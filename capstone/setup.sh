#!/bin/sh
# Capstone topics. NOT RUN: checked only with `sh -n`.
# Safe to run twice: --if-not-exists skips a topic that already exists.
# The cluster must be up first: docker compose up -d   (from the knowledge-base folder)

k() { docker exec -i kafka-1 /opt/kafka/bin/"$@"; }
B=kafka-1:19092

for t in order-events order-events-dlq; do
  k kafka-topics.sh --bootstrap-server $B --create --if-not-exists \
    --topic "$t" --partitions 3 --replication-factor 3 \
    --config min.insync.replicas=2
done

k kafka-topics.sh --bootstrap-server $B --describe --topic order-events
k kafka-topics.sh --bootstrap-server $B --describe --topic order-events-dlq
