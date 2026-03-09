# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist/ ./dist/
COPY repos.json ./

ENV TRANSPORT=http
ENV PORT=3200
ENV HOST=0.0.0.0

EXPOSE 3200

CMD ["node", "dist/index.js"]
