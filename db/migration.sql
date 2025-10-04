-- migration.sql

-- Step 1: Add a 'line_number' column to the 'lines' table for consistent grouping.
ALTER TABLE lines ADD COLUMN IF NOT EXISTS line_number TEXT;

-- Step 2: Backfill the new 'line_number' column from existing 'line_name' data.
-- This extracts the numeric or alphanumeric identifier (e.g., '4', '34E', 'N1').
UPDATE lines
SET line_number = substring(line_name from '\d{1,2}[A-Z]?')
WHERE line_number IS NULL;

-- Step 3: Add a 'departure_time' column to the 'trips' table for easier display and sorting.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS departure_time TIME;

-- Step 4: Backfill the 'departure_time' column.
-- This query finds the first planned departure for each trip and populates the column.
-- Note: This can be slow on very large datasets.
UPDATE trips t
SET departure_time = sub.min_planned_time::TIME
FROM (
    SELECT
    trip_id,
    MIN(planned_time) as min_planned_time
    FROM stop_events
    WHERE event_type = 'departure' AND planned_time IS NOT NULL
    GROUP BY trip_id
    ) AS sub
WHERE t.trip_id = sub.trip_id AND t.departure_time IS NULL;

-- Step 5: Create an index for the new column to speed up queries.
CREATE INDEX IF NOT EXISTS lines_line_number_product_idx ON lines (line_number, product);

-- After running this migration, you should apply the changes to the fetcher and api.