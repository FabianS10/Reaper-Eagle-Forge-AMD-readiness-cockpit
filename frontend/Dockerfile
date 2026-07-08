FROM node:20-alpine AS build

WORKDIR /app

# Do not copy package-lock.json here. The previous archive lockfile could pin
# registry-specific metadata and make Docker installs brittle on other machines.
COPY package.json ./
RUN npm install --include=dev --legacy-peer-deps --no-audit --no-fund

COPY . .

ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=${VITE_API_BASE}

# Use the local Vite binary directly. This avoids npm/npx accidentally fetching
# the unrelated deprecated "tsc" package when TypeScript is not resolved.
RUN ./node_modules/.bin/vite build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
