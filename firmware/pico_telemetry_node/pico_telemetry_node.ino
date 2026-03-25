#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

const int ADC_PIN = 26;
const float V_REF = 3.3;
const float ADC_MAX = 4095.0;
const float V_MIN = 0.5;
const float V_MAX = 3.3;
const float T_MIN = 20.00;
const float T_MAX = 50.00;

const String FW_VERSION = "v1.2.0-captive";
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
    if (c == 0 || c == 255) break;
    ssid += c;
  }
  return ssid;
}

String readPassword() {
  String pass = "";
  for (int i = 0; i < 32; ++i) {
    char c = EEPROM.read(32 + i);
    if (c == 0 || c == 255) break;
    pass += c;
  }
  return pass;
}

void handleRoot() {
  String html = R"rawliteral(
  <!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>
  <style>
    body{font-family:system-ui,sans-serif;background:#0B1120;color:#F8FAFC;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}
    .card{background:#1E293B;padding:30px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);width:100%;max-width:400px;border:1px solid #334155;}
    h2{margin-top:0;font-size:22px;color:#38BDF8;}
    label{display:block;margin-bottom:8px;font-size:14px;color:#94A3B8;}
    select,input{width:100%;padding:12px;margin-bottom:20px;border-radius:8px;border:1px solid #334155;background:#0F172A;color:#fff;box-sizing:border-box;font-size:16px;}
    button{width:100%;padding:14px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;transition:0.2s;}
    button:hover{background:#1D4ED8;}
    .spinner{display:inline-block;width:20px;height:20px;border:3px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin 1s ease-in-out infinite;margin-right:10px;vertical-align:middle;}
    @keyframes spin{to{transform:rotate(360deg);}}
  </style></head><body>
  <div class='card'>
    <h2>Edge Node Provisioning</h2>
    <form action='/save' method='POST'>
      <label>Available Networks</label>
      <select id='ssid_select' name='ssid'>
        <option value=''>Loading networks...</option>
      </select>
      <label>WiFi Password</label>
      <input type='password' name='pass' placeholder='Leave blank if open network'>
      <button type='submit' id='submit_btn' disabled>
        <span class='spinner' id='spinner'></span>Scanning Airwaves...
      </button>
    </form>
  </div>
  <script>
    fetch('/scan').then(res => res.json()).then(data => {
      const select = document.getElementById('ssid_select');
      const btn = document.getElementById('submit_btn');
      const spinner = document.getElementById('spinner');
      select.innerHTML = '';
      if(data.length === 0) {
        select.innerHTML = '<option value="">No networks found</option>';
        return;
      }
      data.forEach(net => {
        let opt = document.createElement('option');
        opt.value = net.ssid;
        opt.textContent = `${net.ssid} (${net.rssi} dBm)`;
        select.appendChild(opt);
      });
      btn.disabled = false;
      btn.innerHTML = 'Save & Connect';
      spinner.style.display = 'none';
    }).catch(err => {
      document.getElementById('ssid_select').innerHTML = '<option value="">Scan failed. Refresh page.</option>';
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
  }
}

void loop() {
  if (isAPMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  unsigned long currentUptime = millis();
  int adc_sum = 0;
  for (int i = 0; i < 10; i++) {
    adc_sum += analogRead(ADC_PIN);
    delay(2); 
  }
  float rawADC = adc_sum / 10.0;
  float voltage = rawADC * (V_REF / ADC_MAX);
  float ext_temp = (voltage + 1.3884) / 0.0948;
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
        http.end();
      }
      client.stop();
    }
    dataIndex = 0;
  }
  delay(250);
}