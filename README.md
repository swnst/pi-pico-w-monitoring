<div align="center">
  <h1>Pico W Edge Node Diagnostics</h1>
  <p><b>Real-time IoT Telemetry Dashboard with Predictive Thermal Runaway Analytics</b></p>

  <img src="[https://img.shields.io/badge/Hardware-Raspberry_Pi_Pico_W-C51A4A?style=for-the-badge&logo=raspberrypi](https://img.shields.io/badge/Hardware-Raspberry_Pi_Pico_W-C51A4A?style=for-the-badge&logo=raspberrypi)" alt="Hardware" />
  <img src="[https://img.shields.io/badge/Firmware-C%2B%2B-00599C?style=for-the-badge&logo=c%2B%2B](https://img.shields.io/badge/Firmware-C%2B%2B-00599C?style=for-the-badge&logo=c%2B%2B)" alt="C++" />
  <img src="[https://img.shields.io/badge/Frontend-React](https://img.shields.io/badge/Frontend-React)_|_Recharts-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="[https://img.shields.io/badge/Backend-Node.js](https://img.shields.io/badge/Backend-Node.js)_|_Express-339933?style=for-the-badge&logo=nodedotjs" alt="Node" />
  <br><br>
</div>

[![Monitoring Dashboard](https://img2.pic.in.th/pico-monitoring.jpeg)](https://pic.in.th/image/pico-monitoring.87HxkE)

## 📌 Project Overview
This project is a real-time health monitoring system for Edge Nodes. Beyond visualizing raw telemetry data, it integrates **Client-side Computing** for **Predictive Analytics**. The system continuously calculates the temperature's rate of change and forecasts critical system saturation points (Time-to-Critical) in advance via mathematical modeling.

## 🏗️ System Architecture & Key Features

### 1. Hardware & Edge Processing (Firmware)
* **Oversampling Filter:** Utilizes a 10x ADC oversampling technique to calculate averages, effectively mitigating electrical noise (Hardware Noise Filtering).
* **N-Point Piecewise Linear Interpolation:** Implements a dynamic Lookup Table (LUT) to compensate for Op-Amp non-linearity and hardware saturation near 50°C, ensuring high mathematical accuracy across the entire sensor range.
* **Resilient Network Architecture:** Features a non-blocking, asynchronous watchdog timer for continuous WiFi connection monitoring and auto-reconnection without halting the core telemetry loop.
* **High-Frequency Telemetry Polling:** Optimized to push payloads at 4Hz (250ms intervals) via HTTP POST, maximizing real-time data acquisition capabilities.
* **Rate Limit Backoff Protection:** Integrates a responsive watchdog to handle HTTP 429 (Too Many Requests) errors, triggering an automated 5-second exponential backoff to prevent IP banning from the backend.
* **Enterprise-Grade Captive Portal:** An onboard provisioning system featuring a modern Glassmorphism UI, utilizing an expanded 64-byte EEPROM architecture to securely support complex WPA3 WiFi credentials.
* **Signal Conditioning:** Designed to interface with an Op-Amp circuit, amplifying the LM35 analog signal to maximize the Pico W's ADC resolution limit (0.5V - 3.3V).

### 2. High-Performance Data Pipeline (Backend)
* **Zero-Latency Broadcast:** Employs `WebSockets (Socket.IO)` to instantly broadcast incoming hardware payloads to clients without micro-batching or buffering delays.
* **TTL Time-Series Database:** Stores historical telemetry data in `MongoDB`, utilizing a 6-hour Time-To-Live (TTL Index) for automated storage management and optimized query latency.

### 3. Advanced Analytics & UI/UX (Frontend)
* **Predictive Thermal Runaway:** Implements an **Ordinary Least Squares (OLS) Linear Regression** model executing directly on the browser to compute the temperature gradient, forecasting the exact timeframe (Time-to-Critical) until system failure.
* **Data Smoothing:** Applies **Exponential Moving Average (EMA)** mathematics to filter real-time temperature fluctuations, ensuring highly stable UI rendering.
* **Calculus on Edge:** Computes the temperature velocity per second (dT/dt) in real-time, triggering automated alerts upon detecting critical acceleration thresholds.
* **Sliding Window DOM Management:** Strictly caps the data array size (Dynamic Payload Capping) to maintain 60 FPS rendering performance and prevent DOM-induced memory leaks in the client's browser.

---

## 🛠️ Tech Stack
* **Microcontroller:** Raspberry Pi Pico W (RP2040)
* **Sensor:** LM35 (Analog Temperature Sensor)
* **Backend:** Node.js, Express, Socket.IO, MongoDB
* **Frontend:** React, Recharts (Data Visualization), CSS Glassmorphism

---

## 📂 Repository Structure
```text
pi-pico-w-monitoring/
├── backend/                  # Node.js Server & REST/WebSocket APIs
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── firmware/                 # C++ Firmware for Pico W Edge Node
│   └── pico_telemetry_node/
│       └── pico_telemetry_node.ino
└── frontend/                 # React SPA Dashboard
    ├── src/
    │   ├── App.jsx
    │   ├── index.css
    │   └── main.jsx
    ├── package.json
    └── index.html
```

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd backend
npm install
# Copy .env.example to .env and configure your MONGODB_URI
npm start
```

### 2. Frontend Setup
```bash
cd frontend
npm install
# Ensure the Socket.io URL in App.jsx points to your Backend API
npm run dev
```

### 3. Firmware Setup
1. Open `pico_telemetry_node.ino` in the Arduino IDE.
2. Install dependencies: `ArduinoJson` (Note: The board uses the built-in `WiFi` and `HTTPClient` libraries; WebSockets are handled exclusively on the backend).
3. Modify the `serverUrl` variable to match your deployed Backend API endpoint.
4. Flash the firmware to the Raspberry Pi Pico W.