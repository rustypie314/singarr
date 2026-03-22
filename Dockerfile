# ─────────────────────────────────────────
#  Stage 1: Build the React frontend
# ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────
#  Stage 2: Final single container
#  - nginx serves the frontend
#  - node runs the backend API
#  - supervisord manages both processes
# ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install nginx, supervisord, and build deps for better-sqlite3
RUN apk add --no-cache nginx supervisor python3 make g++

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/src/ ./src/

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/frontend/dist /usr/share/nginx/html

# Copy configs
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 8684

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
