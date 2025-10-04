import { createClient } from 'hafas-client';
import { profile as stvProfile } from 'hafas-client/p/stv/index.js';
import pkg from 'pg';
const { Pool } = pkg;

// --- CONFIGURATION ---
const DEBUG = true;
const FETCH_INTERVAL = 45 * 1000;
const STATIONS_PER_CYCLE = 5;
const JAKOMINIPLATZ_ID = '460304700';
const ONLY_FETCH_GRAZ_LINES = true;

const GRAZ_BOUNDING_BOX = {
    north: 47.15,
    west: 15.30,
    south: 46.95,
    east: 15.60,
};

// --- STATE ---
const discoveredStops = new Set([JAKOMINIPLATZ_ID]);
const stopsToQuery = [JAKOMINIPLATZ_ID];

// --- LOGGER & UTILS ---
const COLORS = {
    RESET: "\x1b[0m",
    RED: "\x1b[31m",
    GREEN: "\x1b[32m",
    YELLOW: "\x1b[33m",
    BLUE: "\x1b[34m",
    MAGENTA: "\x1b[35m",
};

const LOG_LEVELS = {
    ERROR: { color: COLORS.RED, name: 'ERROR' },
    WARN: { color: COLORS.YELLOW, name: 'WARN' },
    INFO: { color: COLORS.GREEN, name: 'INFO' },
    DEBUG: { color: COLORS.BLUE, name: 'DEBUG' },
};

function log(level, context, message) {
    if (level === 'DEBUG' && !DEBUG) {
        return;
    }
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const levelInfo = LOG_LEVELS[level] || { color: COLORS.RESET, name: level };
    console.log(`${levelInfo.color}[${timestamp}] [${levelInfo.name.padEnd(5)}] ${context.padEnd(12)} :: ${message}${COLORS.RESET}`);
}

function parseTripId(tripId) {
    const getVal = (key) => {
        const match = tripId.match(new RegExp(`#${key}#([^#]+)`));
        return match ? match[1] : '?';
    };
    return {
        line: getVal('ZE'),
        fromId: getVal('FR'),
        fromTime: getVal('FT'),
        toId: getVal('TO'),
        toTime: getVal('TT'),
    };
}

log('INFO', '[INIT]', 'Fetcher service starting...');

// --- DATABASE SETUP ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const dbQuery = async (query, values) => {
    try {
        return await pool.query(query, values);
    } catch (err) {
        log('ERROR', '[DB]', `Query failed: ${err.message}`);
        log('DEBUG', '[DB]', `Failing Query: ${query.substring(0, 150).replace(/\s\s+/g, ' ')}...`);
    }
};

// --- HAFAS CLIENT SETUP ---
const userAgent = 'GrazRealtimeTransportMonitor/1.0 (https://github.com/ledahosn/holding-graz-statistik)';
const hafas = createClient(stvProfile, userAgent);

// --- FILTERING LOGIC ---
function isGrazLine(line) {
    if (!ONLY_FETCH_GRAZ_LINES) return true;
    if (!line || !line.name || !line.product) return false;
    const lineIdentifier = line.name.match(/\d{1,2}[A-Z]?/);
    if (!lineIdentifier) return false;
    const isTram = line.product === 'tram';
    const isBus = line.product === 'city-bus';
    return isTram || isBus;
}

function isWithinBoundingBox(location) {
    if (!location || !location.latitude || !location.longitude) return false;
    return (
        location.latitude <= GRAZ_BOUNDING_BOX.north &&
        location.latitude >= GRAZ_BOUNDING_BOX.south &&
        location.longitude <= GRAZ_BOUNDING_BOX.east &&
        location.longitude >= GRAZ_BOUNDING_BOX.west
    );
}

// --- CORE LOGIC ---
async function upsertStopEvent(event) {
    const { trip_id, stop_id, event_type, stop_sequence, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds } = event;
    const now = new Date();
    const eventTime = actual_time ? new Date(actual_time) : (planned_time ? new Date(planned_time) : now);

    if (Math.abs(now - eventTime) > 24 * 60 * 60 * 1000) {
        const parsedId = parseTripId(trip_id);
        log('DEBUG', `[DB:SKIP]`, `Skipping out-of-range event for Trip on Line ${parsedId.line}`);
        return;
    }

    const query = `
        INSERT INTO stop_events (timestamp, trip_id, stop_id, stop_sequence, event_type, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT ("timestamp", trip_id, stop_id, event_type) DO UPDATE SET
            planned_time = EXCLUDED.planned_time,
                                                                           actual_time = EXCLUDED.actual_time,
                                                                           arrival_delay_seconds = EXCLUDED.arrival_delay_seconds,
                                                                           departure_delay_seconds = EXCLUDED.departure_delay_seconds;
    `;
    await dbQuery(query, [eventTime, trip_id, stop_id, stop_sequence, event_type, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds]);
}

