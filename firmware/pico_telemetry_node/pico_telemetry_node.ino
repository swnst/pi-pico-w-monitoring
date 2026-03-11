#include <WiFi.h>
#include <WebServer.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

const int ADC_PIN = 26;
const float V_REF = 3.3;
const float ADC_MAX = 4095.0;
const float V_MIN = 0.5;
const float V_MAX = 3.3;
const float T_MIN = 20.00;
const float T_MAX = 50.00;

const char* serverUrl = "https://pi-pico-w-monitoring.onrender.com/api/telemetry";

WebServer server(80);
bool isAPMode = false;
bool isTimeSynced = false;

struct TelemetryData {
  unsigned long uptime;
  char timeStr[10];
  float voltage;
  float ext_temp;
  float core_temp;
  int32_t rssi;
  uint32_t free_ram;
};

const int BUFFER_SIZE = 50;
TelemetryData buffer[BUFFER_SIZE];
int dataIndex = 0;

void saveWiFiCredentials(String ssid, String pass) {
  for (int i = 0; i < 32; ++i) {
    EEPROM.write(i, i < ssid.length() ? ssid[i] : 0);
  }
  for (int i = 0; i < 32; ++i) {
    EEPROM.write(32 + i, i < pass.length() ? pass[i] : 0);
  }
  EEPROM.commit();
}

String readSSID() {
  String ssid = "";
  for (int i = 0; i < 32; ++i) {
    char c = EEPROM.read(i);
    if (c == 0) break;
    ssid += c;
  }
  return ssid;
}

String readPassword() {
  String pass = "";
  for (int i = 0; i < 32; ++i) {
    char c = EEPROM.read(32 + i);
    if (c == 0) break;
    pass += c;
  }
  return pass;
}

void handleRoot() {
  String html = "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'><style>body{font-family:sans-serif;background:#0F172A;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}form{background:#1E293B;padding:30px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.5);}input{display:block;width:100%;margin:10px 0 20px;padding:10px;border-radius:5px;border:none;}input[type='submit']{background:#3B82F6;color:#fff;font-weight:bold;cursor:pointer;}</style></head><body>";
  html += "<form action='/save' method='POST'><h2>Edge Node Setup</h2>";
  html += "<label>WiFi Name (SSID)</label><input type='text' name='ssid' required>";
  html += "<label>Password</label><input type='password' name='pass' required>";
  html += "<input type='submit' value='Save & Restart'></form></body></html>";
  server.send(200, "text/html", html);
}

void handleSave() {
  if (server.hasArg("ssid") && server.hasArg("pass")) {
    String newSSID = server.arg("ssid");
    String newPass = server.arg("pass");
    saveWiFiCredentials(newSSID, newPass);
    server.send(200, "text/html", "<html><body style='background:#0F172A;color:#fff;text-align:center;margin-top:20%'><h2>Saved Successfully!</h2><p>Rebooting Pico W to connect to new network...</p></body></html>");
    delay(2000);
    rp2040.reboot();
  } else {
    server.send(400, "text/plain", "Bad Request");
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  EEPROM.begin(512);

  String savedSSID = readSSID();
  String savedPass = readPassword();

  WiFi.mode(WIFI_STA);
  if (savedSSID.length() > 0) {
    WiFi.begin(savedSSID.c_str(), savedPass.c_str());
    unsigned long startAttemptTime = millis();
    
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
      delay(500);
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    isAPMode = true;
    WiFi.mode(WIFI_AP);
    WiFi.softAP("PicoW_Config_Node"); 
    
    server.on("/", HTTP_GET, handleRoot);
    server.on("/save", HTTP_POST, handleSave);
    server.begin();
  } 
  else {
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 10000)) {
      isTimeSynced = true;
    }
  }
}

void loop() {
  if (isAPMode) {
    server.handleClient();
    return;
  }

  unsigned long currentUptime = millis();
  int rawADC = analogRead(ADC_PIN);
  float voltage = rawADC * (V_REF / ADC_MAX);
  float v_calc = (voltage < V_MIN) ? V_MIN : ((voltage > V_MAX) ? V_MAX : voltage);
  float ext_temp = T_MIN + ((T_MAX - T_MIN) / (V_MAX - V_MIN)) * (v_calc - V_MIN);
  float core_temp = analogReadTemp();
  int32_t current_rssi = WiFi.RSSI();
  uint32_t current_ram = rp2040.getFreeHeap();

  char currentTime[10] = "NO_SYNC";
  if (isTimeSynced) {
    time_t now = time(nullptr);
    struct tm* timeinfo = localtime(&now);
    if (timeinfo->tm_year > 100) {
      strftime(currentTime, sizeof(currentTime), "%H:%M:%S", timeinfo);
    }
  }

  buffer[dataIndex].uptime = currentUptime;
  strlcpy(buffer[dataIndex].timeStr, currentTime, sizeof(buffer[dataIndex].timeStr));
  buffer[dataIndex].voltage = voltage;
  buffer[dataIndex].ext_temp = ext_temp;
  buffer[dataIndex].core_temp = core_temp;
  buffer[dataIndex].rssi = current_rssi;
  buffer[dataIndex].free_ram = current_ram;

  dataIndex++;

  if (dataIndex >= BUFFER_SIZE) {
    if (WiFi.status() == WL_CONNECTED) {
      JsonDocument doc;
      JsonArray array = doc.to<JsonArray>();

      for (int i = 0; i < BUFFER_SIZE; i++) {
        JsonObject obj = array.add<JsonObject>();
        obj["time"] = buffer[i].timeStr;
        obj["uptime"] = buffer[i].uptime;
        obj["voltage"] = buffer[i].voltage;
        obj["ext_temp"] = buffer[i].ext_temp;
        obj["core_temp"] = buffer[i].core_temp;
        obj["rssi"] = buffer[i].rssi;
        obj["free_ram"] = buffer[i].free_ram;
      }

      String jsonPayload;
      serializeJson(doc, jsonPayload);

      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");
      http.POST(jsonPayload);
      http.end();
    }
    dataIndex = 0;
  }
  delay(100);
}