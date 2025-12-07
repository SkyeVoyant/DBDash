# Multi-stage build for DBDash with pnpm

# Install pnpm
FROM node:20-alpine AS pnpm-installer
RUN corepack enable && corepack prepare pnpm@latest --activate

# Backend stage
FROM node:20-alpine AS backend-builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile
COPY backend/ ./backend/
WORKDIR /app/backend
RUN pnpm run build || true

# Frontend stage
FROM node:20-alpine AS frontend-builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN pnpm run build

# Production stage
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install system dependencies for database drivers
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy backend
COPY --from=backend-builder /app/backend /app/backend
WORKDIR /app/backend
RUN pnpm install --frozen-lockfile --prod

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Install express for frontend server and copy serve script
WORKDIR /app
RUN rm -rf package.json pnpm-workspace.yaml pnpm-lock.yaml && echo '{"type": "module", "dependencies": {"express": "^4.18.2"}}' > package.json && pnpm install --prod
COPY serve-frontend.js .

EXPOSE 8888 8889

CMD ["sh", "-c", "cd /app/backend && node server.js & cd /app && node serve-frontend.js"]
