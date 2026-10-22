# syntax=docker/dockerfile:1

#########################################
# Stage 1: Build the TypeScript code
#########################################
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

#########################################
# Stage 2: Minimal Production Image
#########################################
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV WHATSAPP_PORT=3001

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
