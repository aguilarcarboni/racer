FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/serve-online.mjs ./scripts/serve-online.mjs
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "scripts/serve-online.mjs"]
