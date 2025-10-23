// Configuration
const CONFIG = {
    SERVICE_UUID: '12345678-1234-5678-1234-1234567890ab',
    CHAR_TEMP_UUID: 'abcd1234-5678-90ab-cdef-1234567890ab',
    CHAR_INTERVAL_UUID: 'feed0001-0000-1000-8000-00805f9b34fb',
    STORAGE_KEY: 'outback_temp_records_v2',
    DEVICE_FILTERS: [
        { namePrefix: 'ESP32C3' },
        { namePrefix: 'ESP32' }
    ]
};

// State management
class AppState {
    constructor() {
        this.device = null;
        this.server = null;
        this.tempChar = null;
        this.intervalChar = null;
        this.wakeLock = null;
        this.records = this.loadRecords();
    }

    loadRecords() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
        } catch (e) {
            console.error('Failed to load records:', e);
            return [];
        }
    }

    saveRecords() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.records));
        } catch (e) {
            console.error('Failed to save records:', e);
        }
    }

    addRecord(temperature) {
        const record = {
            timestamp: new Date().toISOString(),
            temperature: parseFloat(temperature).toFixed(2)
        };
        
        this.records.push(record);
        this.saveRecords();
        return record;
    }

    clearRecords() {
        this.records = [];
        this.saveRecords();
    }

    getRecordCount() {
        return this.records.length;
    }
}

// UI Manager
class UIManager {
    constructor() {
        this.elements = this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        return {
            status: document.getElementById('status'),
            temp: document.getElementById('temp'),
            lastUpdate: document.getElementById('lastUpdate'),
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            clearBtn: document.getElementById('clearBtn'),
            intervalSlider: document.getElementById('intervalSlider'),
            intervalLabel: document.getElementById('intervalLabel'),
            wakeLock: document.getElementById('wakeLock'),
            exportBtn: document.getElementById('exportBtn'),
            dataLog: document.getElementById('dataLog'),
            connectionStats: document.getElementById('connectionStats')
        };
    }

    bindEvents() {
        this.elements.intervalSlider.addEventListener('input', (e) => {
            this.updateIntervalLabel(e.target.value);
        });

        this.elements.wakeLock.addEventListener('change', (e) => {
            this.onWakeLockChange(e.target.checked);
        });
    }

    updateIntervalLabel(value) {
        this.elements.intervalLabel.textContent = `${value} s`;
    }

    async onWakeLockChange(enabled) {
        if (enabled) {
            await this.requestWakeLock();
        } else {
            this.releaseWakeLock();
        }
    }

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.log('WakeLock aktiviert');
            } else {
                this.log('WakeLock API nicht verfügbar');
            }
        } catch (e) {
            this.log(`WakeLock Fehler: ${e.message}`);
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
            this.log('WakeLock deaktiviert');
        }
    }

    updateConnectionStatus(connected, deviceName = '') {
        const statusEl = this.elements.status;
        
        if (connected) {
            statusEl.textContent = `🔋 Verbunden: ${deviceName}`;
            statusEl.className = 'small status-connected';
        } else {
            statusEl.textContent = '🔌 Getrennt';
            statusEl.className = 'small status-disconnected';
        }
    }

    updateTemperature(temperature) {
        this.elements.temp.textContent = `${temperature} °C`;
        this.elements.lastUpdate.textContent = new Date().toLocaleString();
    }

    log(message) {
        const timestamp = new Date().toLocaleString();
        const logEntry = `${timestamp}  ${message}`;
        
        this.elements.dataLog.innerText = logEntry + '\n' + this.elements.dataLog.innerText;
    }

    renderRecords(records) {
        if (!records.length) {
            this.elements.dataLog.innerText = 'Keine Datensätze';
            return;
        }

        const logContent = records
            .slice()
            .reverse()
            .map(record => 
                `${new Date(record.timestamp).toLocaleString()}  ${record.temperature} °C`
            )
            .join('\n');
        
        this.elements.dataLog.innerText = logContent;
    }

    updateStats(recordCount) {
        this.elements.connectionStats.textContent = `Datenpunkte: ${recordCount}`;
    }
}

// Bluetooth Manager
class BluetoothManager {
    constructor(uiManager, appState) {
        this.ui = uiManager;
        this.state = appState;
        this.isConnecting = false;
    }

    async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            if (!navigator.bluetooth) {
                throw new Error('Web Bluetooth nicht verfügbar. Auf iPhone: Bluefy/WebBLE nutzen.');
            }

            this.ui.log('Suche Gerät...');

            const device = await navigator.bluetooth.requestDevice({
                filters: CONFIG.DEVICE_FILTERS,
                optionalServices: [CONFIG.SERVICE_UUID]
            });

            device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
            
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(CONFIG.SERVICE_UUID);
            