async function fetchTripDetails(tripId) {
    const parsedId = parseTripId(tripId);
    const tripContext = `Line ${parsedId.line} (${parsedId.fromTime} -> ${parsedId.toTime})`;

    try {
        log('DEBUG', '[HAFAS:GET]', `Fetching details for trip: ${tripContext}`);
        const { trip } = await hafas.trip(tripId, { stopovers: true, remarks: false });

        if (!trip || !trip.line || !isGrazLine(trip.line)) {
            log('DEBUG', '[HAFAS:SKIP]', `Skipped non-Graz trip: ${tripContext}`);
            return;
        }

        log('DEBUG', '[HAFAS:PROC]', `Processing Line ${trip.line.name} -> ${trip.direction || 'N/A'}`);

        const lineMatch = trip.line.name.match(/\d{1,2}[A-Z]?/);
        const lineNumber = lineMatch ? lineMatch[0] : null;
        await dbQuery('INSERT INTO lines (line_id, line_name, product, line_number) VALUES ($1, $2, $3, $4) ON CONFLICT (line_id) DO UPDATE SET line_name = EXCLUDED.line_name, product = EXCLUDED.product, line_number = EXCLUDED.line_number', [trip.line.id, trip.line.name, trip.line.product, lineNumber]);

        const date = new Date(trip.plannedDeparture || new Date()).toISOString().split('T')[0];
        const firstDeparture = trip.stopovers.find(so => so.plannedDeparture)?.plannedDeparture;
        const departureTime = firstDeparture ? new Date(firstDeparture).toTimeString().split(' ')[0] : null;
        await dbQuery('INSERT INTO trips (trip_id, line_id, direction, date, departure_time) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (trip_id) DO UPDATE SET direction = EXCLUDED.direction, date = EXCLUDED.date, departure_time = EXCLUDED.departure_time', [trip.id, trip.line.id, trip.direction, date, departureTime]);

        if (trip.currentLocation) {
            const delay = trip.departureDelay !== null ? trip.departureDelay : (trip.arrivalDelay !== null ? trip.arrivalDelay : 0);
            await dbQuery('INSERT INTO vehicle_positions (trip_id, "timestamp", location, delay_seconds) VALUES ($1, NOW(), ST_SetSRID(ST_MakePoint($2, $3), 4326), $4)', [trip.id, trip.currentLocation.longitude, trip.currentLocation.latitude, delay]);
        }

        for (const [index, stopover] of trip.stopovers.entries()) {
            const { stop } = stopover;
            if (!stop || !stop.id || !stop.location) continue;

            await dbQuery('INSERT INTO stops (stop_id, stop_name, location) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)) ON CONFLICT (stop_id) DO NOTHING', [stop.id, stop.name, stop.location.longitude, stop.location.latitude]);

            if (!discoveredStops.has(stop.id)) {
                discoveredStops.add(stop.id);
                if (isWithinBoundingBox(stop.location)) {
                    stopsToQuery.push(stop.id);
                    log('DEBUG', '[DISCOVERY]', `New stop for queue: ${stop.name} (${stop.id})`);
                } else {
                    log('DEBUG', '[DISCOVERY]', `Out-of-bounds stop found: ${stop.name}`);
                }
            }

            if (stopover.arrival || stopover.plannedArrival) await upsertStopEvent({ trip_id: trip.id, stop_id: stop.id, stop_sequence: index + 1, event_type: 'arrival', planned_time: stopover.plannedArrival, actual_time: stopover.arrival, arrival_delay_seconds: stopover.arrivalDelay, departure_delay_seconds: null });
            if (stopover.departure || stopover.plannedDeparture) await upsertStopEvent({ trip_id: trip.id, stop_id: stop.id, stop_sequence: index + 1, event_type: 'departure', planned_time: stopover.plannedDeparture, actual_time: stopover.departure, arrival_delay_seconds: null, departure_delay_seconds: stopover.departureDelay });
        }
    } catch (error) {
        log('ERROR', `[TRIP]`, `Fetch failed for ${tripContext}: ${error.message}`);
    }
}

async function mainLoop() {
    log('INFO', '[MAIN]', '--- Starting new fetch cycle ---');
    const processedTripIds = new Set();

    if (stopsToQuery.length === 0) {
        log('WARN', '[MAIN]', 'Stop query queue empty. Resetting with Jakominiplatz.');
        stopsToQuery.push(JAKOMINIPLATZ_ID);
    }

    stopsToQuery.sort(() => 0.5 - Math.random());
    const currentStops = stopsToQuery.slice(0, STATIONS_PER_CYCLE);

    log('INFO', '[MAIN]', `Querying ${currentStops.length} stops. Discovered: ${discoveredStops.size}. Queue: ${stopsToQuery.length}`);

    try {
        const departurePromises = currentStops.map(stopId => hafas.departures(stopId, { duration: 120 }));
        const results = await Promise.allSettled(departurePromises);

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value && result.value.departures) {
                for (const departure of result.value.departures) {
                    if (departure.tripId && isGrazLine(departure.line) && !processedTripIds.has(departure.tripId)) {
                        processedTripIds.add(departure.tripId);
                    }
                }
            }
        }

        log('INFO', '[MAIN]', `Found ${processedTripIds.size} unique trips to process.`);

        const tripDetailPromises = Array.from(processedTripIds).map(tripId => fetchTripDetails(tripId));
        await Promise.all(tripDetailPromises);

    } catch (error) {
        log('ERROR', '[MAIN]', `Error in main fetch loop: ${error.message}`);
    }
    log('INFO', '[MAIN]', '--- Fetch cycle complete. Waiting for next interval. ---');
}

// --- STARTUP ---
pool.connect()
    .then(async (client) => {
        log('INFO', '[DB]', 'Successfully connected to the database.');
        client.release();
        mainLoop();
        setInterval(mainLoop, FETCH_INTERVAL);
    })
    .catch(err => {
        log('ERROR', '[DB]', `Failed to connect to the database: ${err.message}`);
        process.exit(1);
    });