# AXGATE 로그 뷰어 Release Notes

버전: **0.1.3** (최신) / 0.1.2 / 0.1.1 / 0.1.0  
날짜: **2026-09-04**

이 문서는 `PLAN.md` 1차 구현, `PLAN2.md` 검색·필터, 설치/포터블 패키징, `PLAN3.md` 개선까지 정리한다.

---

## 한 줄 요약

Axgate 방화벽 `.adb`(SQLite) 백업과 장비 UI `.csv` 내보내기를 같은 화면에서 조회·검색·필터할 수 있는 데스크탑/웹 뷰어의 첫 사용 가능 버전이다.

---

## 설치 파일

0.1.3 산출물은 `release/`에 있다. Windows는 CPU에 맞는 파일을 고른다.

- Intel/AMD PC → `win-x64`
- Snapdragon 등 ARM PC → `win-arm64` (**포터블은 zip만 사용**. ARM용 NSIS portable exe는 실행되지 않음)

| 파일 | 용도 | 크기 |
|---|---|---|
| `AXGATE-Log-Viewer-Setup-0.1.3-win-x64.exe` | Windows 설치 프로그램 (Intel/AMD 64비트) | 75MB |
| `AXGATE-Log-Viewer-0.1.3-portable-win-x64.exe` | Windows 단일 실행 포터블 (x64) | 74MB |
| `AXGATE-Log-Viewer-0.1.3-win-x64.zip` | Windows 폴더 포터블 x64 (`AXGATE-Log-Viewer.exe`) | 103MB |
| `AXGATE-Log-Viewer-Setup-0.1.3-win-arm64.exe` | Windows 설치 프로그램 (ARM64) | 67MB |
| `AXGATE-Log-Viewer-0.1.3-win-arm64.zip` | Windows ARM 포터블 (zip 해제 후 `AXGATE-Log-Viewer.exe`) | 96MB |
| `AXGATE-Log-Viewer-0.1.3-mac-arm64.dmg` | macOS 설치 (Apple Silicon) | 86MB |

Windows에서:

1. **설치본** — `Setup-...-win-x64.exe` 또는 `...-win-arm64.exe` 실행 → 설치 경로 선택 → 바로가기 생성. 0.1.0/0.1.1이 이미 있어도 **삭제하지 않고** 이 Setup을 실행하면 된다.
2. **단일 포터블 (x64만)** — `portable-win-x64.exe`를 USB/폴더에 두고 더블클릭. ARM용 portable exe는 제공하지 않는다.
3. **폴더 포터블** — zip을 풀고 `AXGATE-Log-Viewer.exe`를 실행. ARM Windows는 이 방법을 쓴다.

검은 화면만 보이던 이전 포터블/설치본, 그리고 `portable-win-arm64.exe`는 쓰지 말고 이 목록의 파일로 교체한다.

코드 서명이 없다. Windows SmartScreen 또는 macOS Gatekeeper 경고가 뜨면 “추가 정보 → 실행” / 우클릭 열기로 진행하면 된다.

`.msi`는 이 Mac에서 크로스 빌드가 불안정해 NSIS `.exe` 설치본으로 대체했다. MSI가 필요하면 Windows 머신에서 `electron-builder --win msi`로 만들 수 있다.

개발용 웹 실행:

```bash
npm run dev
```

브라우저에서 `http://localhost:5173/` . 개발 서버에서는 **샘플 불러오기**로 `adb_ex/`를 바로 연다.

- `npm test` — 단위/통합 테스트 (27개)
- `npm run dist` — mac dmg + Windows x64/ARM64 설치본/포터블 재빌드

---

## 포함된 기능

### 파일 열기

- `.adb`와 `.csv`를 폴더 열기, 파일 열기, 드래그 앤 드롭으로 가져오기
- 가져오기 미리보기: 파일별 형식·추정 로그 종류·신뢰도 표시, 종류 수동 재지정
- CSV 로그 종류 자동 판별 (헤더 anchor 컬럼 기준)
- 자동 판별 대신 “종류를 지정해서 가져오기” 경로
- UTF-16LE / UTF-8, 탭/콤마 구분자 자동 감지
- 알 수 없는 스키마는 원본 컬럼 그대로 표시
- 원본 `.adb`는 메모리(sql.js)에서만 읽어 `-wal`/`-shm`을 만들지 않음

