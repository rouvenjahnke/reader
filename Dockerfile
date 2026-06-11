FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS node-min
RUN apk add --no-cache upx \
  && upx --best --lzma /usr/local/bin/node

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Cap the V8 heap so trace collection GCs instead of growing until the
# container's OOM killer sends SIGKILL (low-memory LXC/Docker hosts).
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build
RUN rm -rf \
  .next/standalone/node_modules/@img \
  .next/standalone/node_modules/sharp \
  .next/standalone/node_modules/typescript \
  .next/standalone/node_modules/@esbuild \
  .next/standalone/node_modules/esbuild \
  .next/standalone/node_modules/webpack

FROM alpine:3.23 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libstdc++
COPY --from=node-min /usr/local/bin/node /usr/local/bin/node
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
