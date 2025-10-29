// Device Manager für BLE Geräte mit KORRIGIERTEM AUTOMATISCHEM SCAN
class DeviceManager {
    constructor() {
        this.connectedDevices = new Map();
        this.availableDevices = new Map();
        this.eventListeners = new Map();
        this.isScanning = false;
        this.currentScan = null;
        
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
    
    // KORRIGIERTER AUTOMATISCHER SCAN - Akzeptiert alle Geräte
    async startAutoScan(duration = 15) {
        if (this.isScanning) {
            console.log('🔍 Scan läuft bereits');
            return this.availableDevices;
        }
        
        try {
            this.isScanning = true;
            this.availableDevices.clear();
            this.emit('scanStarted');
            
            console.log(`🔄 Starte AUTO-SCAN für ${duration} Sekunden...`);

            const foundDevices = new Map();
            let scanTimer;
            let scanStartTime = Date.now();

            // Event Listener für gefundene Geräte - KORRIGIERT
            const onAdvertisementReceived = (event) => {
                const device = event.device;
                
                // KORREKTUR: Akzeptiere ALLE Geräte mit Namen
                if (device.name) {
                    if (!foundDevices.has(device.id)) {
                        console.log(`📱 Gefunden: "${device.name}" (RSSI: ${event.rssi})`);
                        foundDevices.set(device.id, {
                            id: device.id,
                            name: device.name,
                            device: device,
                            rssi: event.rssi,
                            timestamp: Date.now()
                        });
                        
                        // Sofortige UI-Aktualisierung
                        this.emit('deviceFound', Array.from(foundDevices.values()));
                    }
                }
            };

            // BLE Scan starten
            console.log('📡 Starte BLE Advertisement Scan...');
            await navigator.bluetooth.requestLEScan({
                acceptAllAdvertisements: true
            });

            // Event Listener registrieren
            navigator.bluetooth.addEventListener('advertisementreceived', onAdvertisementReceived);

            // Scan-Dauer Timer
            scanTimer = setTimeout(async () => {
                await this.stopAutoScan();
                navigator.bluetooth.removeEventListener('advertisementreceived', onAdvertisementReceived);
                
                const devices = Array.from(foundDevices.values());
                const scanTime = ((Date.now() - scanStartTime) / 1000).toFixed(1);
                
                console.log(`✅ AUTO-SCAN beendet: ${devices.length} Geräte in ${scanTime}s gefunden`);
                this.emit('scanStopped', devices);
                
            }, duration * 1000);

            // Speichere aktuellen Scan für Stopp-Funktion
            this.currentScan = {
                timer: scanTimer,
                eventListener: onAdvertisementReceived,
                foundDevices: foundDevices
            };

            return Array.from(foundDevices.values());

        } catch (error) {
            console.error('❌ AUTO-SCAN fehlgeschlagen:', error);
            this.isScanning = false;
            this.emit('scanStopped', []);
            
            if (error.name === 'NotSupportedError') {
                throw new Error('Automatischer Scan wird vom Browser nicht unterstützt. Verwende Chrome oder Edge.');
            } else if (error.name === 'SecurityError') {
                throw new Error('Bluetooth-Zugriff wurde verweigert. Bitte erlauben Sie den Zugriff.');
            } else {
                throw new Error(`Scan fehlgeschlagen: ${error.message}`);
            }
        }
    }
    
    // Scan stoppen
    async stopAutoScan() {
        if (!this.isScanning) return;
        
        try {
            if (this.currentScan) {
                clearTimeout(this.currentScan.timer);
                navigator.bluetooth.removeEventListener('advertisementreceived', this.currentScan.eventListener);
                this.currentScan = null;
            }
            
            await navigator.bluetooth.stopLEScan();
            this.isScanning = false;
            console.log('⏹️ AUTO-SCAN gestoppt');
            
        } catch (error) {
            console.error('Fehler beim Scan-Stopp:', error);
            this.isScanning = false;
        }
    }
    
    // Verbindung zu einem Gerät mit SERVICE-VERFÜGBARKEITS-PRÜFUNG
    async connectToDevice(device) {
        if (this.connectedDevices.has(device.id)) {
            console.log('Gerät bereits verbunden:', device.id);
            return this.connectedDevices.get(device.id);
        }
        
        try {
            console.log('🔗 Versuche Verbindung mit:', device.name);
            
            const server = await device.device.gatt.connect();
            console.log('✅ GATT Server verbunden');
            
            // PRÜFE OB UNSER SERVICE VORHANDEN IST
            let service;
            try {
                service = await server.getPrimaryService(this.SERVICE_UUID);
                console.log('✅ Unser Service gefunden');
            } catch (serviceError) {
                throw new Error(`Gerät "${device.name}" unterstützt nicht das benötigte Sensor-Format.`);
            }
            
            // Geräteinformationen lesen
            const deviceInfo = await this.readDeviceInfo(service, device);
            
            // Notifications starten
            await this.setupNotifications(service, deviceInfo);
            
            // Gerät speichern
            this.connectedDevices.set(deviceInfo.id, deviceInfo);
            
            // Disconnect Handler
            device.device.addEventListener('gattserverdisconnected', () => {
                this.onDeviceDisconnected(deviceInfo.id);
            });
            
            console.log('✅ Gerät erfolgreich verbunden:', deviceInfo);
            this.emit('deviceConnected', deviceInfo);
            
            return deviceInfo;
            
        } catch (error) {
            console.error('❌ Verbindungsfehler:', error);
            
            // Spezifische Fehlermeldungen
            if (error.message.includes('unterstützt nicht')) {
                throw error; // Bereits gute Fehlermeldung
            } else if (error.toString().includes('GATT Server is disconnected')) {
                throw new Error('Gerät nicht erreichbar. Bitte stelle sicher, dass der ESP32 eingeschaltet ist.');
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
                const tempChar = await service.getCharacteristic(this.CHAR_TEMP_UUID);
                await tempChar.startNotifications();
                tempChar.addEventListener('characteristicvaluechanged', (event) => {
                    const value = decoder.decode(event.target.value);
                    deviceInfo.temperature = value;
                    deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                    this.emit('deviceUpdated', deviceInfo.id, {
                        type: 'temperature',
                        value: value
                    });
                });
                console.log('✅ Temperatur-Notifications aktiviert');
            } catch (error) {
                console.warn('❌ Temperatur-Notifications nicht verfügbar:', error);
            }
        }
        
        // Spannungs Notifications
        if (deviceInfo.type === this.DEVICE_TYPE.VOLTAGE || deviceInfo.type === this.DEVICE_TYPE.MULTI) {
            try {
                const voltageChar = await service.getCharacteristic(this.CHAR_VOLTAGE_UUID);
                await voltageChar.startNotifications();
                voltageChar.addEventListener('characteristicvaluechanged', (event) => {
                    const value = decoder.decode(event.target.value);
                    deviceInfo.voltage = value;
                    deviceInfo.lastUpdate = new Date().toLocaleTimeString();
                    this.emit('deviceUpdated', deviceInfo.id, {
                        type: 'voltage',
                        value: value
                    });
                });
                console.log('✅ Spannungs-Notifications aktiviert');
            } catch (error) {
                console.warn('❌ Spannungs-Notifications nicht verfügbar:', error);
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
