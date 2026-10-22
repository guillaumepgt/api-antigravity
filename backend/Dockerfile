# syntax=docker/dockerfile:1

#########################################
# Stage 1: Build Frontend (Svelte 5 + TS)
#########################################
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

#########################################
# Stage 2: Build Rust Backend
#########################################
FROM rust:1.89-bookworm AS backend-builder

WORKDIR /usr/src/backend

COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

#########################################
# Stage 3: Minimal Runtime Environment
#########################################
FROM debian:bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libstdc++6 \
    git \
    procps \
    sqlite3 \
    docker.io \
    nginx-light \
    && rm -rf /var/lib/apt/lists/*

# Install official Antigravity CLI binary
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash

# Install ttyd web terminal
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd && \
    chmod +x /usr/local/bin/ttyd

# Configure environment
ENV PATH="/root/.local/bin:${PATH}"
ENV GEMINI_FORCE_FILE_STORAGE=true
ENV TZ=UTC
ENV TERM=xterm-256color
ENV WORKSPACE_DIR=/workspace
ENV STATIC_DIR=/app/dist

# Configure Nginx
COPY backend/nginx.conf /etc/nginx/conf.d/antigravity.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Copy built frontend assets to /app/dist
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Copy compiled Rust API backend & entrypoint
COPY --from=backend-builder /usr/src/backend/target/release/backend /usr/local/bin/backend
COPY backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create workspace and data folders
RUN mkdir -p /workspace /root/.gemini/antigravity-cli

WORKDIR /workspace

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
