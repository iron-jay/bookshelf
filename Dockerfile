# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The migrate bundle lands inside .next/standalone, so the runtime stage picks
# it up with everything else.
# A "use server" file exporting anything but async functions breaks every action
# on the pages importing it, and neither the build nor eslint notices. Cheaper to
# fail here than to publish it.
RUN npm run check:actions && npm run build && npm run build:migrate

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The SQL the bundled migrate script reads at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

# Cover art lives on a bind mount. Creating it here only helps when nothing is
# mounted over it; when something is, the host directory's ownership is what
# counts, which is why the deploy steps chown it to this uid.
RUN mkdir -p /data/covers && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000

# Migrations first, every start. Both halves are idempotent, and the server does
# not come up if the schema could not be brought up to date.
CMD ["sh", "-c", "node migrate.mjs && node server.js"]
