#include "ble_link.h"

#include <NimBLEDevice.h>

#include "protocol.h"

namespace {

QueueHandle_t queue = nullptr;
volatile int connections = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    connections++;
    log_i("connected: %s", info.getAddress().toString().c_str());
    // Keep advertising so a second phone (e.g. a backup timer) can take over.
    NimBLEDevice::startAdvertising();
  }

  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& info, int reason) override {
    if (connections > 0) connections--;
    log_i("disconnected (reason %d)", reason);
    NimBLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo& info) override {
    NimBLEAttValue value = characteristic->getValue();
    if (value.size() == 0) return;
    Packet p;
    p.len = value.size() > sizeof(p.data) ? sizeof(p.data) : value.size();
    memcpy(p.data, value.data(), p.len);
    xQueueSend(queue, &p, 0);  // drop if the loop is somehow 16 packets behind
  }
};

}  // namespace

namespace BleLink {

void begin(const char* deviceName, const char* infoString) {
  queue = xQueueCreate(16, sizeof(Packet));

  NimBLEDevice::init(deviceName);
  NimBLEDevice::setPower(9);  // dBm — max range on the pit wall

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* service = server->createService(SERVICE_UUID);
  NimBLECharacteristic* command =
      service->createCharacteristic(COMMAND_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  command->setCallbacks(new CommandCallbacks());
  NimBLECharacteristic* info = service->createCharacteristic(INFO_UUID, NIMBLE_PROPERTY::READ);
  info->setValue(infoString);
  service->start();

  // The 128-bit service UUID fills most of the 31-byte advert, so the name
  // goes in the scan response. Phones filter scans on the UUID.
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.addServiceUUID(NimBLEUUID(SERVICE_UUID));
  NimBLEAdvertisementData scanData;
  scanData.setName(deviceName);
  adv->setAdvertisementData(advData);
  adv->setScanResponseData(scanData);
  adv->start();
  log_i("advertising as %s", deviceName);
}

bool poll(Packet& out) { return queue && xQueueReceive(queue, &out, 0) == pdTRUE; }

bool connected() { return connections > 0; }

}  // namespace BleLink
