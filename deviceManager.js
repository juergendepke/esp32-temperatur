// Device Manager für BLE Geräte - KORRIGIERTE VERSION
class DeviceManager {
    constructor() {
        this.connectedDevices = new Map();
        this.availableDevices = new Map();
        this.eventListeners = new Map();
        this.isScanning = false;
        this.pollingIntervals = new Map();
        
        // BLE UUIDs - KORRIGIERT
        this.SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
        this.CHAR_TEMP_UUID = '12345678-1234-5678-1234-56789abcdef1';
        this.CHAR_INTERVAL_UUID = '12345678-1234-5678-1234-56789abcdef2';
        this.CHAR_DEVICE_TYPE_UUID = '12345678-1234-5678-1234-56789abcdef4';
        this.CHAR_DEVICE_ID_UUID = '12345678-1234-5678-1234-56789abcdef5';
        // CHAR_VOLTAGE_UUID wurde entfernt da nicht im ESP32 vorhanden
        
        // Gerätetypen
        this.DEVICE_TYPE = {
            TEMPERATURE: 0,
            VOLTAGE: 1,
            MULTI: 2
        };
    }

    // VERBESSERTE VERBINDUNGSMETHODE
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
            await new Promise(resolve => setTimeout(resolve, 500));
            
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
            
            // 4. Geräteinformationen lesen - FEHLERBEHANDLUNG VERBESSERT
            console.log('📖 Lese Geräteinformationen...');
            const deviceInfo = await this.readDeviceInfo(service, device);
            console.log('✅ Geräteinfo gelesen:', deviceInfo);
            
            // 5. Gerät speichern
            this.connectedDevices.set(deviceInfo.id, deviceInfo);
            console.log('💾 Gerät gespeichert');
            
            // 6. Polling starten
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
                if (device.device.gatt && device.device.gatt.connected) {
                    await device.device.gatt.disconnect();
                }
            } catch (disconnectError) {
                // Ignoriere Disconnect-Fehler
            }
            
            throw error;
        }
    }
    
    async readDeviceInfo(service, device) {
        const decoder = new TextDecoder();
        
        try {
            console.log('🔍 Lese Device Type Characteristic...');
            const typeChar = await service.getCharacteristic(this.CHAR_DEVICE_TYPE_UUID);
            const typeValue = await typeChar.readValue();
            const deviceType = parseInt(decoder.decode(typeValue));
            console.log('📋 Device Type:', deviceType);
            
            console.log('🔍 Lese Device ID Characteristic...');
            const idChar = await service.getCharacteristic(this.CHAR_DEVICE_ID_UUID);
            const idValue = await idChar.readValue();
            const deviceId = decoder.decode(idValue);
            console.log('🆔 Device ID:', deviceId);
            
            console.log('🔍 Lese Interval Characteristic...');
            const intervalChar = await service.getCharacteristic(this.CHAR_INTERVAL_UUID);
            const intervalValue = await intervalChar.readValue();
            const interval = parseInt(decoder.decode(intervalValue));
            console.log('⏱️ Interval:', interval);
            
            // Prüfe verfügbare Characteristics
            console.log('🔍 Prüfe verfügbare Characteristics...');
            const characteristics = await service.getCharacteristics();
            console.log('📊 Verfügbare Characteristics:', characteristics.length);
            characteristics.forEach(char => {
                console.log('   -', char.uuid);
            });
            
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
            throw new Error('Gerät unterstützt nicht das benötigte Service-Format: ' + error.message);
        }
    }
    
    // VERBESSERTE POLLING-METHODE
    startSimplePolling(deviceInfo) {
        console.log('🔄 STARTE POLLING für:', deviceInfo.name, 'Type:', deviceInfo.type);
        
        // Stoppe vorhandenes Polling
        this.stopPolling(deviceInfo.id);
        
        const pollingInterval = setInterval(async () => {
            if (!this.connectedDevices.has(deviceInfo.id)) {
                console.log('ℹ️ Polling gestoppt - Gerät nicht mehr verbunden');
                this.stopPolling(deviceInfo.id);
                return;
            }
            
            try {
                // Temperatur lesen (nur für Temperatur- und Multi-Geräte)
                if (deviceInfo.type === this.DEVICE_TYPE.TEMPERATURE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
                    try {
                        const tempChar = await deviceInfo.service.getCharacteristic(this.CHAR_TEMP_UUID);
                        const value = await tempChar.readValue();
                        const tempValue = new TextDecoder().decode(value);
                        
                        console.log('🌡️ TEMPERATUR:', tempValue + '°C');
                        
                        // Aktualisiere nur wenn Wert vorhanden
                        if (tempValue && tempValue !== deviceInfo.temperature) {
                            deviceInfo.temperature = tempValue;
                            deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                            this.emit('deviceUpdated', deviceInfo.id, {
                                type: 'temperature',
                                value: tempValue
                            });
                        }
                    } catch (tempError) {
                        console.error('❌ Fehler beim Lesen der Temperatur:', tempError);
                    }
                }
                
                // Spannung lesen (nur für Spannungs- und Multi-Geräte)
                // ACHTUNG: CHAR_VOLTAGE_UUID existiert nicht im aktuellen ESP32!
                if (deviceInfo.type === this.DEVICE_TYPE.VOLTAGE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
                    console.log('⚡ Voltage reading skipped - not implemented in ESP32');
                }
                
            } catch (error) {
                console.error('❌ Polling Fehler:', error);
                // Bei schwerwiegenden Fehlern: Polling stoppen
                if (error.toString().includes('disconnected') || error.toString().includes('not connected')) {
                    this.stopPolling(deviceInfo.id);
                    this.connectedDevices.delete(deviceInfo.id);
                    this.emit('deviceDisconnected', deviceInfo.id);
                }
            }
        }, Math.max(deviceInfo.interval * 1000, 2000)); // Mindestens 2 Sekunden
        
        this.pollingIntervals.set(deviceInfo.id, pollingInterval);
        console.log('✅ POLLING GESTARTET - Intervall:', deviceInfo.interval + 's');
        
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
        }, 1000);
    }

    // ... restliche Methoden bleiben gleich ...
}
