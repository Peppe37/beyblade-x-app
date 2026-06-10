#!/usr/bin/env bash
set -e

CONTAINER="beyblade-x-backend"
IMAGE="beyblade-x-backend"
PORT=7878
DATA_DIR="$HOME/.beyblade-x-app"

# Ensure data dir exists on host
mkdir -p "$DATA_DIR"

# ─── Build ───────────────────────────────────────────────────────────────────
echo "Building image $IMAGE..."
docker build -t "$IMAGE" .

# ─── Stop and remove old container ───────────────────────────────────────────
if docker ps -q -f "name=^${CONTAINER}$" | grep -q .; then
  echo "Stopping existing container..."
  docker stop "$CONTAINER"
fi
if docker ps -aq -f "name=^${CONTAINER}$" | grep -q .; then
  docker rm "$CONTAINER"
fi

# ─── Run ─────────────────────────────────────────────────────────────────────
echo "Starting $CONTAINER..."
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p "$PORT:$PORT" \
  -v "$DATA_DIR:/root/.beyblade-x-app" \
  --env-file .env \
  "$IMAGE"

echo ""
echo "Backend avviato!"
echo "  API:   http://localhost:$PORT"
echo "  Admin: http://localhost:$PORT/admin"
