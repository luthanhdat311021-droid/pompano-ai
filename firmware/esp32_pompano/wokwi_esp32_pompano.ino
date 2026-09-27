// POMPANO AI — Wokwi ESP32 Simulator with Instant Non-Blocking Button Response
// Buttons:
//   - NORMAL (Pin 12): Reset to optimal conditions (pH 7.8, Temp 28.2C, DO 6.2 mg/L)
//   - SPIKE  (Pin 14): Simulate sudden pH & Temp Spike (pH 8.8, Temp 31.5C)
//   - DRIFT  (Pin 27): Simulate progressive Oxygen Crash (DO drops to 3.2 mg/L)
//   - STUCK  (Pin 26): Simulate Sensor Stuck / Offline WiFi fault

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
const char* SERVER_URL    = "http://localhost:3000/api/telemetry"; // Or your PC IP
const char* DEVICE_ID     = "ESP32-A01";
const char* POND_ID       = "A01";

const int PIN_BTN_NORMAL = 12;
const int PIN_BTN_SPIKE  = 14;
const int PIN_BTN_DRIFT  = 27;
const int PIN_BTN_STUCK  = 26;

const int PIN_LED_GREEN  = 18;
const int PIN_LED_YELLOW = 19;
const int PIN_LED_RED    = 21;

enum FaultMode { MODE_NORMAL, MODE_SPIKE, MODE_DRIFT, MODE_STUCK };
FaultMode currentMode = MODE_NORMAL;

float basePh = 7.80;
float baseTemp = 28.2;
float baseOxygen = 6.20;

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 2000;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN_NORMAL, INPUT_PULLUP);
  pinMode(PIN_BTN_SPIKE,  INPUT_PULLUP);
  pinMode(PIN_BTN_DRIFT,  INPUT_PULLUP);
  pinMode(PIN_BTN_STUCK,  INPUT_PULLUP);

  pinMode(PIN_LED_GREEN,  OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED,    OUTPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting Wokwi Wi-Fi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Connected!");
}

void updateLeds() {
  digitalWrite(PIN_LED_GREEN,  currentMode == MODE_NORMAL ? HIGH : LOW);
  digitalWrite(PIN_LED_YELLOW, currentMode == MODE_DRIFT ? HIGH : LOW);
  digitalWrite(PIN_LED_RED,    (currentMode == MODE_SPIKE || currentMode == MODE_STUCK) ? HIGH : LOW);
}

void checkButtons() {
  if (digitalRead(PIN_BTN_NORMAL) == LOW) {
    if (currentMode != MODE_NORMAL) {
      currentMode = MODE_NORMAL;
      Serial.println("\n[BTN] Mode changed to NORMAL");
      updateLeds();
    }
  } else if (digitalRead(PIN_BTN_SPIKE) == LOW) {
    if (currentMode != MODE_SPIKE) {
      currentMode = MODE_SPIKE;
      Serial.println("\n[BTN] Mode changed to SPIKE (pH & Temp High)");
      updateLeds();
    }
  } else if (digitalRead(PIN_BTN_DRIFT) == LOW) {
    if (currentMode != MODE_DRIFT) {
      currentMode = MODE_DRIFT;
      Serial.println("\n[BTN] Mode changed to DRIFT (Oxygen Crash)");
      updateLeds();
    }
  } else if (digitalRead(PIN_BTN_STUCK) == LOW) {
    if (currentMode != MODE_STUCK) {
      currentMode = MODE_STUCK;
      Serial.println("\n[BTN] Mode changed to STUCK (Sensor Offline)");
      updateLeds();
    }
  }
}

void loop() {
  // Check buttons constantly every loop (instant response, 10ms)
  checkButtons();
  updateLeds();

  // Send telemetry non-blockingly every 2 seconds
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;

    if (currentMode == MODE_STUCK) {
      Serial.println("[STUCK] Simulated sensor failure / connection offline...");
      return;
    }

    float ph = basePh;
    float temp = baseTemp;
    float oxygen = baseOxygen;

    if (currentMode == MODE_SPIKE) {
      ph = 8.85;
      temp = 31.8;
    } else if (currentMode == MODE_DRIFT) {
      oxygen = 3.20; // Suffocation risk
    }

    // Add slight noise
    ph += (random(-5, 5) / 100.0);
    temp += (random(-2, 2) / 10.0);
    oxygen += (random(-5, 5) / 100.0);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(SERVER_URL);
      http.addHeader("Content-Type", "application/json");

      char body[128];
      snprintf(body, sizeof(body),
        "{\"deviceId\":\"%s\",\"pondId\":\"%s\",\"ph\":%.2f,\"temp\":%.1f,\"oxygen\":%.2f}",
        DEVICE_ID, POND_ID, ph, temp, oxygen);

      int code = http.POST(body);
      Serial.printf("Posted: %s -> HTTP %d\n", body, code);
      http.end();
    }
  }

  delay(10); // Short polling delay
}
