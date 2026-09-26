// POMPANO AI — ESP32 firmware
// Sends the same JSON as scripts/virtual-esp32.mjs:
//   POST http://<PC_IP>:3000/api/telemetry
//   {"deviceId":"ESP32-A01","pondId":"A01","ph":7.80,"temp":28.4,"oxygen":6.10}
//
// Libraries (Arduino Library Manager): OneWire, DallasTemperature
// Wiring (example): pH module AO -> GPIO34, DO module AO -> GPIO35, DS18B20 data -> GPIO4 (4.7k pull-up)

#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID     = "TEN_WIFI";
const char* WIFI_PASSWORD = "MAT_KHAU_WIFI";
const char* SERVER_URL    = "http://192.168.1.10:3000/api/telemetry"; // IP of the PC running `pnpm dev`
const char* DEVICE_TOKEN  = "";                                        // same as DEVICE_TOKEN on the server, if set
const char* DEVICE_ID     = "ESP32-A01";
const char* POND_ID       = "A01";
const unsigned long INTERVAL_MS = 2000;

const int PIN_PH = 34;
const int PIN_DO = 35;
const int PIN_TEMP = 4;

OneWire oneWire(PIN_TEMP);
DallasTemperature tempSensor(&oneWire);

float readVoltage(int pin) {
  long sum = 0;
  for (int i = 0; i < 20; i++) { sum += analogReadMilliVolts(pin); delay(5); }
  return sum / 20.0 / 1000.0;
}

float readTemperature() {
  tempSensor.requestTemperatures();
  return tempSensor.getTempCByIndex(0);
}

// TODO: calibrate with pH 4.00 / 6.86 buffer solutions and replace these two constants.
float readPh() {
  const float slope = -5.70, offset = 21.34;
  return slope * readVoltage(PIN_PH) + offset;
}

// TODO: calibrate per the DO probe's datasheet (saturation voltage at a known temperature).
float readOxygen(float tempC) {
  const float saturationVoltage = 1.6;             // volts at 100% saturation during calibration
  const float saturationMgL = 14.46 - 0.3943 * tempC + 0.0056 * tempC * tempC; // approx. O2 solubility
  return readVoltage(PIN_DO) / saturationVoltage * saturationMgL;
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting Wi-Fi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print('.'); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " OK " + WiFi.localIP().toString() : " failed");
}

void setup() {
  Serial.begin(115200);
  analogSetAttenuation(ADC_11db);
  tempSensor.begin();
  connectWifi();
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last < INTERVAL_MS) return;
  last = millis();

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  float temp = readTemperature();
  float ph = readPh();
  float oxygen = readOxygen(temp);

  char body[160];
  snprintf(body, sizeof(body), "{\"deviceId\":\"%s\",\"pondId\":\"%s\",\"ph\":%.2f,\"temp\":%.1f,\"oxygen\":%.2f}", DEVICE_ID, POND_ID, ph, temp, oxygen);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_TOKEN)) http.addHeader("x-device-key", DEVICE_TOKEN);
  int status = http.POST(body);
  Serial.printf("%s -> HTTP %d\n", body, status);
  http.end();
}