### 로그 보기

- 사이드바 6종: 세션 / 감사 / 인증 / 시스템 / IPsec / SSL-VPN
- 종류별 기본 컬럼 프리셋 + 행 클릭 시 우측 상세 패널
- 상세에서 해석값 / 원시 JSON 토글
- 페이지네이션 (50 / 100 / 200)
- 빈 로그·알 수 없는 형식에 대한 안내
- IP 엔디안 디코딩 (`src_1` LE, `ip_src` BE → dotted-decimal)
- 코드값 일부 매핑 (`act=1` → 차단, IANA 프로토콜, syslog 위험도), 모르는 값은 `코드 N (알 수 없음)`
- 라이트/다크/OS 따름, 표 밀도, CSV 내보내기(UTF-8 BOM / UTF-16LE)

### 검색·필터 (`PLAN2.md` 2절)

- **컬럼 필터** (현재 보고 있는 로그 종류)
  - 세션: 기간, 출발지/목적지 IP·포트, 프로토콜, 동작, 정책 ID, Zone
  - 감사: 기간, 관리자, 접속 유형, 위험도, IP
  - 인증: 기간, 사용자 ID, 접속 유형, 결과, IP, 그룹
  - 시스템: 기간, 프로세스(자동완성), 위험도
  - IPsec / SSL-VPN: 기간, 주소, 상태(메시지)
- 드롭다운은 하드코딩하지 않고, 불러온 데이터에 실제로 나온 값만 사용
- 여러 조건은 AND
- 적용된 필터 칩 (개별 해제 / 필터 초기화)
- 건수 표시: `1,000건 중 37건 표시`
- **통합 검색** (6종 전체, 사람이 읽는 값 기준)
  - 입력 디바운스, 대소문자 구분 없음
  - “정확히 일치” 토글
  - 로그 종류별 그룹 + 건수, 미리보기 행, 일치 문구 하이라이트
  - 그룹을 누르면 해당 종류 화면으로 이동하고 검색어가 필터로 유지됨

### 부가 UI

- 시간대별 로그량 막대그래프 (막대 클릭 시 그 구간으로 기간 필터)
- 컬럼/필터/상세 라벨에 용어 설명 (마우스 오버)
- 하단 상태줄: 파일 수, 용량, 조회 건수
- 시작 화면·설정에 오프라인 처리·원본 불변 안내

---

## 검증

- 자동 테스트 27개 통과 (IP 디코딩, CSV 판별, 필터 SQL, 샘플 `.adb`/`.csv` 적재, 중복 키, 한국어 인증 결과)
- 브라우저에서 샘플 11개 파일 적재 확인
  - 세션 3,811건, IP `192.168.1.177` → `10.20.10.255`, 동작 차단
  - `logout` 통합 검색 → 감사 37건 그룹 → `감사 1,000건 중 37건 표시`

---

## 이 버전에 넣지 않은 항목과 이유

`PLAN2.md` 4절은 문서 자체에서 **“제안 단계이며 우선순위·채택 여부는 추후 논의”**, 5절은 **“설계 문서이며 코드 작성 단계는 아니다”** 라고 못 박혀 있다. 1절 방침도 미결·취향 항목을 구현을 막는 차단 요소가 아니라 **개선 백로그**로 두라고 한다. 그래서 2절(검색·필터)처럼 요구가 구체적이고 기존 화면에 바로 붙는 것부터 넣었다.

아래는 항목별 이유다.

