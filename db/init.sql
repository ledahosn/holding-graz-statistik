-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create an ENUM type for stop events
CREATE TYPE event_type AS ENUM ('arrival', 'departure');

-- Create tables for static data
CREATE TABLE IF NOT EXISTS stops (
                                     stop_id TEXT PRIMARY KEY,
                                     stop_name TEXT,
                                     location GEOGRAPHY(Point, 4326)
    );

CREATE TABLE IF NOT EXISTS lines (
                                     line_id TEXT PRIMARY KEY,
                                     line_name TEXT,
                                     product TEXT
);

CREATE TABLE IF NOT EXISTS trips (
                                     trip_id TEXT PRIMARY KEY,
                                     line_id TEXT REFERENCES lines(line_id),
    direction TEXT,
    date DATE
    );

-- Create the hypertable for stop events
CREATE TABLE IF NOT EXISTS stop_events (
                                           "timestamp" TIMESTAMPTZ NOT NULL,
                                           trip_id TEXT REFERENCES trips(trip_id),
    stop_id TEXT REFERENCES stops(stop_id),
    stop_sequence INTEGER,
    event_type event_type NOT NULL,
    planned_time TIMESTAMPTZ,
    actual_time TIMESTAMPTZ,
    arrival_delay_seconds INTEGER,
    departure_delay_seconds INTEGER,
    PRIMARY KEY ("timestamp", trip_id, stop_id, event_type)
    );

-- Create the hypertable for real-time vehicle positions
CREATE TABLE IF NOT EXISTS vehicle_positions (
                                                 trip_id TEXT REFERENCES trips(trip_id),
    "timestamp" TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(Point, 4326),
    delay_seconds INTEGER,
    PRIMARY KEY (trip_id, "timestamp")
    );

-- Convert the time-series tables into TimescaleDB hypertables
SELECT create_hypertable('stop_events', 'timestamp', if_not_exists => TRUE);
SELECT create_hypertable('vehicle_positions', 'timestamp', if_not_exists => TRUE);

-- Create spatial indexes for fast geospatial queries
CREATE INDEX IF NOT EXISTS vehicle_positions_location_idx ON vehicle_positions USING GIST (location);
CREATE INDEX IF NOT EXISTS stops_location_idx ON stops USING GIST (location);

-- Create indexes for foreign keys and common query patterns
CREATE INDEX IF NOT EXISTS trips_line_id_date_idx ON trips (line_id, date);
CREATE INDEX IF NOT EXISTS stop_events_trip_id_idx ON stop_events (trip_id);
CREATE INDEX IF NOT EXISTS stop_events_stop_id_idx ON stop_events (stop_id);
CREATE INDEX IF NOT EXISTS vehicle_positions_trip_id_timestamp_desc_idx ON vehicle_positions (trip_id, "timestamp" DESC);