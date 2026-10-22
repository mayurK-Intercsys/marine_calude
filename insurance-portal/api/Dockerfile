FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Migrations run on start; seed demo data once with: docker compose exec api npm run seed
CMD ["sh", "-c", "npx knex --knexfile knexfile.js migrate:latest && node src/server.js"]
