#!/usr/bin/env bash
# Creates a self-signed certificate so phones on the same Wi-Fi can open the dev site over HTTPS
# (browsers only allow the camera on HTTPS or localhost). Then run: DEV_HTTPS=1 npm run dev
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/apps/web/.cert"
mkdir -p "$dir"
ip="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo 127.0.0.1)"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout "$dir/key.pem" -out "$dir/cert.pem" \
  -subj "/CN=birthday-dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${ip}" >/dev/null 2>&1
echo "Certificate created for localhost and ${ip} (valid 30 days)."
echo "Start with:  DEV_HTTPS=1 npm run dev"
echo "On your phone (same Wi-Fi) open:  https://${ip}:5173  and accept the certificate warning."
