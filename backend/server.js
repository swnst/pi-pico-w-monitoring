const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('[DB] Connected to MongoDB Atlas'))
        .catch(err => console.error('[DB] Connection error:', err));
} else {
    console.log('[DB] Warning: MONGODB_URI not provided. Running in Memory-only mode.');
}

const telemetrySchema = new mongoose.Schema({
    time: String,
    uptime: Number,
    voltage: Number,
    ext_temp: Number,
    core_temp: Number,
    rssi: Number,
    free_ram: Number,
    server_timestamp: {
        type: Date,
        default: Date.now,
        expires: 21600
    }
});
const Telemetry = mongoose.model('Telemetry', telemetrySchema);

app.post('/api/telemetry', async (req, res) => {
    try {
        const dataBatch = req.body;

        io.emit('telemetry_stream', dataBatch);

        if (MONGODB_URI && Array.isArray(dataBatch) && dataBatch.length > 0) {
            await Telemetry.insertMany(dataBatch);
        }

        res.status(200).send({ status: 'success', message: 'Telemetry processed and stored' });
    } catch (error) {
        console.error('[API] Processing Error:', error);
        res.status(500).send({ status: 'error', message: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SYS] Server running on port ${PORT}`);
});