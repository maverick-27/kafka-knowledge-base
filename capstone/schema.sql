-- Capstone database schema for the `pg` service (profile cdc).
-- Run with:  docker exec -i pg psql -U postgres -d postgres < capstone/schema.sql
-- "orders" and "outbox" are the tables as run in the cdc lab.
-- "processed_events" is new for the capstone and has NOT been run.

CREATE TABLE IF NOT EXISTS orders (
  id       int PRIMARY KEY,
  customer text,
  amount   numeric(10,2),
  status   text
);

CREATE TABLE IF NOT EXISTS outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregatetype text,
  aggregateid   text,
  type          text,
  payload       jsonb,
  created       timestamptz DEFAULT now()
);

-- Not run. The consumer inserts the event id here in the same database
-- transaction as its own effect. A repeat hits the primary key and is skipped.
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     uuid PRIMARY KEY,
  processed_at timestamptz DEFAULT now()
);
