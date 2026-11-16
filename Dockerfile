# Factory Pulse - single-image deploy: build the React frontend, then run the
# FastAPI backend which serves both the API and the built frontend.

# ---- stage 1: build the frontend ----
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- stage 2: run the API (serving the built frontend) ----
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY src ./src
COPY backend ./backend
COPY --from=web /web/dist ./frontend/dist
ENV PORT=8000
EXPOSE 8000
# DATABASE_URL (Neon) is provided at runtime as an environment variable.
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}"]
