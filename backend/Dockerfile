FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM rust:1.89-bookworm AS backend-builder

WORKDIR /usr/src/backend

COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim

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

RUN curl -fsSL https://antigravity.google/cli/install.sh | bash

RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd && \
    chmod +x /usr/local/bin/ttyd

ENV PATH="/root/.local/bin:${PATH}"
ENV GEMINI_FORCE_FILE_STORAGE=true
ENV TZ=UTC
ENV TERM=xterm-256color
ENV WORKSPACE_DIR=/workspace
ENV STATIC_DIR=/app/dist

COPY backend/nginx.conf /etc/nginx/conf.d/antigravity.conf
RUN rm -f /etc/nginx/sites-enabled/default

COPY --from=frontend-builder /app/frontend/dist /app/dist

COPY --from=backend-builder /usr/src/backend/target/release/backend /usr/local/bin/backend
COPY backend/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY backend/terminal-wrapper.sh /usr/local/bin/terminal-wrapper.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/terminal-wrapper.sh

RUN mkdir -p /workspace /root/.gemini/antigravity-cli

WORKDIR /workspace

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
