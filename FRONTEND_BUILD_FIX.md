# Frontend Build Fix

The Docker frontend build uses Vite directly instead of `tsc && vite build`.

Why:

- `npm exec -- tsc` can accidentally download the deprecated `tsc` package if the local TypeScript binary is not resolved.
- The hackathon demo does not need Docker to run a blocking TypeScript typecheck before bundling.
- Vite transpiles the TypeScript/React source during `vite build`.

Local checks:

```bash
cd frontend
npm install
npm run build
npm run typecheck
```

Docker:

```bash
docker compose build --no-cache frontend
docker compose up
```
