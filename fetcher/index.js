import { createClient } from 'hafas-client';
import { profile as stvProfile } from 'hafas-client/p/stv/index.js';
import pkg from 'pg';
const { Pool } = pkg;

console.log('Fetcher service starting...');

// --- CONFIGURATION ---
const DEBUG = true; // Set to true for verbose logging
const FETCH_INTERVAL = 30 * 1000;
const JAKOMINIPLATZ_ID = '460304700';
const ONLY_FETCH_GRAZ_LINES = true;

const GRAZ_BOUNDING_BOX = {
    north: 47.15,
    west: 15.30,
    south: 46.95,
    east: 15.60,
};

// --- DATABASE SETUP ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const upsert = async (query, values) => {
    try {
        await pool.query(query, values);
    } catch (err) {
        console.error(`Database Error on query: ${query.substring(0, 100)}...`, err.message);
    }
};

// --- HAFAS CLIENT SETUP ---
const userAgent = 'GrazRealtimeTransportMonitor/1.0 (https://github.com/your-repo)';
const hafas = createClient(stvProfile, userAgent);


// --- CORRECTED FILTERING LOGIC ---

/**
 * Checks if a line is a local Graz tram or bus based on its product and name.
 * @param {object} line - The line object from a HAFAS response.
 * @returns {boolean} - True if it's a valid Graz line.
 */
function isGrazLine(line) {
    if (!ONLY_FETCH_GRAZ_LINES) return true;
    if (!line || !line.name || !line.product) return false;

    // Extract the numeric part of the line name (e.g., "Straßenbahn 1" -> "1", "Stadtbus 34E" -> "34E")
    const lineIdentifier = line.name.split(' ').pop();

    const isTram = line.product === 'tram' && /^\d{1,2}$/.test(lineIdentifier);
    const isBus = line.product === 'city-bus' && /^\d{2}E?A?$/.test(lineIdentifier);

    if (DEBUG) {
        console.log(`[FILTER] Line: '${line.name}' (${line.product}) -> Identifier: '${lineIdentifier}'. Tram? ${isTram}. Bus? ${isBus}. -> Allowed: ${isTram || isBus}`);
    }

    return isTram || isBus;
}

/**
 * Checks if a location is within the defined geographic bounding box.
 * @param {object} location - The location object from a HAFAS response.
 * @returns {boolean} - True if the location is within the box.
 */
function isWithinBoundingBox(location) {
    if (!location || !location.latitude || !location.longitude) return false;
    return (
        location.latitude <= GRAZ_BOUNDING_BOX.north &&
        location.latitude >= GRAZ_BOUNDING_BOX.south &&
        location.longitude <= GRAZ_BOUNDING_BOX.east &&
        location.longitude >= GRAZ_BOUNDING_BOX.west
    );
}


// --- CORE LOGIC (No changes needed below this line) ---
const processedTripIds = new Set();
const processedStopIds = new Set();

async function fetchTripDetails(tripId) {
    if (processedTripIds.has(tripId)) return;
    processedTripIds.add(tripId);

    try {
        if (DEBUG) console.log(`[TRIP] Fetching details for tripId: ${tripId}`);
        const { trip } = await hafas.trip(tripId, { stopovers: true });
        if (!trip || !trip.line) return;

        if (!isGrazLine(trip.line)) return;

        // DB operations...
        await upsert('INSERT INTO lines (line_id, line_name, product) VALUES ($1, $2, $3) ON CONFLICT (line_id) DO NOTHING', [trip.line.id, trip.line.name, trip.line.product]);
        const date = new Date(trip.departure || trip.plannedDeparture).toISOString().split('T')[0];
        await upsert('INSERT INTO trips (trip_id, line_id, direction, date) VALUES ($1, $2, $3, $4) ON CONFLICT (trip_id) DO NOTHING', [trip.id, trip.line.id, trip.direction, date]);

        if (trip.currentLocation) {
            if (DEBUG) console.log(`  -> [DB] Saving Position: Line ${trip.line.name}, Trip ${trip.id}`);
            await upsert('INSERT INTO vehicle_positions (trip_id, "timestamp", location, delay_seconds) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5) ON CONFLICT (trip_id, "timestamp") DO NOTHING', [trip.id, new Date().toISOString(), trip.currentLocation.longitude, trip.currentLocation.latitude, trip.departureDelay || 0]);
        }

        for (const stopover of trip.stopovers) {
            const { stop } = stopover;
            if (stop && stop.id && !processedStopIds.has(stop.id) && isWithinBoundingBox(stop.location)) {
                processedStopIds.add(stop.id);
                fetchDeparturesForStop(stop.id);
            }
        }
    } catch (error) {
        console.error(`Error fetching trip ${tripId}:`, error.message);
    }
}

async function fetchDeparturesForStop(stopId) {
    if (!stopId) return;
    if (DEBUG) console.log(`[DEPARTURES] Fetching departures for stop ID: ${stopId}`);
    try {
        const { departures } = await hafas.departures(stopId, { duration: 60 });

        if (DEBUG) {
            console.log(`[DEPARTURES] Found ${departures.length} raw departures for stop ${stopId}. Now filtering...`);
        }

        if (departures.length === 0) return;

        for (const departure of departures) {
            if (departure.line && isGrazLine(departure.line)) {
                if (DEBUG) console.log(`  -> [PASS] Departure for line '${departure.line.name}' passed filter. Processing trip ${departure.tripId}.`);

                if (departure.stop) {
                    await upsert('INSERT INTO stops (stop_id, stop_name, location) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)) ON CONFLICT (stop_id) DO NOTHING', [departure.stop.id, departure.stop.name, departure.stop.location.longitude, departure.stop.location.latitude]);
                }

                if (departure.tripId) {
                    fetchTripDetails(departure.tripId);
                }
            }
        }
    } catch (error) {
        console.error(`Error fetching departures for stop ${stopId}:`, error.message);
    }
}

async function getAndLogStationInfo(stationId) {
    try {
        const stop = await hafas.stop(stationId, { linesOfStops: true });
        console.log('[DEBUG] Initial station info for Jakominiplatz:');
        console.log(JSON.stringify(stop, null, 2));
    } catch (error) {
        console.error(`[DEBUG] Could not fetch info for station ${stationId}:`, error.message);
    }
}

// --- MAIN LOOP ---
async function mainLoop() {
    console.log('\n--- Starting new fetch cycle ---');
    if (DEBUG) console.log(`[CONFIG] Debug mode is ON. Fetching only Graz lines: ${ONLY_FETCH_GRAZ_LINES}.`);

    processedTripIds.clear();
    processedStopIds.clear();

    processedStopIds.add(JAKOMINIPLATZ_ID);
    await fetchDeparturesForStop(JAKOMINIPLATZ_ID);

    console.log('--- Fetch cycle complete. Waiting for next interval. ---');
}

// --- STARTUP ---
pool.connect()
    .then(async (client) => {
        console.log('Successfully connected to the database.');
        client.release();
        if (DEBUG) {
            await getAndLogStationInfo(JAKOMINIPLATZ_ID);
        }
        mainLoop();
        setInterval(mainLoop, FETCH_INTERVAL);
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
        process.exit(1);
    });