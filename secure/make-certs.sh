#!/bin/sh
# Lab only. Creates a private certificate authority, a broker certificate signed by it,
# and a truststore for clients, in ./secrets. The password "labpass" is not a secret.
# Run:  sh make-certs.sh
set -e
cd "$(dirname "$0")"
mkdir -p secrets
docker run --rm -u 0 -v "$PWD/secrets:/s" -w /s --entrypoint sh apache/kafka:4.3.1 -c '
set -e
rm -f ca.p12 ca.crt broker.p12 broker.csr broker.crt truststore.p12
P=labpass
# 1. the certificate authority
keytool -genkeypair -alias ca -keyalg RSA -keysize 2048 -validity 365 -dname "CN=Kafka Lab CA" -ext bc:c \
  -keystore ca.p12 -storetype PKCS12 -storepass $P -keypass $P
keytool -exportcert -alias ca -keystore ca.p12 -storepass $P -rfc -file ca.crt
# 2. the broker key, and a certificate for it signed by the authority
keytool -genkeypair -alias broker -keyalg RSA -keysize 2048 -validity 365 -dname "CN=kafka-sec" \
  -ext SAN=dns:kafka-sec,dns:localhost -keystore broker.p12 -storetype PKCS12 -storepass $P -keypass $P
keytool -certreq -alias broker -keystore broker.p12 -storepass $P -file broker.csr
keytool -gencert -alias ca -keystore ca.p12 -storepass $P -infile broker.csr -outfile broker.crt \
  -ext SAN=dns:kafka-sec,dns:localhost -validity 365 -rfc
keytool -importcert -alias ca -file ca.crt -keystore broker.p12 -storepass $P -noprompt
keytool -importcert -alias broker -file broker.crt -keystore broker.p12 -storepass $P -noprompt
# 3. what clients need: only the authority certificate
keytool -importcert -alias ca -file ca.crt -keystore truststore.p12 -storetype PKCS12 -storepass $P -noprompt
chmod 644 *.p12 *.crt
ls -1
'
