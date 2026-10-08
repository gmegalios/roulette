#!/usr/bin/env bash
set -euo pipefail

certificate_name="${1:-localhost}"
certificate_directory="certs"
certificate_file="${certificate_directory}/dev-cert.pem"
key_file="${certificate_directory}/dev-key.pem"

if [[ ! "${certificate_name}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Use a hostname or IPv4 address containing only letters, numbers, dots, and hyphens." >&2
  exit 1
fi

mkdir -p "${certificate_directory}"

if [[ "${certificate_name}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  subject_alt_name="IP:${certificate_name},IP:127.0.0.1,DNS:localhost"
elif [[ "${certificate_name}" == "localhost" ]]; then
  subject_alt_name="DNS:localhost,IP:127.0.0.1"
else
  subject_alt_name="DNS:${certificate_name},DNS:localhost,IP:127.0.0.1"
fi

openssl req \
  -x509 \
  -newkey rsa:2048 \
  -sha256 \
  -days 365 \
  -nodes \
  -keyout "${key_file}" \
  -out "${certificate_file}" \
  -subj "/CN=${certificate_name}" \
  -addext "subjectAltName=${subject_alt_name}" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

chmod 600 "${key_file}"

echo "Created ${certificate_file} and ${key_file} for ${certificate_name}."
echo "This is a development certificate. Trust ${certificate_file} on each device that opens the app."
