# Build the browser wallet bundle (get-starknet, Starkzap, Cartridge, Privy) with dev deps.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY shared ./shared
COPY scripts ./scripts
RUN node scripts/build-wallets.js

# Runtime: Node 24 so the optional STRK20 pool client (strk20-discovery) installs.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY client ./client
COPY scripts/house.js ./scripts/house.js
COPY contracts/build ./contracts/build
COPY --from=build /app/client/vendor ./client/vendor
# mount a volume here for real tokens: the cashier journal and the STRK20 discovery cache.
# Hosts mount volumes owned by root (Fly, Railway): the entrypoint hands /data to the
# node user, then drops root before the server starts.
RUN mkdir -p /data && chown node /data
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENV PORT=8080 STRK20_CACHE_DIR=/data/strk20-cache
EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "server/index.js"]