            const tempChar = await service.getCharacteristic(CONFIG.CHAR_TEMP_UUID);
            const intervalChar = await service.getCharacteristic(CONFIG.CHAR_INTERVAL_UUID);

            await this.setupTemperatureNotifications(tempChar);
            await this.setupIntervalCharacteristic(intervalChar);

            this.state.device = device;
            this.state.server = server;
            this.state.tempChar = tempChar;
            this.state.intervalChar = intervalChar;

            this.ui.updateConnectionStatus(true, device.name || device.id);
            this.ui.log(`Verbunden mit ${device.name || device.id}`);

        } catch (error) {
            this.ui.log(`Verbindungsfehler: ${error.message}`);
            console.error('Bluetooth connection error:', error);
        } finally {
            this.isConnecting = false;
        }
    }

    async setupTemperatureNotifications(characteristic) {
        await characteristic.startNotifications();
        
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = new TextDecoder().decode(event.target.value);
            const temperature = parseFloat(value);
            
            if (!isNaN(temperature)) {
                const formattedTemp = temperature.toFixed(2);
                this.ui.updateTemperature(formattedTemp);
                
                const record = this.state.addRecord(formattedTemp);
                this.ui.log(`Gemessen: ${record.temperature} °C`);
                this.ui.updateStats(this.state.getRecordCount());
            } else {
                this.ui.log(`Ungültiger Temperaturwert: ${value}`);
            }
        });
    }

    async setupIntervalCharacteristic(characteristic) {
        // Read current interval
        try {
            const value = await characteristic.readValue();
            const intervalText = new TextDecoder().decode(value);
            const interval = parseInt(intervalText);
            
            if (!isNaN(interval)) {
                this.ui.elements.intervalSlider.value = interval;
                this.ui.updateIntervalLabel(interval);
                this.ui.log(`Intervall gelesen: ${interval} s`);
            }
        } catch (error) {
            this.ui.log('Intervall lesen fehlgeschlagen');
        }

        // Setup interval change handler
        this.ui.elements.intervalSlider.addEventListener('change', async (event) => {
            const newInterval = parseInt(event.target.value);
            
            if (this.state.intervalChar) {
                try {
                    const encoder = new TextEncoder();
                    await this.state.intervalChar.writeValue(encoder.encode(newInterval.toString()));
                    this.ui.log(`Intervall gesetzt: ${newInterval} s`);
                } catch (error) {
                    this.ui.log(`Intervall schreiben fehlgeschlagen: ${error.message}`);
                }
            }
        });
    }

    onDisconnected() {
        this.ui.log('Gerät getrennt');
        this.ui.updateConnectionStatus(false);
        
        this.state.device = null;
        this.state.server = null;
        this.state.tempChar = null;
        this.state.intervalChar = null;
    }

    async disconnect() {
        if (this.state.device?.gatt?.connected) {
            this.state.device.gatt.disconnect();
            this.ui.log('Verbindung getrennt');
        }
    }
}

// Export functionality
class DataExporter {
    static exportToCSV(records) {
        const headers = 'timestamp,temperature_celsius\n';
        const csvContent = records.map(record => 
            `${record.timestamp},${record.temperature}`
        ).join('\n');
        
        return headers + csvContent;
    }

    static downloadCSV(records, filename) {
        const csv = this.exportToCSV(records);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// Main Application
class TemperatureApp {
    constructor() {
        this.state = new AppState();
        this.ui = new UIManager();
        this.bluetooth = new BluetoothManager(this.ui, this.state);
        
        this.initializeApp();
    }

    initializeApp() {
        this.bindEventListeners();
        this.ui.renderRecords(this.state.records);
        this.ui.updateStats(this.state.getRecordCount());
        this.ui.updateIntervalLabel(this.ui.elements.intervalSlider.value);
        
        console.log('Temperature App initialized');
    }

    bindEventListeners() {
        this.ui.elements.connectBtn.addEventListener('click', () => {
            this.bluetooth.connect();
        });

        this.ui.elements.disconnectBtn.addEventListener('click', () => {
            this.bluetooth.disconnect();
        });

        this.ui.elements.clearBtn.addEventListener('click', () => {
            this.state.clearRecords();
            this.ui.renderRecords(this.state.records);
            this.ui.updateStats(this.state.getRecordCount());
            this.ui.log('Lokale Daten gelöscht');
        });

        this.ui.elements.exportBtn.addEventListener('click', () => {
            if (!this.state.records.length) {
                alert('Keine Daten zum Exportieren');
                return;
            }

            const filename = `temperature_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
            DataExporter.downloadCSV(this.state.records, filename);
            this.ui.log(`CSV exportiert: ${filename}`);
        });
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TemperatureApp();
});
