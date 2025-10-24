// app.js — Web Bluetooth client + UI logic
const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';


let device = null;
let characteristic = null;
let notifying = false;


const connectBtn = document.getElementById('connectBtn');
const tempValue = document.getElementById('tempValue');
const lastUpdate = document.getElementById('lastUpdate');
const deviceNameEl = document.getElementById('deviceName');
const notifyToggle = document.getElementById('notifyToggle');


connectBtn.addEventListener('click', async ()=>{
try{
await connectToDevice();
}catch(e){
alert('Fehler beim Verbinden: ' + e);
console.error(e);
}
});


notifyToggle.addEventListener('click', async ()=>{
if(!characteristic) return;
if(notifying){
await characteristic.stopNotifications();
notifying = false;
notifyToggle.textContent = 'Benachrichtigungen an';
} else {
await characteristic.startNotifications();
notifying = true;
notifyToggle.textContent = 'Benachrichtigungen aus';
}
});


async function connectToDevice(){
// Filter by service
const opts = {filters: [{services: [SERVICE_UUID]}]};
device = await navigator.bluetooth.requestDevice(opts);
deviceNameEl.textContent = device.name || 'ESP32_TempSim';
const server = await device.gatt.connect();
const service = await server.getPrimaryService(SERVICE_UUID);
characteristic = await service.getCharacteristic(CHAR_UUID);


// Read once
try{
const val = await characteristic.readValue();
handleTemperatureValue(val);
}catch(e){ console.log('read failed', e); }


// Start notifications automatically
await characteristic.startNotifications();
notifying = true;
notifyToggle.textContent = 'Benachrichtigungen aus';
characteristic.addEventListener('characteristicvaluechanged', e => {
handleTemperatureValue(e.target.value);
});
}


function handleTemperatureValue(dataView){
// ESP32 schickt ASCII-String wie "23.45"
const decoder = new TextDecoder('utf-8');
const raw = decoder.decode(dataView.buffer);
tempValue.textContent = raw + '°C';
lastUpdate.textContent = new Date().toLocaleTimeString();
}


// PWA: register service worker
if('serviceWorker' in navigator){
navigator.serviceWorker.register('sw.js').then(()=>console.log('SW registered'))
}
