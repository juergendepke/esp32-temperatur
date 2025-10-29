// Device Manager für BLE Geräte
class DeviceManager {
    constructor() {
        this.connectedDevices = new Map();
        this.availableDevices = new Map();
        this.eventListeners = new Map();
        this.isScanning = false;
        
        // BLE UUIDs (OHNE LED Characteristic)
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
    
    // Scan für verfügbare Geräte
    async startScan(duration = 10) {
        if (this.isScanning) {
            console.log('Scan läuft bereits');
            return;
        }
        
        try {
            this.isScanning = true;
            this.availableDevices.clear();
            this.emit('scanStarted');
            
            console.log(`Starte BLE Scan für ${duration} Sekunden...`);
            
            const options = {
                filters: [
                    { services: [this.SERVICE_UUID] }
                ],
                optionalServices: [this.SERVICE_UUID]
            };
            
            // Timeout für Scan
            const scanTimeout = setTimeout(() => {
                this.stopScan();
            }, duration * 1000);
            
            // Device Found Handler
            const onDeviceFound = (event) => {
                const device = event.device;
                if (device.name && !this.availableDevices.has(device.id)) {
                    console.log('Gefunden:', device.name, device.id);
                    this.availableDevices.set(device.id, device);
                }
            };
            
            navigator.bluetooth.addEventListener('advertisementreceived', onDeviceFound);
            
            // Scan starten
            await navigator.bluetooth.requestLEScan(options);
            
            // Warte auf Timeout
            await new Promise(resolve => {
                this.scanResolve = resolve;
            });
            
            // Cleanup
            clearTimeout(scanTimeout);
            navigator.bluetooth.removeEventListener('advertisementreceived', onDeviceFound);
            
            const devices = Array.from(this.availableDevices.values());
            console.log(`Scan abgeschlossen. ${devices.length} Geräte gefunden.`);
            this.emit('scanStopped', devices);
            
            return devices;
            
        } catch (error) {
            console.error('Scan Fehler:', error);
            this.isScanning = false;
            this.emit('scanStopped', []);
            throw error;
        }
    }
    
    async stopScan() {
        if (!this.isScanning) return;
        
        try {
            await navigator.bluetooth.stopLEScan();
            this.isScanning = false;
            if (this.scanResolve) {
                this.scanResolve();
            }
        } catch (error) {
            console.error('Fehler beim Scan Stoppen:', error);
        }
    }
    
    // Verbindung zu einem Gerät
    async connectToDevice(device) {
        if (this.connectedDevices.has(device.id)) {
            console.log('Gerät bereits verbunden:', device.id);
            return this.connectedDevices.get(device.id);
        }
        
        try {
            console.log('Verbinde mit Gerät:', device.name);
            
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(this.SERVICE_UUID);
            
            // Geräteinformationen lesen
            const deviceInfo = await this.readDeviceInfo(service, device);
            
            // Notifications starten
            await this.setupNotifications(service, deviceInfo);
            
            // Gerät speichern
            this.connectedDevices.set(deviceInfo.id, deviceInfo);
            
            // Disconnect Handler
            device.addEventListener('gattserverdisconnected', () => {
                this.onDeviceDisconnected(deviceInfo.id);
            });
            
            console.log('Gerät erfolgreich verbunden:', deviceInfo);
            this.emit('deviceConnected', deviceInfo);
            
            return deviceInfo;
            
        } catch (error) {
            console.error('Verbindungsfehler:', error);
            throw error;
        }
    }
    
    async readDeviceInfo(service, device) {
        const decoder = new TextDecoder();
        
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
            device: device,
            service: service,
            lastUpdate: new Date().toLocaleTimeString(),
            temperature: null,
            voltage: null
        };
    }
    
    async setupNotifications(service, deviceInfo) {
        const decoder = new TextDecoder();
        
        // Temperatur Notifications (falls unterstützt)
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
            } catch (error) {
                console.warn('Temperatur-Notifications nicht verfügbar:', error);
            }
        }
        
        // Spannungs Notifications (falls unterstützt)
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
            } catch (error) {
                console.warn('Spannungs-Notifications nicht verfügbar:', error);
            }
        }
    }
    
    onDeviceDisconnected(deviceId) {
        console.log('Gerät getrennt:', deviceId);
        this.connectedDevices.delete(deviceId);
        this.emit('deviceDisconnected', deviceId);
    }
    
    async disconnectDevice(deviceId) {
        const deviceInfo = this.connectedDevices.get(deviceId);
        if (deviceInfo) {
            try {
                await deviceInfo.device.gatt.disconnect();
            } catch (error) {
                console.warn('Fehler beim Trennen:', error);
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
    
    // Geräte-Einstellungen (NUR INTERVALL - KEINE LED)
    async setUpdateInterval(deviceId, interval) {
        const deviceInfo = this.connectedDevices.get(deviceId);
        if (!deviceInfo) throw new Error('Gerät nicht verbunden');
        
        try {
            const intervalChar = await deviceInfo.service.getCharacteristic(this.CHAR_INTERVAL_UUID);
            const encoder = new TextEncoder();
            await intervalChar.writeValue(encoder.encode(interval.toString()));
            deviceInfo.interval = interval;
            console.log(`Update-Intervall für ${deviceId} auf ${interval}s gesetzt`);
        } catch (error) {
            console.error('Fehler beim Setzen des Intervalls:', error);
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
}
