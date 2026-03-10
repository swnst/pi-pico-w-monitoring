const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.post('/api/telemetry', (req, res) => {
    try {
        const telemetryData = req.body;

        if (!telemetryData || !Array.isArray(telemetryData)) {
            return res.status(400).json({ error: "Invalid payload format. Expected JSON array." });
        }

        console.log(`[*] Received ${telemetryData.length} data points from Pico W`);

        io.emit('telemetry_stream', telemetryData);

        res.status(200).json({ message: "Data ingested successfully" });

    } catch (error) {
        console.error("[!] Error processing telemetry:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

io.on('connection', (socket) => {
    console.log(`[+] Web Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`[-] Web Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[*] Backend Architecture running on port ${PORT}`);
    console.log(`[*] Ready to receive telemetry at POST http://localhost:${PORT}/api/telemetry`);
});