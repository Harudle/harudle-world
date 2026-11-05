import type { Server } from 'node:http'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createChatLog } from './server/chatLog.ts'
import { createCheersHandler } from './server/cheers.ts'
import { createCrabRankingHandler } from './server/crabRanking.ts'
import { createQuizzesHandler } from './server/quizzes.ts'
import { attachRealtime, isLocalOrigin } from './server/realtime.ts'
import { createRelayHandler } from './server/relay.ts'

/** `npm run dev`와 `npm run preview` 하나로 실시간 서버와 방명록까지 함께 띄운다. */
function realtimePlugin(): Plugin {
  const options = { path: '/ws', maxPlayers: 150, isOriginAllowed: isLocalOrigin }
  const attach = (server: PreviewServer | ViteDevServer) => {
    if (!server.httpServer) return
    const chatLog = createChatLog('.data/chats.db')
    attachRealtime(server.httpServer as Server, { ...options, chatLog })
    const cheers = createCheersHandler({ databasePath: '.data/cheers.db', isOriginAllowed: isLocalOrigin })
    const quizzes = createQuizzesHandler({ databasePath: '.data/quizzes.db', isOriginAllowed: isLocalOrigin })
    const relay = createRelayHandler({ databasePath: '.data/relay.db', isOriginAllowed: isLocalOrigin })
    const crabRanking = createCrabRankingHandler({ databasePath: '.data/crabgame.db', isOriginAllowed: isLocalOrigin })
    server.middlewares.use((request, response, next) => {
      if (!cheers.handle(request, response) && !quizzes.handle(request, response) && !relay.handle(request, response) && !crabRanking.handle(request, response)) next()
    })
    server.httpServer.once('close', () => {
      cheers.close()
      quizzes.close()
      relay.close()
      crabRanking.close()
      chatLog.close()
    })
  }
  return {
    name: 'harudle-realtime',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

// 하루들 API와 S3 CORS가 harudle.com만 허용하므로 로컬에서는 프록시로 받는다. 배포 서버는 server/harudleProxy.ts가 맡는다.
const proxy = {
  '/api': {
    target: 'https://www.harudle.com',
    changeOrigin: true,
  },
  '/s3-image': {
    target: 'https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/s3-image/, ''),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), realtimePlugin()],
  server: {
    port: 5174,
    strictPort: true,
    proxy,
  },
  preview: { proxy },
})
