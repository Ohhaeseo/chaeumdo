# 채움도 운영 배포 가이드

현재 운영 구성은 `frontend(Nginx) → backend(Spring Boot) → db(PostgreSQL)` 구조입니다. 사용자 사진은 별도 Docker 볼륨에, 여행 데이터는 PostgreSQL 볼륨에 보존됩니다.

## 준비

- Docker Engine과 Docker Compose v2
- 서비스 도메인
- 도메인에 연결된 HTTPS 리버스 프록시 또는 로드 밸런서

저장소 루트에서 환경 파일을 만들고 비밀번호를 반드시 교체합니다.

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d
```

애플리케이션 컨테이너는 기본적으로 호스트의 80번 포트에 노출됩니다. 실제 운영에서는 Cloudflare, Caddy, Nginx 또는 클라우드 로드 밸런서에서 HTTPS를 종료하고 이 포트로 전달하세요. 운영 프로필은 세션 쿠키에 `Secure`, `HttpOnly`, `SameSite=Strict`를 적용하므로 HTTPS가 필수입니다.

## 배포 확인

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
curl -fsS http://127.0.0.1/healthz
docker compose --env-file .env.production -f compose.production.yaml exec backend \
  curl -fsS http://127.0.0.1:8080/actuator/health/readiness
```

브라우저에서는 로그인, 지도 진입, 시·도 상세 지도, 여행 사진 등록·재조회 순서로 확인합니다. 지도 경계 파일은 `/data/map/boundaries.json`에서 별도 캐시되며 17개 시·도와 250개 시·군·구를 포함해야 합니다.

## 백업과 복구

- PostgreSQL: `pg_dump`를 이용해 매일 백업하고 다른 저장소에 보관합니다.
- 사진: `media-data` 볼륨을 PostgreSQL 백업과 같은 시점에 스냅샷으로 보관합니다.
- 복구 훈련: 최소 월 1회 별도 환경에서 DB와 사진을 함께 복원합니다.

사진과 데이터베이스 백업 시점이 다르면 기록은 있지만 사진이 없는 상태가 생길 수 있습니다. 두 볼륨은 하나의 백업 단위로 취급하세요.

## 배포 전 필수 체크

- `.env.production`이 Git에 포함되지 않았는지 확인
- HTTPS 및 실제 도메인 확인
- 신규 계정 생성과 재로그인 확인
- 15MB 사진 업로드와 삭제 확인
- 전국 지도 및 서울을 포함한 시·도 상세 지도 확인
- 컨테이너 재시작 후 여행 기록과 사진이 유지되는지 확인
- 데이터베이스 및 사진 복구 테스트 완료
