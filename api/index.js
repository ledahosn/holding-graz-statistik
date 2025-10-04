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

// Allow any origin for simplicity in this example
app.use(cors());
app.use(express.json());


// --- API ENDPOINTS ---

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Hello from the Graz Transport API!' });
});

// MODIFIED: Returns a de-duplicated and structured list of lines
app.get('/api/lines', async (req, res) => {
    try {
        const query = `
            WITH RankedLines AS (
                SELECT
                    line_number,
                    product,
                    line_name,
                    -- Prefer longer names like "Straßenbahn 4" over "4"
                    ROW_NUMBER() OVER(PARTITION BY line_number, product ORDER BY LENGTH(line_name) DESC, line_name) as rn
                FROM lines
                WHERE line_number IS NOT NULL AND product IN ('tram', 'city-bus')
            )
            SELECT line_number, product, line_name
            FROM RankedLines
            WHERE rn = 1
            ORDER BY
                product,
                -- Natural sort for line numbers (e.g., 1, 2, 10 instead of 1, 10, 2)
                LPAD(regexp_replace(line_number, '[^0-9]', '', 'g'), 10, '0'),
                line_number;
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching lines:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// MODIFIED: Fetches trips based on the cleaned line_number
app.get('/api/trips', async (req, res) => {
    const { lineNumber, date } = req.query;

    if (!lineNumber || !date) {
        return res.status(400).json({ error: 'A lineNumber and date query parameter are required.' });
    }

    try {
        const query = `
            SELECT t.trip_id, t.direction, t.departure_time
            FROM trips t
                     JOIN lines l ON t.line_id = l.line_id
            WHERE l.line_number = $1 AND t.date = $2 AND t.departure_time IS NOT NULL
            ORDER BY t.departure_time;
        `;
        const { rows } = await pool.query(query, [lineNumber, date]);
        res.json(rows);
    } catch (err) {
        console.error(`Error fetching trips for line ${lineNumber} on ${date}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// No changes needed here, POST is efficient
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
                se.arrival_delay_seconds
            FROM stop_events se
                     JOIN stops s ON se.stop_id = s.stop_id
            WHERE se.trip_id = $1
              AND se.event_type = 'arrival'
            ORDER BY se.stop_sequence;
        `;
        const { rows } = await pool.query(query, [tripId]);
        res.json(rows);
    } catch (err) {
        console.error(`Error fetching delay stats for trip ${tripId}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- WEBSOCKET SETUP ---
const wss = new WebSocketServer({ path: '/ws', server });
const LIVE_UPDATE_INTERVAL = 15 * 1000; // 15 seconds

async function getLiveVehicleData() {
    const query = `
        WITH LatestPositions AS (
            SELECT DISTINCT ON (vp.trip_id)
            vp.trip_id,
            vp.timestamp,
            ST_AsGeoJSON(vp.location) AS location,
            vp.delay_seconds
        FROM vehicle_positions vp
        WHERE vp.timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY vp.trip_id, vp.timestamp DESC
            )
        SELECT
            lp.trip_id,
            lp.timestamp,
            lp.location,
            lp.delay_seconds,
            l.line_number,
            l.product,
            t.direction
        FROM LatestPositions lp
                 JOIN trips t ON lp.trip_id = t.trip_id
                 JOIN lines l ON t.line_id = l.line_id;
    `;
    const { rows } = await pool.query(query);

    const geoJson = {
        type: 'FeatureCollection',
        features: rows.map(row => ({
            type: 'Feature',
            geometry: JSON.parse(row.location),
            properties: {
                tripId: row.trip_id,
                lineNumber: row.line_number,
                product: row.product,
                direction: row.direction,
                delay: row.delay_seconds,
                timestamp: row.timestamp,
            },
        })),
    };
    return JSON.stringify(geoJson);
}

const broadcastLiveData = async () => {
    if (wss.clients.size === 0) return;
    try {
        const liveData = await getLiveVehicleData();
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(liveData);
            }
        });
    } catch (err) {
        console.error('Failed to get and broadcast live data:', err);
    }
};

setInterval(broadcastLiveData, LIVE_UPDATE_INTERVAL);

wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');
    // Send initial data immediately on connection
    getLiveVehicleData().then(data => ws.send(data)).catch(console.error);
    ws.on('close', () => console.log('Client disconnected'));
});

server.listen(PORT, () => {
    console.log(`API Server is listening on http://localhost:${PORT}`);
});