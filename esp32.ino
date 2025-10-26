#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#define SERVICE_UUID           "12345678-1234-5678-1234-56789abcdef0"
#define CHAR_TEMP_UUID         "12345678-1234-5678-1234-56789abcdef1"
#define CHAR_INTERVAL_UUID     "12345678-1234-5678-1234-56789abcdef2"
#define CHAR_LED_STATUS_UUID   "12345678-1234-5678-1234-56789abcdef3"

BLECharacteristic *tempCharacteristic;
BLECharacteristic *intervalCharacteristic;
BLECharacteristic *ledCharacteristic;

bool deviceConnected = false;
int intervalSeconds = 2;
bool ledOn = true;
float temp = 23.5;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("📱 Gerät verbunden");
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("❌ Gerät getrennt");
    pServer->startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  BLEDevice::init("ESP32_TempSim");

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);

  tempCharacteristic = pService->createCharacteristic(
    CHAR_TEMP_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  tempCharacteristic->addDescriptor(new BLE2902());

  intervalCharacteristic = pService->createCharacteristic(
    CHAR_INTERVAL_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  ledCharacteristic = pService->createCharacteristic(
    CHAR_LED_STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);

  // Startwerte
  intervalCharacteristic->setValue(String(intervalSeconds).c_str());
  ledCharacteristic->setValue("1");

  pService->start();
  pServer->getAdvertising()->start();

  Serial.println("✅ BLE TempLink bereit");
}

unsigned long lastUpdate = 0;

void loop() {
  if (deviceConnected && millis() - lastUpdate > intervalSeconds * 1000) {
    lastUpdate = millis();
    temp += random(-3, 4) * 0.1;
    String t = String(temp, 1);
    tempCharacteristic->setValue(t.c_str());
    tempCharacteristic->notify();
    Serial.println("Gesendet: " + t + " °C");
  }
}
