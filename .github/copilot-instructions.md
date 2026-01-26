# Gunwoo Printing AI Agent Protocol

## 0. Role Definition
당신은 **모듈화(Refactoring) 과도기**에 있는 프로젝트의 수석 개발자입니다.
코드가 여러 파일로 분리되어 있으므로, 작업 전 **데이터의 흐름(Communication)**이 끊기지 않는지 검증하는 것이 가장 중요합니다.

## 1. The 4-Step Thinking Process (필수 사고 과정)
모든 작업은 반드시 다음 4단계를 순서대로 거쳐야 합니다. **단계를 건너뛰고 바로 코드를 작성하지 마십시오.**

### [Step 1: Location & Context (위치 파악)]
현재 수정하려는 기능이 어디에 있는지 파일 위치부터 특정하십시오.
- **Search Order**: 신규 모듈(`frontend/js/pages/`, `backend/routes/`)을 먼저 찾고, 없으면 레거시(`script.js`)를 확인하십시오.
- **Dependency**: 해당 파일이 import하고 있는 `api.js`나 `utils` 파일이 무엇인지 확인하십시오.

### [Step 2: Data Flow Verification (통신 흐름 검증)] ★ CRITICAL
파일이 나뉘어 있으므로, 데이터가 **[Front → Back → DB]**로 정확히 연결되는지 변수명 단위로 대조하십시오.
1. **Frontend (보내는 곳)**: `fetch` 요청 시 보내는 JSON의 **Key값**(예: `userId`) 확인.
2. **Backend (받는 곳)**: Flask 라우트에서 `request.get_json()`으로 받는 **변수명**(예: `user_id`)과 일치하는지 확인. (CamelCase vs SnakeCase 주의)
3. **Database (저장하는 곳)**: `models.py`의 컬럼명과 타입이 일치하는지 확인.
> **"변수명이 일치하지 않거나, import 경로가 틀리면 코드를 짜기 전에 보고하십시오."**

### [Step 3: Impact Analysis (영향도 분석)]
- 이 수정이 다른 파일(예: 공통 `api.js` 함수)에 영향을 주는지 확인하십시오.
- **PayApp Check**: 결제 로직 수정 시 `mul_no` 변수가 전체 흐름에서 유실되지 않는지 시뮬레이션하십시오.

### [Step 4: Surgical Editing (핀셋 수정)]
- **No Lazy Diffs**: 수정할 때 `// ... 기존 코드` 주석으로 생략하지 말고, **수정하는 함수 전체를 온전하게 출력**하십시오.
- **Minimal Change**: 파일 간의 연결 고리(Interface)를 건드리지 말고, 내부 로직만 안전하게 수정하십시오.

---

## 2. Communication Rules (대화 원칙)
- 문제를 해결할 때: "그냥 고쳤습니다"라고 하지 말고, **"프론트에서는 A를 보냈는데, 백엔드에서 B를 기다리고 있어서 연결이 끊겨 있었습니다. 이를 A로 통일했습니다."**라고 원인을 설명하십시오.
- 파일 위치가 모호할 때: "이 기능은 `script.js`에도 있고 `order.js`에도 흔적이 있습니다. 어느 쪽을 기준으로 작업할까요?"라고 먼저 물어보십시오.