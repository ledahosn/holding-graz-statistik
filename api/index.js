import express from 'express';
import http from 'http';
import cors from 'cors'; // Import the cors package
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
// This tells the server to accept requests from your Vite dev server
const corsOptions = {
    origin: 'http://localhost:5173'
};
app.use(cors(corsOptions));


// A test endpoint to see if the server is running
app.get('/api', (req, res) => {
    res.json({ message: 'Hello from the Graz Transport API!' });
});

// The rest of your file remains the same...
app.get('/api/lines', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM lines ORDER BY line_name');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching lines:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ... (the rest of the file is unchanged)
// Endpoint for statistics, as described in the blueprint
app.get('/api/stats/line/:lineId', async (req, res) => {
    const { lineId } = req.params;
    // Extract and validate query parameters
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const startTime = req.query.startTime || '00:00:00';
    const endTime = req.query.endTime || '23:59:59';
    const interval = req.query.interval || '15 minutes';

    try {
        // This query uses the time_bucket() function from TimescaleDB
        const query = `
            SELECT
                time_bucket($1, "timestamp") AS interval_start,
                AVG(delay_seconds) AS avg_delay_seconds,
                COUNT(*) AS event_count
            FROM vehicle_positions
            WHERE trip_id IN (
                SELECT trip_id FROM trips WHERE line_id = $2 AND "date" = $3
            )
              AND "timestamp" BETWEEN $4 AND $5
            GROUP BY interval_start
            ORDER BY interval_start;
        `;
        const startDateTime = `${date}T${startTime}Z`;
        const endDateTime = `${date}T${endTime}Z`;
        const values = [interval, lineId, date, startDateTime, endDateTime];

        const { rows } = await pool.query(query, values);
        res.json(rows);
    } catch (err) {
        console.error(`Error fetching stats for line ${lineId}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// --- WEBSOCKET SETUP ---
const wss = new WebSocketServer({ server });
const LIVE_UPDATE_INTERVAL = 5 * 1000; // 5 seconds

// Function to fetch the latest vehicle positions and format as GeoJSON
async function getLiveVehicleData() {
    // This query gets the single most recent position for each trip ID
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

    // Format the database rows into a GeoJSON FeatureCollection
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

// Function to broadcast data to all connected clients
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(data);
        }
    });
}

// Set up the broadcast loop
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


// --- STARTUP ---
server.listen(PORT, () => {
    console.log(`API Server is listening on http://localhost:${PORT}`);
});