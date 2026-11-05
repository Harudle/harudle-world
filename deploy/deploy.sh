#!/bin/sh
# 무중단 배포. 새 버전을 다른 색으로 띄우고, 정상이면 트래픽을 옮긴 뒤 이전 버전을 끈다.
#   ./deploy.sh           새 코드로 배포
#   ./deploy.sh rollback  다시 빌드하지 않고 직전 버전으로 되돌리기
set -eu
cd "$(dirname "$0")"

compose() {
  docker compose --env-file "${ENV_FILE:-.env}" "$@"
}

# 두 배포가 겹치면 트래픽 전환이 꼬이므로 하나가 끝날 때까지 다른 배포를 막는다.
exec 9>.deploy.lock
flock -n 9 || { echo "다른 배포가 진행 중입니다. 끝난 뒤 다시 실행하세요." >&2; exit 1; }

STATE_FILE=.active-color
HEALTH_TIMEOUT_SECONDS=60

active=$(cat "$STATE_FILE" 2>/dev/null || true)
if [ "$active" = "blue" ]; then next=green; else next=blue; fi

if [ "${1:-}" = "rollback" ]; then
  [ -n "$active" ] || { echo "되돌릴 이전 버전이 없습니다." >&2; exit 1; }
  docker image inspect "harudle-world:$next" >/dev/null 2>&1 || { echo "harudle-world:$next 이미지가 없습니다." >&2; exit 1; }
  echo "== 직전 버전($next)으로 되돌립니다"
  compose up -d --no-build --no-deps "world-$next"
else
  echo "== 새 버전을 $next 로 빌드합니다"
  compose build "world-$next"
  compose up -d --no-deps --force-recreate "world-$next"
fi

echo "== 상태 확인을 기다립니다"
container=$(compose ps -q "world-$next")
waited=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = "healthy" ]; do
  sleep 1
  waited=$((waited + 1))
  if [ "$waited" -ge "$HEALTH_TIMEOUT_SECONDS" ]; then
    echo "새 버전이 정상 상태가 되지 않았습니다. 트래픽은 그대로 $active 입니다." >&2
    compose logs --tail=30 "world-$next" >&2
    compose stop "world-$next"
    exit 1
  fi
done

echo "== 트래픽을 $next 로 옮깁니다"
cat > caddy/upstream.caddy <<UPSTREAM
reverse_proxy world-$next:8787 {
	lb_try_duration 5s
	stream_close_delay 2m
}
UPSTREAM
# 이미 돌고 있는 Caddy는 재시작하지 않고 설정만 다시 읽게 한다.
if [ -z "$(compose ps -q --status running caddy)" ]; then
  compose up -d --no-deps caddy
else
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
fi
echo "$next" > "$STATE_FILE"

if [ -n "$active" ]; then
  # 진행 중인 요청이 끝나길 기다렸다가 끈다. 접속 중인 방문자에게는 재접속 신호를 보낸다.
  sleep 2
  echo "== 이전 버전($active)을 끕니다"
  compose stop "world-$active"
fi
# 배포가 잦아도 디스크가 차지 않게 이름이 없어진 이미지와 오래된 빌드 캐시를 지운다. 되돌리기용 이미지는 남는다.
docker image prune -f >/dev/null || true
docker builder prune -f --filter until=168h >/dev/null || true
echo "== 완료: 지금 $next 가 서비스 중입니다"
