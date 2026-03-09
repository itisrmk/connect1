FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY apps/api/package.json apps/api/
COPY connectors/gmail/package.json connectors/gmail/
COPY connectors/slack/package.json connectors/slack/
COPY connectors/google-drive/package.json connectors/google-drive/
COPY connectors/notion/package.json connectors/notion/
COPY connectors/google-calendar/package.json connectors/google-calendar/

RUN npm ci

# Copy source and build
COPY packages/ packages/
COPY apps/ apps/
COPY connectors/ connectors/

RUN npx turbo run build

# Production image
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/connectors/gmail/dist ./connectors/gmail/dist
COPY --from=builder /app/connectors/gmail/package.json ./connectors/gmail/
COPY --from=builder /app/connectors/slack/dist ./connectors/slack/dist
COPY --from=builder /app/connectors/slack/package.json ./connectors/slack/
COPY --from=builder /app/connectors/google-drive/dist ./connectors/google-drive/dist
COPY --from=builder /app/connectors/google-drive/package.json ./connectors/google-drive/
COPY --from=builder /app/connectors/notion/dist ./connectors/notion/dist
COPY --from=builder /app/connectors/notion/package.json ./connectors/notion/
COPY --from=builder /app/connectors/google-calendar/dist ./connectors/google-calendar/dist
COPY --from=builder /app/connectors/google-calendar/package.json ./connectors/google-calendar/

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "apps/api/dist/index.js"]
