import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const socket = io('https://pi-pico-w-monitoring.onrender.com', {
  transports: ['websocket']
});

const formatUptime = (ms) => {
  if (!ms) return "0d 0h 0m 0s";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
};

function App() {
  const [dataPoints, setDataPoints] = useState([]);
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [isNodeActive, setIsNodeActive] = useState(false);
  const [eventLogs, setEventLogs] = useState([]);
  const [nodeMeta, setNodeMeta] = useState({ mac: 'XX:XX:XX:XX:XX:XX', fw: 'v1.0.0-prod' });
  const [displayUptime, setDisplayUptime] = useState(0);

  const [hiddenSeries, setHiddenSeries] = useState({
    voltage: false,
    ext_temp: false,
    core_temp: false
  });

  const watchdogTimer = useRef(null);

  useEffect(() => {
    socket.on('connect', () => {
      setIsServerConnected(true);
    });

    socket.on('disconnect', () => {
      setIsServerConnected(false);
      setIsNodeActive(false);
    });

    socket.on('telemetry_stream', (incomingArray) => {
      setIsNodeActive(true);

      if (watchdogTimer.current) {
        clearTimeout(watchdogTimer.current);
      }

      watchdogTimer.current = setTimeout(() => {
        setIsNodeActive(false);
      }, 15000);

      if (incomingArray.length > 0) {
        setNodeMeta({
          mac: incomingArray[0].mac || 'XX:XX:XX:XX:XX:XX',
          fw: incomingArray[0].fw || 'v1.0.0-prod'
        });
        setDisplayUptime(incomingArray[incomingArray.length - 1].uptime);
      }

      setDataPoints((prevData) => {
        const newData = [...prevData, ...incomingArray];
        return newData.slice(-100);
      });

      setEventLogs((prevLogs) => {
        let newLogs = [...prevLogs];
        incomingArray.forEach(data => {
          if (data.core_temp > 45) {
            newLogs.unshift({ id: Date.now() + Math.random(), time: data.time, type: 'CRITICAL', msg: `Core Temp high: ${data.core_temp.toFixed(1)}°C` });
          }
          if (data.voltage < 0.5 || data.voltage > 3.4) {
            newLogs.unshift({ id: Date.now() + Math.random(), time: data.time, type: 'WARNING', msg: `Voltage anomaly: ${data.voltage.toFixed(2)}V` });
          }
          if (data.rssi < -85) {
            newLogs.unshift({ id: Date.now() + Math.random(), time: data.time, type: 'WARNING', msg: `Weak WiFi: ${data.rssi}dBm` });
          }
        });
        return newLogs.slice(0, 20);
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('telemetry_stream');
      if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
    };
  }, []);

  useEffect(() => {
    let interval;
    if (isNodeActive) {
      interval = setInterval(() => {
        setDisplayUptime(prev => prev + 1000);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isNodeActive]);

  const handleLegendClick = (e) => {
    const { dataKey } = e;
    setHiddenSeries(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const exportToCSV = () => {
    if (dataPoints.length === 0) return;
    const headers = ["Time", "Uptime (ms)", "Voltage (V)", "Ext Temp (C)", "Core Temp (C)", "RSSI (dBm)", "Free RAM (Bytes)"];
    const csvRows = [headers.join(',')];

    dataPoints.forEach(row => {
      csvRows.push(`${row.time},${row.uptime},${row.voltage},${row.ext_temp},${row.core_temp},${row.rssi},${row.free_ram}`);
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Telemetry_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const latestData = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] :
    { time: "00:00:00", uptime: 0, voltage: 0, ext_temp: 0, core_temp: 0, rssi: 0, free_ram: 0 };

  let samplingRate = 0;
  let stats = { maxTemp: 0, minTemp: 0, avgTemp: 0, maxVolt: 0, minVolt: 0, avgVolt: 0 };

  if (dataPoints.length > 1) {
    const firstPoint = dataPoints[0].uptime;
    const lastPoint = latestData.uptime;
    const timeDeltaSec = (lastPoint - firstPoint) / 1000;
    if (timeDeltaSec > 0) {
      samplingRate = (dataPoints.length - 1) / timeDeltaSec;
    }

    const temps = dataPoints.map(d => d.core_temp);
    const volts = dataPoints.map(d => d.voltage);
    stats.maxTemp = Math.max(...temps);
    stats.minTemp = Math.min(...temps);
    stats.avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    stats.maxVolt = Math.max(...volts);
    stats.minVolt = Math.min(...volts);
    stats.avgVolt = volts.reduce((a, b) => a + b, 0) / volts.length;
  }

  const colors = {
    bgFull: '#0B1120', bgCard: '#1E293B', bgKPI: '#0F172A',
    textMain: '#F8FAFC', textMuted: '#94A3B8', gridLine: '#334155',
    voltage: '#38BDF8', extTemp: '#10B981', coreTemp: '#F43F5E',
    rssi: '#A855F7', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6'
  };

  let statusColor = colors.danger;
  let statusText = "SYSTEM OFFLINE";
  if (isServerConnected && !isNodeActive) {
    statusColor = colors.warning;
    statusText = "WAITING FOR NODE";
  } else if (isServerConnected && isNodeActive) {
    statusColor = colors.extTemp;
    statusText = "NODE ONLINE";
  }

  return (
    <div className="app-root">
      <div className="layout-wrapper">
        <div className="main-card">
          <div className="header-section">
            <div className="header-content">
              <h1 className="header-title">Pico W Edge Node Diagnostics</h1>
              <div className="header-details">
                <div className="detail-item">
                  <div className="status-dot" style={{
                    backgroundColor: statusColor,
                    boxShadow: `0 0 12px ${statusColor}`,
                    animation: isNodeActive ? 'pulse 2s infinite' : 'none'
                  }}></div>
                  <strong style={{ color: statusColor }}>{statusText}</strong>
                </div>
                <span className="detail-separator">MAC: <strong style={{ color: colors.textMain }}>{nodeMeta.mac}</strong></span>
                <span className="detail-separator">FW: <strong style={{ color: colors.textMain }}>{nodeMeta.fw}</strong></span>
                <span className="detail-separator">Points: <strong style={{ color: colors.textMain }}>{dataPoints.length}</strong>/100</span>
              </div>
            </div>
            <button className="export-btn" onClick={exportToCSV}>
              Download CSV
            </button>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: `4px solid ${colors.voltage}` }}>
              <div className="kpi-label">Voltage (ADC)</div>
              <div className="kpi-value" style={{ color: colors.voltage }}>{latestData.voltage.toFixed(2)} <span className="kpi-unit">V</span></div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${colors.extTemp}` }}>
              <div className="kpi-label">Ext. Temperature</div>
              <div className="kpi-value" style={{ color: colors.extTemp }}>{latestData.ext_temp.toFixed(2)} <span className="kpi-unit">°C</span></div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${latestData.core_temp > 45 ? colors.warning : colors.coreTemp}` }}>
              <div className="kpi-label">Core Temperature</div>
              <div className="kpi-value" style={{ color: latestData.core_temp > 45 ? colors.warning : colors.coreTemp }}>{latestData.core_temp.toFixed(2)} <span className="kpi-unit">°C</span></div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${latestData.rssi < -80 ? colors.warning : colors.rssi}` }}>
              <div className="kpi-label">Signal / RAM</div>
              <div className="kpi-value-small" style={{ color: colors.textMain }}>
                {latestData.rssi} <span className="kpi-unit-small">dBm</span>
                <div className="kpi-sub-value">{(latestData.free_ram / 1024).toFixed(1)} KB</div>
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${colors.info}` }}>
              <div className="kpi-label">Hardware Uptime</div>
              <div className="kpi-value-small" style={{ color: colors.textMain, paddingTop: '4px' }}>
                {formatUptime(displayUptime)}
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${colors.info}` }}>
              <div className="kpi-label">Data Throughput</div>
              <div className="kpi-value" style={{ color: colors.info }}>{samplingRate.toFixed(1)} <span className="kpi-unit">Hz</span></div>
            </div>
          </div>

          <div className="chart-container">
            {dataPoints.length === 0 && (
              <div className="empty-state">
                Waiting for Edge Node Telemetry...
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVoltage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.voltage} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={colors.voltage} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExtTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.extTemp} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={colors.extTemp} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCoreTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.coreTemp} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={colors.coreTemp} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridLine} vertical={false} />
                <XAxis dataKey="time" stroke={colors.textMuted} tick={{ fill: colors.textMuted, fontSize: 12 }} axisLine={{ stroke: colors.gridLine }} />
                <YAxis yAxisId="left" stroke={colors.voltage} tick={{ fill: colors.voltage, fontSize: 12 }} domain={[0, 3.5]} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke={colors.coreTemp} tick={{ fill: colors.coreTemp, fontSize: 12 }} domain={[15, 60]} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: colors.bgKPI, borderColor: colors.gridLine, borderRadius: '8px' }} itemStyle={{ fontWeight: '600' }} cursor={{ stroke: colors.gridLine }} />
                <Legend verticalAlign="top" height={40} onClick={handleLegendClick} wrapperStyle={{ cursor: 'pointer', paddingBottom: '10px', fontSize: '14px' }} />
                <Area hide={hiddenSeries.voltage} yAxisId="left" type="monotone" dataKey="voltage" name="Voltage" stroke={colors.voltage} strokeWidth={2} fill="url(#colorVoltage)" dot={false} isAnimationActive={false} />
                <Area hide={hiddenSeries.ext_temp} yAxisId="right" type="monotone" dataKey="ext_temp" name="Ext Temp" stroke={colors.extTemp} strokeWidth={2} fill="url(#colorExtTemp)" dot={false} isAnimationActive={false} />
                <Area hide={hiddenSeries.core_temp} yAxisId="right" type="monotone" dataKey="core_temp" name="Core Temp" stroke={colors.coreTemp} strokeWidth={2} fill="url(#colorCoreTemp)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bottom-panel">
          <div className="stats-card">
            <h3 className="section-title">Statistical Summary (Window: 100 Pts)</h3>
            <div className="stats-inner-grid">
              <div>
                <div style={{ color: colors.coreTemp, fontWeight: 'bold', marginBottom: '10px' }}>Core Temperature</div>
                <div className="stat-row"><span>MAX:</span> <strong>{stats.maxTemp.toFixed(2)} °C</strong></div>
                <div className="stat-row"><span>MIN:</span> <strong>{stats.minTemp.toFixed(2)} °C</strong></div>
                <div className="stat-row"><span>AVG:</span> <strong>{stats.avgTemp.toFixed(2)} °C</strong></div>
              </div>
              <div>
                <div style={{ color: colors.voltage, fontWeight: 'bold', marginBottom: '10px' }}>ADC Voltage</div>
                <div className="stat-row"><span>MAX:</span> <strong>{stats.maxVolt.toFixed(2)} V</strong></div>
                <div className="stat-row"><span>MIN:</span> <strong>{stats.minVolt.toFixed(2)} V</strong></div>
                <div className="stat-row"><span>AVG:</span> <strong>{stats.avgVolt.toFixed(2)} V</strong></div>
              </div>
            </div>
          </div>

          <div className="logs-card">
            <h3 className="section-title">System Event Logs</h3>
            {eventLogs.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: '14px', fontStyle: 'italic' }}>No anomalies detected in the current session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {eventLogs.map(log => (
                  <div key={log.id} className="log-item" style={{ borderLeft: `3px solid ${log.type === 'CRITICAL' ? colors.danger : colors.warning}` }}>
                    <span style={{ color: colors.textMuted, whiteSpace: 'nowrap' }}>[{log.time}]</span>
                    <strong style={{ color: log.type === 'CRITICAL' ? colors.danger : colors.warning }}>{log.type}</strong>
                    <span style={{ color: colors.textMain }}>{log.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        :root {
          --bg-full: #0B1120;
          --bg-card: #1E293B;
          --bg-kpi: #0F172A;
          --grid-line: #334155;
          --text-muted: #94A3B8;
        }
        .app-root {
          min-height: 100vh;
          background-color: var(--bg-full);
          color: #F8FAFC;
          font-family: system-ui, sans-serif;
          padding: 40px 20px;
          display: flex;
          justify-content: center;
        }
        .layout-wrapper {
          width: 100%;
          max-width: 1400px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .main-card {
          background-color: var(--bg-card);
          border-radius: 16px;
          padding: 30px;
          border: 1px solid var(--grid-line);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        }
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--grid-line);
          padding-bottom: 20px;
          margin-bottom: 25px;
          gap: 15px;
        }
        .header-title {
          margin: 0 0 10px 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .header-details {
          display: flex;
          align-items: center;
          gap: 15px;
          font-size: 13px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }
        .detail-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .detail-separator {
          border-left: 1px solid var(--grid-line);
          padding-left: 15px;
        }
        .export-btn {
          background-color: #2563EB;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .export-btn:hover {
          background-color: #1D4ED8;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }
        .kpi-card {
          background-color: var(--bg-kpi);
          padding: 15px;
          border-radius: 8px;
          border: 1px solid var(--grid-line);
        }
        .kpi-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 5px;
        }
        .kpi-value {
          font-size: 24px;
          font-weight: bold;
        }
        .kpi-value-small {
          font-size: 18px;
          font-weight: bold;
        }
        .kpi-unit {
          font-size: 14px;
          color: var(--text-muted);
        }
        .kpi-unit-small {
          font-size: 12px;
          color: var(--text-muted);
        }
        .kpi-sub-value {
          font-size: 14px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .chart-container {
          width: 100%;
          height: 400px;
          position: relative;
        }
        .empty-state {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          display: flex; justify-content: center; align-items: center;
          color: var(--text-muted); z-index: 10; font-size: 16px;
          font-weight: 500; pointer-events: none;
        }
        .bottom-panel {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .stats-card, .logs-card {
          background-color: var(--bg-card);
          border-radius: 16px;
          padding: 25px;
          border: 1px solid var(--grid-line);
        }
        .logs-card {
          max-height: 250px;
          overflow-y: auto;
        }
        .section-title {
          margin: 0 0 20px 0;
          font-size: 16px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .stats-inner-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          margin-bottom: 5px;
        }
        .log-item {
          display: flex;
          gap: 15px;
          font-size: 13px;
          padding: 10px;
          background-color: var(--bg-kpi);
          border-radius: 6px;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg-card); border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--grid-line); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }

        @media (max-width: 1024px) {
          .bottom-panel {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .app-root {
            padding: 20px 10px;
          }
          .main-card {
            padding: 20px;
          }
          .header-section {
            flex-direction: column;
            align-items: stretch;
          }
          .header-details {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .detail-separator {
            border-left: none;
            padding-left: 0;
          }
          .export-btn {
            width: 100%;
            margin-top: 10px;
          }
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 480px) {
          .kpi-grid {
            grid-template-columns: 1fr;
          }
          .stats-inner-grid {
            grid-template-columns: 1fr;
          }
          .chart-container {
            height: 300px;
          }
          .header-title {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}

export default App;