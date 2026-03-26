import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const link = document.createElement('link');
link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700;800&display=swap';
link.rel = 'stylesheet';
document.head.appendChild(link);

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

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        borderRadius: '12px',
        padding: '16px',
        color: '#F8FAFC',
        minWidth: '200px'
      }}>
        <p className="tabular-nums" style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', color: '#94A3B8' }}>{label}</p>
        {payload.map((entry, index) => (
          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', fontSize: '14px', fontWeight: '600' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: entry.color }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}` }}></span>
              {entry.name}
            </span>
            <span className="tabular-nums" style={{ color: '#F8FAFC' }}>{Number(entry.value).toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function App() {
  const [dataPoints, setDataPoints] = useState([]);
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [isNodeActive, setIsNodeActive] = useState(false);
  const [eventLogs, setEventLogs] = useState([]);
  const [nodeMeta, setNodeMeta] = useState({ mac: 'XX:XX:XX:XX:XX:XX', fw: 'v1.0.0-prod' });
  const [displayUptime, setDisplayUptime] = useState(0);
  const [customMins, setCustomMins] = useState(5);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);

  const maxDataPoints = useRef(60);
  const watchdogTimer = useRef(null);

  const fetchHistoricalData = async (minutes) => {
    setIsFetchingHistory(true);
    try {
      const response = await fetch(`https://pi-pico-w-monitoring.onrender.com/api/history?mins=${minutes}`);
      const data = await response.json();

      if (data && data.length > 0) {
        maxDataPoints.current = Math.max(100, data.length + 50);
        setDataPoints(data);
        setDisplayUptime(data[data.length - 1].uptime);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData(1);
  }, []);

  const [hiddenSeries, setHiddenSeries] = useState({
    voltage: false,
    ext_temp: false,
    core_temp: false
  });

  useEffect(() => {
    socket.on('connect', () => setIsServerConnected(true));
    socket.on('disconnect', () => {
      setIsServerConnected(false);
      setIsNodeActive(false);
    });

    socket.on('telemetry_stream', (incomingArray) => {
      setIsNodeActive(true);
      if (watchdogTimer.current) clearTimeout(watchdogTimer.current);

      watchdogTimer.current = setTimeout(() => setIsNodeActive(false), 15000);

      if (incomingArray.length > 0) {
        setNodeMeta({
          mac: incomingArray[0].mac || 'XX:XX:XX:XX:XX:XX',
          fw: incomingArray[0].fw || 'v1.0.0-prod'
        });
        setDisplayUptime(incomingArray[incomingArray.length - 1].uptime);
      }

      setDataPoints((prevData) => {
        const newData = [...prevData, ...incomingArray];
        return newData.slice(-maxDataPoints.current);
      });

      setEventLogs((prevLogs) => {
        let newLogs = [...prevLogs];
        incomingArray.forEach(data => {
          if (data.ext_temp > 48) {
            newLogs.unshift({ id: Date.now() + Math.random(), time: data.time, type: 'WARNING', msg: `High Ext Temp: ${data.ext_temp.toFixed(1)}°C` });
          }
          if (data.voltage >= 3.25 || data.voltage <= 0.1) {
            newLogs.unshift({ id: Date.now() + Math.random(), time: data.time, type: 'CRITICAL', msg: `ADC Saturation / Fault (V: ${data.voltage.toFixed(2)}V)` });
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
      interval = setInterval(() => setDisplayUptime(prev => prev + 1000), 1000);
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
  let stats = { maxTemp: 0, minTemp: 0, avgTemp: 0, maxVolt: 0, minVolt: 0, avgVolt: 0, dTdt: 0, stdDev: 0 };

  if (dataPoints.length > 1) {
    const firstPoint = dataPoints[0].uptime;
    const lastPoint = latestData.uptime;
    const timeDeltaSec = (lastPoint - firstPoint) / 1000;

    if (timeDeltaSec > 0) {
      samplingRate = (dataPoints.length - 1) / timeDeltaSec;
      const tempDelta = latestData.ext_temp - dataPoints[0].ext_temp;
      stats.dTdt = tempDelta / timeDeltaSec;
    }

    const temps = dataPoints.map(d => d.ext_temp);
    const volts = dataPoints.map(d => d.voltage);

    stats.maxTemp = Math.max(...temps);
    stats.minTemp = Math.min(...temps);
    stats.avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    stats.maxVolt = Math.max(...volts);
    stats.minVolt = Math.min(...volts);
    stats.avgVolt = volts.reduce((a, b) => a + b, 0) / volts.length;

    const variance = temps.reduce((sum, val) => sum + Math.pow(val - stats.avgTemp, 2), 0) / temps.length;
    stats.stdDev = Math.sqrt(variance);
  }

  let predictiveAlert = null;

  if (dataPoints.length > 20) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = dataPoints.length;
    const startUptime = dataPoints[0].uptime;

    dataPoints.forEach(pt => {
      const x = (pt.uptime - startUptime) / 1000;
      const y = pt.ext_temp;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const c = (sumY - m * sumX) / n;

    if (m > 0.05) {
      const threshold = 50.0;
      const targetRelativeSec = (threshold - c) / m;
      const currentRelativeSec = (latestData.uptime - startUptime) / 1000;

      const secondsToCritical = targetRelativeSec - currentRelativeSec;

      if (secondsToCritical > 0 && secondsToCritical <= 180) {
        const confidence = Math.min((n / 100) * 100, 99.9);
        predictiveAlert = {
          secondsLeft: Math.round(secondsToCritical),
          confidence: confidence.toFixed(1),
          slope: m.toFixed(3)
        };
      }
    }
  }

  const analyticalData = dataPoints.map((pt, i, arr) => {
    if (i === 0) return { ...pt, dTdt: 0 };
    const dt = (pt.uptime - arr[i - 1].uptime) / 1000;
    const dTemp = pt.ext_temp - arr[i - 1].ext_temp;
    const rate = dt > 0 ? (dTemp / dt) : 0;
    return { ...pt, dTdt: parseFloat(rate.toFixed(3)) };
  });

  const colors = isDarkMode ? {
    bgFull: '#030712', bgCard: 'rgba(15, 23, 42, 0.4)', bgKPI: 'rgba(30, 41, 59, 0.3)',
    textMain: '#F8FAFC', textMuted: '#94A3B8', gridLine: 'rgba(255, 255, 255, 0.05)',
    borderGlow: 'rgba(255, 255, 255, 0.08)', voltage: '#38BDF8', extTemp: '#34D399',
    coreTemp: '#FB7185', rssi: '#C084FC', warning: '#FBBF24', danger: '#EF4444', info: '#60A5FA',
    glowVoltage: 'rgba(56, 189, 248, 0.12)', glowExtTemp: 'rgba(52, 211, 153, 0.12)',
    glowCoreTemp: 'rgba(251, 113, 133, 0.12)', glowRssi: 'rgba(192, 132, 252, 0.12)', glowInfo: 'rgba(96, 165, 250, 0.12)'
  } : {
    bgFull: '#F8FAFC', bgCard: 'rgba(255, 255, 255, 0.7)', bgKPI: 'rgba(241, 245, 249, 0.5)',
    textMain: '#0F172A', textMuted: '#64748B', gridLine: 'rgba(0, 0, 0, 0.05)',
    borderGlow: 'rgba(0, 0, 0, 0.05)', voltage: '#0284C7', extTemp: '#059669',
    coreTemp: '#E11D48', rssi: '#7E22CE', warning: '#D97706', danger: '#DC2626', info: '#2563EB',
    glowVoltage: 'rgba(2, 132, 199, 0.1)', glowExtTemp: 'rgba(5, 150, 105, 0.1)',
    glowCoreTemp: 'rgba(225, 29, 72, 0.1)', glowRssi: 'rgba(126, 34, 206, 0.1)', glowInfo: 'rgba(37, 99, 235, 0.1)'
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
      <div className="mesh-bg"></div>
      <div className="layout-wrapper">
        {predictiveAlert && (
          <div style={{
            background: 'linear-gradient(90deg, #7F1D1D 0%, #B91C1C 100%)',
            border: '1px solid #EF4444',
            borderRadius: '16px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 10px 30px rgba(239, 68, 68, 0.4)',
            animation: 'pulse 1.5s infinite',
            marginBottom: '-8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: '#FECACA', color: '#991B1B', padding: '10px', borderRadius: '50%' }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: '#FEF2F2', letterSpacing: '0.5px' }}>PREDICTIVE WARNING: THERMAL RUNAWAY IMMINENT</h3>
                <div style={{ fontSize: '14px', color: '#FCA5A5', display: 'flex', gap: '15px' }}>
                  <span>OLS Model Gradient: <strong>+{predictiveAlert.slope} °C/s</strong></span>
                  <span>Model Confidence: <strong>{predictiveAlert.confidence}%</strong></span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#FCA5A5', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '1px' }}>Time to Critical (50°C)</div>
              <div className="tabular-nums" style={{ fontSize: '36px', fontWeight: '900', color: '#FFFFFF', textShadow: '0 0 20px rgba(255,255,255,0.5)' }}>
                {predictiveAlert.secondsLeft} <span style={{ fontSize: '16px', color: '#FCA5A5' }}>sec</span>
              </div>
            </div>
          </div>
        )}
        <div className="bento-panel glass-panel">
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
                <span className="detail-separator">MAC: <strong className="tabular-nums" style={{ color: colors.textMain }}>{nodeMeta.mac}</strong></span>
                <span className="detail-separator">FW: <strong className="tabular-nums" style={{ color: colors.textMain }}>{nodeMeta.fw}</strong></span>
                <span className="detail-separator">Points: <strong className="tabular-nums" style={{ color: colors.textMain }}>{dataPoints.length}</strong>/100</span>
              </div>
            </div>

            <div className="header-actions">
              <button
                className="theme-btn premium-btn"
                onClick={() => setIsDarkMode(!isDarkMode)}
                title="Toggle Theme"
              >
                {isDarkMode ? (
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                ) : (
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                )}
              </button>
              <button className="export-btn premium-btn" onClick={exportToCSV}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                CSV
              </button>
            </div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card glass-kpi" style={{ boxShadow: `0 8px 32px ${colors.glowVoltage}`, borderColor: colors.borderGlow }}>
              <div className="kpi-label">Voltage (ADC)</div>
              <div className="kpi-value tabular-nums" style={{ color: colors.voltage }}>{latestData.voltage.toFixed(2)} <span className="kpi-unit">V</span></div>
            </div>
            <div className="kpi-card glass-kpi" style={{ boxShadow: `0 8px 32px ${colors.glowExtTemp}`, borderColor: colors.borderGlow }}>
              <div className="kpi-label">Ext. Temperature</div>
              <div className="kpi-value tabular-nums" style={{ color: colors.extTemp }}>{latestData.ext_temp.toFixed(2)} <span className="kpi-unit">°C</span></div>
            </div>
            <div className="kpi-card glass-kpi" style={{ boxShadow: `0 8px 32px ${latestData.core_temp > 45 ? 'rgba(245,158,11,0.15)' : colors.glowCoreTemp}`, borderColor: colors.borderGlow }}>
              <div className="kpi-label">Core Temperature</div>
              <div className="kpi-value tabular-nums" style={{ color: latestData.core_temp > 45 ? colors.warning : colors.coreTemp }}>{latestData.core_temp.toFixed(2)} <span className="kpi-unit">°C</span></div>
            </div>
            <div className="kpi-card glass-kpi" style={{ boxShadow: `0 8px 32px ${colors.glowRssi}`, borderColor: colors.borderGlow }}>
              <div className="kpi-label">Signal / RAM</div>
              <div className="kpi-value-small tabular-nums" style={{ color: colors.textMain }}>
                {latestData.rssi} <span className="kpi-unit-small">dBm</span>
                <div className="kpi-sub-value tabular-nums">{(latestData.free_ram / 1024).toFixed(1)} KB</div>
              </div>
            </div>
            <div className="kpi-card glass-kpi" style={{ boxShadow: `0 8px 32px ${colors.glowInfo}`, borderColor: colors.borderGlow }}>
              <div className="kpi-label">Hardware Uptime</div>
              <div className="kpi-value-small tabular-nums" style={{ color: colors.textMain, paddingTop: '4px' }}>
                {formatUptime(displayUptime)}
              </div>
            </div>
            <div className="kpi-card glass-kpi" style={{ boxShadow: `0 8px 32px ${colors.glowInfo}`, borderColor: colors.borderGlow }}>
              <div className="kpi-label">Data Throughput</div>
              <div className="kpi-value tabular-nums" style={{ color: colors.info }}>{samplingRate.toFixed(1)} <span className="kpi-unit">Hz</span></div>
            </div>
          </div>

          <div className="glass-kpi flex-toolbar" style={{ borderColor: colors.borderGlow }}>
            <span style={{ color: colors.textMuted, fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Historical Range</span>
            <div className="divider-vertical"></div>
            <button className="time-btn" onClick={() => fetchHistoricalData(1)}>1 Min</button>
            <button className="time-btn" onClick={() => fetchHistoricalData(5)}>5 Mins</button>
            <button className="time-btn" onClick={() => fetchHistoricalData(60)}>1 Hour</button>
            <div className="divider-vertical"></div>
            <input
              type="number"
              min="1" max="360"
              value={customMins}
              onChange={(e) => setCustomMins(e.target.value)}
              className="tabular-nums custom-time-input"
              style={{ background: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)', borderColor: colors.borderGlow, color: colors.textMain }}
            />
            <span style={{ color: colors.textMuted, fontSize: '13px' }}>Mins</span>
            <button
              className="time-btn fetch-btn"
              style={{ background: isFetchingHistory ? colors.textMuted : colors.extTemp, color: '#fff', borderColor: 'transparent' }}
              onClick={() => fetchHistoricalData(customMins)}
              disabled={isFetchingHistory}
            >
              {isFetchingHistory ? 'Loading...' : 'Fetch'}
            </button>
          </div>

          <div className="chart-container">
            {dataPoints.length === 0 && (
              <div className="premium-empty-state">
                <div className="radar-pulse"></div>
                <div style={{ color: colors.textMuted, fontWeight: '600', letterSpacing: '1px' }}>Awaiting Telemetry Stream...</div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVoltage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.voltage} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.voltage} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExtTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.extTemp} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.extTemp} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCoreTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.coreTemp} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.coreTemp} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridLine} vertical={false} />
                <XAxis dataKey="time" stroke={colors.textMuted} tick={{ fill: colors.textMuted, fontSize: 12 }} axisLine={{ stroke: colors.gridLine }} className="tabular-nums" />
                <YAxis yAxisId="left" stroke={colors.voltage} tick={{ fill: colors.voltage, fontSize: 12 }} domain={[0, 3.5]} axisLine={false} tickLine={false} className="tabular-nums" />
                <YAxis yAxisId="right" orientation="right" stroke={colors.extTemp} tick={{ fill: colors.extTemp, fontSize: 12 }} domain={[15, 55]} axisLine={false} tickLine={false} className="tabular-nums" />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.gridLine, strokeWidth: 1, strokeDasharray: '4 4' }} />
                <ReferenceLine y={50} yAxisId="right" stroke={colors.warning} strokeDasharray="4 4" label={{ position: 'insideTopLeft', value: 'System Limit (50°C)', fill: colors.warning, fontSize: 11, fontWeight: '700' }} />
                <Area hide={hiddenSeries.voltage} yAxisId="left" type="monotone" dataKey="voltage" name="Voltage" stroke={colors.voltage} strokeWidth={2.5} fill="url(#colorVoltage)" dot={false} isAnimationActive={false} />
                <Area hide={hiddenSeries.ext_temp} yAxisId="right" type="monotone" dataKey="ext_temp" name="Ext Temp" stroke={colors.extTemp} strokeWidth={2.5} fill="url(#colorExtTemp)" dot={false} isAnimationActive={false} />
                <Area hide={hiddenSeries.core_temp} yAxisId="right" type="monotone" dataKey="core_temp" name="Core Temp" stroke={colors.coreTemp} strokeWidth={2.5} fill="url(#colorCoreTemp)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bottom-panel">
          <div className="bento-panel glass-panel">
            <h3 className="section-title">Statistical Summary (Window: 100 Pts)</h3>
            <div className="stats-inner-grid">
              <div>
                <div style={{ color: colors.extTemp, fontWeight: '700', marginBottom: '12px', letterSpacing: '0.5px' }}>Ext. Temperature</div>
                <div className="stat-row"><span>MAX:</span> <strong className="tabular-nums">{stats.maxTemp.toFixed(2)} °C</strong></div>
                <div className="stat-row"><span>MIN:</span> <strong className="tabular-nums">{stats.minTemp.toFixed(2)} °C</strong></div>
                <div className="stat-row"><span>AVG:</span> <strong className="tabular-nums">{stats.avgTemp.toFixed(2)} °C</strong></div>
                <div className="stat-row"><span>Noise (StdDev):</span> <strong className="tabular-nums">±{stats.stdDev.toFixed(3)}</strong></div>
                <div className="stat-row" style={{ alignItems: 'center' }}>
                  <span>Trend (dT/dt):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong className="tabular-nums" style={{ color: stats.dTdt > 0.5 ? colors.danger : colors.textMain }}>
                      {stats.dTdt > 0 ? '+' : ''}{stats.dTdt.toFixed(3)} °C/s
                    </strong>
                    <button
                      onClick={() => setShowAdvancedAnalytics(!showAdvancedAnalytics)}
                      className="premium-btn chart-toggle-btn"
                      style={{ background: colors.voltage, color: '#fff' }}
                    >
                      {showAdvancedAnalytics ? 'Close' : 'Chart'}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ color: colors.voltage, fontWeight: '700', marginBottom: '12px', letterSpacing: '0.5px' }}>ADC Voltage</div>
                <div className="stat-row"><span>MAX:</span> <strong className="tabular-nums">{stats.maxVolt.toFixed(2)} V</strong></div>
                <div className="stat-row"><span>MIN:</span> <strong className="tabular-nums">{stats.minVolt.toFixed(2)} V</strong></div>
                <div className="stat-row"><span>AVG:</span> <strong className="tabular-nums">{stats.avgVolt.toFixed(2)} V</strong></div>
              </div>
            </div>
          </div>

          <div className="bento-panel glass-panel logs-card">
            <h3 className="section-title">System Event Logs</h3>
            {eventLogs.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>No anomalies detected in the current session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {eventLogs.map(log => (
                  <div key={log.id} className="log-item glass-kpi" style={{ borderLeft: `3px solid ${log.type === 'CRITICAL' ? colors.danger : colors.warning}`, borderColor: colors.borderGlow, borderLeftColor: log.type === 'CRITICAL' ? colors.danger : colors.warning }}>
                    <span className="tabular-nums" style={{ color: colors.textMuted, whiteSpace: 'nowrap' }}>[{log.time}]</span>
                    <strong style={{ color: log.type === 'CRITICAL' ? colors.danger : colors.warning, width: '70px' }}>{log.type}</strong>
                    <span className="tabular-nums" style={{ color: colors.textMain }}>{log.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showAdvancedAnalytics && (
          <div className="bento-panel glass-panel" style={{ animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <h3 className="section-title" style={{ color: colors.voltage }}>Thermal Rate of Change Analysis (dT/dt)</h3>
            <p style={{ fontSize: '13px', color: colors.textMuted, marginBottom: '20px', lineHeight: '1.5' }}>
              กราฟแสดงความเร็วในการเปลี่ยนแปลงอุณหภูมิต่อวินาที หากกราฟพุ่งทะลุเส้นอ้างอิง (0.5 °C/s) แสดงถึงภาวะความร้อนสะสมผิดปกติ (Thermal Runaway)
            </p>
            <div style={{ width: '100%', height: '260px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticalData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.gridLine} vertical={false} />
                  <XAxis dataKey="time" stroke={colors.textMuted} tick={{ fill: colors.textMuted, fontSize: 11 }} className="tabular-nums" />
                  <YAxis stroke={colors.voltage} tick={{ fill: colors.voltage, fontSize: 11 }} domain={['auto', 'auto']} className="tabular-nums" />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.gridLine, strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <ReferenceLine y={0.5} stroke={colors.danger} strokeDasharray="4 4" label={{ position: 'insideTopLeft', value: 'Critical Heating Rate (+0.5°C/s)', fill: colors.danger, fontSize: 11, fontWeight: '700' }} />
                  <ReferenceLine y={0} stroke={colors.gridLine} />
                  <Area type="monotone" dataKey="dTdt" name="Temp Velocity (°C/s)" stroke={colors.voltage} strokeWidth={2.5} fill={colors.glowVoltage} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <style>{`
        :root {
          --bg-full: ${colors.bgFull};
          --text-main: ${colors.textMain};
          --text-muted: ${colors.textMuted};
          --grid-line: ${colors.gridLine};
        }
        body { background-color: var(--bg-full); transition: background-color 0.5s ease; margin: 0; overflow-x: hidden; }
        
        .mesh-bg {
          position: fixed; top: -50%; left: -50%; width: 200%; height: 200%; z-index: -1; pointer-events: none;
          background: radial-gradient(circle at 50% 50%, ${colors.glowVoltage} 0%, transparent 40%),
                      radial-gradient(circle at 80% 20%, ${colors.glowRssi} 0%, transparent 30%);
          opacity: ${isDarkMode ? 0.6 : 0.8};
          transition: opacity 0.5s ease, background 0.5s ease;
        }

        .app-root { min-height: 100vh; color: var(--text-main); font-family: 'Inter', system-ui, sans-serif; padding: 40px 24px; display: flex; justify-content: center; transition: color 0.5s ease; }
        .tabular-nums { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
        
        .glass-panel { 
          background: ${colors.bgCard}; backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); 
          border: 1px solid ${colors.borderGlow}; box-shadow: 0 4px 24px -8px rgba(0,0,0, ${isDarkMode ? '0.5' : '0.05'}); 
          position: relative; overflow: hidden; 
        }
        .bento-panel { border-radius: 24px; padding: 32px; }
        .glass-kpi { 
          background: ${colors.bgKPI}; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); 
          border: 1px solid; border-radius: 16px; 
        }

        .layout-wrapper { width: 100%; max-width: 1400px; display: flex; flex-direction: column; gap: 24px; }
        .header-section { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--grid-line); padding-bottom: 24px; margin-bottom: 32px; gap: 20px; }
        .header-title { margin: 0 0 12px 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
        .header-details { display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--text-muted); flex-wrap: wrap; }
        .detail-item { display: flex; align-items: center; gap: 8px; font-weight: 700; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; }
        .detail-separator { border-left: 1px solid var(--grid-line); padding-left: 16px; height: 14px; display: flex; align-items: center; }
        
        .header-actions { display: flex; gap: 12px; align-items: center; }
        .premium-btn { 
          display: flex; align-items: center; justify-content: center; gap: 8px; color: white; border: none; 
          padding: 10px 16px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 13px; 
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap; 
        }
        .export-btn { background-color: #2563EB; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); }
        .export-btn:hover { background-color: #1D4ED8; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3); }
        .theme-btn { background-color: ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; color: var(--text-main); border: 1px solid ${colors.borderGlow}; padding: 10px; }
        .theme-btn:hover { background-color: ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}; transform: translateY(-2px); }

        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .kpi-card { padding: 20px; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s; }
        .kpi-card:hover { transform: translateY(-4px); }
        .kpi-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; font-weight: 700; }
        .kpi-value { font-size: 32px; font-weight: 800; letter-spacing: -1px; }
        .kpi-value-small { font-size: 22px; font-weight: 700; }
        .kpi-unit { font-size: 15px; color: var(--text-muted); font-weight: 600; letter-spacing: 0; }
        .kpi-unit-small { font-size: 13px; color: var(--text-muted); font-weight: 600; }
        .kpi-sub-value { font-size: 13px; color: var(--text-muted); margin-top: 6px; font-weight: 600; }
        
        .flex-toolbar { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; align-items: center; padding: 16px 20px; }
        .divider-vertical { border-left: 1px solid var(--grid-line); height: 20px; margin: 0 8px; }
        .time-btn { 
          background-color: transparent; color: var(--text-main); border: 1px solid var(--grid-line); 
          padding: 8px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s; 
        }
        .time-btn:hover { background-color: ${colors.borderGlow}; border-color: ${colors.borderGlow}; }
        .custom-time-input { border-radius: 10px; padding: 8px 12px; width: 64px; text-align: center; font-weight: 600; outline: none; border: 1px solid; }
        .custom-time-input:focus { border-color: ${colors.voltage}; box-shadow: 0 0 0 2px ${colors.glowVoltage}; }
        .fetch-btn { padding: 8px 20px; }
        .fetch-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px ${colors.glowExtTemp}; }

        .chart-container { width: 100%; height: 460px; position: relative; min-width: 0; min-height: 0; }
        .premium-empty-state { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 24px; z-index: 10; pointer-events: none; }
        .radar-pulse { width: 48px; height: 48px; border-radius: 50%; background-color: ${colors.info}; animation: radarPing 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
        @keyframes radarPing { 75%, 100% { transform: scale(2.5); opacity: 0; } }

        .bottom-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .logs-card { display: flex; flex-direction: column; }
        .section-title { margin: 0 0 24px 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; }
        .stats-inner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .stat-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 12px; border-bottom: 1px solid var(--grid-line); padding-bottom: 8px; }
        .chart-toggle-btn { border: none; border-radius: 8px; padding: 4px 12px; font-size: 11px; cursor: pointer; font-weight: 700; transition: transform 0.2s; }
        .chart-toggle-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px ${colors.glowVoltage}; }
        .log-item { display: flex; gap: 16px; font-size: 13px; padding: 14px 16px; transition: transform 0.2s; }
        .log-item:hover { transform: translateX(4px); }

        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); } 70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
        
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--grid-line); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        @media (max-width: 1024px) { .bottom-panel { grid-template-columns: 1fr; } }
        
        @media (max-width: 768px) {
          .app-root { padding: 12px; } 
          .bento-panel { padding: 16px; border-radius: 16px; } 
          .header-section { flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom: 20px; padding-bottom: 16px; }
          .header-actions { width: 100%; justify-content: flex-end; margin-top: 0; } 
          .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; } 
          .flex-toolbar { flex-direction: row; flex-wrap: wrap; justify-content: space-between; padding: 12px; gap: 8px; } 
          .time-btn { flex: 1; padding: 8px 4px; font-size: 12px; min-width: 60px; }
          .custom-time-input { flex: 1; min-width: 50px; padding: 8px 4px; }
          .divider-vertical { display: none; }
        }
        
        @media (max-width: 480px) { 
          .stats-inner-grid { grid-template-columns: 1fr; } 
          .chart-container { height: 280px; } 
          .header-title { font-size: 20px; }
          .kpi-card { padding: 16px 12px; }
          .kpi-value { font-size: 24px; }
          .kpi-value-small { font-size: 18px; }
          .kpi-label { font-size: 10px; margin-bottom: 8px; }
        }
      `}</style>
    </div>
  );
}

export default App;