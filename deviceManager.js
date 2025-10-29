// Device Manager für BLE Geräte - VOLLSTÄNDIG KORRIGIERT
class DeviceManager {
    constructor() {
        this.connectedDevices = new Map();
        this.availableDevices = new Map();
        this.eventListeners = new Map();
        this.isScanning = false;
        this.pollingIntervals = new Map();
        
        // BLE UUIDs - EXAKT WIE IM ESP32
        this.SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
        this.CHAR_TEMP_UUID = '12345678-1234-5678-1234-56789abcdef1';
        this.CHAR_INTERVAL_UUID = '12345678-1234-5678-1234-56789abcdef2';
        this.CHAR_DEVICE_TYPE_UUID = '12345678-1234-5678-1234-56789abcdef4';
        this.CHAR_DEVICE_ID_UUID = '12345678-1234-5678-1234-56789abcdef5';
        
        this.DEVICE_TYPE = {
            TEMPERATURE: 0,
            VOLTAGE: 1,
            MULTI: 2
        };
    }
    
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
    
    async startScan(duration = 15) {
        if (this.isScanning) {
            console.log('🔍 Scan läuft bereits');
            return [];
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

            const scanTimeout = setTimeout(() => {
                console.log(`⏰ Scan-Dauer von ${duration} Sekunden abgelaufen`);
                scanResolve([]);
            }, duration * 1000);

            // WICHTIG: acceptAllDevices auf true für bessere Kompatibilität
            const options = {
                acceptAllDevices: true,
                optionalServices: [this.SERVICE_UUID]
            };

            console.log('📱 Öffne System-Bluetooth-Dialog...');

            try {
                const device = await navigator.bluetooth.requestDevice(options);
                
                clearTimeout(scanTimeout);
                
                if (device) {
                    console.log('✅ Gerät ausgewählt:', device.name, device.id);
                    this.availableDevices.set(device.id, {
                        id: device.id,
                        name: device.name || 'Unbekanntes Gerät',
                        device: device
                    });
                    const devices = Array.from(this.availableDevices.values());
                    scanResolve(devices);
                } else {
                    scanResolve([]);
                }
            } catch (error) {
                clearTimeout(scanTimeout);
                console.error('❌ Scan Fehler:', error);
                
                if (error.name === 'NotFoundError') {
                    console.log('❌ Benutzer hat Geräteauswahl abgebrochen');
                } else {
                    console.error('❌ Bluetooth Fehler:', error);
                }
                scanResolve([]);
            }

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
    
    // VERBESSERTE VERBINDUNGSMETHODE
    async connectToDevice(device) {
        console.log('🔗 VERSUCHE VERBINDUNG mit:', device.name);
        
        if (this.connectedDevices.has(device.id)) {
            console.log('ℹ️ Gerät bereits verbunden');
            return this.connectedDevices.get(device.id);
        }
        
        try {
            // 1. GATT Server verbinden mit Timeout
            console.log('📡 Verbinde mit GATT Server...');
            const server = await this.connectWithTimeout(device.device.gatt.connect(), 10000);
            console.log('✅ GATT Server verbunden');
            
            // 2. Längere Pause für Stabilität
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 3. Service discoveren
            console.log('🔍 Suche Service...');
            let service;
            try {
                service = await server.getPrimaryService(this.SERVICE_UUID);
                console.log('✅ Service gefunden');
            } catch (serviceError) {
                console.error('❌ Service nicht gefunden:', serviceError);
                throw new Error('Service nicht gefunden. Ist der ESP32 korrekt programmiert?');
            }
            
            // 4. ALLE Characteristics auflisten zur Diagnose
            console.log('🔍 Prüfe verfügbare Characteristics...');
            const characteristics = await service.getCharacteristics();
            console.log(`📊 Gefundene Characteristics: ${characteristics.length}`);
            characteristics.forEach(char => {
                console.log('   -', char.uuid, 'Properties:', this.getPropertyNames(char.properties));
            });
            
            // 5. Geräteinformationen lesen
            console.log('📖 Lese Geräteinformationen...');
            const deviceInfo = await this.readDeviceInfo(service, device);
            console.log('✅ Geräteinfo gelesen:', {
                id: deviceInfo.id,
                type: deviceInfo.type,
                interval: deviceInfo.interval
            });
            
            // 6. Gerät speichern
            this.connectedDevices.set(deviceInfo.id, deviceInfo);
            console.log('💾 Gerät gespeichert');
            
            // 7. Polling starten
            console.log('🔄 Starte Polling...');
            this.startSimplePolling(deviceInfo);
            
            // 8. Disconnect Handler
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
            
            // Versuche zu trennen
            try {
                if (device.device.gatt && device.device.gatt.connected) {
                    await device.device.gatt.disconnect();
                }
            } catch (disconnectError) {
                // Ignoriere Disconnect-Fehler
            }
            
            throw error;
        }
    }
    
    // Timeout für Verbindung
    connectWithTimeout(promise, timeout) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Verbindungs-Time-out - Gerät nicht erreichbar'));
            }, timeout);
            