| 항목 | 이유 |
|---|---|
| **저장된 필터 프리셋** | **0.1.3에 넣음.** 로그 종류별, `localStorage`. |
| **타임라인 드래그로 구간 선택** | **0.1.3에 넣음.** 클릭과 드래그 모두 기간 필터. |
| **로그 간 상관 보기** | IP/사용자 클릭 시 ±N분 창으로 6종을 병렬 조회하는 새 패널이다. 시간 창 기본값, 어떤 필드를 키로 볼지, 통합 검색 UI와의 중복을 정하지 않은 상태라 성급히 넣으면 검색과 역할이 겹친다. |
| **행 단위 메모/태그** | `.adb`/CSV에 고유 PK가 없어 행 해시 + 파일 식별이 필요하다. 원본이 바뀌면 고아 메모 정책까지 설계돼 있으나, 웹 테스트 단계에서는 영구 저장소(Electron `userData`)가 아직 패키징과 함께 없다. 잘못 구현하면 원본 불변 원칙을 깨기 쉽다. |
| **로그 공백/누락 구간 감지** | 타임라인 집계에 의존하는 2차 기능이다. “중앙값의 N배 vs 절대 1시간” 임계값이 미확정이고, 샘플처럼 날짜가 다른 파일을 한 워크스페이스에 넣으면 공백이 정상(로그 로테이션)인데 경고로 오인될 수 있다. |
| **규칙 기반 하이라이트** | SIEM식 그룹/횟수 조건(`동일 IP 실패 5회`)은 필터 엔진과 별도 평가 루프가 필요하다. 문서도 MVP는 “검사 실행 버튼”으로 단순화하라고 했고, 규칙 편집 UI·오탐 안내가 없어 지금은 필터/검색으로 대체 가능하다. |
| **최근 워크스페이스 목록** | **0.1.3 Electron에서 넣음.** 웹(`npm run dev`)은 OS 경로를 못 줘서 숨김. |
| **최초 실행 온보딩 투어** | 화면 좌표 기반 오버레이는 레이아웃이 필터 바·검색 결과처럼 자주 바뀌면 깨지기 쉽다. 시작 화면 안내 문구로 1차는 충분하다고 봤다. |
| **OS 파일 연결 (`.adb` 더블클릭)** | **0.1.3에 넣음.** `.adb`만 연결. CSV는 연결하지 않음. |
| **PDF/이미지 리포트** | CSV 내보내기는 있다. PDF는 인쇄용 HTML + `printToPDF`/`window.print()` 경로인데, 행 수 상한(예: 5,000)과 리포트 레이아웃을 정한 뒤 넣는 편이 안전하다. |
| **두 워크스페이스 비교** | 문서가 **우선순위 낮음, 백로그 유지**라고 적었다. 집합 diff는 구현은 가능하나 사용 시나리오(설정 변경 전/후) 확인이 없다. |
| **로컬 인덱싱 캐시(디스크)** | CSV/ADB를 이미 메모리 SQLite로 정규화하고 `search_text`·시간 인덱스를 걸었다. 디스크 캐시(경로+크기+mtime 무효화)는 50MB급·웹 테스트에는 이득이 작고, 캐시 오염 버그 비용이 더 크다. |
| **네트워크 호출 린트/CI** | **CI는 0.1.3에 넣음** (`npm run typecheck && npm test`). 네트워크 grep 린트는 아직 없음. |

타임라인·용어 툴팁·상태줄·오프라인 안내·원본 불변(메모리 전용 오픈)은 4절 제안 중 **기존 화면에 안전하게 붙고 설계가 이미 구체적인 것**만 최소 구현했다.

---

## 알려진 제한

- 앱 아이콘은 Electron 기본 아이콘이다 (커스텀 아이콘 미설정).
- Windows 설치본은 `.msi`가 아니라 NSIS `.exe`이다.
- 패키지 용량은 Electron 런타임이 대부분이다. 앱 자체(asar)는 약 2MB.
- 이 환경에 Rust가 없어 Tauri 대신 Electron(+ 웹 개발 서버)을 썼다.
- 코드값 전체 표(`act` 허용 코드, `oper`, IPsec CSV 헤더 등)는 샘플 부족으로 미완. 모르는 값은 원본을 보여 준다.
- 통합 검색은 해석된(사람이 읽는) 값만 대상으로 한다. 원시 정수 코드 검색은 `PLAN2` 3절 미결.
- 컬럼 필터 연산자는 포함/일치 수준이다. 이상·이하 등 세분화는 3절 미결.
- 타임라인은 클릭·드래그로 기간을 고른다.
- 웹에서 연 폴더는 OS 경로가 없어 최근 목록이 없다 (Electron만 지원).
- 코드 서명·공증은 없다. macOS 27에서 Electron 37 패키지 앱이 바로 종료된 사례가 있다.

