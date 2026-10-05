# Kafka knowledge base

A self-study site for staff-level Apache Kafka (4.3, KRaft): 14 modules with labs, 175+ activities, failure drills, a mock interview, case studies, projects, and a reading guide.

Open `index.html` in a browser, or use the deployed site. It is plain HTML with no build step.

## Labs
Labs need Docker. From this folder: `docker compose up -d`. Start with module 01. Later labs reuse topics from earlier ones.

Two folders are not in this repository on purpose:
- `secure/secrets/` holds private keys. Create them with `sh secure/make-certs.sh` (module 11).
- `tiered/plugins/` is a 90 MB plug-in download. Fetch it as shown in module 14.

## Honesty
Every claim that was not checked against the Kafka 4.3 documentation or a lab run is marked "unverified" and listed in `unverified.html`.
