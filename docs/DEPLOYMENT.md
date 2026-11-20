# 채움도 운영 배포 가이드

현재 운영 구성은 `caddy(HTTPS) → frontend(Nginx) → backend(Spring Boot) → db(PostgreSQL)` 구조이고, `backup` 서비스가 매일 DB와 사진을 함께 백업합니다. 사용자 사진은 별도 Docker 볼륨에, 여행 데이터는 PostgreSQL 볼륨에 보존됩니다. 모든 서비스의 컨테이너 로그는 10MB씩 5개까지만 남습니다(`compose.production.yaml`의 `x-logging`).

## 준비

- Docker Engine과 Docker Compose v2
- 서비스 도메인. DNS A/AAAA 레코드가 이 서버를 가리켜야 합니다.
- 인터넷에서 이 서버의 80·443 포트로 접속할 수 있어야 합니다. Caddy가 인증서를 받을 때 80번을 사용합니다.

저장소 루트에서 환경 파일을 만들고 `POSTGRES_PASSWORD`와 `DOMAIN`을 반드시 교체합니다.

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d
```

호스트에는 Caddy만 80·443 포트를 엽니다. Caddy는 `DOMAIN`의 인증서를 자동으로 발급·갱신하고, HTTP 요청을 HTTPS로 돌리며, HSTS 헤더를 붙입니다. 인증서는 `caddy-data` 볼륨에 보관되므로 이 볼륨을 지우면 재발급이 일어나고, 반복하면 인증 기관의 발급 한도에 걸릴 수 있습니다. 설정은 저장소 루트의 `Caddyfile`입니다.

운영 프로필은 세션 쿠키에 항상 `Secure`, `HttpOnly`, `SameSite=Strict`를 적용하므로 HTTPS가 필수입니다. 앞단 프록시가 보낸 `X-Forwarded-Proto`는 Nginx가 그대로 백엔드에 전달합니다.

### 지도 타일과 장소 검색 공급자

기본값은 OpenStreetMap 공개 타일 서버와 Photon 공개 검색 서버입니다. 두 서버의 이용 정책은 대량 트래픽이나 공개 서비스를 받지 않으므로, 공개 전에 공급자를 정해 `.env.production`에 넣고 프론트 이미지를 다시 빌드합니다(`build` 후 `up -d`).

| 변수 | 의미 |
|---|---|
| `MAP_TILE_URL` | 래스터 XYZ 타일 주소. `{z}`, `{x}`, `{y}`를 채워 씁니다. 예: VWorld 배경지도 `https://api.vworld.kr/req/wmts/1.0.0/<인증키>/Base/{z}/{y}/{x}.png` |
| `MAP_ATTRIBUTION`, `MAP_ATTRIBUTION_URL` | 상세 지도 오른쪽 아래의 출처 문구와 링크 |
| `PLACE_SEARCH_URL` | Photon과 같은 형식의 검색 API(`/api?q=`). 직접 띄운 Photon 서버가 해당합니다. |
| `PLACE_SEARCH_ATTRIBUTION`, `PLACE_SEARCH_ATTRIBUTION_URL` | 장소 검색 결과 아래의 출처 문구와 링크 |

값은 빌드할 때 앱에 들어갑니다. 브라우저가 이 공급자에만 접속하도록 Content-Security-Policy의 `img-src`·`connect-src`도 같은 주소로 바뀝니다. 비워 두면 기본값을 씁니다. 카카오·네이버처럼 자체 지도 SDK가 필요한 공급자, 그리고 검색 응답 형식이 Photon과 다른 공급자는 코드 수정이 필요합니다(`frontend/src/providers.ts`, `placeSearch.ts`).

### 비밀번호 재설정 메일

로그인 화면의 "이메일로 찾기"는 계정에 등록된 이메일로 아이디와 30분짜리 재설정 링크를 보냅니다. 링크는 `https://DOMAIN/reset-password#token=…` 형식입니다(`PUBLIC_URL`은 compose가 `DOMAIN`으로 채웁니다). 메일 발송 서비스(SMTP)를 정해 `.env.production`에 넣습니다.

| 변수 | 의미 |
|---|---|
| `MAIL_HOST`, `MAIL_PORT` | SMTP 서버와 포트(기본 587, STARTTLS) |
| `MAIL_USERNAME`, `MAIL_PASSWORD` | SMTP 인증 정보 |
| `MAIL_FROM` | 보내는 주소. 비우면 `no-reply@DOMAIN` |

