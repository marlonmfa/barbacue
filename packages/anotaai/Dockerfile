# Build canônico do monitor Anota AI. Não depende de arquivos no servidor.
FROM node:22.22.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/anotaai/package.json packages/anotaai/package.json
RUN npm ci --workspace=@barbacue/anotaai --include-workspace-root=false
COPY packages/anotaai packages/anotaai
RUN npm run typecheck --workspace=@barbacue/anotaai && cd packages/anotaai && npx tsc

FROM node:22.22.0-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/anotaai/package.json packages/anotaai/package.json
RUN npm ci --omit=dev --workspace=@barbacue/anotaai --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/packages/anotaai/dist packages/anotaai/dist
USER node
CMD ["node", "packages/anotaai/dist/poller.js"]
