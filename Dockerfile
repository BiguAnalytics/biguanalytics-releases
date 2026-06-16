FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev

COPY server ./

EXPOSE 8080
CMD ["npm", "run", "server"]
