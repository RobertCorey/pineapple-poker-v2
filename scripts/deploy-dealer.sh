#!/usr/bin/env bash
set -euo pipefail

# Deploy dealer to GCE VM (pineapple-dealer)
# Usage: ./scripts/deploy-dealer.sh

ZONE="us-central1-a"
VM="pineapple-dealer"
REMOTE_DIR="/opt/pineapple"

echo "==> Building dealer..."
npm run build -w dealer

echo "==> Copying files to VM..."
gcloud compute scp --recurse \
  dealer/ shared/ package.json package-lock.json \
  "${VM}:${REMOTE_DIR}/" \
  --zone="${ZONE}"

echo "==> Installing dependencies on VM..."
gcloud compute ssh "${VM}" --zone="${ZONE}" --command \
  "cd ${REMOTE_DIR} && sudo npm ci --workspace=dealer --production"

echo "==> Restarting dealer service..."
gcloud compute ssh "${VM}" --zone="${ZONE}" --command \
  "sudo systemctl restart pineapple-dealer"

echo "==> Waiting for health check..."
sleep 3
gcloud compute ssh "${VM}" --zone="${ZONE}" --command \
  "curl -s http://localhost:8080/health"

echo ""
echo "==> Dealer deployed successfully!"
