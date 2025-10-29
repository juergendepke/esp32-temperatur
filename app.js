// Haupt-Anwendungslogik mit AUTOMATISCHEM SCAN
class MultiSensorApp {
    constructor() {
        this.deviceManager = new DeviceManager();
        this.isScanning = false;
        this.scanProgressInterval = null;
        this.currentScanDuration = 15;
        
        this.initializeApp();
    }
    
    initializeApp() {
        this.bindEvents();
        this.checkBluetoothAvailability();
        this.updateDisplay();
    }
    
    bindEvents() {
        // Scan Button - AUTOMATISCHER SCAN
        document.getElementById('scanBtn').addEventListener('click', () => {
            this.startAutoScan();
        });
        
        // Stop Scan Button
        document.getElementById('stopScanBtn').addEventListener('click', () => {
            this.stopAutoScan();
        });
        
        // Disconnect All Button
        document.getElementById('disconnectAllBtn').addEventListener('click', () => {
            this.disconnectAllDevices();
        });
        
        // Interval Slider
        document.getElementById('intervalSlider').addEventListener('input', (e) => {
            document.getElementById('intervalValue').textContent = e.target.value;
        });
        
        // Scan Duration Slider
        document.getElementById('scanDurationSlider').addEventListener('input', (e) => {
            this.currentScanDuration = parseInt(e.target.value);
            document.getElementById('scanDurationValue').textContent = this.currentScanDuration;
        });
        
        // Apply Interval Button
        document.getElementById('applyInterval').addEventListener('click', () => {
            this.applyIntervalToAllDevices();
        });
        
        // Modal Close
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideDeviceModal();
        });
        
        // Rescan Button
        document.getElementById('rescanBtn').addEventListener('click', () => {
            this.hideDeviceModal();
            setTimeout(() => this.startAutoScan(), 500);
        });
        
        // Modal Background Click
        document.getElementById('deviceModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('deviceModal')) {
                this.hideDeviceModal();
            }
        });
        
        // Device Manager Events
        this.deviceManager.on('scanStarted', () => {
            this.onScanStarted();
        });
        
        this.deviceManager.on('scanStopped', (devices) => {
            this.onScanStopped(devices);
        });
        
        this.deviceManager.on('deviceFound', (devices) => {
            this.onDeviceFound(devices);
        });
        
        this.deviceManager.on('deviceConnected', (device) => {
            this.onDeviceConnected(device);
        });
        
        this.deviceManager.on('deviceDisconnected', (deviceId) => {
            this.onDeviceDisconnected(deviceId);
        });
        
        this.deviceManager.on('deviceUpdated', (deviceId, data) => {
            this.onDeviceUpdated(deviceId, data);
        });
    }
    
    async checkBluetoothAvailability() {
        try {
            if (!navigator.bluetooth) {
                throw new Error('Web Bluetooth API nicht unterstützt');
            }
            
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
    
    // AUTOMATISCHER SCAN - Hauptfunktion
    async startAutoScan() {
        if (this.isScanning) {
            console.log('Scan läuft bereits');
            return;
        }
        
        this.isScanning = true;
        this.showScanProgress();
        
        try {
            console.log(`🔄 Starte AUTO-SCAN für ${this.currentScanDuration} Sekunden...`);
            
            // Starte den automatischen Scan
            await this.deviceManager.startAutoScan(this.currentScanDuration);
            
        } catch (error) {
            console.error('❌ AUTO-SCAN fehlgeschlagen:', error);
            this.isScanning = false;
            this.hideScanProgress();
            this.showMessage(`❌ Auto-Scan fehlgeschlagen: ${error.message}`, 'error');
        }
    }
    
    // Scan stoppen
    async stopAutoScan() {
        if (!this.isScanning) return;
        
        await this.deviceManager.stopAutoScan();
        this.isScanning = false;
        this.hideScanProgress();
        console.log('⏹️ AUTO-SCAN manuell gestoppt');
    }
    
    // Scan Fortschritt anzeigen
    showScanProgress() {
        const scanProgress = document.getElementById('scanProgress');
        const scanProgressBar = document.getElementById('scanProgressBar');
        const scanProgressText = document.getElementById('scanProgressText');
        const foundDevicesCount = document.getElementById('foundDevicesCount');
        
        scanProgressText.textContent = `🔍 Scanne nach Sensoren... (${this.currentScanDuration}s)`;
        foundDevicesCount.innerHTML = 'Gefundene Geräte: <strong>0</strong>';
        scanProgressBar.style.width = '0%';
        
        scanProgress.classList.remove('hidden');
        
        // Fortschrittsbalken Animation
        let elapsed = 0;
        const updateInterval = 100; // ms
        
        this.scanProgressInterval = setInterval(() => {
            elapsed += updateInterval;
            const progress = (elapsed / (this.currentScanDuration * 1000)) * 100;
            scanProgressBar.style.width = `${Math.min(progress, 100)}%`;
            
            const remaining = Math.max(0, this.currentScanDuration - Math.floor(elapsed / 1000));
            scanProgressText.textContent = `🔍 Scanne... ${remaining}s verbleibend`;
            
            if (progress >= 100) {
                clearInterval(this.scanProgressInterval);
            }
        }, updateInterval);
    }
    
    hideScanProgress() {
        const scanProgress = document.getElementById('scanProgress');
        scanProgress.classList.add('hidden');
        
        if (this.scanProgressInterval) {
            clearInterval(this.scanProgressInterval);
            this.scanProgressInterval = null;
        }
    }
    
    onScanStarted() {
        document.getElementById('scanBtn').textContent = '🔄 Scannt...';
        document.getElementById('scanBtn').classList.add('scanning-animation');
        console.log('✅ Scan gestartet');
    }
    
    onScanStopped(devices) {
        this.isScanning = false;
        this.hideScanProgress();
        
        document.getElementById('scanBtn').textContent = '🔍 Auto Scan';
        document.getElementById('scanBtn').classList.remove('scanning-animation');
        
        document.getElementById('lastScanTime').textContent = new Date().toLocaleTimeString();
        
        if (devices.length > 0) {
            console.log(`✅ ${devices.length} Gerät(e) gefunden - zeige Auswahl`);
            this.showDeviceModal(devices);
        } else {
            console.log('❌ Keine Geräte gefunden');
            this.showMessage('❌ Keine ESP32 Sensoren gefunden. Stellen Sie sicher, dass die Geräte eingeschaltet sind.', 'error');
        }
    }
    
    onDeviceFound(devices) {
        // Aktualisiere die Anzahl der gefundenen Geräte im Progress-Fenster
        const foundDevicesCount = document.getElementById('foundDevicesCount');
        foundDevicesCount.innerHTML = `Gefundene Geräte: <strong>${devices.length}</strong>`;
        
        console.log(`📊 Aktuell ${devices.length} Geräte gefunden`);
    }
    
    onDeviceConnected(device) {
        console.log('✅ Gerät verbunden:', device.name);
        this.updateDisplay();
        this.showMessage(`✅ "${device.name}" erfolgreich verbunden`, 'success');
    }
    
    onDeviceDisconnected(deviceId) {
        console.log('🔌 Gerät getrennt:', deviceId);
        this.updateDisplay();
        this.showMessage(`❌ "${deviceId}" getrennt`, 'error');
    }
    
    onDeviceUpdated(deviceId, data) {
        this.updateSensorDisplay(deviceId, data);
    }
    
    showDeviceModal(devices) {
        const deviceList = document.getElementById('deviceList');
        
        if (devices.length === 0) {
            deviceList.innerHTML = `
                <div class="no-devices">
                    <p>❌ Keine Geräte gefunden</p>
                    <p class="hint">Stellen Sie sicher, dass die ESP32 Geräte eingeschaltet sind</p>
                </div>
            `;
        } else {
            deviceList.innerHTML = devices.map(device => `
                <div class="device-item" data-device-id="${device.id}">
                    <div class="device-icon">${this.getDeviceIcon(device)}</div>
                    <div class="device-info">
                        <div class="device-name">${device.name || 'Unbekanntes Gerät'}</div>
                        <div class="device-id">${device.id.substring(0, 8)}...</div>
                        <div class="device-status status-disconnected">Bereit zum Verbinden</div>
                    </div>
                    <button class="btn primary small connect-btn" data-device-id="${device.id}">
                        Verbinden
                    </button>
                </div>
            `).join('');
            
            // Event Listener für Connect Buttons
            deviceList.querySelectorAll('.connect-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const deviceId = e.target.dataset.deviceId;
                    const device = devices.find(d => d.id === deviceId);
                    if (device) {
                        await this.connectToDevice(device);
                    }
                });
            });
        }
        
        document.getElementById('deviceModal').classList.remove('hidden');
    }
    
    hideDeviceModal() {
        document.getElementById('deviceModal').classList.add('hidden');
    }
    
    getDeviceIcon(device) {
        const name = device.name || '';
        if (name.includes('Temp-')) return '🌡️';
        if (name.includes('Volt-')) return '⚡';
        if (name.includes('Multi-')) return '🔀';
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
        
        const deviceNames = connectedDevices.map(d => d.name).join(', ');
        if (confirm(`Möchten Sie wirklich alle ${connectedDevices.length} Geräte trennen?\n\n${deviceNames}`)) {
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
            return count + (device.type === 2 ? 2 : 1);
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
                    <p class="hint">Klicke auf "Auto Scan" um automatisch nach Sensoren zu suchen</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = devices.map(device => `
            <div class="device-item" data-device-id="${device.id}">
                <div class="device-icon">${this.getDeviceIcon(device)}</div>
                <div class="device-info">
                    <div class="device-name">${device.name}</div>
                    <div class="device-id">${device.id.substring(0, 8)}...</div>
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
            
            if (device.type === 0 || device.type === 2) {
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
            
            if (device.type === 1 || device.type === 2) {
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
        
        if (data.type === 'temperature' && device.type !== 1) {
            const element = document.getElementById(`temp-${deviceId}`);
            const timeElement = document.getElementById(`temp-time-${deviceId}`);
            if (element) {
                element.textContent = `${data.value}°C`;
                element.classList.add('pulse');
                setTimeout(() => element.classList.remove('pulse'), 1000);
            }
            if (timeElement) timeElement.textContent = now;
        }
        
        if (data.type === 'voltage' && device.type !== 0) {
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
        if (type === 'error') {
            alert('❌ ' + message);
        } else if (type === 'success') {
            alert('✅ ' + message);
        } else {
            alert('ℹ️ ' + message);
        }
    }
}

// App starten
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MultiSensorApp();
    console.log('🚀 SensorDashboard mit AUTO-SCAN gestartet');
});
