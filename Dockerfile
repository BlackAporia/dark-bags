FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY client ./client
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
