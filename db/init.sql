-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create an ENUM type for stop events
CREATE TYPE event_type AS ENUM ('arrival', 'departure');

-- Create tables for static data
CREATE TABLE IF NOT EXISTS stops (
                                     stop_id VARCHAR(255) PRIMARY KEY,
    stop_name VARCHAR(255),
    location GEOGRAPHY(Point, 4326)
    );

CREATE TABLE IF NOT EXISTS lines (
                                     line_id VARCHAR(255) PRIMARY KEY,
    line_name VARCHAR(255),
    product VARCHAR(50)
    );

CREATE TABLE IF NOT EXISTS trips (
                                     trip_id VARCHAR(255) PRIMARY KEY,
    line_id VARCHAR(255) REFERENCES lines(line_id),
    direction VARCHAR(255),
    date DATE
    );

-- Create the hypertable for stop events
CREATE TABLE IF NOT EXISTS stop_events (
                                           trip_id VARCHAR(255) REFERENCES trips(trip_id),
    stop_id VARCHAR(255) REFERENCES stops(stop_id),
    "timestamp" TIMESTAMPTZ NOT NULL,
    event_type event_type NOT NULL,
    time_planned TIMESTAMPTZ,
    time_actual TIMESTAMPTZ,
    delay_seconds INTEGER,
    PRIMARY KEY (trip_id, stop_id, "timestamp")
    );

-- Create the hypertable for real-time vehicle positions
CREATE TABLE IF NOT EXISTS vehicle_positions (
                                                 trip_id VARCHAR(255) REFERENCES trips(trip_id),
    "timestamp" TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(Point, 4326),
    delay_seconds INTEGER,
    speed_mps REAL,
    PRIMARY KEY (trip_id, "timestamp")
    );

-- Convert the time-series tables into TimescaleDB hypertables
SELECT create_hypertable('stop_events', 'timestamp', if_not_exists => TRUE);
SELECT create_hypertable('vehicle_positions', 'timestamp', if_not_exists => TRUE);

-- Create spatial indexes for fast geospatial queries
CREATE INDEX IF NOT EXISTS vehicle_positions_location_idx ON vehicle_positions USING GIST (location);
CREATE INDEX IF NOT EXISTS stops_location_idx ON stops USING GIST (location);