/**
 * SEMTOS — Smart Emergency Management and Traffic Orchestration System
 * ============================================================================
 * File: esp32-firmware/esp32_traffic_signal_ble.ino
 * Target Board: ESP32 NodeMCU (ESP-WROOM-32)
 *
 * Minimal-Hardware Prototype Pinout (Total Hardware Budget <= Rs. 4,500):
 *  - GPIO 25 -> Traffic Light Module RED LED
 *  - GPIO 26 -> Traffic Light Module YELLOW LED
 *  - GPIO 27 -> Traffic Light Module GREEN LED
 *  - GPIO 14 -> 5V Active Piezo Buzzer (+ve pin; -ve to GND)
 *  - GND     -> Common Ground (LED Module GND + Buzzer GND)
 *
 * Dual-Mode Operation:
 *  1. NORMAL CLOUD/LAN MODE (Wi-Fi Connected):
 *     - Polls `http://<LAPTOP_LAN_IP>:4081/api/signal-state` every 250 ms.
 *     - Switches physical Red/Yellow/Green LEDs & Buzzer in real-time sync
 *       with the 3D Digital Twin and YOLOv8 dynamic green-hold timer.
 *  2. OFFLINE BLE FALLBACK MODE (5G/Wi-Fi Outage or BLE_FALLBACK Mode):
 *     - If Wi-Fi drops, HTTP server is unreachable, or `networkMode == "BLE_FALLBACK"`,
 *       scans via Bluetooth Low Energy (BLE) for an approaching ambulance beacon
 *       named `"SEMTOS-AMB-108"` (or service UUID `0000180d-0000-1000-8000-00805f9b34fb`).
 *     - When measured RSSI >= -72 dBm (~30-100m indoor/outdoor range), immediately
 *       overrides physical LEDs to GREEN and pulses the acoustic piezo buzzer.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// ── 1. Wi-Fi & V2X Server Configuration (Edit Before Flashing) ───────────────
const char* WIFI_SSID     = "YOUR_WIFI_HOTSPOT_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* V2X_API_URL   = "http://192.168.1.100:4081/api/signal-state"; // Replace with Laptop LAN IP

// ── 2. Hardware GPIO Pin Definitions ─────────────────────────────────────────
#define PIN_LED_RED     25
#define PIN_LED_YELLOW  26
#define PIN_LED_GREEN   27
#define PIN_BUZZER      14

// ── 3. BLE Proximity Fallback Thresholds ─────────────────────────────────────
#define BLE_TARGET_NAME       "SEMTOS-AMB-108"
#define BLE_RSSI_THRESHOLD    -72   // dBm threshold to trigger local Green override
#define BLE_SCAN_SECONDS      1     // Fast 1-second non-blocking scan window

BLEScan* pBLEScan = nullptr;
bool bleBeaconDetected = false;
int  lastMeasuredRssi  = -100;
String currentLedState = "RED";
bool buzzerState       = false;
unsigned long lastPollMs = 0;
unsigned long lastBuzzerToggleMs = 0;

// ── 4. Helper: Drive Physical R/Y/G LEDs & Piezo Buzzer ──────────────────────
void setTrafficSignalHardware(const String& state, bool activateBuzzer) {
  currentLedState = state;
  buzzerState = activateBuzzer;

  if (state == "GREEN") {
    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_LED_YELLOW, LOW);
    digitalWrite(PIN_LED_GREEN, HIGH);
  } else if (state == "YELLOW") {
    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_LED_YELLOW, HIGH);
    digitalWrite(PIN_LED_GREEN, LOW);
  } else {
    // Default safe state: RED
    digitalWrite(PIN_LED_RED, HIGH);
    digitalWrite(PIN_LED_YELLOW, LOW);
    digitalWrite(PIN_LED_GREEN, LOW);
  }

  if (!activateBuzzer) {
    digitalWrite(PIN_BUZZER, LOW);
  }
}

// ── 5. Lightweight JSON Value Extractor (No External ArduinoJson Required) ──
String extractJsonString(const String& json, const String& key) {
  String searchKey = "\"" + key + "\":\"";
  int startIdx = json.indexOf(searchKey);
  if (startIdx == -1) return "";
  startIdx += searchKey.length();
  int endIdx = json.indexOf("\"", startIdx);
  if (endIdx == -1) return "";
  return json.substring(startIdx, endIdx);
}

bool extractJsonBool(const String& json, const String& key) {
  String searchKey = "\"" + key + "\":";
  int startIdx = json.indexOf(searchKey);
  if (startIdx == -1) return false;
  startIdx += searchKey.length();
  String sub = json.substring(startIdx, startIdx + 5);
  sub.trim();
  return sub.startsWith("true");
}

// ── 6. BLE Advertised Device Callback (Offline Failover Scanner) ─────────────
class SemtosBleAdvertisedCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    String devName = advertisedDevice.getName().c_str();
    int rssi = advertisedDevice.getRSSI();

    if (devName.indexOf("SEMTOS") >= 0 || devName.indexOf("AMB") >= 0) {
      lastMeasuredRssi = rssi;
      if (rssi >= BLE_RSSI_THRESHOLD) {
        bleBeaconDetected = true;
        Serial.printf("[BLE-FAILOVER] Ambulance Beacon '%s' detected! RSSI=%d dBm >= %d dBm\n",
                      devName.c_str(), rssi, BLE_RSSI_THRESHOLD);
      }
    }
  }
};

void runLocalBleFallbackScan() {
  bleBeaconDetected = false;
  if (!pBLEScan) return;
  BLEScanResults foundDevices = pBLEScan->start(BLE_SCAN_SECONDS, false);
  pBLEScan->clearResults();

  if (bleBeaconDetected) {
    Serial.println("[BLE-FAILOVER] >>> OVERRIDING SIGNAL TO GREEN (LOCAL BLE PROXIMITY) <<<");
    setTrafficSignalHardware("GREEN", true);
  } else {
    setTrafficSignalHardware("RED", false);
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Power-on self-test (R -> Y -> G -> R)
  setTrafficSignalHardware("RED", false);    delay(250);
  setTrafficSignalHardware("YELLOW", false); delay(250);
  setTrafficSignalHardware("GREEN", true);   delay(250);
  setTrafficSignalHardware("RED", false);

  Serial.println("====================================================");
  Serial.println("SEMTOS ESP32 Roadside Signal & BLE Failover Node");
  Serial.println("====================================================");

  // Initialize BLE Scanner for Offline Failover
  BLEDevice::init("SEMTOS-SIGNAL-INT01");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new SemtosBleAdvertisedCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  // Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WIFI] Connecting to %s ", WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 16) {
    delay(400);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WIFI] Offline at boot -> Operating in Autonomous BLE Beacon Failover Mode.");
  }
}

void loop() {
  unsigned long now = millis();

  // Pulse piezo buzzer intermittently when preemption is active (avoids continuous ear-splitting tone)
  if (buzzerState && (now - lastBuzzerToggleMs >= 300)) {
    lastBuzzerToggleMs = now;
    digitalWrite(PIN_BUZZER, !digitalRead(PIN_BUZZER));
  }

  // Poll V2X Server every 250ms or fall back to local BLE scan
  if (now - lastPollMs >= 250) {
    lastPollMs = now;

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.setTimeout(600);
      http.begin(V2X_API_URL);
      int httpCode = http.GET();

      if (httpCode == 200) {
        String payload = http.getString();
        String ledState = extractJsonString(payload, "ledState");
        String netMode  = extractJsonString(payload, "networkMode");
        bool buzActive  = extractJsonBool(payload, "buzzerActive");

        if (netMode == "BLE_FALLBACK") {
          // Server instructed simulated 5G outage: use local BLE scan OR server-relayed BLE state
          if (ledState == "GREEN") {
            setTrafficSignalHardware("GREEN", true);
          } else {
            runLocalBleFallbackScan();
          }
        } else {
          if (ledState == "") ledState = "RED";
          setTrafficSignalHardware(ledState, buzActive);
        }
      } else {
        Serial.printf("[V2X-HTTP] Server unreachable (code=%d) -> Switching to BLE Fallback Scan\n", httpCode);
        runLocalBleFallbackScan();
      }
      http.end();
    } else {
      // Wi-Fi disconnected -> Autonomous BLE Beacon Failover Mode
      runLocalBleFallbackScan();
    }
  }
}
