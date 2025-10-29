// Haupt-Anwendungslogik
class MultiSensorApp {
    constructor() {
        this.deviceManager = new DeviceManager();
        this.isScanning = false;
        
        this.initializeApp();
    }
    
    initializeApp() {
        this.bindEvents();
        this.checkBluetoothAvailability();
        this.updateDisplay();
    }
    
    bindEvents() {
        // Scan Button
        document.getElementById('scanBtn').addEventListener('click', () => {
            this.toggleScan();
        });
        
        // Disconnect All Button
        document.getElementById('disconnectAllBtn').addEventListener('click', () => {
            this.disconnectAllDevices();
        });
        
        // Interval Slider
        document.getElementById('intervalSlider').addEventListener('input', (e) => {
            document.getElementById('intervalValue').textContent = e.target.value;
        });
        
        // Apply Interval Button
        document.getElementById('applyInterval').addEventListener('click', () => {
            this.applyIntervalToAllDevices();
        });
        
        // Scan Duration Slider
        document.getElementById('scanDurationSlider').addEventListener('input', (e) => {
            document.getElementById('scanDurationValue').textContent = e.target.value;
        });
        
        // Modal Close
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideDeviceModal();
        });
        
        // Modal Background Click
        document.getElementById('deviceModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('deviceModal')) {
                this.hideDeviceModal();
            }
        });
        
        // Device Manager Events
        this.deviceManager.on('deviceConnected', (device) => {
            this.onDeviceConnected(device);
        });
        
        this.deviceManager.on('deviceDisconnected', (deviceId) => {
            this.onDeviceDisconnected(deviceId);
        });
        
        this.deviceManager.on('deviceUpdated', (deviceId, data) => {
            this.onDeviceUpdated(deviceId, data);
        });
        
        this.deviceManager.on('scanStarted', () => {
            this.onScanStarted();
        });
        
        this.deviceManager.on('scanStopped', (devices) => {
            this.onScanStopped(devices);
        });
    }
    
    async checkBluetoothAvailability() {
        try {
            if (!navigator.bluetooth) {
                throw new Error('Web Bluetooth API nicht unterstützt');
            }
            
            // Teste ob Bluetooth verfügbar ist
            const available = await navigator.bluetooth.getAvailability();
            document.getElementById('bleStatus').textContent = 
                available ? 'Verfügbar' : 'Nicht verfügbar';
            document.getElementById('bleStatus').className = 
                available ? 'status-available' : 'status-unavailable';
                
            if (!available) {
                document.getElementById('scanBtn').disabled = true;
                document.getElementById('scanBtn').textContent = '❌ BLE nicht verfügbar';
                this.showMessage('❌ Bluetooth ist auf diesem Gerät nicht verfügbar oder deaktiviert.', 'error');
            } else {
                console.log('✅ Bluetooth ist verfügbar');
            }
        } catch (error) {
            console.error('Bluetooth Check fehlgeschlagen:', error);
            document.getElementById('bleStatus').textContent = 'Fehler';
            document.getElementById('bleStatus').className = 'status-unavailable';
            document.getElementById('scanBtn').disabled = true;
            document.getElementById('scanBtn').textContent = '❌ BLE Fehler';
            this.showMessage('❌ Bluetooth-Fehler: ' + error.message, 'error');
        }
    }
    
    async toggleScan() {
        if (this.isScanning) {
            await this.deviceManager.stopScan();
        } else {
            const duration = parseInt(document.getElementById('scanDurationSlider').value);
            await this.startDeviceScan(duration);
        }
    }

    // VERBESSERTE SCAN-METHODE
    async startDeviceScan(duration) {
        this.isScanning = true;
        this.onScanStarted();
        
        try {
            console.log('Starte Gerätescan...');
            
            // Verwende die zuverlässige Scan-Methode
            const devices = await this.deviceManager.startAdvancedScan(duration);
            
            if (devices.length > 0) {
                console.log(`✅ ${devices.length} Gerät(e) gefunden`);
                this.showDeviceModal(devices);
            } else {
                console.log('❌ Keine Geräte gefunden');
                this.showMessage('❌ Keine kompatiblen Geräte gefunden. Stellen Sie sicher, dass der ESP32 eingeschaltet ist und advertising.', 'error');
            }
            
        } catch (error) {
            console.error('Scan fehlgeschlagen:', error);
            
            if (error.name === 'NotFoundError') {
                this.showMessage('❌ Kein Gerät ausgewählt oder gefunden.', 'error');
            } else if (error.name === 'SecurityError') {
                this.showMessage('❌ Bluetooth-Zugriff wurde verweigert. Bitte erlauben Sie den Zugriff in den Browsereinstellungen.', 'error');
            } else if (error.name === 'NotSupportedError') {
                this.showMessage('❌ Web Bluetooth wird von diesem Browser nicht unterstützt. Verwenden Sie Chrome, Edge oder Safari.', 'error');
            } else {
                this.showMessage('❌ Scan fehlgeschlagen: ' + error.message, 'error');
            }
        } finally {
            this.isScanning = false;
            this.onScanStopped();
        }
    }
    
    onScanStarted() {
        document.getElementById('scanBtn').textContent = '⏹️ Scan Stoppen';
        document.getElementById('scanBtn').classList.add('pulse');
        this.showLoading('Suche nach Sensoren...\nEs öffnet sich ein System-Dialog.');
    }
    
    onScanStopped() {
        document.getElementById('scanBtn').textContent = '🔍 Scan Starten';
        document.getElementById('scanBtn').classList.remove('pulse');
        this.hideLoading();
        
        document.getElementById('lastScanTime').textContent = new Date().toLocaleTimeString();
    }
    
    onDeviceConnected(device) {
        console.log('Gerät verbunden:', device);
        this.updateDisplay();
        this.showMessage(`✅ "${device.name}" erfolgreich verbunden`, 'success');
    }
    
    onDeviceDisconnected(deviceId) {
        console.log('Gerät getrennt:', deviceId);
        this.updateDisplay();
        this.showMessage(`❌ "${deviceId}" getrennt`, 'error');
    }
    
    onDeviceUpdated(deviceId, data) {
        this.updateSensorDisplay(deviceId, data);
    }
    
    showDeviceModal(devices) {
        const deviceList = document.getElementById('deviceList');
        deviceList.innerHTML = '';
        
        if (devices.length === 0) {
            deviceList.innerHTML = '<div class="no-devices"><p>❌ Keine Geräte gefunden</p></div>';
        } else {
            devices.forEach(device => {
                const deviceElement = document.createElement('div');
                deviceElement.className = 'device-item';
                deviceElement.innerHTML = `
                    <div class="device-icon">${this.getDeviceIcon(device)}</div>
                    <div class="device-info">
                        <div class="device-name">${device.name || 'Unbenanntes Gerät'}</div>
                        <div class="device-id">${device.id}</div>
                        <div class="device-status status-disconnected">Nicht verbunden</div>
                    </div>
                    <button class="btn primary small connect-btn" data-device-id="${device.id}">
                        Verbinden
                    </button>
                `;
                
                deviceElement.querySelector('.connect-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.connectToDevice(device);
                });
                
                deviceList.appendChild(deviceElement);
            });
        }
        
        document.getElementById('deviceModal').classList.remove('hidden');
    }
    
    hideDeviceModal() {
        document.getElementById('deviceModal').classList.add('hidden');
    }
    
    getDeviceIcon(device) {
        const name = device.name || '';
        if (name.includes('Temp')) return '🌡️';
        if (name.includes('Volt')) return '⚡';
        if (name.includes('Multi')) return '🔀';
        return '📱';
    }
    
    async connectToDevice(device) {
        this.showLoading(`Verbinde mit "${device.name}"...`);
        this.hideDeviceModal();
        
        try {
            await this.deviceManager.connectToDevice(device);
        } catch (error) {
            console.error('Verbindungsfehler:', error);
            this.showMessage(`❌ Verbindung fehlgeschlagen: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async disconnectAllDevices() {
        const connectedDevices = this.deviceManager.getConnectedDevices();
        if (connectedDevices.length === 0) {
            this.showMessage('❌ Keine Geräte verbunden', 'error');
            return;
        }
        
        if (confirm(`Möchten Sie wirklich alle ${connectedDevices.length} Geräte trennen?`)) {
            await this.deviceManager.disconnectAllDevices();
            this.updateDisplay();
            this.showMessage(`✅ Alle Geräte getrennt`, 'success');
        }
    }
    
    async applyIntervalToAllDevices() {
        const interval = parseInt(document.getElementById('intervalSlider').value);
        const connectedDevices = this.deviceManager.getConnectedDevices();
        
        if (connectedDevices.length === 0) {
            this.showMessage('❌ Keine Geräte verbunden', 'error');
            return;
        }
        
        this.showLoading(`Setze Intervall auf ${interval}s für ${connectedDevices.length} Gerät(e)...`);
        
        try {
            const promises = connectedDevices.map(device => 
                this.deviceManager.setUpdateInterval(device.id, interval)
            );
            
            await Promise.all(promises);
            this.showMessage(`✅ Intervall auf ${interval}s für alle Geräte gesetzt`, 'success');
        } catch (error) {
            console.error('Fehler beim Setzen des Intervalls:', error);
            this.showMessage(`❌ Fehler: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    updateDisplay() {
        const connectedDevices = this.deviceManager.getConnectedDevices();
        const connectedCount = connectedDevices.length;
        
        // Device Count
        document.getElementById('deviceCount').textContent = `${connectedCount} verbunden`;
        document.getElementById('connectedDevicesCount').textContent = connectedCount;
        
        // Sensor Count
        const sensorCount = connectedDevices.reduce((count, device) => {
            return count + (device.type === 2 ? 2 : 1); // Multi-Sensor hat 2 Sensoren
        }, 0);
        document.getElementById('sensorCount').textContent = `${sensorCount} Sensoren`;
        
        // Available Devices List
        this.updateAvailableDevicesList(connectedDevices);
        
        // Sensor Dashboard
        this.updateSensorDashboard(connectedDevices);
    }
    
    updateAvailableDevicesList(devices) {
        const container = document.getElementById('availableDevices');
        
        if (devices.length === 0) {
            container.innerHTML = `
                <div class="no-devices">
                    <p>🔍 Keine Geräte verbunden</p>
                    <p class="hint">Klicke auf "Scan Starten" um nach Sensoren zu suchen</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = devices.map(device => `
            <div class="device-item" data-device-id="${device.id}">
                <div class="device-icon">${this.getDeviceIcon(device)}</div>
                <div class="device-info">
                    <div class="device-name">${device.name}</div>
                    <div class="device-id">${device.id}</div>
                    <div class="device-status status-connected">Verbunden</div>
                </div>
                <button class="btn error small disconnect-btn" data-device-id="${device.id}">
                    Trennen
                </button>
            </div>
        `).join('');
        
        // Event Listener für Disconnect Buttons
        container.querySelectorAll('.disconnect-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const deviceId = e.target.dataset.deviceId;
                const device = this.deviceManager.getConnectedDevice(deviceId);
                if (device && confirm(`"${device.name}" trennen?`)) {
                    await this.deviceManager.disconnectDevice(deviceId);
                }
            });
        });
    }
    
    updateSensorDashboard(devices) {
        const dashboard = document.getElementById('sensorDashboard');
        
        if (devices.length === 0) {
            dashboard.innerHTML = `
                <div class="no-sensors">
                    <p>🌡️⚡ Keine Sensoren verbunden</p>
                    <p class="hint">Verbinde Geräte um deren Daten hier zu sehen</p>
                </div>
            `;
            return;
        }
        
        dashboard.innerHTML = devices.map(device => {
            const sensors = [];
            
            if (device.type === 0 || device.type === 2) { // Temperatur oder Multi
                sensors.push(`
                    <div class="sensor-card">
                        <div class="sensor-header">
                            <div class="sensor-icon">🌡️</div>
                            <div class="sensor-info">
                                <div class="sensor-name">Temperatur</div>
                                <div class="sensor-type">${device.name}</div>
                            </div>
                        </div>
                        <div class="sensor-value temp-value" id="temp-${device.id}">
                            ${device.temperature || '--'}°C
                        </div>
                        <div class="sensor-meta">
                            <span>Letzte Aktualisierung</span>
                            <span id="temp-time-${device.id}">${device.lastUpdate || '--'}</span>
                        </div>
                        <div class="sensor-meta">
                            <span>Update-Intervall</span>
                            <span>${device.interval}s</span>
                        </div>
                    </div>
                `);
            }
            
            if (device.type === 1 || device.type === 2) { // Spannung oder Multi
                sensors.push(`
                    <div class="sensor-card">
                        <div class="sensor-header">
                            <div class="sensor-icon">⚡</div>
                            <div class="sensor-info">
                                <div class="sensor-name">Spannung</div>
                                <div class="sensor-type">${device.name}</div>
                            </div>
                        </div>
                        <div class="sensor-value voltage-value" id="voltage-${device.id}">
                            ${device.voltage || '--'}V
                        </div>
                        <div class="sensor-meta">
                            <span>Letzte Aktualisierung</span>
                            <span id="voltage-time-${device.id}">${device.lastUpdate || '--'}</span>
                        </div>
                        <div class="sensor-meta">
                            <span>Update-Intervall</span>
                            <span>${device.interval}s</span>
                        </div>
                    </div>
                `);
            }
            
            return sensors.join('');
        }).join('');
    }
    
    updateSensorDisplay(deviceId, data) {
        const device = this.deviceManager.getConnectedDevice(deviceId);
        if (!device) return;
        
        const now = new Date().toLocaleTimeString();
        
        if (data.type === 'temperature' && device.type !== 1) { // Nicht reiner Spannungssensor
            const element = document.getElementById(`temp-${deviceId}`);
            const timeElement = document.getElementById(`temp-time-${deviceId}`);
            if (element) {
                element.textContent = `${data.value}°C`;
                element.classList.add('pulse');
                setTimeout(() => element.classList.remove('pulse'), 1000);
            }
            if (timeElement) timeElement.textContent = now;
        }
        
        if (data.type === 'voltage' && device.type !== 0) { // Nicht reiner Temperatursensor
            const element = document.getElementById(`voltage-${deviceId}`);
            const timeElement = document.getElementById(`voltage-time-${deviceId}`);
            if (element) {
                element.textContent = `${data.value}V`;
                element.classList.add('pulse');
                setTimeout(() => element.classList.remove('pulse'), 1000);
            }
            if (timeElement) timeElement.textContent = now;
        }
    }
    
    showLoading(message = 'Lädt...') {
        document.getElementById('loadingText').textContent = message;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }
    
    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
    
    showMessage(message, type = 'info') {
        // Verwende Browser-Alert für einfache Fehlermeldungen
        if (type === 'error') {
            alert('❌ ' + message);
        } else if (type === 'success') {
            alert('✅ ' + message);
        } else {
            alert('ℹ️ ' + message);
        }
    }
}

// App starten wenn DOM geladen
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MultiSensorApp();
    console.log('✅ MultiSensor App gestartet');
});
