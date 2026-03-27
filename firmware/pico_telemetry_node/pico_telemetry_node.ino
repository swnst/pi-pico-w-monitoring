#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

const int ADC_PIN = 26;
const float ADC_MAX_RESOLUTION = 4095.0;
const float V_REF_MV = 3300.0;

const String FW_VERSION = "v1.3.0-stable";
String macAddress = "XX:XX:XX:XX:XX:XX";
const char* serverUrl = "https://pi-pico-w-monitoring.onrender.com/api/telemetry";

const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
DNSServer dnsServer;
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

const int BUFFER_SIZE = 1;
TelemetryData buffer[BUFFER_SIZE];
int dataIndex = 0;

void saveWiFiCredentials(String ssid, String pass) {
  for (int i = 0; i < 64; ++i) {
    EEPROM.write(i, i < ssid.length() ? ssid[i] : 0);
  }
  for (int i = 0; i < 64; ++i) {
    EEPROM.write(64 + i, i < pass.length() ? pass[i] : 0);
  }
  EEPROM.commit();
}

String readSSID() {
  String ssid = "";
  for (int i = 0; i < 64; ++i) {
    char c = EEPROM.read(i);
    if (c == 0 || c == 255) break;
    ssid += c;
  }
  return ssid;
}

String readPassword() {
  String pass = "";
  for (int i = 0; i < 64; ++i) {
    char c = EEPROM.read(64 + i);
    if (c == 0 || c == 255) break;
    pass += c;
  }
  return pass;
}