---

## 다음으로 넣을 수 있는 것 (우선 후보)

채택만 정해 주면 이 순서부터 착수하기 좋다.

1. Windows `.msi` / 커스텀 앱 아이콘 / 코드 서명
2. Electron 버전 상향 (macOS 27에서 37대가 바로 종료되는 문제)
3. 로그 간 상관 보기 / 메모·태그 (영속 계층 전제)
4. `.adb` 파일 연결 + 최근 워크스페이스 (Electron 패키지 전제)
5. 로그 간 상관 보기

---

## 0.1.0 최적화 (용량·성능)

- 웹 번들 `dist/` 16MB → **2MB** (한글/라틴 400·700 woff2만 포함, 레거시 woff 제거, wasm 중복 제거)
- 설치 파일: Windows Setup **155MB → 72MB**, macOS dmg **174MB → 86MB**
- asar에 production `node_modules`(폰트 원본 포함)가 들어가던 문제 제거 — asar **94MB → 2MB**
- Electron 로케일을 한국어/영어만 남김, Windows에서 ffmpeg/swiftshader/dxcompiler 등 미사용 DLL 제거
- 로그 적재: 800행 단위 청크 INSERT, 불필요한 COUNT/인덱스 제거, 목록 쿼리에서 `raw_json`/`search_text` 제외
- 건수·distinct·기간 범위 캐시, 상세 원시값은 필요할 때만 조회

## 0.1.0 버그 수정 — 포터블/설치본 검은 화면

Windows에서 포터블(또는 설치본)을 실행하면 창만 뜨고 **검고 빈 화면**만 보이던 문제를 수정했다.

**원인**

