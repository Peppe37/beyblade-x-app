# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM rust:bookworm AS builder

RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies before copying full source
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./
COPY src-tauri/build.rs src-tauri/tauri.conf.json ./
COPY src-tauri/capabilities ./capabilities/
RUN mkdir -p src && \
    printf 'fn main(){}\n' > src/main.rs && \
    printf 'pub mod db;\npub mod server;\npub mod commands;\n' > src/lib.rs && \
    printf '' > src/db.rs && \
    printf '' > src/server.rs && \
    printf '' > src/commands.rs && \
    cargo build --release 2>/dev/null || true
RUN rm -rf src

# Full build
COPY src-tauri/src ./src/
RUN touch src/main.rs && cargo build --release

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.1-0 \
    libssl3 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    librsvg2-2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.beyblade-x-app

WORKDIR /app
COPY --from=builder /app/target/release/beyblade-x-app .

EXPOSE 7878

CMD ["./beyblade-x-app", "--server"]
