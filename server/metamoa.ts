const REPORT_INTERVAL_MS = 10 * 60_000
const TIMEOUT_MS = 10_000

export type MetamoaReportOptions = {
  spaceId: string
  key: string
  baseUrl?: string
  intervalMs?: number
  count: () => number
}

/**
 * 메타모아에 지금 접속자 수를 10분마다 보낸다. 숫자만 보내고 이용자 정보는 보내지 않는다.
 * 재배포 직후에는 사람들이 다시 붙는 중이고 9분 안에 또 보내면 거절되므로, 첫 전송도 10분 뒤에 한다.
 * 실패해도 사이트에는 영향이 없도록 기록만 남기고 다음 차례에 다시 보낸다.
 */
export function startMetamoaReport({ spaceId, key, baseUrl = 'https://metamoa.com', intervalMs = REPORT_INTERVAL_MS, count }: MetamoaReportOptions) {
  const url = `${baseUrl}/api/live/${encodeURIComponent(spaceId)}`
  const report = async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: count() }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) console.error(`메타모아 접속자 수 전송 실패: ${response.status}`)
    } catch (error) {
      console.error('메타모아 접속자 수 전송 실패', error instanceof Error ? error.message : error)
    }
  }
  const timer = setInterval(report, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