            try {
                const result = await promise;
                clearTimeout(timer);
                resolve(result);
            } catch (error) {
                clearTimeout(timer);
                reject(error);
            }
        });
    }
    
    // Characteristic Properties anzeigen
    getPropertyNames(properties) {
        const props = [];
        if (properties & 0x02) props.push('READ');
        if (properties & 0x04) props.push('WRITE');
        if (properties & 0x08) props.push('NOTIFY');
        if (properties & 0x10) props.push('INDICATE');
        return props.join(', ');
    }
    
    async readDeviceInfo(service, device) {
        const decoder = new TextDecoder();
        
        try {
            // Device Type
            console.log('🔍 Lese Device Type...');
            const typeChar = await service.getCharacteristic(this.CHAR_DEVICE_TYPE_UUID);
            const typeValue = await typeChar.readValue();
            const deviceType = parseInt(decoder.decode(typeValue));
            console.log('📋 Device Type:', deviceType);
            
            // Device ID
            console.log('🔍 Lese Device ID...');
            const idChar = await service.getCharacteristic(this.CHAR_DEVICE_ID_UUID);
            const idValue = await idChar.readValue();
            const deviceId = decoder.decode(idValue);
            console.log('🆔 Device ID:', deviceId);
            
            // Interval
            console.log('🔍 Lese Interval...');
            const intervalChar = await service.getCharacteristic(this.CHAR_INTERVAL_UUID);
            const intervalValue = await intervalChar.readValue();
            const interval = parseInt(decoder.decode(intervalValue));
            console.log('⏱️ Interval:', interval);
            
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
            throw new Error('Fehler beim Lesen der Geräteinformationen: ' + error.message);
        }
    }
    
    // VERBESSERTE POLLING-METHODE
    startSimplePolling(deviceInfo) {
        console.log('🔄 STARTE POLLING für:', deviceInfo.name, 'Type:', deviceInfo.type);
        
        this.stopPolling(deviceInfo.id);
        
        const pollingInterval = setInterval(async () => {
            if (!this.connectedDevices.has(deviceInfo.id)) {
                console.log('ℹ️ Polling gestoppt - Gerät nicht mehr verbunden');
                this.stopPolling(deviceInfo.id);
                return;
            }
            
            try {
                // Temperatur lesen für Temperatur-Geräte
                if (deviceInfo.type === this.DEVICE_TYPE.TEMPERATURE) {
                    const tempChar = await deviceInfo.service.getCharacteristic(this.CHAR_TEMP_UUID);
                    const value = await tempChar.readValue();
                    const tempValue = new TextDecoder().decode(value);
                    
                    console.log('🌡️ TEMPERATUR GELESEN:', tempValue + '°C');
                    
                    if (tempValue && tempValue !== deviceInfo.temperature) {
                        deviceInfo.temperature = tempValue;
                        deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                        this.emit('deviceUpdated', deviceInfo.id, {
                            type: 'temperature',
                            value: tempValue
                        });
                    }
                }
                
            } catch (error) {
                console.error('❌ Polling Fehler:', error);
                
                // Bei Verbindungsfehlern Polling stoppen
                if (error.toString().includes('disconnected') || 
                    error.toString().includes('not connected') ||
                    error.toString().includes('GATT')) {
                    console.log('🔌 Verbindungsfehler - stoppe Polling');
                    this.stopPolling(deviceInfo.id);
                    this.connectedDevices.delete(deviceInfo.id);
                    this.emit('deviceDisconnected', deviceInfo.id);
                }
            }
        }, Math.max(deviceInfo.interval * 1000, 2000));
        
        this.pollingIntervals.set(deviceInfo.id, pollingInterval);
        console.log('✅ POLLING GESTARTET - Intervall:', deviceInfo.interval + 's');
        
        // SOFORT ERSTEN WERT LESEN
        setTimeout(async () => {
            try {
                if (deviceInfo.type === this.DEVICE_TYPE.TEMPERATURE) {
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
        this.pollingIntervals.forEach((interval, deviceId) => {
            clearInterval(interval);
        });
        this.pollingIntervals.clear();
        
        const disconnectPromises = Array.from(this.connectedDevices.keys()).map(
            deviceId => this.disconnectDevice(deviceId)
        );
        await Promise.all(disconnectPromises);
    }
    
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
