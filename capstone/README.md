# Capstone starter: order-to-settlement

Read `../capstone.html` first. It has the plan, the requirements and the checklist.

## Status: scripts not run

None of the files here has been run end to end. `setup.sh` was checked with `sh -n` only.
`connector-outbox.json` was checked as valid JSON only. The `orders` and `outbox` tables and the
connector settings are as run in the cdc lab. The `processed_events` table has not been run.
Treat every file as a starting point and fix what you find.

## What is here

| File | Purpose |
|---|---|
| `setup.sh` | Creates `order-events` and `order-events-dlq`: 3 partitions, 3 copies, `min.insync.replicas=2`. Safe to run twice. |
| `schema.sql` | Tables `orders`, `outbox` and `processed_events` for the `pg` service. |
| `connector-outbox.json` | The Debezium outbox connector config from the cdc lab. |
| `acceptance-tests.md` | The tests that decide whether each part works. |

## How to start

Run these from the knowledge-base folder, one step at a time.

    docker compose --profile cdc --profile monitoring up -d
    sh capstone/setup.sh
    docker exec -i pg psql -U postgres -d postgres < capstone/schema.sql
    curl -s -X POST -H 'Content-Type: application/json' \
      --data @capstone/connector-outbox.json http://localhost:8087/connectors

Then follow week 1 and week 2 on the capstone page.

## How to stop

Stop and keep your data:

    docker compose --profile cdc --profile monitoring stop

Stop and delete the containers (the volumes follow the main compose file):

    docker compose --profile cdc --profile monitoring down

The connector keeps a replication slot (`outbox_slot`) in PostgreSQL. While the connector is stopped,
the slot holds back the database log. Do not leave it stopped for weeks.
