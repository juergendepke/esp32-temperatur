/*
  ESP32-C3 BLE Temperature Sensor
  Robuste vereinfachte Version
*/

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Configuration
#define DEVICE_NAME "ESP32C3-Temp"
#define SERVICE_UUID "12345678-1234-5678-1234-1234567890ab"
#define CHAR_TEMP_UUID "abcd1234-5678-90ab-cdef-1234567890ab"
#define CHAR_INTERVAL_UUID "feed0001-0000-1000-8000-00805f9b34fb"

#define SERIAL_BAUD 115200
#define LOOP_DELAY_MS 10
#define DEFAULT_INTERVAL 2
#define MIN_INTERVAL 1
#define MAX_INTERVAL 30

// Global instances
BLEServer* pServer = nullptr;
BLECharacteristic* pTempChar = nullptr;
BLECharacteristic* pIntervalChar = nullptr;

// Device state
bool deviceConnected = false;
int intervalSeconds = DEFAULT_INTERVAL;
unsigned long lastNotifyMs = 0;
float temperature = 22.0;

// Server callbacks
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("BLE: Device connected");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("BLE: Device disconnected");
    pServer->getAdvertising()->start();
    Serial.println("BLE: Advertising restarted");
  }
};

// Interval characteristic callbacks
class IntervalCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String value = pCharacteristic->getValue();
    if (value.length() == 0) return;

    int newInterval = value.toInt();
    if (newInterval < MIN_INTERVAL) newInterval = MIN_INTERVAL;
    if (newInterval > MAX_INTERVAL) newInterval = MAX_INTERVAL;
    
    intervalSeconds = newInterval;
    Serial.printf("Interval set to: %d s\n", newInterval);

    // Update characteristic value and notify
    String intervalStr = String(newInterval);
    pIntervalChar->setValue(intervalStr.c_str());
    
    if (deviceConnected) {
      pIntervalChar->notify();
    }
  }
};

float readTemperature() {
  // Simulate temperature with random walk
  float delta = (random(-50, 51)) / 100.0f; // -0.5 to +0.5
  temperature += delta;
  if (temperature < -10.0) temperature = -10.0;
  if (temperature > 50.0) temperature = 50.0;
  return temperature;
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);
  
  Serial.println();
  Serial.println("=== ESP32-C3 BLE Temperature Sensor ===");

  // BLE Setup
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  // Temperature Characteristic
  pTempChar = pService->createCharacteristic(
    CHAR_TEMP_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pTempChar->addDescriptor(new BLE2902());

  // Interval Characteristic
  pIntervalChar = pService->createCharacteristic(
    CHAR_INTERVAL_UUID,
    BLECharacteristic::PROPERTY_READ | 
    BLECharacteristic::PROPERTY_WRITE | 
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pIntervalChar->setCallbacks(new IntervalCallbacks());
  pIntervalChar->addDescriptor(new BLE2902());

  // Set initial interval value
  String initInterval = String(DEFAULT_INTERVAL);
  pIntervalChar->setValue(initInterval.c_str());

  pService->start();

  // Advertising
  BLEAdvertising* pAdvertising = pServer->getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->start();

  Serial.println("BLE initialized and advertising started");
  Serial.printf("Initial interval: %d s\n", DEFAULT_INTERVAL);
  Serial.println("Ready for connections...");
}

void loop() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastNotifyMs >= (unsigned long)intervalSeconds * 1000) {
    lastNotifyMs = currentTime;
    
    float temp = readTemperature();
    
    // Format and send temperature
    char tempBuffer[16];
    dtostrf(temp, 5, 2, tempBuffer);
    
    pTempChar->setValue(tempBuffer);
    if (deviceConnected) {
      pTempChar->notify();
    }

    // Serial output
    Serial.printf("%lu,%s\n", currentTime, tempBuffer);
  }
  
  delay(LOOP_DELAY_MS);
}
