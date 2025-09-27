import { createClient } from 'hafas-client';
import { profile as stvProfile } from 'hafas-client/p/stv/index.js';
import pkg from 'pg';
const { Pool } = pkg;

console.log('Fetcher service starting...');

// --- CONFIGURATION ---
const DEBUG = true;
const FETCH_INTERVAL = 45 * 1000; // Increased interval slightly
const STATIONS_PER_CYCLE = 5; // How many stations to query each cycle
const ONLY_FETCH_GRAZ_LINES = true;

const GRAZ_BOUNDING_BOX = {
    north: 47.15,
    west: 15.30,
    south: 46.95,
    east: 15.60,
};

// --- STATE ---
let allGrazStops = [];
let currentStopIndex = 0;


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
    // Regex for tram lines (1-2 digits) and city bus lines (2 digits, possibly with E or A suffix)
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
        SELECT actual_time, planned_time FROM stop_events
        WHERE trip_id = $1 AND stop_id = $2 AND event_type = $3;
    `;
    const result = await dbQuery(selectQuery, [trip_id, stop_id, event_type]);
    const existingEvent = result && result.rows.length > 0 ? result.rows[0] : null;

    if (existingEvent) {
        const existingEventTime = existingEvent.actual_time ? new Date(existingEvent.actual_time) : (existingEvent.planned_time ? new Date(existingEvent.planned_time) : null);

        // Skip updates for events that have already passed to avoid race conditions
        if (existingEventTime && existingEventTime < now) {
            if (DEBUG) console.log(`  -> [DB] Skipping update for past event: Trip ${trip_id}, Stop ${stop_id}, Type ${event_type}`);
            return;
        }

        if (DEBUG) console.log(`  -> [DB] Updating future event: Trip ${trip_id}, Stop ${stop_id}, Type ${event_type}`);
        const updateQuery = `
            UPDATE stop_events
            SET
                "timestamp" = $1,
                actual_time = $2,
                arrival_delay_seconds = $3,
                departure_delay_seconds = $4,
                planned_time = $5,
                stop_sequence = $6
            WHERE trip_id = $7 AND stop_id = $8 AND event_type = $9;
        `;
        await dbQuery(updateQuery, [
            eventTime, actual_time, arrival_delay_seconds, departure_delay_seconds, planned_time, stop_sequence,
            trip_id, stop_id, event_type
        ]);
    } else {
        if (DEBUG) console.log(`  -> [DB] Inserting new event: Trip ${trip_id}, Stop ${stop_id}, Type ${event_type}`);
        const insertQuery = `
            INSERT INTO stop_events (timestamp, trip_id, stop_id, stop_sequence, event_type, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `;
        await dbQuery(insertQuery, [
            eventTime, trip_id, stop_id, stop_sequence, event_type, planned_time, actual_time, arrival_delay_seconds, departure_delay_seconds
        ]);
    }
}


async function fetchTripDetails(tripId, processedStops) {
    try {
        if (DEBUG) console.log(`[TRIP] Fetching details for tripId: ${tripId}`);
        const { trip } = await hafas.trip(tripId, { stopovers: true });
        if (!trip || !trip.line || !isGrazLine(trip.line)) return;

        // Upsert Line and Trip info
        await dbQuery('INSERT INTO lines (line_id, line_name, product) VALUES ($1, $2, $3) ON CONFLICT (line_id) DO NOTHING', [trip.line.id, trip.line.name, trip.line.product]);
        const date = new Date(trip.departure || trip.plannedDeparture).toISOString().split('T')[0];
        await dbQuery('INSERT INTO trips (trip_id, line_id, direction, date) VALUES ($1, $2, $3, $4) ON CONFLICT (trip_id) DO NOTHING', [trip.id, trip.line.id, trip.direction, date]);

        // Insert current vehicle position
        if (trip.currentLocation) {
            await dbQuery('INSERT INTO vehicle_positions (trip_id, "timestamp", location, delay_seconds) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5) ON CONFLICT (trip_id, "timestamp") DO NOTHING', [trip.id, new Date().toISOString(), trip.currentLocation.longitude, trip.currentLocation.latitude, trip.departureDelay || 0]);
        }

        // Process all stopovers in the trip
        for (const [index, stopover] of trip.stopovers.entries()) {
            const { stop } = stopover;
            if (!stop || !stop.id) continue;

            // Add stop to DB if it's new and within Graz
            if (!processedStops.has(stop.id) && isWithinBoundingBox(stop.location)) {
                processedStops.add(stop.id);
                await dbQuery('INSERT INTO stops (stop_id, stop_name, location) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)) ON CONFLICT (stop_id) DO NOTHING', [stop.id, stop.name, stop.location.longitude, stop.location.latitude]);
            }

            // Upsert arrival event
            if(stopover.arrival || stopover.plannedArrival) {
                await upsertStopEvent({
                    trip_id: trip.id,
                    stop_id: stop.id,
                    stop_sequence: index + 1,
                    event_type: 'arrival',
                    planned_time: stopover.plannedArrival,
                    actual_time: stopover.arrival,
                    arrival_delay_seconds: stopover.arrivalDelay,
                    departure_delay_seconds: null
                });
            }

            // Upsert departure event
            if(stopover.departure || stopover.plannedDeparture) {
                await upsertStopEvent({
                    trip_id: trip.id,
                    stop_id: stop.id,
                    stop_sequence: index + 1,
                    event_type: 'departure',
                    planned_time: stopover.plannedDeparture,
                    actual_time: stopover.departure,
                    arrival_delay_seconds: null,
                    departure_delay_seconds: stopover.departureDelay
                });
            }
        }
    } catch (error) {
        // HAFAS can sometimes throw errors for specific trips, we'll log and continue
        console.error(`Error fetching trip ${tripId}:`, error.message);
    }
}

/**
 * Fetches all transit stops within the defined bounding box.
 */
async function fetchAllGrazStops() {
    console.log('[INIT] Fetching all stops in the Graz area...');
    try {
        const locations = await hafas.locations({
            type: 'stop',
            box: GRAZ_BOUNDING_BOX
        });
        allGrazStops = locations.filter(loc => loc.id && loc.name);
        console.log(`[INIT] Found ${allGrazStops.length} stops.`);
        if (allGrazStops.length === 0) {
            console.error("[INIT] No stops found. Check HAFAS connection or bounding box. Retrying in 1 minute.");
            setTimeout(fetchAllGrazStops, 60000);
        }
    } catch (error) {
        console.error('[INIT] Failed to fetch stops:', error.message);
        console.error("[INIT] Retrying in 1 minute.");
        setTimeout(fetchAllGrazStops, 60000);
    }
}

async function mainLoop() {
    if (allGrazStops.length === 0) {
        console.log("Stop list is empty, waiting for initial fetch...");
        return;
    }
    console.log('\n--- Starting new fetch cycle ---');
    const processedTripIds = new Set();
    const processedStops = new Set();

    // Determine the slice of stops to process in this cycle
    const stopsToQuery = [];
    for (let i = 0; i < STATIONS_PER_CYCLE; i++) {
        const index = (currentStopIndex + i) % allGrazStops.length;
        stopsToQuery.push(allGrazStops[index]);
    }
    currentStopIndex = (currentStopIndex + STATIONS_PER_CYCLE) % allGrazStops.length;

    console.log(`Querying departures for ${stopsToQuery.length} stops (Index ${currentStopIndex}/${allGrazStops.length})...`);

    try {
        // Fetch departures for each stop in this cycle's slice
        const departurePromises = stopsToQuery.map(stop => hafas.departures(stop.id, { duration: 90 }));
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

        // Process each unique trip found
        for (const tripId of processedTripIds) {
            await fetchTripDetails(tripId, processedStops);
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
        // First, get the list of all stops
        await fetchAllGrazStops();
        // Then, start the main loop interval
        if (allGrazStops.length > 0) {
            mainLoop(); // Run once immediately
            setInterval(mainLoop, FETCH_INTERVAL);
        }
    })
    .catch(err => {
        console.error('Failed to connect to the database:', err.message);
        process.exit(1);
    });