import { createClient } from 'hafas-client';
import { profile as stvProfile } from 'hafas-client/p/stv/index.js';
import pkg from 'pg';
const { Pool } = pkg;

console.log('Fetcher service starting...');

// --- CONFIGURATION ---
const DEBUG = true;
const FETCH_INTERVAL = 45 * 1000; // 45 seconds
const STATIONS_PER_CYCLE = 5; // How many new stations to query each cycle
const JAKOMINIPLATZ_ID = '460304700';
const ONLY_FETCH_GRAZ_LINES = true;

const GRAZ_BOUNDING_BOX = {
    north: 47.15,
    west: 15.30,
    south: 46.95,
    east: 15.60,
};

// --- STATE ---
// Set of all stop IDs that have been discovered
const discoveredStops = new Set([JAKOMINIPLATZ_ID]);
// Array of stop IDs that we should query for departures
const stopsToQuery = [JAKOMINIPLATZ_ID];


// --- DATABASE SETUP ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const dbQuery = async (query, values) => {
    try {
        return await pool.query(query, values);
    } catch (err) {
        console.error(`Database Error on query: ${query.substring(0, 100)}...`, err.message);
    }
};

// --- HAFAS CLIENT SETUP ---
const userAgent = 'GrazRealtimeTransportMonitor/1.0 (https://github.com/ledahosn/holding-graz-statistik)';
const hafas = createClient(stvProfile, userAgent);

// --- FILTERING LOGIC ---
function isGrazLine(line) {
    if (!ONLY_FETCH_GRAZ_LINES) return true;
    if (!line || !line.name || !line.product) return false;
    const lineIdentifier = line.name.split(' ').pop();
    const isTram = line.product === 'tram' && /^\d{1,2}$/.test(lineIdentifier);
    const isBus = line.product === 'city-bus' && /^\d{2}E?A?$/.test(lineIdentifier);
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

    const selectQuery = `
        SELECT actual_time FROM stop_events
        WHERE trip_id = $1 AND stop_id = $2 AND event_type = $3;
    `;
    const result = await dbQuery(selectQuery, [trip_id, stop_id, event_type]);
    const existingEvent = result && result.rows.length > 0 ? result.rows[0] : null;

    if (existingEvent) {
        const existingEventTime = existingEvent.actual_time ? new Date(existingEvent.actual_time) : null;
        if (existingEventTime && existingEventTime < now) {
            if (DEBUG) console.log(`  -> [DB] Skipping update for past event: Trip ${trip_id}, Stop ${stop_id}, Type ${event_type}`);
            return;
        }
        const updateQuery = `
            UPDATE stop_events SET "timestamp" = $1, actual_time = $2, arrival_delay_seconds = $3, departure_delay_seconds = $4, planned_time = $5, stop_sequence = $6
            WHERE trip_id = $7 AND stop_id = $8 AND event_type = $9;
        `;
        await dbQuery(updateQuery, [eventTime, actual_time, arrival_delay_seconds, departure_delay_seconds, planned_time, stop_sequence, trip_id, stop_id, event_type]);
    } else {
        const insertQuery = `
            INSERT INTO stop_events (timestamp, trip_id, stop_id, stop_sequence, event_type, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `;
        await dbQuery(insertQuery, [eventTime, trip_id, stop_id, stop_sequence, event_type, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds]);
    }
}

async function fetchTripDetails(tripId) {
    try {
        if (DEBUG) console.log(`[TRIP] Fetching details for tripId: ${tripId}`);
        const { trip } = await hafas.trip(tripId, { stopovers: true });
        if (!trip || !trip.line || !isGrazLine(trip.line)) return;

        await dbQuery('INSERT INTO lines (line_id, line_name, product) VALUES ($1, $2, $3) ON CONFLICT (line_id) DO NOTHING', [trip.line.id, trip.line.name, trip.line.product]);
        const date = new Date(trip.departure || trip.plannedDeparture).toISOString().split('T')[0];
        await dbQuery('INSERT INTO trips (trip_id, line_id, direction, date) VALUES ($1, $2, $3, $4) ON CONFLICT (trip_id) DO NOTHING', [trip.id, trip.line.id, trip.direction, date]);

        if (trip.currentLocation) {
            await dbQuery('INSERT INTO vehicle_positions (trip_id, "timestamp", location, delay_seconds) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5) ON CONFLICT (trip_id, "timestamp") DO NOTHING', [trip.id, new Date().toISOString(), trip.currentLocation.longitude, trip.currentLocation.latitude, trip.departureDelay || 0]);
        }

        for (const [index, stopover] of trip.stopovers.entries()) {
            const { stop } = stopover;
            if (!stop || !stop.id) continue;

            // --- Network Discovery ---
            // If we find a stop we haven't seen before, add it to our lists for future queries.
            if (!discoveredStops.has(stop.id)) {
                if(isWithinBoundingBox(stop.location)) {
                    discoveredStops.add(stop.id);
                    stopsToQuery.push(stop.id);
                    if (DEBUG) console.log(`  -> [DISCOVERY] Found new stop: ${stop.name} (${stop.id})`);
                    await dbQuery('INSERT INTO stops (stop_id, stop_name, location) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)) ON CONFLICT (stop_id) DO NOTHING', [stop.id, stop.name, stop.location.longitude, stop.location.latitude]);
                }
            }

            if(stopover.arrival || stopover.plannedArrival) await upsertStopEvent({ trip_id: trip.id, stop_id: stop.id, stop_sequence: index + 1, event_type: 'arrival', planned_time: stopover.plannedArrival, actual_time: stopover.arrival, arrival_delay_seconds: stopover.arrivalDelay, departure_delay_seconds: null });
            if(stopover.departure || stopover.plannedDeparture) await upsertStopEvent({ trip_id: trip.id, stop_id: stop.id, stop_sequence: index + 1, event_type: 'departure', planned_time: stopover.plannedDeparture, actual_time: stopover.departure, arrival_delay_seconds: null, departure_delay_seconds: stopover.departureDelay });
        }
    } catch (error) {
        console.error(`Error fetching trip ${tripId}:`, error.message);
    }
}

async function mainLoop() {
    console.log('\n--- Starting new fetch cycle ---');
    const processedTripIds = new Set();

    // Take the first N stops from our queue. If the queue is empty, reset with Jakominiplatz.
    if (stopsToQuery.length === 0) {
        console.log('[WARNING] Stop query queue was empty. Resetting with Jakominiplatz.');
        stopsToQuery.push(JAKOMINIPLATZ_ID);
    }
    const currentStops = stopsToQuery.splice(0, STATIONS_PER_CYCLE);

    console.log(`Querying departures for ${currentStops.length} stops. Total discovered: ${discoveredStops.size}`);

    try {
        const departurePromises = currentStops.map(stopId => hafas.departures(stopId, { duration: 90 }));
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

        console.log(`Found ${processedTripIds.size} unique trips to process in this cycle.`);
        for (const tripId of processedTripIds) {
            await fetchTripDetails(tripId);
        }

    } catch (error) {
        console.error('Error in main fetch loop:', error.message);
    }
    console.log('--- Fetch cycle complete. Waiting for next interval. ---');
}

// --- STARTUP ---
pool.connect()
    .then(async (client) => {
        console.log('Successfully connected to the database.');
        client.release();
        mainLoop(); // Run once immediately
        setInterval(mainLoop, FETCH_INTERVAL);
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
        process.exit(1);
    });