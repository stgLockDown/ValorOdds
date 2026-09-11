FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

ENV NODE_ENV=production
EXPOSE 8081

RUN chown -R 1000:1000 /app
USER 1000

CMD ["node", "src/server.js"]
