# API service image. Deterministic Node 22 + pnpm 11 (Nixpacks defaulted to
# Node 18, which pnpm 11 can't run). Builds from the monorepo root so the
# @regularity/* workspace packages resolve.
FROM node:22-slim

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.5.1

WORKDIR /app

# Copy the whole monorepo (see .dockerignore for exclusions) and install.
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
# PORT is injected by Railway at runtime; the API reads process.env.PORT.
CMD ["pnpm", "--filter", "@regularity/api", "start"]
