# 건우프린팅 Render 배포 가이드

## Render에 배포하기

### 1. GitHub 저장소 준비
1. 프로젝트를 GitHub에 푸시
2. Render 계정으로 로그인 (https://render.com)

### 2. PostgreSQL 데이터베이스 생성
1. Render 대시보드에서 "New +" → "PostgreSQL" 선택
2. 이름: `gunu-printing-db`
3. 무료 플랜 선택
4. "Create Database" 클릭
5. 생성된 데이터베이스의 연결 정보 확인

### 3. Web Service 생성
1. Render 대시보드에서 "New +" → "Web Service" 선택
2. GitHub 저장소 연결
3. 설정:
   - **Name**: `gunu-printing`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Instance Type**: `Free`

### 4. 환경 변수 설정
Web Service 설정에서 Environment Variables 추가:
- `DATABASE_URL`: PostgreSQL 연결 문자열 (자동으로 연결 가능)
- `SECRET_KEY`: 임의의 안전한 문자열

### 5. 자동 배포 (선택사항)
`render.yaml` 파일이 이미 포함되어 있으므로:
1. Render 대시보드에서 "New +" → "Blueprint" 선택
2. GitHub 저장소 연결
3. 자동으로 데이터베이스와 웹 서비스가 생성됨

## 로컬 개발

### PostgreSQL 로컬 설정 (선택사항)
```bash
# .env 파일 생성
cp .env.example .env

# .env 파일 수정하여 로컬 PostgreSQL 연결 정보 입력
DATABASE_URL=postgresql://localhost/printing_local
SECRET_KEY=dev-secret-key
```

### 로컬 서버 실행
```bash
# 패키지 설치
pip install -r requirements.txt

# 서버 실행
python app.py
```

## 데이터베이스 마이그레이션

데이터베이스는 첫 실행 시 자동으로 생성됩니다. 
`app.py`의 `db.create_all()`이 자동으로 테이블을 생성합니다.

## 주의사항
- 무료 플랜은 일정 시간 활동이 없으면 자동으로 슬립 모드로 전환됩니다
- PostgreSQL 무료 플랜은 90일 후 만료됩니다
- 프로덕션 환경에서는 SECRET_KEY를 안전하게 관리하세요
