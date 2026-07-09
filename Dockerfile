# ---- Stage 1: build the frontend ----
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Do not copy package-lock.json here. The previous archive lockfile could pin
# registry-specific metadata and make Docker installs brittle on other machines.
COPY frontend/package.json ./
RUN npm install --include=dev --legacy-peer-deps --no-audit --no-fund

COPY frontend/ .

# Same-origin deploy: frontend and backend are served from the same Fly app,
# so API calls should be relative, not pinned to localhost.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}

# Use the local Vite binary directly. This avoids npm/npx accidentally fetching
# the unrelated deprecated "tsc" package when TypeScript is not resolved.
RUN ./node_modules/.bin/vite build

# ---- Stage 2: backend, serving the built frontend ----
FROM python:3.11-slim

WORKDIR /app

RUN useradd --create-home --shell /bin/bash forge

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/app /app/app
COPY backend/diagnostics /app/diagnostics
COPY backend/evidence /app/evidence
COPY backend/demo_repo /app/demo_repo

COPY --from=frontend-build /app/dist /app/static

RUN chown -R forge:forge /app
USER forge

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]