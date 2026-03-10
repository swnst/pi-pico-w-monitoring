import serial
import csv
import time
import sys
import os     
import glob    
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque

MAX_LOG_FILES = 2 

def cleanup_old_logs(max_keep):
    files = glob.glob("datalog_*.csv")
    files.sort(key=os.path.getmtime)
    if len(files) > max_keep:
        files_to_delete = files[:-max_keep] 
        for f in files_to_delete:
            try:
                os.remove(f)
                print(f"[*] ลบไฟล์เก่าตาม Data Retention Policy: {f}")
            except Exception as e:
                print(f"[!] ไม่สามารถลบไฟล์ {f} ได้: {e}")
cleanup_old_logs(MAX_LOG_FILES)

SERIAL_PORT = 'COM4'  
BAUD_RATE = 115200

MAX_POINTS = 100 
times = deque(maxlen=MAX_POINTS)
voltages = deque(maxlen=MAX_POINTS)
temperatures = deque(maxlen=MAX_POINTS)

filename = f"datalog_{time.strftime('%Y%m%d_%H%M%S')}.csv"

try:
    file = open(filename, mode='a', newline='', encoding='utf-8')
    writer = csv.writer(file)
    writer.writerow(["Uptime_ms", "Date", "Time", "ADC_Raw", "Voltage_V", "Ext_Temp_C", "Core_Temp_C", "RSSI_dBm", "Free_RAM_bytes"])
except Exception as e:
    print(f"[!] ไม่สามารถสร้างไฟล์ได้: {e}")
    sys.exit(1)

try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    print(f"[*] เชื่อมต่อ {SERIAL_PORT} สำเร็จ")
    print(f"[*] กำลังบันทึกข้อมูลลงไฟล์: {filename}")
except serial.SerialException as e:
    print(f"[!] ไม่สามารถเชื่อมต่อพอร์ตได้: {e}")
    file.close()
    sys.exit(1)

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 6))
fig.canvas.manager.set_window_title('Raspberry Pi Pico W - Live Telemetry')

def update_graph(frame):
    if ser.in_waiting > 0:
        raw_data = ser.readline()
        try:
            decoded_data = raw_data.decode('utf-8').strip()
            
            if not decoded_data or decoded_data.startswith("Uptime"):
                return
            
            data_list = [item.strip() for item in decoded_data.split(',')]
            
            if len(data_list) == 9:
                writer.writerow(data_list)
                file.flush() 
                
                uptime_sec = float(data_list[0]) / 1000.0
                voltage = float(data_list[4])
                ext_temp = float(data_list[5])
                
                times.append(uptime_sec)
                voltages.append(voltage)
                temperatures.append(ext_temp)
                
                ax1.clear()
                ax1.plot(times, voltages, color='blue', label='Voltage (V)', linewidth=2)
                ax1.set_ylim(0.0, 3.5)
                ax1.set_ylabel('Voltage (V)')
                ax1.legend(loc='upper right')
                ax1.grid(True, linestyle='--', alpha=0.7)
                
                ax2.clear()
                ax2.plot(times, temperatures, color='red', label='Ext Temp (°C)', linewidth=2)
                ax2.set_ylim(15.0, 55.0)
                ax2.set_ylabel('Temperature (°C)')
                ax2.set_xlabel('Uptime (Seconds)')
                ax2.legend(loc='upper right')
                ax2.grid(True, linestyle='--', alpha=0.7)
                
        except (UnicodeDecodeError, ValueError, IndexError):
            pass 

ani = animation.FuncAnimation(fig, update_graph, interval=100, cache_frame_data=False)

plt.tight_layout()
plt.show() 

ser.close()
file.close()
print("[*] บันทึกข้อมูลและตัดการเชื่อมต่อฮาร์ดแวร์อย่างปลอดภัย")