- `MAIL_HOST`가 없으면 운영에서는 메일을 보내지 않고 "이메일로 찾기"가 503을 돌려줍니다. 개발 실행(기본 프로필)은 메일을 서버 로그에 남깁니다.
- 받는 쪽 스팸함에 빠지지 않도록 보내는 도메인의 SPF·DKIM 설정을 메일 서비스 안내대로 해 주세요.
- 같은 계정에는 5분에 한 번만 보냅니다. 응답은 계정이 있든 없든 같아서, 이 화면으로 가입 여부를 알 수 없습니다.

### 이용약관과 개인정보처리방침

`frontend/src/legal.ts`에 초안이 있고 `/terms`, `/privacy`에서 보입니다. 가입할 때 "(필수) 만 14세 이상이며 이용약관과 개인정보처리방침에 동의합니다"를 받아, 동의 시각과 `TERMS_VERSION`을 계정에 기록합니다.

- 공개 전에 `{{…}}` 빈칸(운영자명, 보호책임자, 위탁 업체, 국외 이전, 관할 법원, 시행일 등)을 채우고 법률 검토를 받습니다. 빈칸이 남아 있으면 문서 위에 "초안" 안내가 보입니다.
- 지도·검색·메일 공급자를 바꾸면 처리방침 6항(위탁·외부 서비스)도 같이 고칩니다.
- 문서를 고치면 `TERMS_VERSION`을 바꿉니다. 약관이 생기기 전에 가입한 계정에는 동의 기록이 없습니다.

### 사진 처리 한도와 정리

- 서버는 JPEG·PNG, 15MB, 2,500만 화소까지 받습니다. 웹 앱은 긴 변 2048px로 줄여서 올립니다.
- 한 번에 디코딩하는 사진은 2장까지입니다(`app.photo-decode-concurrency`). 나머지 업로드는 최대 30초 기다리고, 그래도 차례가 오지 않으면 503을 받습니다. 장당 메모리를 100MB 안쪽으로 잡았으므로 1GB 메모리 서버에서도 동시 업로드로 메모리가 바닥나지 않습니다.
- 백엔드는 시작 10분 뒤부터 6시간마다, 24시간이 넘도록 어디에도 연결되지 않은 사진과 DB 행이 없는 사진 파일을 지웁니다(`PhotoJanitor`). 기록 저장을 마치지 않고 떠난 업로드 등이 여기에 해당합니다. 정리할 것이 있으면 `Removed N unlinked photos and M stray media files` 로그가 남습니다.

Cloudflare나 클라우드 로드 밸런서에서 HTTPS를 끝내려면 `caddy` 서비스를 빼고 `frontend`에 포트(`"80:8080"`)를 열어 그쪽으로 전달하세요. 이때는 아래 요청 속도 제한 설명도 확인하세요.

### 요청 속도 제한

프론트 Nginx는 POST 요청만 클라이언트 IP별로 제한하고, 초과하면 429를 돌려줍니다.

| 대상 | 한도 |
|---|---|
| `/api/auth/*` (로그인·가입·복구·삭제) | 분당 10회, 버스트 10 |
| `POST /api/photos` | 분당 60회, 버스트 30 |

클라이언트 IP는 같은 호스트나 Docker 네트워크(사설 대역)의 프록시가 보낸 `X-Forwarded-For`에서 읽습니다. 기본 구성의 Caddy가 여기에 해당합니다. Cloudflare처럼 공인 IP의 프록시가 Nginx에 직접 연결하면 모든 사용자가 프록시 IP 하나로 묶이므로, `frontend/nginx.conf`의 `set_real_ip_from`에 해당 공급자의 IP 대역을 추가하세요.

## 배포 확인

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
curl -fsS https://chaeummdo.example.com/healthz
curl -sI http://chaeummdo.example.com/ | head -1   # 308 → HTTPS 이동
docker compose --env-file .env.production -f compose.production.yaml exec frontend nginx -t
docker compose --env-file .env.production -f compose.production.yaml exec backend \
  curl -fsS http://127.0.0.1:8080/actuator/health/readiness
