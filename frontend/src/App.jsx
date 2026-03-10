import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const socket = io('http://localhost:3000');

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
  const [isConnected, setIsConnected] = useState(false);
  const [eventLogs, setEventLogs] = useState([]);

  const [hiddenSeries, setHiddenSeries] = useState({
    voltage: false,
    ext_temp: false,
    core_temp: false
  });

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('telemetry_stream', (incomingArray) => {
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
    };
  }, []);

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bgFull, color: colors.textMain, fontFamily: 'system-ui, sans-serif', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ backgroundColor: colors.bgCard, borderRadius: '16px', padding: '30px', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.gridLine}`, paddingBottom: '20px', marginBottom: '25px' }}>
            <div>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px' }}>Pico W Edge Node Diagnostics</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '13px', color: colors.textMuted }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: isConnected ? colors.extTemp : colors.danger,
                    boxShadow: `0 0 12px ${isConnected ? colors.extTemp : colors.danger}`,
                    animation: isConnected ? 'pulse 2s infinite' : 'none'
                  }}></div>
                  <strong style={{ color: isConnected ? colors.textMain : colors.danger }}>{isConnected ? "ONLINE" : "OFFLINE"}</strong>
                </div>
                <span style={{ borderLeft: `1px solid ${colors.gridLine}`, paddingLeft: '15px' }}>MAC: <strong>XX:XX:XX:XX:XX:XX</strong></span>
                <span style={{ borderLeft: `1px solid ${colors.gridLine}`, paddingLeft: '15px' }}>FW: <strong>v1.0.0-prod</strong></span>
                <span style={{ borderLeft: `1px solid ${colors.gridLine}`, paddingLeft: '15px' }}>Points: <strong>{dataPoints.length}</strong>/100</span>
              </div>
            </div>
            <button
              onClick={exportToCSV}
              style={{ backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#1D4ED8'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#2563EB'}
            >
              Download CSV
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '30px' }}>
            <div style={{ backgroundColor: colors.bgKPI, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${colors.voltage}`, border: `1px solid ${colors.gridLine}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Voltage (ADC)</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.voltage }}>{latestData.voltage.toFixed(2)} <span style={{ fontSize: '14px', color: colors.textMuted }}>V</span></div>
            </div>
            <div style={{ backgroundColor: colors.bgKPI, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${colors.extTemp}`, border: `1px solid ${colors.gridLine}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Ext. Temperature</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.extTemp }}>{latestData.ext_temp.toFixed(2)} <span style={{ fontSize: '14px', color: colors.textMuted }}>°C</span></div>
            </div>
            <div style={{ backgroundColor: colors.bgKPI, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${latestData.core_temp > 45 ? colors.warning : colors.coreTemp}`, border: `1px solid ${latestData.core_temp > 45 ? colors.warning : colors.gridLine}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Core Temperature</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: latestData.core_temp > 45 ? colors.warning : colors.coreTemp }}>{latestData.core_temp.toFixed(2)} <span style={{ fontSize: '14px', color: colors.textMuted }}>°C</span></div>
            </div>
            <div style={{ backgroundColor: colors.bgKPI, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${latestData.rssi < -80 ? colors.warning : colors.rssi}`, border: `1px solid ${latestData.rssi < -80 ? colors.warning : colors.gridLine}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Signal / RAM</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: colors.textMain }}>
                {latestData.rssi} <span style={{ fontSize: '12px', color: colors.textMuted }}>dBm</span>
                <div style={{ fontSize: '14px', color: colors.textMuted, marginTop: '2px' }}>{(latestData.free_ram / 1024).toFixed(1)} KB</div>
              </div>
            </div>
            <div style={{ backgroundColor: colors.bgKPI, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${colors.info}`, border: `1px solid ${colors.gridLine}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Hardware Uptime</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: colors.textMain }}>{formatUptime(latestData.uptime)}</div>
            </div>
            <div style={{ backgroundColor: colors.bgKPI, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${colors.info}`, border: `1px solid ${colors.gridLine}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Data Throughput</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.info }}>{samplingRate.toFixed(1)} <span style={{ fontSize: '14px', color: colors.textMuted }}>Hz</span></div>
            </div>
          </div>

          <div style={{ width: '100%', height: 400, position: 'relative' }}>
            {dataPoints.length === 0 && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: colors.textMuted, zIndex: 10, fontSize: '16px', fontWeight: '500', pointerEvents: 'none' }}>
                Waiting for Edge Node Telemetry...
              </div>
            )}
            <ResponsiveContainer>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: colors.bgCard, borderRadius: '16px', padding: '25px', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>Statistical Summary (Window: 100 Pts)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={{ color: colors.coreTemp, fontWeight: 'bold', marginBottom: '10px' }}>Core Temperature</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}><span>MAX:</span> <strong>{stats.maxTemp.toFixed(2)} °C</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}><span>MIN:</span> <strong>{stats.minTemp.toFixed(2)} °C</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}><span>AVG:</span> <strong>{stats.avgTemp.toFixed(2)} °C</strong></div>
              </div>
              <div>
                <div style={{ color: colors.voltage, fontWeight: 'bold', marginBottom: '10px' }}>ADC Voltage</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}><span>MAX:</span> <strong>{stats.maxVolt.toFixed(2)} V</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}><span>MIN:</span> <strong>{stats.minVolt.toFixed(2)} V</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}><span>AVG:</span> <strong>{stats.avgVolt.toFixed(2)} V</strong></div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: colors.bgCard, borderRadius: '16px', padding: '25px', border: '1px solid #334155', maxHeight: '250px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>System Event Logs</h3>
            {eventLogs.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: '14px', fontStyle: 'italic' }}>No anomalies detected in the current session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {eventLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', gap: '15px', fontSize: '13px', padding: '10px', backgroundColor: colors.bgKPI, borderRadius: '6px', borderLeft: `3px solid ${log.type === 'CRITICAL' ? colors.danger : colors.warning}` }}>
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
        @keyframes pulse {
          0% { boxShadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { boxShadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { boxShadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #1E293B; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
}

export default App;