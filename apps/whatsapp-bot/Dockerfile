# Standalone build (context = apps/whatsapp-bot). Installs its own deps rather
# than relying on the monorepo workspace hoist, so it ships as one image.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Auth state is mounted as a volume so pairing survives restarts.
ENV SESSIONS_DIR=/app/sessions
CMD ["node", "dist/index.js"]
