// Device Manager für BLE Geräte - MIT FEHLERBEHANDLUNG
class DeviceManager {
    constructor() {
        this.connectedDevices = new Map();
        this.availableDevices = new Map();
        this.eventListeners = new Map();
        this.isScanning = false;
        this.pollingIntervals = new Map();
        
        // BLE UUIDs
        this.SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
        this.CHAR_TEMP_UUID = '12345678-1234-5678-1234-56789abcdef1';
        this.CHAR_INTERVAL_UUID = '12345678-1234-5678-1234-56789abcdef2';
        this.CHAR_DEVICE_TYPE_UUID = '12345678-1234-5678-1234-56789abcdef4';
        this.CHAR_DEVICE_ID_UUID = '12345678-1234-5678-1234-56789abcdef5';
        
        // Gerätetypen
        this.DEVICE_TYPE = {
            TEMPERATURE: 0,
            VOLTAGE: 1,
            MULTI: 2
        };
    }
    
    // Event System
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }
    
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    
    // System-Dialog für Geräteauswahl
    async startScan(duration = 15) {
        if (this.isScanning) {
            console.log('🔍 Scan läuft bereits');
            return;
        }
        
        try {
            this.isScanning = true;
            this.availableDevices.clear();
            this.emit('scanStarted');
            
            console.log(`🔄 Starte Scan für ${duration} Sekunden...`);

            let scanResolve;
            const scanPromise = new Promise(resolve => {
                scanResolve = resolve;
            });

            // Timeout für die Scan-Dauer
            const scanTimeout = setTimeout(() => {
                console.log(`⏰ Scan-Dauer von ${duration} Sekunden abgelaufen`);
                scanResolve([]);
            }, duration * 1000);

            // Bluetooth System-Dialog öffnen
            const options = {
                acceptAllDevices: true,
                optionalServices: [this.SERVICE_UUID]
            };

            console.log('📱 Öffne System-Bluetooth-Dialog...');

            navigator.bluetooth.requestDevice(options)
                .then(device => {
                    // User hat ein Gerät ausgewählt → Timeout cancellen
                    clearTimeout(scanTimeout);
                    
                    if (device) {
                        console.log('✅ Gerät ausgewählt:', device.name);
                        this.availableDevices.set(device.id, {
                            id: device.id,
                            name: device.name,
                            device: device
                        });
                        const devices = Array.from(this.availableDevices.values());
                        scanResolve(devices);
                    } else {
                        scanResolve([]);
                    }
                })
                .catch(error => {
                    // User hat abgebrochen oder Fehler → Timeout cancellen
                    clearTimeout(scanTimeout);
                    
                    if (error.name === 'NotFoundError') {
                        console.log('❌ Benutzer hat Geräteauswahl abgebrochen');
                        scanResolve([]);
                    } else {
                        console.error('❌ Scan Fehler:', error);
                        scanResolve([]);
                    }
                });

            // Warte auf Ergebnis
            const devices = await scanPromise;
            
            console.log(`📊 Scan beendet: ${devices.length} Gerät(e) gefunden`);
            this.isScanning = false;
            this.emit('scanStopped', devices);
            return devices;
            
        } catch (error) {
            console.error('❌ Scan komplett fehlgeschlagen:', error);
            this.isScanning = false;
            this.emit('scanStopped', []);
            return [];
        }
    }
    
    // VERBINDUNGSMETHODE
    async connectToDevice(device) {
        console.log('🔗 VERSUCHE VERBINDUNG mit:', device.name);
        
        // Prüfe ob bereits verbunden
        if (this.connectedDevices.has(device.id)) {
            console.log('ℹ️ Gerät bereits verbunden');
            return this.connectedDevices.get(device.id);
        }
        
        try {
            // 1. GATT Server verbinden
            console.log('📡 Verbinde mit GATT Server...');
            const server = await device.device.gatt.connect();
            console.log('✅ GATT Server verbunden');
            
            // 2. Kurze Pause für Stabilität
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 3. Service discoveren
            console.log('🔍 Suche Service...');
            let service;
            try {
                service = await server.getPrimaryService(this.SERVICE_UUID);
                console.log('✅ Service gefunden');
            } catch (serviceError) {
                console.error('❌ Service nicht gefunden:', serviceError);
                throw new Error('Dieses Gerät unterstützt nicht das benötigte Sensor-Format.');
            }
            
            // 4. Geräteinformationen lesen
            console.log('📖 Lese Geräteinformationen...');
            const deviceInfo = await this.readDeviceInfo(service, device);
            console.log('✅ Geräteinfo gelesen');
            
            // 5. Gerät speichern
            this.connectedDevices.set(deviceInfo.id, deviceInfo);
            console.log('💾 Gerät gespeichert');
            
            // 6. Polling-Methode starten
            console.log('🔄 Starte Polling...');
            this.startSimplePolling(deviceInfo);
            
            // 7. Disconnect Handler
            device.device.addEventListener('gattserverdisconnected', () => {
                console.log('🔌 Gerät getrennt');
                this.stopPolling(deviceInfo.id);
                this.connectedDevices.delete(deviceInfo.id);
                this.emit('deviceDisconnected', deviceInfo.id);
            });
            
            console.log('🎉 GERÄT ERFOLGREICH VERBUNDEN!');
            this.emit('deviceConnected', deviceInfo);
            
            return deviceInfo;
            
        } catch (error) {
            console.error('💥 VERBINDUNGSFEHLER:', error);
            
            // Versuche zu trennen falls teilweise verbunden
            try {
                if (device.device.gatt.connected) {
                    await device.device.gatt.disconnect();
                }
            } catch (disconnectError) {
                // Ignoriere Disconnect-Fehler
            }
            
            // Benutzerfreundliche Fehlermeldung
            let userMessage = 'Verbindung fehlgeschlagen: ';
            
            if (error.message.includes('unterstützt nicht')) {
                userMessage = 'Dieses Gerät ist kein kompatibler Sensor.';
            } else if (error.toString().includes('GATT Server is disconnected')) {
                userMessage = 'Gerät nicht erreichbar. Bitte ESP32 neustarten.';
            } else if (error.toString().includes('Timeout')) {
                userMessage = 'Verbindungs-Time-out. Gerät in Reichweite?';
            } else if (error.toString().includes('Characteristic')) {
                userMessage = 'Gerät unterstützt nicht alle benötigten Funktionen.';
            } else {
                userMessage += error.message;
            }
            
            throw new Error(userMessage);
        }
    }
    
    async readDeviceInfo(service, device) {
        const decoder = new TextDecoder();
        
        try {
            // Device Type
            const typeChar = await service.getCharacteristic(this.CHAR_DEVICE_TYPE_UUID);
            const typeValue = await typeChar.readValue();
            const deviceType = parseInt(decoder.decode(typeValue));
            
            // Device ID
            const idChar = await service.getCharacteristic(this.CHAR_DEVICE_ID_UUID);
            const idValue = await idChar.readValue();
            const deviceId = decoder.decode(idValue);
            
            // Interval
            const intervalChar = await service.getCharacteristic(this.CHAR_INTERVAL_UUID);
            const intervalValue = await intervalChar.readValue();
            const interval = parseInt(decoder.decode(intervalValue));
            
            return {
                id: deviceId,
                name: device.name,
                type: deviceType,
                interval: interval,
                device: device.device,
                service: service,
                lastUpdate: new Date().toLocaleTimeString(),
                temperature: '--',
                voltage: '--'
            };
        } catch (error) {
            console.error('❌ Fehler beim Lesen der Geräteinfo:', error);
            throw new Error('Gerät unterstützt nicht das benötigte Service-Format.');
        }
    }
    
    // POLLING-METHODE
    startSimplePolling(deviceInfo) {
        console.log('🔄 STARTE POLLING für:', deviceInfo.name);
        
        // Stoppe vorhandenes Polling
        this.stopPolling(deviceInfo.id);
        
        const pollingInterval = setInterval(async () => {
            if (!this.connectedDevices.has(deviceInfo.id)) {
                console.log('ℹ️ Polling gestoppt - Gerät nicht mehr verbunden');
                this.stopPolling(deviceInfo.id);
                return;
            }
            
            try {
                // Temperatur lesen
                if (deviceInfo.type === this.DEVICE_TYPE.TEMPERATURE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
                    const tempChar = await deviceInfo.service.getCharacteristic(this.CHAR_TEMP_UUID);
                    const value = await tempChar.readValue();
                    const tempValue = new TextDecoder().decode(value);
                    
                    console.log('🌡️ TEMPERATUR:', tempValue + '°C');
                    
                    // Nur aktualisieren wenn sich der Wert geändert hat
                    if (deviceInfo.temperature !== tempValue) {
                        deviceInfo.temperature = tempValue;
                        deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                        this.emit('deviceUpdated', deviceInfo.id, {
                            type: 'temperature',
                            value: tempValue
                        });
                    }
                }
                
                // Spannung lesen
                if (deviceInfo.type === this.DEVICE_TYPE.VOLTAGE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
                    const voltageChar = await deviceInfo.service.getCharacteristic(this.CHAR_VOLTAGE_UUID);
                    const value = await voltageChar.readValue();
                    const voltageValue = new TextDecoder().decode(value);
                    
                    console.log('⚡ SPANNUNG:', voltageValue + 'V');
                    
                    // Nur aktualisieren wenn sich der Wert geändert hat
                    if (deviceInfo.voltage !== voltageValue) {
                        deviceInfo.voltage = voltageValue;
                        deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                        this.emit('deviceUpdated', deviceInfo.id, {
                            type: 'voltage',
                            value: voltageValue
                        });
                    }
                }
                
            } catch (error) {
                console.error('❌ Polling Fehler:', error);
                // Bei Fehler: Polling stoppen und Gerät als getrennt markieren
                this.stopPolling(deviceInfo.id);
                this.connectedDevices.delete(deviceInfo.id);
                this.emit('deviceDisconnected', deviceInfo.id);
            }
        }, 2000); // Alle 2 Sekunden
        
        this.pollingIntervals.set(deviceInfo.id, pollingInterval);
        console.log('✅ POLLING GESTARTET');
        
        // SOFORT ERSTEN WERT LESEN
        setTimeout(async () => {
            try {
                if (deviceInfo.type === this.DEVICE_TYPE.TEMPERATURE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
                    const tempChar = await deviceInfo.service.getCharacteristic(this.CHAR_TEMP_UUID);
                    const value = await tempChar.readValue();
                    const tempValue = new TextDecoder().decode(value);
                    
                    console.log('🚀 ERSTE TEMPERATUR:', tempValue + '°C');
                    deviceInfo.temperature = tempValue;
                    deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                    this.emit('deviceUpdated', deviceInfo.id, {
                        type: 'temperature',
                        value: tempValue
                    });
                }
            } catch (error) {
                console.error('❌ Fehler beim ersten Lesen:', error);
            }
        }, 500);
    }
    
    stopPolling(deviceId) {
        if (this.pollingIntervals.has(deviceId)) {
            clearInterval(this.pollingIntervals.get(deviceId));
            this.pollingIntervals.delete(deviceId);
            console.log('⏹️ Polling gestoppt für:', deviceId);
        }
    }
    
    async disconnectDevice(deviceId) {
        const deviceInfo = this.connectedDevices.get(deviceId);
        if (deviceInfo) {
            try {
                this.stopPolling(deviceId);
                await deviceInfo.device.gatt.disconnect();
            } catch (error) {
                console.warn('Warnung beim Trennen:', error);
            }
            this.connectedDevices.delete(deviceId);
            this.emit('deviceDisconnected', deviceId);
        }
    }
    
    async disconnectAllDevices() {
        // Stoppe alle Polling-Intervalle
        this.pollingIntervals.forEach((interval, deviceId) => {
            clearInterval(interval);
        });
        this.pollingIntervals.clear();
        
        const disconnectPromises = Array.from(this.connectedDevices.keys()).map(
            deviceId => this.disconnectDevice(deviceId)
        );
        await Promise.all(disconnectPromises);
    }
    
    // Geräte-Einstellungen
    async setUpdateInterval(deviceId, interval) {
        const deviceInfo = this.connectedDevices.get(deviceId);
        if (!deviceInfo) throw new Error('Gerät nicht verbunden');
        
        try {
            const intervalChar = await deviceInfo.service.getCharacteristic(this.CHAR_INTERVAL_UUID);
            const encoder = new TextEncoder();
            await intervalChar.writeValue(encoder.encode(interval.toString()));
            deviceInfo.interval = interval;
            console.log(`⏱️ Update-Intervall auf ${interval}s gesetzt`);
            return true;
        } catch (error) {
            console.error('❌ Fehler beim Setzen des Intervalls:', error);
            throw error;
        }
    }
    
    // Utility Methods
    getConnectedDevices() {
        return Array.from(this.connectedDevices.values());
    }
    
    getConnectedDevice(deviceId) {
        return this.connectedDevices.get(deviceId);
    }
    
    isDeviceConnected(deviceId) {
        return this.connectedDevices.has(deviceId);
    }
    
    getAvailableDevices() {
        return Array.from(this.availableDevices.values());
    }
    
    isScanningActive() {
        return this.isScanning;
    }
}