```

도메인은 `DOMAIN` 값으로 바꿔 실행합니다. 브라우저에서는 로그인, 지도 진입, 시·도 상세 지도, 여행 사진 등록·재조회 순서로 확인합니다. 지도 경계 파일은 `/data/map/boundaries.json`에서 별도 캐시되며 17개 시·도와 250개 시·군·구를 포함해야 합니다.

캐시 정책은 다음과 같습니다. `index.html`은 매번 재검증(`no-cache`)하므로 새 배포가 바로 반영됩니다. 해시가 붙은 `/assets/`는 1년, 지도 경계는 1시간, 글꼴은 30일 캐시합니다. 보안 헤더는 `frontend/nginx-security-headers.conf` 하나에서 관리하며, 캐시 헤더를 지정한 위치에도 다시 포함됩니다. Caddy를 거친 요청에는 `Via` 헤더가 붙는데, nginx는 기본적으로 이런 요청을 압축하지 않습니다. 그래서 `gzip_proxied any`로 압축을 켭니다(예: 지도 경계 662KB → 247KB).

## 백업과 복구

`backup` 서비스(`scripts/backup.sh`)는 백엔드가 정상 기동한 뒤 시작하며, 시작할 때 한 번, 그 뒤 24시간마다 백업합니다. 백엔드보다 먼저 사진 볼륨을 마운트하면 Docker가 볼륨을 root 소유로 만들어 백엔드가 사진을 저장하지 못하기 때문입니다. 백엔드는 사진 폴더에 쓸 수 없으면 시작하지 않고 로그에 이유를 남깁니다. 백업 한 번은 호스트의 `BACKUP_DIR`(기본 `./backups`) 아래 UTC 시각 이름의 폴더 하나입니다.

| 파일 | 내용 |
|---|---|
| `db.dump` | `pg_dump` custom 형식 |
| `media.tar.gz` | 원본과 썸네일 사진 전부 |
| `SHA256SUMS` | 두 파일의 체크섬 |

- **한 쌍으로 보관**: DB를 먼저 덤프하고 사진을 묶습니다. 그 사이에 올라온 사진은 쓰이지 않는 파일로만 더해집니다. 기록은 있는데 사진이 없는 상태는 그 사이에 사진을 지운 경우에만 생기고, 새벽에는 거의 없습니다.
- **보관 기간**: `BACKUP_KEEP_DAYS`(기본 14일)가 지난 폴더는 지웁니다. 가장 최근 백업은 남깁니다. 만드는 중인 폴더는 이름이 `.…partial`이라 덜 된 백업과 섞이지 않습니다.
- **서버 밖에 복사**: 백업은 같은 서버의 디스크에 있으므로 서버나 디스크를 잃으면 함께 사라집니다. `BACKUP_DIR`을 매일 다른 저장소(오브젝트 스토리지, 다른 서버 등)로 복사하는 작업을 따로 두세요. 예: `rclone sync ./backups remote:chaeummdo-backups`
- **지금 바로 백업**: `docker compose --env-file .env.production -f compose.production.yaml exec backup sh /opt/backup.sh`
- **복구**: `scripts/restore.sh backups/<폴더>`
  1. 체크섬을 확인하고 `RESTORE` 입력을 받습니다.
  2. 백엔드와 백업 서비스를 멈춥니다.
  3. DB를 `pg_restore --clean`으로 덮어쓰고, 사진 볼륨을 비운 뒤 아카이브로 다시 채웁니다.
  4. 서비스를 다시 시작합니다. 백업 뒤에 생긴 데이터는 사라지므로, 지금 데이터가 중요하면 먼저 백업하세요.
- **복구 훈련**: 최소 월 1회 별도 환경에 복원해 로그인과 사진 조회까지 확인합니다. CI는 매 실행마다 백업 서비스가 만든 백업의 체크섬, `pg_restore --list`, 아카이브 목록을 확인합니다.

## 배포 전 필수 체크

- `.env.production`이 Git에 포함되지 않았는지 확인
- HTTPS 및 실제 도메인 확인 (HTTP 접속이 HTTPS로 이동하는지 포함)
- 신규 계정 생성과 재로그인 확인
- 15MB 사진 업로드와 삭제 확인
- 전국 지도 및 서울을 포함한 시·도 상세 지도 확인
- 컨테이너 재시작 후 여행 기록과 사진이 유지되는지 확인
- 데이터베이스 및 사진 복구 테스트 완료(`scripts/restore.sh`)
- `BACKUP_DIR`을 서버 밖 저장소로 매일 복사하는 작업 설정
- 지도 타일·장소 검색 공급자를 공개 서비스용으로 설정(`MAP_TILE_URL`, `PLACE_SEARCH_URL`)
- `backup` 서비스 로그에 `backup: …` 줄이 남는지 확인(`docker compose … logs backup`)
- 이용약관·개인정보처리방침의 빈칸을 채우고 법률 검토 완료, `TERMS_VERSION` 갱신
- SMTP 설정 후 "이메일로 찾기"로 재설정 메일이 실제로 도착하는지 확인
