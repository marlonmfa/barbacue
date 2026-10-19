# Build canônico do monitor iFood. Não depende de arquivos no servidor.
FROM node:22.22.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ifood/package.json packages/ifood/package.json
RUN npm ci --workspace=@barbacue/ifood --include-workspace-root=false
COPY packages/ifood packages/ifood
RUN npm run typecheck --workspace=@barbacue/ifood && cd packages/ifood && npx tsc

FROM node:22.22.0-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ifood/package.json packages/ifood/package.json
RUN npm ci --omit=dev --workspace=@barbacue/ifood --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/packages/ifood/dist packages/ifood/dist
USER node
CMD ["node", "packages/ifood/dist/poller.js"]
