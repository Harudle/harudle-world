# 웹사이트와 서버(실시간, 방명록, 문제, 릴레이, 하루들 전달)를 이미지 하나로 묶는다.
FROM node:22-slim AS site
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 서버가 아바타 검증과 공간 크기를 src에서 함께 쓴다.
COPY server ./server
COPY src ./src
COPY --from=site /app/dist ./dist

RUN mkdir -p /data && chown node:node /data
USER node

ENV PORT=8787
ENV SITE_DIR=/app/dist
ENV CHEERS_DB_PATH=/data/cheers.db
ENV QUIZZES_DB_PATH=/data/quizzes.db
ENV RELAY_DB_PATH=/data/relay.db
ENV CHATS_DB_PATH=/data/chats.db
ENV CRAB_GAME_DB_PATH=/data/crabgame.db
EXPOSE 8787
VOLUME /data

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=6 \
  CMD node -e "fetch('http://localhost:8787/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
