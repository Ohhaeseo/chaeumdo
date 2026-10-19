<div align="center">

# 🗺️ 채움도

### 여행의 순간으로 대한민국 지도를 채워가는 기록 서비스

사진과 장소, 동행자를 여행 지역과 함께 기록하고<br />
내가 다녀온 대한민국을 지도 위에서 한눈에 확인해 보세요.

**박정윤 기획**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111111)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4-6DB33F?logo=springboot&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)

</div>

---

## 채움도는

단순한 여행 목록 대신 **대한민국 지도 자체를 여행 앨범으로 만드는 서비스**입니다. 전국 17개 시·도에서 시·군·구, 읍·면·동까지 내려가 방문 지역을 선택하고 사진과 여행 일정을 연결할 수 있습니다.

> 어디부터 채워볼까요...

## 주요 기능

- **대한민국 여행 지도** — 실제 행정 경계를 기반으로 방문한 지역을 지도에서 확인합니다.
- **세밀한 지역 선택** — 17개 시·도, 250개 시·군·구, 3,627개 행정 읍·면·동을 지원합니다.
- **여러 지역을 하나의 여행으로** — 이동 순서대로 최대 10개 지역을 한 기록에 연결합니다.
- **사진 중심 기록** — 대표 사진과 DAY별 방문 장소 사진을 저장합니다.
- **일정과 동행자** — 여행 기간, 일자별 장소, 함께한 사람을 기록합니다.
- **장소 검색과 지도 핀** — Photon 검색과 OpenStreetMap 좌표를 이용해 방문 장소를 지도에 표시합니다.
- **최근 사진 지도** — 같은 지역에서는 가장 최근 여행의 대표 사진을 지도에 보여줍니다.
- **체험 모드** — 회원가입 없이 브라우저의 IndexedDB에 여행 기록을 저장할 수 있습니다.
- **계정 모드** — Spring Boot와 PostgreSQL을 이용해 계정과 기록을 서버에 보관합니다.

## 지역 구조

```text
대한민국
└─ 시·도
   └─ 시·군·구
      └─ 읍·면·동
```

읍·면·동에 기록한 여행은 상위 시·군·구와 시·도 지도, MY 통계에 자동으로 합산됩니다. 읍·면·동을 지정하지 않고 시·도 또는 시·군·구 전체로 기록하는 것도 가능합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 프론트 | React 19, TypeScript, Vite 7, Lucide React |
| 백엔드 | Java 21, Spring Boot 4, Spring JDBC, Validation |
| 데이터베이스 | PostgreSQL 17, Flyway |
| 로컬 저장 | IndexedDB |
| 지도 데이터 | 국가공간정보포털·V-World 기반 행정 경계. 제주 읍·면·동은 통계청 SGIS 행정동 경계(공공누리 제1유형), 가공 [vuski/admdongkor](https://github.com/vuski/admdongkor)(CC BY 4.0) |
| 장소 검색 | Photon, OpenStreetMap |

## 프로젝트 구조

```text
chaeummdo/
├─ frontend/              # React 웹 애플리케이션
├─ backend/               # Spring Boot API 서버
├─ scripts/               # 지도·행정동 데이터 생성 및 API 검증
├─ docs/                  # 기획, 디자인, DB, 지도, 검증 문서
├─ compose.yaml           # 로컬 PostgreSQL 구성
├─ compose.production.yaml # 운영 전체 구성
├─ SYSTEM.md              # 전체 시스템 명세
└─ README.md
```

## 빠르게 실행하기

### 1. 체험 모드

Node.js 22.12 이상을 권장합니다.

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173`을 열고 **로그인 없이 기기에서 체험하기**를 선택합니다. 체험 기록과 사진은 현재 브라우저에만 저장되며 브라우저 데이터를 지우면 함께 삭제됩니다.

### 2. 서버 모드

Java 21과 Docker가 필요합니다.

```powershell
# 프로젝트 루트
docker compose up -d db

cd backend
.\mvnw.cmd spring-boot:run
```

별도 터미널에서 프론트를 실행합니다.

```powershell
cd frontend
npm install
npm run dev
```

Vite는 `/api` 요청을 `http://127.0.0.1:8080`으로 프록시합니다. 서버 데이터는 PostgreSQL에, 업로드 사진은 기본적으로 `backend/.data/media`에 저장됩니다.

### 환경 변수

| 변수 | 설명 |
| --- | --- |
| `DB_URL` | PostgreSQL 연결 주소 |
| `DB_USER` | 데이터베이스 사용자 |
| `DB_PASSWORD` | 데이터베이스 비밀번호 |
| `MEDIA_ROOT` | 업로드 사진 저장 경로 |

## 검증

```powershell
cd frontend
npm test
npm run build

cd ../backend
.\mvnw.cmd test
```

API 통합 및 브라우저 검증 내역은 [검증 기록](docs/VALIDATION.md)에서 확인할 수 있습니다.

### CI

`main` 푸시와 PR마다 GitHub Actions([`ci.yml`](.github/workflows/ci.yml))가 아래 네 작업을 서로 독립적으로 실행합니다.

| 작업 | 하는 일 |
| --- | --- |
| `frontend` | Node 22에서 `npm ci`, `npm test`, `npm run build` |
| `backend` | Temurin 21에서 `./mvnw -B test` |
| `integration` | PostgreSQL 17 서비스 컨테이너에 백엔드 jar를 운영 프로필로 띄우고 `smoke-api.mjs`, `smoke-account.mjs` 실행 |
| `containers` | 백엔드·프론트 이미지 빌드, `nginx -t`, `caddy validate`, `compose config` 확인 후 운영 compose 전체를 `localhost:8443`에 띄워 `smoke-stack.mjs`(Caddy 뒤 gzip, `index.html` `no-cache`, HTTPS 이동)와 `smoke-api.mjs` 실행 |

같은 전체 스택 검사를 로컬에서 돌리는 명령은 [`.github/ci/compose.stack.yaml`](.github/ci/compose.stack.yaml) 머리말에 있습니다.

운영 배포는 Docker Compose를 기준으로 준비되어 있습니다. 비밀번호, HTTPS, 볼륨 백업과 배포 후 점검 절차는 [운영 배포 가이드](docs/DEPLOYMENT.md)를 따르세요.

## 프로젝트 문서

- [제품 요구사항](docs/PRD.md)
- [시스템 명세](SYSTEM.md)
- [디자인 시스템](docs/DESIGN_SYSTEM.md)
- [데이터베이스·사진 저장 설계](docs/DATABASE.md)
- [지도 구현 결정](docs/MAP.md)
- [검증 기록](docs/VALIDATION.md)
- [운영 배포 가이드](docs/DEPLOYMENT.md)

## 현재 범위

- JPEG/PNG 대표 사진 한 장은 필수이며 DAY별 장소 사진은 선택 사항입니다.
- HEIC, 장소당 여러 사진, S3 저장, 비동기 이미지 변환 워커와 자동 백업은 아직 포함하지 않습니다. 썸네일은 업로드 요청 안에서 만듭니다.
- 검색과 지도 타일은 외부 공개 서비스의 네트워크 상태와 가용성에 영향을 받습니다.
- 운영 배포 전에는 자체 또는 상용 지도·검색 공급자 사용을 검토해야 합니다.

## 글꼴

S-Core Dream을 사용합니다. 배포 글꼴의 라이선스 이미지는 `frontend/public/fonts/에스코어 드림_라이선스.png`에 포함되어 있습니다.

---

<div align="center">

기획 **박정윤** · 여행으로 채우는 나의 지도, **채움도**

</div>
