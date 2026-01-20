# 건우프린팅 견적 시스템

프리미엄 인쇄 견적 웹 애플리케이션

## 기술 스택

### 프론트엔드
- HTML5, CSS3, JavaScript (Vanilla)
- jQuery, Summernote

### 백엔드
- Python 3.x
- Flask
- JSON 파일 기반 데이터 저장

## 설치 및 실행

### 1. Python 가상환경 생성 (선택사항)
```bash
python -m venv venv
venv\Scripts\activate  # Windows
```

### 2. 필요한 패키지 설치
```bash
pip install -r requirements.txt
```

### 3. Flask 서버 실행
```bash
python app.py
```

서버가 실행되면 http://localhost:5000 에서 접속 가능합니다.

## API 엔드포인트

### 사용자 관련
- `POST /api/users/login` - 로그인
- `POST /api/users/signup` - 회원가입
- `POST /api/users/check-id` - 아이디 중복 확인

### 견적 관련
- `GET /api/quotes` - 견적 목록 조회
- `POST /api/quotes` - 견적 생성
- `GET /api/quotes/<quote_id>` - 특정 견적 조회

### 주문 관련
- `GET /api/orders` - 주문 목록 조회
- `POST /api/orders` - 주문 생성

### 장바구니 관련
- `GET /api/cart/<user_id>` - 장바구니 조회
- `POST /api/cart/<user_id>` - 장바구니에 추가
- `DELETE /api/cart/<user_id>` - 장바구니 비우기

### 관리자
- `GET /api/admin/stats` - 통계 조회

## 프로젝트 구조
```
├── app.py              # Flask 백엔드 서버
├── index.html          # 메인 HTML
├── script.js           # 프론트엔드 JavaScript
├── style.css           # 스타일시트
├── requirements.txt    # Python 패키지 목록
├── data/              # 데이터 저장 폴더 (자동 생성)
│   ├── users.json
│   ├── quotes.json
│   ├── orders.json
│   └── cart.json
└── README.md
```

## 주요 기능
- 사용자 인증 (로그인/회원가입)
- 인쇄 견적 계산 (소량 인디고, 흑백 디지털, 대량 옵셋)
- 장바구니 관리
- 주문 관리
- 관리자 대시보드
