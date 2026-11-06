import { createServer } from 'node:http'
import { createChatLog } from './chatLog.ts'
import { createEaselStore } from './easelStore.ts'
import { createCheersHandler } from './cheers.ts'
import { createHarudleProxy } from './harudleProxy.ts'
import { createCrabRankingHandler } from './crabRanking.ts'
import { startMetamoaReport } from './metamoa.ts'
import { createQuizzesHandler } from './quizzes.ts'
import { attachRealtime } from './realtime.ts'
import { createRelayHandler } from './relay.ts'
import { createStaticSite } from './staticSite.ts'

const port = Number(process.env.PORT ?? 8787)
const maxPlayers = Number(process.env.MAX_PLAYERS ?? 150)
// 프로모션 사이트 도메인을 쉼표로 구분해 넣는다. 비어 있으면 브라우저 접속을 모두 거절한다.
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const isOriginAllowed = (origin: string | undefined) => origin !== undefined && allowedOrigins.has(origin)

const cheers = createCheersHandler({
  databasePath: process.env.CHEERS_DB_PATH ?? '.data/cheers.db',
  isOriginAllowed,
  trustProxy: process.env.TRUST_PROXY === '1',
})

const quizzes = createQuizzesHandler({
  databasePath: process.env.QUIZZES_DB_PATH ?? '.data/quizzes.db',
  isOriginAllowed,
  trustProxy: process.env.TRUST_PROXY === '1',
  harudleBaseUrl: process.env.HARUDLE_BASE_URL,
})

const relay = createRelayHandler({
  databasePath: process.env.RELAY_DB_PATH ?? '.data/relay.db',
  isOriginAllowed,
  trustProxy: process.env.TRUST_PROXY === '1',
  harudleBaseUrl: process.env.HARUDLE_BASE_URL,
})

const crabRanking = createCrabRankingHandler({
  databasePath: process.env.CRAB_GAME_DB_PATH ?? '.data/crabgame.db',
  isOriginAllowed,
  trustProxy: process.env.TRUST_PROXY === '1',
})

const chatLog = createChatLog(process.env.CHATS_DB_PATH ?? '.data/chats.db')
const easelStore = createEaselStore(process.env.EASEL_DB_PATH ?? '.data/easel.db')

const proxyHarudle = createHarudleProxy({ trustProxy: process.env.TRUST_PROXY === '1' })
// SITE_DIR가 있으면 웹사이트도 이 서버가 함께 내준다.
const serveSite = process.env.SITE_DIR ? createStaticSite(process.env.SITE_DIR) : null

const server = createServer((request, response) => {
  if (cheers.handle(request, response) || quizzes.handle(request, response) || relay.handle(request, response) || crabRanking.handle(request, response) || easelStore.handle(request, response)) return
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true, players: realtime.playerCount() }))
    return
  }
  // 메타모아 같은 바깥 서비스가 읽어 가는 지금 접속자 수. 숫자 하나만 돌려준다.
  if (request.url === '/api/online' && (request.method === 'GET' || request.method === 'HEAD')) {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
    response.end(String(realtime.liveCount()))
    return
  }
  if (proxyHarudle(request, response) || serveSite?.(request, response)) return
  response.writeHead(404).end()
})

const realtime = attachRealtime(server, {
  path: '/ws',
  maxPlayers,
  isOriginAllowed,
  chatLog,
  easelStore,
})

// 공간 ID와 키를 모두 넣은 서버에서만 메타모아로 보낸다.
const metamoaSpaceId = process.env.METAMOA_SPACE_ID
const metamoaKey = process.env.METAMOA_KEY
const stopMetamoaReport =
  metamoaSpaceId && metamoaKey
    ? startMetamoaReport({ spaceId: metamoaSpaceId, key: metamoaKey, count: realtime.liveCount })
    : null

server.on('upgrade', (request, socket) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  if (pathname !== '/ws') socket.destroy()
})

// 재배포 때 새 요청을 멈추고 진행 중인 요청을 마친 뒤 DB를 닫고 끝낸다.
const SHUTDOWN_TIMEOUT_MS = 10_000
let shuttingDown = false
const shutdown = () => {
  if (shuttingDown) return
  shuttingDown = true
  setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref()
  stopMetamoaReport?.()
  // 웹소켓을 먼저 닫아야 server.close가 끝난다. 접속자는 재접속 신호를 받는다.
  realtime.close()
  server.close(() => {
    cheers.close()
    quizzes.close()
    relay.close()
    crabRanking.close()
    chatLog.close()
    easelStore.close()
    process.exit(0)
  })
  server.closeIdleConnections()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.listen(port, () => {
  console.log(`realtime server on :${port}, max ${maxPlayers} players, origins: ${[...allowedOrigins].join(', ') || '(none)'}`)
})
