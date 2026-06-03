# API service image. Deterministic Node 22 + pnpm 11 (Nixpacks defaulted to
# Node 18, which pnpm 11 can't run). Also builds the Expo web bundle and serves
# it same-origin from the API.
FROM node:22-slim

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.5.1

WORKDIR /app

# Copy the whole monorepo (see .dockerignore for exclusions) and install.
COPY . .
RUN pnpm install --frozen-lockfile

# Build the Expo web bundle. Empty API base -> the web app calls /api on its own
# origin (same-origin, no CORS); WEB_URL backs shareable live links.
ENV EXPO_PUBLIC_API_URL=""
ENV EXPO_PUBLIC_WEB_URL="https://api-production-341fc.up.railway.app"
RUN pnpm --filter @regularity/mobile exec expo export --platform web --output-dir dist

# The API serves the built web bundle from here (see apps/api/src/index.ts).
ENV WEB_DIST=/app/apps/mobile/dist
ENV NODE_ENV=production

# PORT is injected by Railway at runtime; the API reads process.env.PORT.
CMD ["pnpm", "--filter", "@regularity/api", "start"]
