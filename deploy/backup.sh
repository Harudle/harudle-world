#!/bin/sh
# DB 다섯 개를 안전하게 복사해 ./backups에 저장한다. cron으로 하루 한 번 돌리면 된다.
set -eu
cd "$(dirname "$0")"
stamp=$(date +%Y%m%d-%H%M%S)
service="world-$(cat .active-color)"
compose() {
  docker compose --env-file "${ENV_FILE:-.env}" "$@"
}
mkdir -p backups
compose exec -T "$service" node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
for (const name of ['cheers', 'quizzes', 'relay', 'chats', 'crabgame']) {
  const db = new DatabaseSync('/data/' + name + '.db');
  db.exec(\"VACUUM INTO '/tmp/\" + name + \".db'\");
  db.close();
}
"
for name in cheers quizzes relay chats crabgame; do
  compose cp "$service:/tmp/$name.db" "backups/$name-$stamp.db"
  compose exec -T "$service" rm -f "/tmp/$name.db"
done
# 14일 지난 백업은 지운다.
find backups -name '*.db' -mtime +14 -delete
echo "backups/*-$stamp.db"
