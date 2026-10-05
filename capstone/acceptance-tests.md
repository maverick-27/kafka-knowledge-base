# Acceptance tests

Status: not run. Each test says what to do and what a pass looks like. Record real output in your
own notes. Set up in your shell first:

    k() { docker exec -i kafka-1 /opt/kafka/bin/"$@"; }
    B=kafka-1:19092
    P() { docker exec -i pg psql -U postgres -d postgres "$@"; }

## A. Topics and schema

A1. Topic settings.
- Do: `k kafka-topics.sh --bootstrap-server $B --describe --topic order-events`
- Pass: 3 partitions, replication factor 3, config shows `min.insync.replicas=2`. Same for `order-events-dlq`.

A2. Setup is safe to repeat.
- Do: run `sh capstone/setup.sh` a second time.
- Pass: no error and no change to the settings.

A3. Writes stop when two copies are not available.
- Do: stop two brokers (`docker stop kafka-2 kafka-3`), then send one record to `order-events` with `acks=all`.
- Pass: the send fails with a not-enough-replicas error. Restart the brokers afterwards.

A4. Schema compatibility.
- Do: register version 1 of the event schema under your subject, set its compatibility mode, then ask the registry
  whether a change that removes a required field is compatible (module 08 shows the calls).
- Pass: the registry answers that the breaking change is not compatible.

## B. Outbox and capture

B1. Atomic write.
- Do: in one database transaction insert an order and an outbox row, then commit.
- Pass: both rows exist. Repeat with a forced error before commit: neither row exists.

B2. Capture.
- Do: after B1, read `order-events` from the beginning (module 02 and 03 show the console consumer).
- Pass: exactly one record for the committed order. The record key is the order id.

B3. The connector survives a restart.
- Do: stop `cdc-connect`, insert three orders, start it again.
- Pass: all three events arrive, none twice at the topic level.
  Note any repeat you see; a repeat is allowed here and is handled in C1.

B4. The service never calls Kafka.
- Do: search the order service code for any Kafka client.
- Pass: none found. The service only talks to PostgreSQL.

## C. Consumer that is safe to repeat

C1. Repeat test.
- Do: replay the same events (reset the group's offsets to the start, see module 03).
- Pass: the count of rows in `processed_events` does not change, and your business totals do not change.

C2. Crash test.
- Do: kill the consumer process in the middle of a batch. Start it again.
- Pass: every event is processed once in effect. `processed_events` has one row per event id.

C3. Bad record.
- Do: put a record that cannot be parsed on `order-events`.
- Pass: the record appears on `order-events-dlq` with the reason, the consumer keeps going, and the alert in E3 fires.

## D. Streams job

D1. Totals are right.
- Do: send a known set of orders for two merchants on one day.
- Pass: the output for each merchant equals the sum you computed by hand.

D2. Crash test.
- Do: kill the job mid-stream. Restart it.
- Pass: totals are still correct. No double counting.

D3. State survives.
- Do: restart with the state directory kept, then once with it deleted (module 07 did this).
- Pass: with the directory kept, only a short replay. With it deleted, the totals come back from the changelog topic.

D4. Names are stable.
- Do: list topics with the job's application id as prefix.
- Pass: every internal topic has a name you chose, not a generated number. Change the topology slightly; the names stay.

## E. Monitoring and lag

E1. Metrics.
- Do: open Prometheus at http://localhost:9095/alerts and Grafana at http://localhost:3005.
- Pass: the three rules from module 12 are listed.

E2. Lag from the command line.
- Do: `k kafka-consumer-groups.sh --bootstrap-server $B --describe --group <your-group>`
- Pass: you can read lag for each partition. Stop the consumer, add 1000 records, and see the lag rise.

E3. Your own alert.
- Do: write the consumer's dead-letter alert and lag alert. The module 12 exporter did not publish lag on Kafka 4.3,
  so decide how your alert reads lag (a small script that parses E2 is acceptable).
- Pass: you trigger each alert on purpose and see it fire.

## F. Load and drills

F1. Load limit.
- Do: run the performance tool against a copy of the topic (module 02), raising the rate until lag grows without stopping.
- Pass: you can state the highest rate at which lag stayed flat, and what limited it.

F2. Weekly drill.
- Do: take one drill from `../drills.html` each week.
- Pass: you wrote a story (situation, what I saw, what I decided, what I got wrong, what I changed).
