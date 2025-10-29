// Haupt-Anwendungslogik - SYSTEM-DIALOG VERSION
class MultiSensorApp {
    constructor() {
        this.deviceManager = new DeviceManager();
        this.isScanning = false;
        this.currentScanDuration = 15;
        
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
            this.startScan();
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
        
        // Debug Buttons
        document.getElementById('testNotifications').addEventListener('click', () => {
            this.testNotifications();
        });
        
        document.getElementById('readCurrentValue').addEventListener('click', () => {
            this.readCurrentValue();
        });
        
        document.getElementById('forceUpdate').addEventListener('click', () => {
            this.forceUpdate();
        });
        
        // Modal Close
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideDeviceModal();
        });
        
        // Rescan Button
        document.getElementById('rescanBtn').addEventListener('click', () => {
            this.hideDeviceModal();
            setTimeout(() => this.startScan(), 500);
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
    
    // SYSTEM-DIALOG SCAN
    async startScan() {
        if (this.isScanning) {
            console.log('Scan läuft bereits');
            return;
        }
        
        this.isScanning = true;
        this.onScanStarted();
        
        try {
            console.log(`🔍 Starte Scan mit System-Dialog für ${this.currentScanDuration} Sekunden...`);
            
            const devices = await this.deviceManager.startScan(this.currentScanDuration);
            
            if (devices.length > 0) {
                console.log(`✅ ${devices.length} Gerät(e) gefunden - zeige Auswahl`);
                this.showDeviceModal(devices);
            } else {
                console.log('❌ Keine Geräte gefunden');
                this.showMessage('❌ Kein Gerät ausgewählt oder keine Geräte gefunden.', 'error');
            }
            
        } catch (error) {
            console.error('❌ Scan fehlgeschlagen:', error);
            
            if (error.name === 'NotFoundError') {
                this.showMessage('❌ Kein Gerät ausgewählt.', 'error');
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
        document.getElementById('scanBtn').textContent = '📡 Scannt...';
        document.getElementById('scanBtn').classList.add('pulse');
        this.showLoading('Öffne Bluetooth-Geräteauswahl...\nWähle deinen ESP32 aus der Liste.');
    }
    
    onScanStopped() {
        document.getElementById('scanBtn').textContent = '🔍 Auto Scan';
        document.getElementById('scanBtn').classList.remove('pulse');
        this.hideLoading();
        
        document.getElementById('lastScanTime').textContent = new Date().toLocaleTimeString();
    }
    
    onDeviceConnected(device) {
        console.log('✅ Gerät verbunden:', device.name);
        this.updateDisplay();
        this.showMessage(`✅ "${device.name}" erfolgreich verbunden`, 'success');
        
        // Debug-Info
        console.log('🔧 Gerätedetails:', {
            id: device.id,
            type: device.type,
            interval: device.interval
        });
    }
    
    onDeviceDisconnected(deviceId) {
        console.log('🔌 Gerät getrennt:', deviceId);
        this.updateDisplay();
        this.showMessage(`❌ Gerät getrennt`, 'error');
    }
    
    onDeviceUpdated(deviceId, data) {
        console.log('📨 Daten empfangen:', deviceId, data);
        this.updateSensorDisplay(deviceId, data);
    }
    
    // DEBUG-FUNKTIONEN
    async testNotifications() {
        const connectedDevices = this.deviceManager.getConnectedDevices();
        if (connectedDevices.length === 0) {
            this.showMessage('❌ Keine Geräte verbunden', 'error');
            return;
        }
        
        const device = connectedDevices[0];
        this.showMessage(`🔔 Teste Verbindung für "${device.name}"... Prüfe Browser-Konsole!`, 'info');
        
        console.log('🧪 ===== VERBINDUNGS-TEST =====');
        console.log('🧪 Gerät:', device.name);
        console.log('🧪 Type:', device.type);
        console.log('🧪 Interval:', device.interval + 's');
        console.log('🧪 Verbunden:', this.deviceManager.isDeviceConnected(device.id));
        console.log('🧪 Warte auf Daten...');
        console.log('🧪 ===== TEST ENDE =====');
    }
    
    async readCurrentValue() {
        const connectedDevices = this.deviceManager.getConnectedDevices();
        if (connectedDevices.length === 0) {
            this.showMessage('❌ Keine Geräte verbunden', 'error');
            return;
        }
        
        try {
            const device = connectedDevices[0];
            this.showLoading('Lese aktuellen Wert...');
            
            console.log('📖 Versuche aktuellen Wert zu lesen...');
            const result = await this.deviceManager.readCurrentValue(device.id);
            
            if (result) {
                console.log('📖 AKTUELLER WERT:', result.value + (result.type === 'temperature' ? '°C' : 'V'));
                this.showMessage(`📖 Aktueller Wert: ${result.value}${result.type === 'temperature' ? '°C' : 'V'}`, 'success');
                
                // Aktualisiere die Anzeige
                this.updateSensorDisplay(device.id, result);
            }
            
        } catch (error) {
            console.error('❌ Fehler beim Lesen:', error);
            this.showMessage('❌ Fehler beim Lesen des Wertes: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async forceUpdate() {
        const connectedDevices = this.deviceManager.getConnectedDevices();
        if (connectedDevices.length === 0) {
            this.showMessage('❌ Keine Geräte verbunden', 'error');
            return;
        }
        
        try {
            const device = connectedDevices[0];
            console.log('🔄 Erzwinge Daten-Update...');
            
            // Setze Intervall auf 1s für schnelleres Testen
            await this.deviceManager.setUpdateInterval(device.id, 1);
            this.showMessage('🔄 Update-Intervall auf 1s gesetzt - Daten sollten schneller kommen', 'success');
            
            // Nach 10 Sekunden zurücksetzen
            setTimeout(async () => {
                try {
                    await this.deviceManager.setUpdateInterval(device.id, 2);
                    console.log('⏱️ Intervall zurückgesetzt auf 2s');
                } catch (error) {
                    console.error('Fehler beim Zurücksetzen:', error);
                }
            }, 10000);
            
        } catch (error) {
            console.error('❌ Fehler beim Force-Update:', error);
            this.showMessage('❌ Fehler: ' + error.message, 'error');
        }
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
        if (name.includes('Temp')) return '🌡️';
        if (name.includes('Volt')) return '⚡';
        if (name.includes('Multi')) return '🔀';
        return '📱';
    }
    
    async connectToDevice(device) {
        this.showLoading(`Verbinde mit "${device.name}"...`);
        this.hideDeviceModal();  // WICHTIG: Modal sofort schließen
        
        try {
            await this.deviceManager.connectToDevice(device);
            // Bei Erfolg: Display wird durch onDeviceConnected aktualisiert
        } catch (error) {
            console.error('Verbindungsfehler:', error);
            this.showMessage(`❌ ${error.message}`, 'error');
            this.updateDisplay(); // UI zurücksetzen bei Fehler
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
            this.showLoading('Trenne Geräte...');
            try {
                await this.deviceManager.disconnectAllDevices();
                this.updateDisplay();
                this.showMessage(`✅ Alle Geräte getrennt`, 'success');
            } catch (error) {
                console.error('Fehler beim Trennen:', error);
                this.showMessage('❌ Fehler beim Trennen der Geräte', 'error');
            } finally {
                this.hideLoading();
            }
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
                    <p class="hint">Klicke auf "Auto Scan" um nach Sensoren zu suchen</p>
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
                    this.showLoading(`Trenne "${device.name}"...`);
                    try {
                        await this.deviceManager.disconnectDevice(deviceId);
                        this.updateDisplay();
                    } catch (error) {
                        console.error('Fehler beim Trennen:', error);
                        this.showMessage('❌ Fehler beim Trennen', 'error');
                    } finally {
                        this.hideLoading();
                    }
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
        // Einfache Alert-Implementation
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
    console.log('🚀 SensorDashboard App gestartet');
});