void handleRoot() {
  String html = R"rawliteral(
  <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>Edge Node Provisioning</title>
  <style>
    :root { --bg: #0f172a; --surface: rgba(30, 41, 59, 0.7); --border: rgba(56, 189, 248, 0.3); --primary: #38bdf8; --primary-hover: #0284c7; --text: #f8fafc; --text-dim: #94a3b8; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; background-image: radial-gradient(circle at 50% 0%, #1e293b 0%, transparent 70%); }
    .card { background: var(--surface); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); padding: 40px 30px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); width: 100%; max-width: 420px; border: 1px solid var(--border); }
    .header { text-align: center; margin-bottom: 30px; }
    h2 { margin: 0 0 8px 0; font-size: 24px; color: var(--primary); font-weight: 600; letter-spacing: -0.5px; }
    p.subtitle { margin: 0; font-size: 14px; color: var(--text-dim); }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 500; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
    select, input { width: 100%; padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: var(--text); font-size: 15px; box-sizing: border-box; transition: all 0.2s ease; outline: none; }
    select:focus, input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2); background: rgba(0,0,0,0.4); }
    button { width: 100%; padding: 16px; background: var(--primary); color: #0f172a; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: center; align-items: center; gap: 10px; }
    button:hover:not(:disabled) { background: var(--primary-hover); color: white; transform: translateY(-1px); }
    button:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
    .spinner { width: 18px; height: 18px; border: 3px solid rgba(15,23,42,0.3); border-radius: 50%; border-top-color: #0f172a; animation: spin 0.8s linear infinite; display: none; }
    button:disabled .spinner { border-top-color: #94a3b8; border-right-color: rgba(255,255,255,0.1); border-bottom-color: rgba(255,255,255,0.1); border-left-color: rgba(255,255,255,0.1); display: block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style></head><body>
  <div class='card'>
    <div class='header'>
      <h2>Edge Node Setup</h2>
      <p class='subtitle'>Select a network to stream telemetry</p>
    </div>
    <form action='/save' method='POST' onsubmit="document.getElementById('submit_btn').disabled=true;">
      <div class='form-group'>
        <label>Available Networks</label>
        <select id='ssid_select' name='ssid' required>
          <option value='' disabled selected>Scanning airwaves...</option>
        </select>
      </div>
      <div class='form-group'>
        <label>WiFi Password</label>
        <input type='password' name='pass' placeholder='Leave blank if Open Network'>
      </div>
      <button type='submit' id='submit_btn' disabled>
        <span class='spinner'></span> <span id='btn_text'>Scanning...</span>
      </button>
    </form>
  </div>
  <script>
    fetch('/scan').then(res => res.json()).then(data => {
      const select = document.getElementById('ssid_select');
      const btn = document.getElementById('submit_btn');
      const btnText = document.getElementById('btn_text');
      select.innerHTML = '<option value="" disabled selected>Select a network...</option>';
      if(data.length === 0) { select.innerHTML = '<option value="" disabled>No networks found</option>'; return; }
      data.sort((a,b) => b.rssi - a.rssi).forEach(net => {
        let opt = document.createElement('option');
        opt.value = net.ssid;
        let signal = net.rssi > -60 ? 'Excellent' : (net.rssi > -70 ? 'Good' : 'Weak');
        opt.textContent = `${net.ssid} (${signal})`;
        select.appendChild(opt);
      });
      btn.disabled = false;
      btnText.textContent = 'Save & Connect';
    }).catch(err => {
      document.getElementById('ssid_select').innerHTML = '<option value="" disabled>Scan failed. Please refresh.</option>';
      document.getElementById('btn_text').textContent = 'Error';
    });
  </script>
  </body></html>
  )rawliteral";

  server.send(200, "text/html", html);
}

void handleScan() {
  int n = WiFi.scanNetworks();
  JsonDocument doc;
  JsonArray array = doc.to<JsonArray>();

  for (int i = 0; i < n; ++i) {
    JsonObject obj = array.add<JsonObject>();
    obj["ssid"] = WiFi.SSID(i);
    obj["rssi"] = WiFi.RSSI(i);
    delay(10);
  }

  String jsonResponse;
  serializeJson(doc, jsonResponse);
  server.send(200, "application/json", jsonResponse);
}

void handleSave() {
  if (server.hasArg("ssid") && server.hasArg("pass")) {
    String newSSID = server.arg("ssid");
    String newPass = server.arg("pass");
    saveWiFiCredentials(newSSID, newPass);

    String response = "<html><body style='background:#0B1120;color:#10B981;font-family:sans-serif;text-align:center;padding-top:20vh;'><h2>Configuration Saved!</h2><p>Node is restarting and connecting to <b>" + newSSID + "</b>...</p></body></html>";
    server.send(200, "text/html", response);

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
  WiFi.disconnect(true);
  delay(500);

  savedSSID.trim();
  savedPass.trim();

  if (savedSSID.length() > 0) {
    WiFi.begin(savedSSID.c_str(), savedPass.c_str());
    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 10000) {
      delay(500);
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    isAPMode = true;
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
    WiFi.softAP("PicoW_Config_Node");

    dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    dnsServer.start(DNS_PORT, "*", apIP);

    server.on("/", HTTP_GET, handleRoot);
    server.on("/scan", HTTP_GET, handleScan);
    server.on("/save", HTTP_POST, handleSave);

    server.onNotFound([]() {
      server.sendHeader("Location", String("http://") + apIP.toString(), true);
      server.send(302, "text/plain", "");
    });

    server.begin();
    Serial.println("System booted in AP Mode for Provisioning.");
  } else {
    macAddress = WiFi.macAddress();
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

    unsigned long startWait = millis();
    while (millis() - startWait < 10000) {
      time_t now = time(nullptr);
      if (now > 1000000000) {
        isTimeSynced = true;
        break;
      }
      delay(500);
    }
    Serial.println("System booted in STA Mode. Ready to stream telemetry.");
  }
}

float getPreciseTemp(float v_raw) {
  const int NUM_POINTS = 7;
  const float V_TABLE[NUM_POINTS] = { 0.500, 0.9665, 1.443, 1.8995, 2.366, 2.8325, 3.120 };
  const float T_TABLE[NUM_POINTS] = { 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0 };

  if (v_raw <= V_TABLE[0]) {
    float slope = (T_TABLE[1] - T_TABLE[0]) / (V_TABLE[1] - V_TABLE[0]);
    return T_TABLE[0] - (slope * (V_TABLE[0] - v_raw));
  }

  if (v_raw >= V_TABLE[NUM_POINTS - 1]) {
    float slope = (T_TABLE[NUM_POINTS - 1] - T_TABLE[NUM_POINTS - 2]) / (V_TABLE[NUM_POINTS - 1] - V_TABLE[NUM_POINTS - 2]);
    return T_TABLE[NUM_POINTS - 1] + (slope * (v_raw - V_TABLE[NUM_POINTS - 1]));
  }

  for (int i = 0; i < NUM_POINTS - 1; i++) {
    if (v_raw >= V_TABLE[i] && v_raw <= V_TABLE[i + 1]) {
      float slope = (T_TABLE[i + 1] - T_TABLE[i]) / (V_TABLE[i + 1] - V_TABLE[i]);
      return T_TABLE[i] + (slope * (v_raw - V_TABLE[i]));
    }
  }
  return 25.0;
}

void loop() {
  unsigned long currentUptime = millis();
  static unsigned long lastWiFiCheck = 0;

  int adc_sum = 0;
  for (int i = 0; i < 10; i++) {
    adc_sum += analogRead(ADC_PIN);
    delay(2);
  }
  float rawADC = adc_sum / 10.0;

  float millivolts = (rawADC / ADC_MAX_RESOLUTION) * V_REF_MV;
  float voltage = (millivolts / 1000.0) * 0.9455;

  float ext_temp = getPreciseTemp(voltage);
  float core_temp = analogReadTemp();

  Serial.print("[HW DIAGNOSTIC] Raw ADC: ");
  Serial.print(rawADC);
  Serial.print(" | Voltage: ");
  Serial.print(voltage, 3);
  Serial.print(" V | Ext Temp: ");
  Serial.print(ext_temp, 2);
  Serial.println(" C");

  if (isAPMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    delay(250);
    return;
  }

  if (!isAPMode && WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWiFiCheck > 10000) {
      Serial.println("[NETWORK] WiFi disconnected. Attempting to reconnect...");

      WiFi.disconnect();
      WiFi.begin(readSSID().c_str(), readPassword().c_str());

      lastWiFiCheck = millis();
    }
  }

  int32_t current_rssi = WiFi.RSSI();
  uint32_t current_ram = rp2040.getFreeHeap();

  char currentTime[10] = "NO_SYNC";
  if (isTimeSynced) {
    time_t now = time(nullptr);
    now = now + 25200;

    struct tm* timeinfo = gmtime(&now);
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
        obj["mac"] = macAddress;
        obj["fw"] = FW_VERSION;
      }

      String jsonPayload;
      serializeJson(doc, jsonPayload);

      WiFiClientSecure client;
      client.setInsecure();

      HTTPClient http;
      if (http.begin(client, serverUrl)) {
        http.addHeader("Content-Type", "application/json");
        int httpResponseCode = http.POST(jsonPayload);

        if (httpResponseCode == 429) {
          Serial.println("[NETWORK WARNING] HTTP 429: Rate Limit Exceeded. Backing off for 5 seconds...");
          delay(5000);  
        }

        http.end();
      }
      client.stop();
    }
    dataIndex = 0;
  }

  delay(250);
}