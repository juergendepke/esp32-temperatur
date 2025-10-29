// Device Manager für BLE Geräte - MIT DEBUG INFORMATIONEN
class DeviceManager {
    constructor() {
        this.connectedDevices = new Map();
        this.availableDevices = new Map();
        this.eventListeners = new Map();
        this.isScanning = false;
        
        // BLE UUIDs
        this.SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
        this.CHAR_TEMP_UUID = '12345678-1234-5678-1234-56789abcdef1';
        this.CHAR_INTERVAL_UUID = '12345678-1234-5678-1234-56789abcdef2';
        this.CHAR_DEVICE_TYPE_UUID = '12345678-1234-5678-1234-56789abcdef4';
        this.CHAR_DEVICE_ID_UUID = '12345678-1234-5678-1234-56789abcdef5';
        this.CHAR_VOLTAGE_UUID = '12345678-1234-5678-1234-56789abcdef6';
        
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
                this.stopScan();
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
    
    async stopScan() {
        if (!this.isScanning) return;
        
        try {
            this.isScanning = false;
            console.log('⏹️ Scan gestoppt');
        } catch (error) {
            console.error('Fehler beim Scan-Stopp:', error);
        }
    }
    
    // Verbindung zu einem Gerät MIT DEBUGGING
    async connectToDevice(device) {
        if (this.connectedDevices.has(device.id)) {
            console.log('Gerät bereits verbunden:', device.id);
            return this.connectedDevices.get(device.id);
        }
        
        try {
            console.log('🔗 STARTE Verbindung mit:', device.name);
            
            // 1. GATT Server verbinden
            console.log('📡 Verbinde mit GATT Server...');
            const server = await device.device.gatt.connect();
            console.log('✅ GATT Server verbunden');
            
            // 2. Service discoveren
            console.log('🔍 Suche Service...');
            let service;
            try {
                service = await server.getPrimaryService(this.SERVICE_UUID);
                console.log('✅ Service gefunden:', this.SERVICE_UUID);
            } catch (serviceError) {
                console.error('❌ Service nicht gefunden:', serviceError);
                throw new Error(`Gerät "${device.name}" unterstützt nicht das benötigte Sensor-Format.`);
            }
            
            // 3. Geräteinformationen lesen
            console.log('📖 Lese Geräteinformationen...');
            const deviceInfo = await this.readDeviceInfo(service, device);
            console.log('✅ Geräteinfo gelesen:', deviceInfo);
            
            // 4. Notifications starten
            console.log('🔔 Starte Notifications...');
            await this.setupNotifications(service, deviceInfo);
            console.log('✅ Notifications gestartet');
            
            // 5. Gerät speichern
            this.connectedDevices.set(deviceInfo.id, deviceInfo);
            
            // 6. Disconnect Handler
            device.device.addEventListener('gattserverdisconnected', () => {
                console.log('🔌 Gerät getrennt:', deviceInfo.id);
                this.onDeviceDisconnected(deviceInfo.id);
            });
            
            console.log('🎉 Gerät erfolgreich verbunden und ready!');
            this.emit('deviceConnected', deviceInfo);
            
            return deviceInfo;
            
        } catch (error) {
            console.error('💥 Verbindungsfehler:', error);
            
            if (error.message.includes('unterstützt nicht')) {
                throw error;
            } else if (error.toString().includes('GATT Server is disconnected')) {
                throw new Error('Gerät nicht erreichbar. ESP32 neustarten?');
            } else if (error.toString().includes('Characteristic')) {
                throw new Error('Gerät unterstützt nicht alle benötigten Funktionen.');
            } else {
                throw new Error(`Verbindung fehlgeschlagen: ${error.message}`);
            }
        }
    }
    
    async readDeviceInfo(service, device) {
        const decoder = new TextDecoder();
        
        try {
            console.log('   📋 Lese Device Type...');
            const typeChar = await service.getCharacteristic(this.CHAR_DEVICE_TYPE_UUID);
            const typeValue = await typeChar.readValue();
            const deviceType = parseInt(decoder.decode(typeValue));
            console.log('   ✅ Device Type:', deviceType);
            
            console.log('   📋 Lese Device ID...');
            const idChar = await service.getCharacteristic(this.CHAR_DEVICE_ID_UUID);
            const idValue = await idChar.readValue();
            const deviceId = decoder.decode(idValue);
            console.log('   ✅ Device ID:', deviceId);
            
            console.log('   📋 Lese Interval...');
            const intervalChar = await service.getCharacteristic(this.CHAR_INTERVAL_UUID);
            const intervalValue = await intervalChar.readValue();
            const interval = parseInt(decoder.decode(intervalValue));
            console.log('   ✅ Interval:', interval);
            
            return {
                id: deviceId,
                name: device.name,
                type: deviceType,
                interval: interval,
                device: device.device,
                service: service,
                lastUpdate: new Date().toLocaleTimeString(),
                temperature: null,
                voltage: null
            };
        } catch (error) {
            console.error('❌ Fehler beim Lesen der Geräteinfo:', error);
            throw new Error('Gerät unterstützt nicht das benötigte Service-Format.');
        }
    }
    
    async setupNotifications(service, deviceInfo) {
        const decoder = new TextDecoder();
        
        // Temperatur Notifications
        if (deviceInfo.type === this.DEVICE_TYPE.TEMPERATURE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
            try {
                console.log('   🌡️ Setup Temperatur Notifications...');
                const tempChar = await service.getCharacteristic(this.CHAR_TEMP_UUID);
                
                // Event Listener für Temperatur
                tempChar.addEventListener('characteristicvaluechanged', (event) => {
                    const value = decoder.decode(event.target.value);
                    console.log('📨 TEMPERATUR EMPFANGEN:', value + '°C');
                    deviceInfo.temperature = value;
                    deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                    this.emit('deviceUpdated', deviceInfo.id, {
                        type: 'temperature',
                        value: value
                    });
                });
                
                // Notifications starten
                await tempChar.startNotifications();
                console.log('   ✅ Temperatur-Notifications aktiviert');
                
            } catch (error) {
                console.error('   ❌ Temperatur-Notifications Fehler:', error);
            }
        }
        
        // Spannungs Notifications
        if (deviceInfo.type === this.DEVICE_TYPE.VOLTAGE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
            try {
                console.log('   ⚡ Setup Spannungs Notifications...');
                const voltageChar = await service.getCharacteristic(this.CHAR_VOLTAGE_UUID);
                
                // Event Listener für Spannung
                voltageChar.addEventListener('characteristicvaluechanged', (event) => {
                    const value = decoder.decode(event.target.value);
                    console.log('📨 SPANNUNG EMPFANGEN:', value + 'V');
                    deviceInfo.voltage = value;
                    deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                    this.emit('deviceUpdated', deviceInfo.id, {
                        type: 'voltage',
                        value: value
                    });
                });
                
                // Notifications starten
                await voltageChar.startNotifications();
                console.log('   ✅ Spannungs-Notifications aktiviert');
                
            } catch (error) {
                console.error('   ❌ Spannungs-Notifications Fehler:', error);
            }
        }
    }
    
    onDeviceDisconnected(deviceId) {
        console.log('🔌 Gerät getrennt:', deviceId);
        this.connectedDevices.delete(deviceId);
        this.emit('deviceDisconnected', deviceId);
    }
    
    async disconnectDevice(deviceId) {
        const deviceInfo = this.connectedDevices.get(deviceId);
        if (deviceInfo) {
            try {
                await deviceInfo.device.gatt.disconnect();
            } catch (error) {
                console.warn('Warnung beim Trennen:', error);
            }
            this.connectedDevices.delete(deviceId);
            this.emit('deviceDisconnected', deviceId);
        }
    }
    
    async disconnectAllDevices() {
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
            console.log(`⏱️ Update-Intervall für ${deviceId} auf ${interval}s gesetzt`);
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
