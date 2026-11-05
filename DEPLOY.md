# 하루들 월드 배포 절차 (MVP)

서버 한 대에 전부 올립니다. **하루들 DNS에 `world` 레코드 하나만 추가하고, 하루들 nginx, API, S3 설정은 바꾸지 않습니다.**

```
방문자 → world.harudle.com (Caddy: HTTPS)
          └─ 서버 컨테이너
              ├─ 웹사이트 파일
              ├─ 실시간 접속, 방명록, 문제, 릴레이 (SQLite)
              └─ /api/v1/feeds, /s3-image → 하루들에서 대신 받아 전달
```

## 1. 공개 전에 팀에서 정할 것

- [ ] 하루들 데이터를 이 서버가 대신 받아 전달한다는 점 공유 (모든 요청이 서버 IP 하나로 갑니다. 피드는 1분간 저장해 줄입니다)
- [ ] 작가 동의: 피드 작품 전시, 작가별 방, 공개 방명록, 그림 속 게임(현재 `성실한 매` 작가의 '체리의 최애 요리')
- [ ] 노래 가사와 대사가 들어간 사용자 문제의 저작권 방침
- [ ] 악성 글 대응 담당자 (아래 6번)
- [ ] 개인정보: IP는 횟수 제한에만 쓰고 DB에 저장하지 않습니다. 닉네임과 글, 게임 점수는 저장되고 공개됩니다. 채팅도 공간별로 30일 동안 저장되고 나중에 온 사람에게 최근 30개가 보입니다.

## 2. 서버 (AWS Lightsail)

항상 켜져 있고(웹소켓) 디스크가 남아야(SQLite) 해서 잠드는 호스팅은 맞지 않습니다.

아래 서버가 만들어져 있습니다. 계정 정보는 팀 내부에서만 공유합니다.

- 이름: `harudle-world`, 태그: `Project` = `harudle`
- 리전: 도쿄 (ap-northeast-1a), 블루프린트: Amazon Linux 2023
- 요금제: 월 $7, 듀얼 스택, 메모리 1GB, vCPU 2개, SSD 40GB, 전송량 2TB. 느려지면 스냅샷으로 $12(2GB)에 옮깁니다. 작은 요금제로는 옮길 수 없습니다.
- 고정 IP: `harudle-world-ip`. 서버를 지울 때 함께 지웁니다. 연결하지 않은 고정 IP는 요금이 나옵니다.

새로 만들 때도 같은 값을 쓰고, 이어서 아래를 진행합니다.

1. Networking 탭의 IPv4 방화벽에 규칙을 추가합니다. SSH(22)와 HTTP(80)는 기본으로 열려 있습니다.
   - HTTPS: TCP 443
   - Custom: UDP 443 (HTTP/3)
2. Account → SSH keys에서 도쿄 리전 기본 키를 내려받아 옮깁니다. 키 내용은 누구에게도 보내지 않습니다.
   ```bash
   mkdir -p ~/.ssh && mv ~/Downloads/LightsailDefaultKey-ap-northeast-1.pem ~/.ssh/harudle-world.pem && chmod 400 ~/.ssh/harudle-world.pem
   ```
3. 접속합니다.
   ```bash
   ssh -i ~/.ssh/harudle-world.pem ec2-user@고정IP
   ```
