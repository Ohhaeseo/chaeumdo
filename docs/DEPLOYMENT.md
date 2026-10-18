# 채움도 운영 배포 가이드

현재 운영 구성은 `caddy(HTTPS) → frontend(Nginx) → backend(Spring Boot) → db(PostgreSQL)` 구조입니다. 사용자 사진은 별도 Docker 볼륨에, 여행 데이터는 PostgreSQL 볼륨에 보존됩니다.

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

- PostgreSQL: `pg_dump`를 이용해 매일 백업하고 다른 저장소에 보관합니다.
- 사진: `media-data` 볼륨을 PostgreSQL 백업과 같은 시점에 스냅샷으로 보관합니다.
- 복구 훈련: 최소 월 1회 별도 환경에서 DB와 사진을 함께 복원합니다.

사진과 데이터베이스 백업 시점이 다르면 기록은 있지만 사진이 없는 상태가 생길 수 있습니다. 두 볼륨은 하나의 백업 단위로 취급하세요.

## 배포 전 필수 체크

- `.env.production`이 Git에 포함되지 않았는지 확인
- HTTPS 및 실제 도메인 확인 (HTTP 접속이 HTTPS로 이동하는지 포함)
- 신규 계정 생성과 재로그인 확인
- 15MB 사진 업로드와 삭제 확인
- 전국 지도 및 서울을 포함한 시·도 상세 지도 확인
- 컨테이너 재시작 후 여행 기록과 사진이 유지되는지 확인
- 데이터베이스 및 사진 복구 테스트 완료