- 패키징된 앱은 HTML을 `file://`로 열었다.
- Vite 빌드가 `<script type="module" crossorigin>` 을 붙인다.
- `file://` + `crossorigin` 조합에서 Chromium이 모듈 JS를 CORS로 취급해 **스크립트가 실행되지 않는다**.
- `#root`는 비어 있고, 창 배경색(`#10161c`)만 보인다.
- `npm run dev`(http://localhost:5173)는 HTTP라 같은 문제가 없다. 그래서 웹 테스트에서는 정상이었다.

**수정**

- 프로덕션에서는 `file://` 대신 `app://localhost/` 커스텀 프로토콜로 UI를 로드한다. (`secure`, `supportFetchAPI`, CORS 허용)
- 빌드 HTML에서 `crossorigin` 속성을 제거한다.
- 화면 로드에 실패하면 “화면을 열 수 없습니다” 오류 창에 URL/코드를 표시한다.

**영향 파일**

- `electron/main.cjs`, `vite.config.ts`, `index.html`
- 이후 다시 빌드한 `release/`의 Windows Setup / portable / zip (x64·arm64)

이전 포터블 exe를 그대로 실행하면 검은 화면이 재현된다. 반드시 재빌드된 파일로 교체한다.

## 0.1.1 버그 수정 — 설치 업데이트 실패 / ARM 포터블 미실행

Intel/AMD에서 이전 버전을 지우고 새 설치본으로 바꾸지 못하면 아래 메시지가 나왔다.

1. `AXGATE 로그 뷰어 cannot be closed. Please close it manually and click Retry to continue.`
2. 취소 시 `Failed to uninstall old application files. Please try running the installer again: 2`

ARM Windows에서는 ARM 포터블 exe가 실행되지 않았다.

**원인**

- 설치 프로그램이 업데이트 전에 실행 중인 앱을 정상 종료하려고 한다. 이전 버전의 검은 화면 프로세스는 응답이 없어 닫히지 않고, 파일이 잠긴 채 남는다.
- 그 상태에서 예전 제거 프로그램을 호출하면 제거기가 없거나 경로를 못 찾아 Windows 오류 2(파일을 찾을 수 없음)가 난다. 그래서 앱 삭제와 덮어쓰기 업데이트가 둘 다 실패한다.
- ARM 포터블 exe는 안쪽 앱은 ARM64이지만, **겉 실행 파일(NSIS 스텁)이 32비트 x86**이다. ARM Windows에서 이 스텁이 안 뜨면 “실행조차 안 되는” 상태가 된다. zip 안의 `AXGATE-Log-Viewer.exe`는 네이티브 ARM64이다.

**수정 (0.1.1)**

- 설치/제거 시작 시 `AXGATE-Log-Viewer.exe`를 `taskkill /F`로 강제 종료한 뒤 진행한다.
- 기존 설치 폴더는 통째로 지우고 다시 깐다 (`customRemoveFiles`).
- x64와 ARM64 설치본을 **따로** 빌드해서, 두 아키텍처가 섞인 통합 설치본이 나오지 않게 했다.
- ARM 포터블은 NSIS exe를 없애고 **`AXGATE-Log-Viewer-0.1.1-win-arm64.zip`** 만 제공한다. 압축을 풀고 `AXGATE-Log-Viewer.exe`를 실행한다.
- Intel/AMD 포터블 exe는 그대로 두되, zip 폴더 포터블도 함께 제공한다.

**이미 0.1.0이 설치되어 업데이트가 막힌 경우 (0.1.2에서 설치기가 처리)**

0.1.1 Setup은 예전 제거기를 그대로 호출해서 같은 오류가 남을 수 있다. **0.1.2 Setup**을 쓴다.

1. 가능하면 작업 관리자에서 `AXGATE-Log-Viewer.exe`를 종료한다. (검은 창이 떠 있으면 그것)
2. `AXGATE-Log-Viewer-Setup-0.1.2-win-x64.exe` (ARM이면 `...-win-arm64.exe`)를 실행한다. 이전 버전을 먼저 지울 필요는 없다.
3. 그래도 실패하면 설치 폴더를 직접 지운다. 기본 경로:  
   `%LOCALAPPDATA%\Programs\AXGATE-Log-Viewer`
4. Windows 설정 → 앱에서 항목이 남아 있으면 제거를 한 번 더 시도한 뒤, 0.1.2를 새로 설치한다.

ARM PC 포터블은 zip만 쓴다 (`AXGATE-Log-Viewer-0.1.2-win-arm64.zip`).

## 0.1.2 버그 수정 — 업데이트/삭제 실패를 설치기에서 우회

0.1.1은 실행 중인 프로세스를 죽이려고만 했고, **이전 버전 제거기 호출은 그대로** 두었다. 그래서 Intel/AMD에서 0.1.0 → 조치 버전 업데이트가 같은 메시지로 막힐 수 있다.

1. `AXGATE 로그 뷰어 cannot be closed. Please close it manually and click Retry to continue.`
2. 취소 시 `Failed to uninstall old application files. Please try running the installer again: 2`

**원인 (사진 1·2와 동일한 흐름)**

- 설치 프로그램은 덮어쓰기 전에 예전 제거기(`Uninstall AXGATE-Log-Viewer.exe`)를 조용히 실행한다.
- 0.1.0은 검은 화면으로 프로세스가 남아 WM_CLOSE에 응답하지 않는다. 제거기는 이를 닫지 못하고 `un.onInit`에서 Abort한다. NSIS에서 `.onInit` Abort의 종료 코드는 **2**다.
- 설치기는 제거를 5번 재시도한 뒤 사진 1(`cannot be closed`)을 띄운다. 취소를 누르면 사진 2(`uninstall failed: 2`)를 띄우고 설치를 중단한다.
- 파일이 잠겨 있으면 Windows 설정에서 앱 삭제도 실패한다.
- ARM 포터블 exe는 겉 스텁이 32비트 x86이라 ARM Windows에서 실행 자체가 안 된다. zip 안의 `AXGATE-Log-Viewer.exe`만 네이티브 ARM64다.

**수정 (0.1.2)**

- 설치/제거 시작 시 `taskkill /F /IM AXGATE-Log-Viewer.exe`로 강제 종료한다. (기본 “부드럽게 닫기”는 쓰지 않음)
- **예전 제거기를 호출하지 않는다.** UninstallString을 지우고 설치 폴더를 통째로 지운 뒤 새 파일을 복사한다. 그래서 사진 1·2 경로를 타지 않는다.
- 이후 버전 제거도 같은 강제 종료 + 폴더 삭제를 쓴다.
- ARM 포터블은 계속 zip만 제공한다.

**영향 파일**

- `build/installer.nsh`, `package.json` (0.1.2), `scripts/afterPack.cjs`

## 0.1.3 — PLAN3 반영

코드 리뷰(`PLAN3.md` 2절)와 바로 넣을 수 있는 기능(3·4절)을 반영했다. 인증서·디스크 캐시·상관 보기처럼 결정이 남은 항목은 넣지 않았다.

### 안정성

- 폴더 열기: 최상위 `.adb`/`.csv`를 먼저 보고, 없으면 하위를 최대 200개까지 검색. 많으면 확인 창.
- 가져오기 중 **취소**와 파일/행 진행 표시. 800행마다 이벤트 루프를 양보.
- 잘못된 대용량 폴더를 열어도 가져오기 전에 멈출 수 있다.

### 데이터

- 파일 간 중복 행 제거 (`dedup_key` = 로그 종류 + 원시 JSON 해시). **같은 파일 안의 행은 그대로 둔다** (시스템 로그 39건이 사라지던 이전 실수를 반복하지 않음). 겹치는 CSV(`Audit.csv` / `Audit (1).csv`)만 건너뛴다.
- 인증 결과 파싱에 한국어 문구(로그인 성공, 실패, 거부, 로그아웃, 타임아웃)를 추가.

### 사용성

- 사이드바 접기
- 상세 패널 값 **복사**
- 타임라인 **드래그**로 기간 선택 (클릭도 유지)
- 로그 종류별 **필터 프리셋** 저장/불러오기 (`localStorage`)
- Electron **최근 폴더** (최대 8개, `userData/recents.json`)
- 목록 **열 표시/숨김** 및 추가 컬럼(Zone, 바이트, NAT 등)
- `.adb` 파일 연결 + 이미 실행 중이면 기존 창으로 전달 (`second-instance` / `open-file`)

### 품질

- 프로덕션 CSP에서 `'unsafe-eval'` 제거 (`wasm-unsafe-eval`만 유지)
- `sandbox: true` 복원 (`app://` 프로토콜은 메인 프로세스에서 처리)
- GitHub Actions CI: `typecheck` + `test`
- 루트에 남아 있던 옛 `main.cjs` 삭제
- Electron **37 → 38** (macOS 27에서 37대가 기동 직후 SIGTRAP으로 죽던 문제 대응)
- `.adb` 더블클릭이 화면보다 먼저 오면 이벤트를 놓치던 문제: 렌더러가 준비된 뒤에만 파일을 넘김
- 폴더에 파일이 많을 때 확인 창 기본값을 “가져오기”로 (200개 초과로 잘린 경우만 기본 취소)

### 이 버전에 넣지 않은 PLAN3 항목

- 코드 서명 / 공증 / 커스텀 아이콘 / mac Intel dmg
- `App.tsx` 대형 리팩터 (화면 분리는 다음)
- 로그 간 상관 보기, 행 메모/태그, 공백 구간 감지, 규칙 하이라이트
- 디스크 인덱싱 캐시, 두 워크스페이스 비교, PDF 리포트, 온보딩 투어
- IPsec CSV 판별 anchor (실제 샘플 없음)
- React 컴포넌트 E2E/RTL 스모크 (jsdom 경로만 준비하지 않음)

이 개발 Mac(macOS 27.0)에서는 Electron 38 패키지 앱도 기동 직후 SIGTRAP으로 종료된다. macOS 14–15 환경에서 실행 확인이 필요하다.

## 기술 메모

- UI: React 19 + Vite + TypeScript, 한글 폰트 Noto Sans KR
- 셸: Electron 37 (패키징 설정만 존재, `electron-builder`)
- DB: sql.js (WASM SQLite, 원본 파일 immutable)
- `.adb` / `.csv` → 로그 종류별 공통 내부 스키마로 정규화 후 동일 SQL 필터·검색