4. 메모리가 1GB라 빌드 중 모자라지 않도록 서버에 스왑을 만듭니다.
   ```bash
   sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   ```
   ```bash
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

서버가 망가지면 데이터도 사라지므로 **백업을 다른 곳에도 복사**해 두세요. 전송량 2TB를 넘으면 초과분에 요금이 붙습니다. 디스크가 차면 오래된 이미지를 `docker image prune`, `docker builder prune`으로 정리합니다.

## 3. 주소 연결하기 (world.harudle.com)

1. 가비아 DNS 관리에서 `harudle.com`에 레코드를 **추가**합니다. 기존 레코드는 건드리지 않습니다.
   - 타입: A
   - 호스트: `world`
   - 값: 서버 고정 IP
   - TTL: 600
2. 몇 분 뒤 확인합니다. 서버 고정 IP가 나오면 됩니다. 인증서 발급에 필요하므로 **배포 전에** 확인합니다.
   ```bash
   dig +short world.harudle.com
   ```

## 4. 올리기

1. 서버에 Docker와 rsync를 설치합니다. Amazon Linux의 Docker 패키지에는 Compose가 없고 Buildx가 오래되어 따로 받습니다. 설치 후 다시 접속합니다.
   ```bash
   sudo dnf install -y docker rsync cronie && sudo systemctl enable --now docker crond && sudo usermod -aG docker ec2-user
   ```
   ```bash
   BUILDX=$(curl -fsSL -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed 's#.*/##') && sudo mkdir -p /usr/local/lib/docker/cli-plugins && sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose && sudo curl -fsSL "https://github.com/docker/buildx/releases/download/$BUILDX/buildx-$BUILDX.linux-amd64" -o /usr/local/lib/docker/cli-plugins/docker-buildx && sudo chmod +x /usr/local/lib/docker/cli-plugins/*
   ```
2. 로컬에서 코드를 복사합니다.
   ```bash
   rsync -az -e "ssh -i ~/.ssh/harudle-world.pem" --exclude .git --exclude node_modules --exclude dist --exclude .data ./ ec2-user@서버IP:~/harudle-world/
   ```
3. 서버에서 설정하고 배포합니다. 처음에는 빌드에 몇 분 걸립니다.
   ```bash
   cd ~/harudle-world/deploy
   cp .env.example .env
   ./deploy.sh
   ```
4. 브라우저에서 `https://world.harudle.com`을 엽니다. 인증서 발급에 잠시 걸릴 수 있습니다.

로컬의 `.data/` 테스트 글은 올리지 않습니다. 서버는 빈 DB로 시작합니다.

## 5. 공개 후 확인

- [ ] 로비가 뜨고 신문 가판대에 어제의 인기 만화가 나온다
- [ ] 전시관 액자에 만화 그림이 보인다
- [ ] 두 기기로 접속해 서로 보이고 닉네임이 뜬다
- [ ] 방명록 글쓰기와 삭제
- [ ] 오락실 문제 등록, 정답, 닉네임 표시, 비밀번호로 내리기
- [ ] 소설관 올리기, 뷰어, 비밀번호로 내리기
- [ ] 실제 휴대폰(iPhone Safari, Android Chrome)에서 조이스틱과 프레임

테스트로 올린 글은 공개 전에 지웁니다.

## 6. 운영

서버의 `deploy` 폴더에서 실행합니다.

**무중단 업데이트:** 각자 컴퓨터에서 서버로 복사하지 않습니다. 다른 사람이 배포한 기능을 덮어쓰게 됩니다. PR이 승인되어 `main`에 합쳐지면 자동으로 배포됩니다. 문서(`.md`)만 바꾼 커밋은 배포하지 않습니다.
- 자동 배포는 합쳐진 코드를 다시 검사하고 데이터를 백업한 뒤 무중단으로 배포합니다.
- 여러 PR이 합쳐져도 차례로 돕니다. 기다리는 배포는 가장 최근 것만 남고, 그 안에 앞선 PR의 코드도 들어 있습니다. 서버에서 `./deploy.sh`를 직접 실행하는 경우에도 잠금으로 겹치지 않습니다.
- 문제가 생기면 Actions → 배포 → Run workflow에서 `rollback`을 고릅니다. 데이터를 백업하고 직전 버전으로 되돌립니다. `main`에는 문제의 코드가 남아 있으므로, 다음 PR이 합쳐지기 전에 되돌리는 PR을 합칩니다.
- 같은 화면의 `deploy`는 `main` 코드를 다시 배포합니다.
- GitHub의 `production` 환경에 비밀값을 둡니다: `DEPLOY_SSH_KEY`(배포 전용 키), `DEPLOY_KNOWN_HOSTS`(서버 지문), `DEPLOY_HOST`(서버 고정 IP). 이 환경은 `main`에서만 쓸 수 있게 제한합니다. 값은 코드나 PR에 적지 않습니다.

새 버전을 다른 색(파랑/초록)으로 띄워 상태 확인을 통과해야 트래픽을 옮기고, 통과하지 못하면 기존 버전을 그대로 둡니다. 데이터는 볼륨에 남습니다.

- 웹 요청은 끊기지 않습니다. 접속 중인 방문자의 실시간 연결은 재접속 신호를 받아 곧바로 다시 붙고, 그동안 다른 방문자가 잠깐 깜빡이거나 접속자 수가 잠깐 줄 수 있습니다.
- 이미 열어 둔 화면은 새로 고침해야 새 기능이 보입니다.
- **DB 표를 바꾸는 기능은 조심합니다.** 잠깐 두 버전이 같은 DB를 쓰고 되돌리기도 가능해야 하므로, 칸은 추가만 하고 지우는 것은 다음 배포로 미룹니다.
- 메모리에 있는 횟수 제한은 배포 때 초기화됩니다.

**상태와 로그:**
```bash
docker compose ps
docker compose logs -f "world-$(cat .active-color)"
```

**백업:** 하루 한 번 돌리기를 권합니다. `crontab -e`에 추가합니다. 서버가 망가지면 같이 사라지므로 백업 파일은 다른 곳에도 복사합니다.
```
0 4 * * * /home/ec2-user/harudle-world/deploy/backup.sh
```

**메타모아 접속자 수:** 두 가지 방법이 있고, 어느 쪽이든 이용자 정보 없이 숫자만 나갑니다.
- 등록 신청의 「접속자 수 API」 칸(live_api)에 `https://world.harudle.com/api/online`을 넣습니다. 숫자 하나만 돌려줍니다.
- 소유자 확인 후 키를 받았다면 서버의 `deploy/.env`에 `METAMOA_SPACE_ID`와 `METAMOA_KEY`를 적고 `./deploy.sh`를 실행합니다. 10분마다 보내고, 실패하면 로그에 상태 코드만 남깁니다. 키는 다른 곳에 올리거나 보내지 않습니다.
- 세는 기준: 모든 공간 합계에서 최근 3분 안에 화면이 위치 신호를 보낸 일반 브라우저만 셉니다. 숨긴 탭, 봇, 테스트 도구는 빠지므로 화면의 접속자 수보다 적을 수 있습니다. 공간에 들어가기 전 로비에 있는 사람은 세지 않습니다.

**글 강제 삭제와 복구:** 관리자 화면이 없어서 DB를 직접 고칩니다. 비밀번호를 잊은 글도 이렇게 지웁니다.
```bash
docker compose exec "world-$(cat .active-color)" node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/quizzes.db');
console.table(db.prepare('SELECT id, room, feed_id, reports, hidden FROM user_quizzes').all());
"
```
- 사용자 문제: `/data/quizzes.db` — `user_quizzes`, 맞힌 사람은 `quiz_solvers`
- 릴레이: `/data/relay.db` — `relay_episodes`
- 방명록: `/data/cheers.db` — `cheers`
- 채팅: `/data/chats.db` — `chat_messages` (가리는 칸은 없으니 `DELETE`로 지웁니다)
- 게임 랭킹: `/data/crabgame.db` — `crab_scores` (식별 칸은 `rowid`입니다. 나쁜 닉네임이나 부정 기록은 `UPDATE crab_scores SET hidden = 1 WHERE rowid = 번호`로 가립니다)
- 가리기: `UPDATE 표 SET hidden = 1 WHERE id = 번호`, 되돌리기: `hidden = 0`
- 지우기: `DELETE FROM 표 WHERE id = 번호` (문제는 `quiz_solvers`도 함께)

## 7. 한계

- 서버는 한 대만 돌립니다. 위치 정보와 횟수 제한이 메모리에, 글이 SQLite 파일에 있어 여러 대로 나눌 수 없습니다. 이 서버가 멈추면 사이트 전체가 멈춥니다.
- 100명이 다 움직이면 실시간 전송량이 초당 약 2.8MB입니다(봇 99명 측정). 들어오고 나가는 양이 모두 2TB 전송량에 포함되니 콘솔의 Metrics 탭에서 사용량을 지켜보세요. CPU를 오래 많이 쓰면 버스트 한도 때문에 느려질 수 있고, 그때는 $12로 올립니다.
- 하루들이 서버 IP를 막거나 API를 바꾸면 전시관 작품이 나오지 않습니다.
- 로그인이 없어서 남의 만화 등록과 닉네임 사칭은 막지 못합니다.
- 게임 랭킹은 서버가 조작 기록을 다시 돌려 점수를 계산하므로 숫자만 바꾼 가짜 점수는 막습니다. 다만 프로그램으로 조작을 만든 자동 플레이는 구별하지 못하고, 브라우저 저장소를 지우면 새 사람으로 셉니다. 이상한 기록은 위 방법으로 가립니다.
