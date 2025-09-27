import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import pkg from 'pg';
const { Pool } = pkg;

console.log('API service starting...');

// --- DATABASE SETUP ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// --- EXPRESS (REST API) SETUP ---
const app = express();
const server = http.createServer(app);
const PORT = 3001;

// --- CORS Configuration ---
const corsOptions = {
    origin: 'http://localhost:5173'
};
app.use(cors(corsOptions));
app.use(express.json());


// --- API ENDPOINTS ---

app.get('/api', (req, res) => {
    res.json({ message: 'Hello from the Graz Transport API!' });
});

app.get('/api/lines', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM lines ORDER BY line_name');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching lines:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/trips/line/:lineId', async (req, res) => {
    const { lineId } = req.params;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'A date query parameter is required.' });
    }

    try {
        const query = `
            SELECT trip_id, direction
            FROM trips
            WHERE line_id = $1 AND date = $2
            ORDER BY direction;
        `;
        const { rows } = await pool.query(query, [lineId, date]);
        res.json(rows);
    } catch (err) {
        console.error(`Error fetching trips for line ${lineId} on ${date}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// MODIFIED: Changed from GET to POST and uses a JOIN for efficiency
app.post('/api/trip/delays', async (req, res) => {
    const { tripId } = req.body;

    if (!tripId) {
        return res.status(400).json({ error: 'tripId is required in the request body.' });
    }

    try {
        const query = `
            SELECT
                se.stop_id,
                s.stop_name,
                se.stop_sequence,
                se.planned_time,
                se.actual_time,
                se.arrival_delay_seconds,
                se.departure_delay_seconds
            FROM stop_events se
                     JOIN stops s ON se.stop_id = s.stop_id
            WHERE se.trip_id = $1
              AND se.event_type = 'arrival'
            ORDER BY se.stop_sequence;
        `;
        const { rows } = await pool.query(query, [tripId]);
        res.json(rows);
    } catch (err)
    {
        console.error(`Error fetching delay stats for trip ${tripId}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// --- WEBSOCKET SETUP ---
const wss = new WebSocketServer({ server });
const LIVE_UPDATE_INTERVAL = 5 * 1000; // 5 seconds

async function getLiveVehicleData() {
    const query = `
        SELECT DISTINCT ON (vp.trip_id)
            vp.trip_id,
            vp.timestamp,
            ST_AsGeoJSON(vp.location) AS location,
            vp.delay_seconds,
            l.line_name,
            t.direction
        FROM vehicle_positions vp
            JOIN trips t ON vp.trip_id = t.trip_id
            JOIN lines l ON t.line_id = l.line_id
        WHERE vp.timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY vp.trip_id, vp.timestamp DESC;
    `;
    const { rows } = await pool.query(query);

    const geoJson = {
        type: 'FeatureCollection',
        features: rows.map(row => ({
            type: 'Feature',
            geometry: JSON.parse(row.location),
            properties: {
                tripId: row.trip_id,
                lineName: row.line_name,
                direction: row.direction,
                delay: row.delay_seconds,
                timestamp: row.timestamp,
            },
        })),
    };
    return JSON.stringify(geoJson);
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(data);
        }
    });
}

setInterval(async () => {
    if (wss.clients.size > 0) {
        try {
            const liveData = await getLiveVehicleData();
            broadcast(liveData);
        } catch (err) {
            console.error('Failed to get and broadcast live data:', err);
        }
    }
}, LIVE_UPDATE_INTERVAL);

wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');
    ws.on('close', () => console.log('Client disconnected'));
});

server.listen(PORT, () => {
    console.log(`API Server is listening on http://localhost:${PORT}`);
});