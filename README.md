<div align="center">
  <h1>⚡ Pico W Edge Node Diagnostics</h1>
  <p><b>Real-time IoT Telemetry Dashboard with Predictive Thermal Runaway Analytics</b></p>

  <img src="https://img.shields.io/badge/Hardware-Raspberry_Pi_Pico_W-C51A4A?style=for-the-badge&logo=raspberrypi" alt="Hardware" />
  <img src="https://img.shields.io/badge/Firmware-C%2B%2B-00599C?style=for-the-badge&logo=c%2B%2B" alt="C++" />
  <img src="https://img.shields.io/badge/Frontend-React_|_Recharts-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Backend-Node.js_|_Express-339933?style=for-the-badge&logo=nodedotjs" alt="Node" />
  <br><br>
</div>

![Dashboard Screenshot](https://via.placeholder.com/1000x600.png?text=Insert+Your+Dashboard+Screenshot+Here)

## 📌 Project Overview
โปรเจกต์นี้คือระบบตรวจติดตามสุขภาพของอุปกรณ์ Edge Node แบบเรียลไทม์ (Real-time Telemetry) ที่ไม่ได้ทำหน้าที่เพียงแค่แสดงผลข้อมูลดิบ แต่ผสานการทำงานของ **Client-side Computing** เพื่อวิเคราะห์ข้อมูลเชิงพยากรณ์ (Predictive Analytics) ระบบสามารถคำนวณอัตราการเปลี่ยนแปลงอุณหภูมิและพยากรณ์จุดวิกฤต (System Saturation) ได้ล่วงหน้าผ่านโมเดลคณิตศาสตร์

## 🏗️ System Architecture & Key Features

### 1. Hardware & Edge Processing (Firmware)
* **Oversampling Filter:** ใช้เทคนิค Oversampling อ่านค่า ADC 10 ครั้งเพื่อหาค่าเฉลี่ย ลดสัญญาณรบกวนทางไฟฟ้า (Hardware Noise Filtering)
* **Captive Portal:** มีระบบ Provisioning เพื่อตั้งค่า WiFi ให้อุปกรณ์ผ่าน Access Point โดยไม่ต้องแก้โค้ด C++
* **Signal Conditioning:** ออกแบบใช้งานร่วมกับวงจร Op-Amp ขยายสัญญาณจากเซนเซอร์ LM35 ให้เต็มความละเอียด ADC ของบอร์ด (0.5V - 3.3V)

### 2. High-Performance Data Pipeline (Backend)
* **Zero-Latency Broadcast:** ใช้โปรโตคอล `WebSockets (Socket.IO)` ในการยิงข้อมูลที่ได้รับจาก Hardware ไปยัง Client ทันทีโดยไม่มีการกักข้อมูล
* **TTL Time-Series Database:** จัดเก็บประวัติข้อมูลใน `MongoDB` โดยมีการตั้ง Time-To-Live (TTL Index) 6 ชั่วโมง เพื่อบริหารจัดการพื้นที่หน่วยความจำอัตโนมัติ

### 3. Advanced Analytics & UI/UX (Frontend)
* **Predictive Thermal Runaway:** ใช้โมเดล **Ordinary Least Squares (OLS) Linear Regression** คำนวณความชันของอุณหภูมิบนเบราว์เซอร์ เพื่อพยากรณ์เวลา (Time-to-Critical) ที่ระบบจะโอเวอร์ฮีทล่วงหน้า
* **Data Smoothing:** ประยุกต์ใช้คณิตศาสตร์ **Exponential Moving Average (EMA)** ในการกรองข้อมูลอุณหภูมิให้แสดงผลบน UI ได้อย่างเสถียร (Smooth Rendering)
* **Calculus on Edge:** คำนวณหาความเร็วในการเปลี่ยนแปลงอุณหภูมิต่อวินาที (dT/dt) พร้อมแจ้งเตือนหากอัตราเร่งสูงผิดปกติ
* **Sliding Window DOM Management:** จำกัดขนาด Array ข้อมูลเพื่อรักษาความเร็วการเรนเดอร์กราฟแบบ 60 FPS ป้องกัน Memory Leak ในเบราว์เซอร์

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
├── firmware/                 # C++ Firmware สำหรับบอร์ด Pico W
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
# คัดลอก .env.example เป็น .env และใส่ค่า MONGODB_URI
npm start
```

### 2. Frontend Setup
```bash
cd frontend
npm install
# แก้ไข URL ของ Socket.io ใน App.jsx ให้ตรงกับ Backend ของคุณ
npm run dev
```

### 3. Firmware Setup
1. เปิดไฟล์ `pico_telemetry_node.ino` ใน Arduino IDE
2. ติดตั้งไลบรารี: `ArduinoJson`, `WebSockets`
3. แก้ไขตัวแปร `serverUrl` ให้ชี้ไปยัง Backend API
4. Flash ลงบอร์ด Raspberry Pi Pico W