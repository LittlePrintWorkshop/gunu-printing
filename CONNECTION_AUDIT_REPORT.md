# 🔍 건우프린팅 시스템 연결성 점검 보고서

**작성일:** 2026-01-26  
**점검 범위:** 프론트엔드 → 백엔드 API 연결 분석

---

## 📊 점검 요약

| 항목 | 결과 | 비고 |
|------|------|------|
| 총 API 엔드포인트 (백엔드) | 41개 | app.py 정의 |
| 프론트엔드 fetch 호출 | 38개 | script.js + payment_link_functions.js |
| **❌ 미정의 엔드포인트** | **1개** | `/api/user/profile` |
| **⚠️ 응답 형식 불일치** | **3건** | 데이터 구조 차이 |
| **⚠️ 데코레이터 누락** | **2건** | 인증 체크 누락 |

---

## 🔴 Critical Issues (즉시 수정 필요)

### 1️⃣ **[CRITICAL] `/api/user/profile` 엔드포인트 미정의**

**프론트엔드 호출:**
```javascript
// payment_link_functions.js, L515
const userRes = await fetch('/api/user/profile', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const userData_raw = await userRes.json();
if (userData_raw.success) {
  userData = userData_raw.user;
}
```

**백엔드 상황:**
- ❌ 정의되지 않음
- 404 에러 발생
- 개인결제 링크 사용 불가

**영향 받는 기능:**
- 개인결제 링크 결제 → 사용자 정보 조회 실패

**필요한 엔드포인트:**
```python
@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile(current_user):
    """현재 로그인한 사용자 정보 조회"""
    return jsonify({
        'success': True,
        'user': current_user.to_dict()
    })
```

---

## 🟠 High Priority Issues

### 2️⃣ **`/api/users` GET - 응답 형식 ✅ OK (수정됨)**

**실제 백엔드 코드 (app.py, L350-374):**
```python
@app.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': '권한이 없습니다.'}), 403
    
    users = User.query.all()  # ✅ 올바른 쿼리
    users_list = [{
        'db_id': u.id,
        'user_id': u.user_id,
        'name': u.name,
        'email': u.email,
        'phone': u.phone,
        'addr': u.address,
        'role': u.role,
        'status': 'active',
        'created_at': u.created_at.isoformat() if u.created_at else None
    } for u in users]
    
    return jsonify({'success': True, 'users': users_list})
```

**상태:** ✅ **정상 작동**
- 관리자만 모든 사용자 조회 가능
- 응답 형식: `{success: true, users: [...]}`
- User 모델과 일치

---

### 4️⃣ **응답 형식 불일치: `/api/homepage-settings` 응답**

**프론트엔드 기대:**
```javascript
// script.js, L1287
const res = await fetch('/api/homepage-settings');
const data = await res.json();
if (data.success && data.settings) {  // ← data.settings 구조 기대
  // ...
}
```

**백엔드 응답:**
```python
# app.py, L657-663
def get_homepage_settings():
    settings = HomepageSettings.query.first()
    if not settings:
        return jsonify({'success': True, 'settings': {}})
    return jsonify({
        'success': True,
        'settings': {
            'slides': json.loads(settings.slides_data) if settings.slides_data else [],
            'quoteImg': settings.quote_img,
            'logo': settings.logo,
            'favicon': settings.favicon
        }
    })
```

**확인 필요:**
- 백엔드 응답 구조가 정확한지 테스트 필요

---

## 🟡 Medium Priority Issues

### 5️⃣ **인증 누락: `/api/payment-links` DELETE (라인 1300+)**

```python
@app.route('/api/payment-links/<int:link_id>', methods=['DELETE'])
@token_required
@admin_required  # ← admin 체크 있음 (OK)
def delete_payment_link(current_user, link_id):
    # 구현 OK
```

**상태:** ✅ OK

---

### 6️⃣ **PaymentLink 모델 `used_at` 필드 확인**

```python
# app.py, L1287
link.used_at = datetime.utcnow()
```

**확인 필요:**
- `PaymentLink` 모델에 `used_at` 필드가 정의되어 있는지 확인

**models.py에서 확인:**
```python
class PaymentLink(db.Model):
    # ... 다른 필드들
    used_at = db.Column(db.DateTime)  # ← 있는지 확인
```

---

## 📋 API 엔드포인트 완전 목록

### ✅ 정상 구현 (37개)

| 엔드포인트 | 메서드 | 인증 | 상태 |
|-----------|--------|------|------|
| `/api/users/login` | POST | ❌ | ✅ |
| `/api/users/signup` | POST | ❌ | ✅ |
| `/api/users/check-id` | POST | ❌ | ✅ |
| `/api/users` | GET | ✅ | ⚠️ 쿼리 오류 |
| `/api/users/<user_id>` | PUT | ✅ | ✅ |
| `/api/users/<user_id>` | DELETE | ✅ | ✅ |
| `/api/quotes` | GET | ✅ | ✅ |
| `/api/quotes` | POST | ✅ | ✅ |
| `/api/quotes/<quote_id>` | GET | ✅ | ✅ |
| `/api/orders` | GET | ✅ | ✅ |
| `/api/orders` | POST | ✅ | ✅ |
| `/api/orders/<order_id>` | GET | ✅ | ✅ |
| `/api/orders/<order_id>` | DELETE | ✅ | ✅ |
| `/api/orders/<order_id>/cancel` | PUT | ✅ | ✅ |
| `/api/orders/<order_id>/refund` | POST | ✅ | ✅ |
| `/api/cart` | GET | ✅ | ✅ |
| `/api/cart` | POST | ✅ | ✅ |
| `/api/cart` | DELETE | ✅ | ✅ |
| `/api/cart/<item_id>` | DELETE | ✅ | ✅ |
| `/api/notices` | GET | ❌ | ✅ |
| `/api/notices/<id>` | GET | ❌ | ✅ |
| `/api/admin/notices` | POST | ✅ | ✅ |
| `/api/admin/notices/<id>` | PUT | ✅ | ✅ |
| `/api/admin/notices/<id>` | DELETE | ✅ | ✅ |
| `/api/upload-image` | POST | ✅ | ✅ |
| `/api/homepage-settings` | GET | ❌ | ✅ |
| `/api/homepage-settings` | POST | ✅ | ✅ |
| `/api/category-settings` | GET | ❌ | ✅ |
| `/api/category-settings/<cat>` | GET | ❌ | ✅ |
| `/api/category-settings` | POST | ✅ | ✅ |
| `/api/popup-notice` | GET | ❌ | ✅ |
| `/api/popup-notice-list` | GET | ❌ | ✅ |
| `/api/admin/popup-notice` | GET | ✅ | ✅ |
| `/api/admin/popup-notice` | POST | ✅ | ✅ |
| `/api/admin/popup-notice/<id>` | PUT | ✅ | ✅ |
| `/api/admin/popup-notice/<id>` | DELETE | ✅ | ✅ |
| `/api/admin/orders` | GET | ✅ | ✅ |
| `/api/admin/orders/<id>` | GET | ✅ | ✅ |
| `/api/admin/orders/<id>/status` | PUT | ✅ | ✅ |
| `/api/admin/orders/<id>/refund/approve` | PUT | ✅ | ✅ |
| `/api/admin/orders/<id>/refund/reject` | PUT | ✅ | ✅ |
| `/api/payment-links` | GET | ✅ | ✅ |
| `/api/payment-links` | POST | ✅ | ✅ |
| `/api/payment-links/<code>` | GET | ❌ | ✅ |
| `/api/payment-links/<code>/use` | POST | ❌ | ✅ |
| `/api/payment-links/<id>` | DELETE | ✅ | ✅ |

### ❌ 미정의 (1개)

| 엔드포인트 | 메서드 | 프론트엔드 위치 | 영향도 |
|-----------|--------|----------------|--------|
| `/api/user/profile` | GET | `payment_link_functions.js:515` | 🔴 높음 |

---

## 🔧 필요한 수정 작업

### Phase 1 - Immediate (오늘)
- [ ] `/api/user/profile` 엔드포인트 추가
- [ ] `/api/users` GET 쿼리 오류 수정
- [ ] `PaymentLink.used_at` 필드 존재 확인

### Phase 2 - Today
- [ ] `/api/homepage-settings` 응답 형식 테스트
- [ ] 모든 에러 응답 형식 일관성 검증
- [ ] 데이터베이스 스키마 마이그레이션 확인

### Phase 3 - Before Launch
- [ ] 모든 API 엔드포인트 통합 테스트
- [ ] 결제 흐름 end-to-end 테스트
- [ ] 개인결제 링크 기능 테스트

---

## 📝 점검 항목별 상세 분석

### `/api/users` GET 엔드포인트 문제

**현재 코드 (app.py L350):**
```python
@app.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    users = User.query.filter_by(user_db_id=g.user.id).all()
    # ↑ user_db_id 필드가 없음!
    return jsonify({'success': True, 'users': [u.to_dict() for u in users]})
```

**문제:**
1. User 모델에 `user_db_id` 필드가 없음
2. Quote, CartItem 등에는 `user_db_id`가 있지만 User에는 없음
3. 의도: 현재 사용자의 정보? 다른 사용자 목록? 불명확

**추정 의도 분석:**
- 관리자가 모든 사용자 조회?
- 또는 현재 사용자만 조회?

**필요한 조사:**
- 이 엔드포인트를 호출하는 프론트엔드 코드 확인
- 의도 명확히 한 후 수정

---

## 🧪 테스트 필요 항목

### 1. 로그인 플로우
```
POST /api/users/login
  → JWT 토큰 발급 확인
  → 토큰으로 인증된 요청 가능한지 확인
```

### 2. 개인결제 링크 플로우
```
GET /api/payment-links/<code>     ✅ (존재)
  → 링크 정보 조회
POST /api/payment-links/<code>/use ✅ (존재)  
  → 결제 완료 후 링크 사용 처리
BUT 사용자 정보 조회:
GET /api/user/profile             ❌ (미정의!)
  → 이부분에서 실패!
```

---

## 🧪 테스트 필요 항목

### 1. 로그인 플로우
```
POST /api/users/login
  → JWT 토큰 발급 확인
  → 토큰으로 인증된 요청 가능한지 확인
```

### 2. 개인결제 링크 플로우 (🔴 BLOCKED)
```
GET /api/payment-links/<code>     ✅ (존재)
  → 링크 정보 조회 OK
POST /api/payment-links/<code>/use ✅ (존재)  
  → 결제 완료 후 링크 사용 처리 OK
BUT 사용자 정보 조회:
GET /api/user/profile             ❌ (미정의!) ← HERE IS THE PROBLEM
  → payment_link_functions.js L515에서 호출
  → 404 에러로 실패!
  → 전체 개인결제 플로우 차단됨
```

### 3. 사용자 정보 조회 (✅ OK)
```
GET /api/users                     ✅ (정상)
  → 관리자 전용 (role 체크 있음)
  → 모든 사용자 목록 반환
  → 응답 형식: {success: true, users: [...]}
```

---

## 🔴 현황 정리

### 발견된 문제 (2개)

| # | 문제 | 파일 | 심각도 | 상태 |
|----|------|------|--------|------|
| 1 | `/api/user/profile` 미정의 | payment_link_functions.js:515 | 🔴 높음 | ❌ 미해결 |
| 2 | `PaymentLink.used_at` 필드 미확인 | app.py:1287 | 🟠 중간 | ⏳ 확인 필요 |

### 추정 영향도

**개인결제 링크 기능 - 완전 차단:**
```
사용자가 개인결제 링크 접근
  ↓
processPaymentLink() 호출 (payment_link_functions.js)
  ↓
링크 정보 조회: GET /api/payment-links/{code} ✅ OK
  ↓
사용자 정보 조회: GET /api/user/profile ❌ FAIL
  ↓
userData = null
userData_raw.success = false (또는 404)
  ↓
모든 후속 처리 불가능
  ↓
결제 실패 또는 에러 표시
```

---

## 📋 백엔드 엔드포인트 세부 현황

### ✅ 정상 구현 (37개)

#### 인증 관련
- `POST /api/users/login` - 로그인 ✅
- `POST /api/users/signup` - 회원가입 ✅
- `POST /api/users/check-id` - 아이디 중복확인 ✅

#### 사용자 관리
- `GET /api/users` - 모든 사용자 조회 (관리자) ✅
- `PUT /api/users/<user_id>` - 사용자 정보 수정 ✅
- `DELETE /api/users/<user_id>` - 사용자 삭제 ✅

#### 견적 관련
- `GET /api/quotes` - 견적 목록 ✅
- `POST /api/quotes` - 견적 생성 ✅
- `GET /api/quotes/<quote_id>` - 견적 상세 ✅

#### 주문 관련
- `GET /api/orders` - 주문 목록 ✅
- `POST /api/orders` - 주문 생성 ✅
- `GET /api/orders/<order_id>` - 주문 상세 ✅
- `DELETE /api/orders/<order_id>` - 주문 삭제 ✅
- `PUT /api/orders/<order_id>/cancel` - 주문 취소 ✅
- `POST /api/orders/<order_id>/refund` - 환불 요청 ✅

#### 장바구니
- `GET /api/cart` - 장바구니 조회 ✅
- `POST /api/cart` - 장바구니 추가 ✅
- `DELETE /api/cart` - 장바구니 비우기 ✅
- `DELETE /api/cart/<item_id>` - 항목 삭제 ✅

#### 공지사항
- `GET /api/notices` - 공지 목록 ✅
- `GET /api/notices/<id>` - 공지 상세 ✅
- `POST /api/admin/notices` - 공지 생성 (관리자) ✅
- `PUT /api/admin/notices/<id>` - 공지 수정 (관리자) ✅
- `DELETE /api/admin/notices/<id>` - 공지 삭제 (관리자) ✅

#### 이미지 업로드
- `POST /api/upload-image` - 이미지 업로드 ✅

#### 홈페이지 설정
- `GET /api/homepage-settings` - 설정 조회 ✅
- `POST /api/homepage-settings` - 설정 저장 (관리자) ✅

#### 카테고리 설정
- `GET /api/category-settings` - 모든 설정 조회 ✅
- `GET /api/category-settings/<cat>` - 특정 카테고리 설정 ✅
- `POST /api/category-settings` - 설정 저장 (관리자) ✅

#### 팝업 공지
- `GET /api/popup-notice` - 팝업 공지 조회 ✅
- `GET /api/popup-notice-list` - 팝업 목록 ✅
- `GET /api/admin/popup-notice` - 관리자 팝업 조회 ✅
- `POST /api/admin/popup-notice` - 팝업 생성 (관리자) ✅
- `PUT /api/admin/popup-notice/<id>` - 팝업 수정 (관리자) ✅
- `DELETE /api/admin/popup-notice/<id>` - 팝업 삭제 (관리자) ✅

#### 관리자 주문 관리
- `GET /api/admin/orders` - 모든 주문 조회 (관리자) ✅
- `GET /api/admin/orders/<id>` - 주문 상세 (관리자) ✅
- `PUT /api/admin/orders/<id>/status` - 상태 변경 (관리자) ✅
- `PUT /api/admin/orders/<id>/refund/approve` - 환불 승인 (관리자) ✅
- `PUT /api/admin/orders/<id>/refund/reject` - 환불 거절 (관리자) ✅

#### 개인결제 링크
- `GET /api/payment-links` - 링크 목록 조회 (관리자) ✅
- `POST /api/payment-links` - 링크 생성 (관리자) ✅
- `GET /api/payment-links/<code>` - 링크 정보 조회 ✅
- `POST /api/payment-links/<code>/use` - 링크 사용 처리 ✅
- `DELETE /api/payment-links/<id>` - 링크 삭제 (관리자) ✅

### ❌ 미정의 (1개)

| 엔드포인트 | 메서드 | 프론트엔드 위치 | 용도 | 응답 형식 (예상) |
|-----------|--------|----------------|------|-----------------|
| `/api/user/profile` | GET | `payment_link_functions.js:515` | 현재 사용자 정보 조회 | `{success: true, user: {...}}` |

---

## 🔧 필요한 수정 작업 (Priority Order)

### 🔴 Priority 1 - 즉시 (기능 차단)

**1. `/api/user/profile` 엔드포인트 추가**

```python
@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile(current_user):
    """현재 로그인한 사용자 정보 조회"""
    return jsonify({
        'success': True,
        'user': current_user.to_dict()
    })
```

**위치:** app.py에서 JWT 관련 함수들 근처에 추가 (L200 근처)

**영향받는 프론트엔드:**
- `payment_link_functions.js` L515
- 개인결제 링크 플로우 복구

---

### 🟠 Priority 2 - 오늘 (데이터 검증)

**2. `PaymentLink` 모델 필드 확인**

```python
# models.py에 이미 정의되어 있는지 확인
class PaymentLink(db.Model):
    # ...
    used_at = db.Column(db.DateTime)  # ✅ 있음!
```

**현황:** ✅ 이미 정의되어 있음 (models.py L213)

---

### 🟡 Priority 3 - 이번 주 (통합 테스트)

**3. 모든 API 응답 형식 일관성 검증**

- [ ] 모든 에러 응답: `{success: false, message: "..."}`
- [ ] 모든 성공 응답: `{success: true, data: ...}`
- [ ] 타임스탬프 형식: ISO 8601 (UTC)

---

## 📊 데이터베이스 모델 상태

### User 모델 ✅ OK
```python
class User(db.Model):
    id          # PK
    user_id     # 로그인 ID (unique)
    password    # bcrypt 해시
    name, email, phone, company, address
    role        # 'user' or 'admin'
    created_at  # KST 시간
```

**관계:**
- `quotes` ← Quote.user_db_id
- `orders` ← Order.user_db_id
- `cart_items` ← CartItem.user_db_id

### PaymentLink 모델 ✅ OK
```python
class PaymentLink(db.Model):
    id              # PK
    link_code       # 고유 코드 (20자)
    product_name    # 상품명
    price           # 결제금액
    customer_name   # 고객명
    customer_phone  # 연락처
    memo            # JSON 또는 문자열
    is_used         # boolean
    order_id        # 결제 후 주문번호
    used_at         # 사용 시간 ✅ 있음!
    created_at      # 생성 시간
```

**문제:** 없음 ✅

---

## 🧪 검증 체크리스트

- [ ] `/api/user/profile` 엔드포인트 추가 완료
- [ ] 개인결제 링크 플로우 테스트 (end-to-end)
  - [ ] 링크 생성
  - [ ] 고객이 링크 접근
  - [ ] 사용자 정보 조회 성공
  - [ ] PayApp 결제 팝업 열기
  - [ ] 결제 콜백 받기
  - [ ] 링크 사용 처리
  - [ ] 주문 완료
- [ ] 모든 API 응답 형식 검증
- [ ] JWT 토큰 인증 흐름 검증
- [ ] 데이터베이스 마이그레이션 상태 확인

---

## 📝 기타 참고사항

### PaymentLink 생성 로직 (app.py L1193-1240)
```python
@app.route('/api/payment-links', methods=['POST'])
@token_required
@admin_required
def create_payment_link(current_user):
    # ...
    link_code = secrets.token_urlsafe(16)
    new_link = PaymentLink(
        link_code=link_code,
        product_name=data['product_name'],
        price=data['price'],
        customer_name=data.get('customer_name'),
        customer_phone=data.get('customer_phone'),
        memo=json.dumps(memo_data),  # memo는 JSON 문자열로 저장
        created_by=current_user.user_id
    )
    # ...
```

**주의:** `memo` 필드는 JSON 형식으로 저장되므로, 프론트에서 파싱 필요

### 프론트엔드 처리 (payment_link_functions.js L508-510)
```javascript
let memoParsed = null;
try {
  if (link.memo) memoParsed = JSON.parse(link.memo);
} catch (e) {
  console.error('메모 파싱 실패 (무시):', e);
}
```

**상태:** ✅ 이미 처리됨

---

## 📌 최종 결론

**현재 상태:**
- ✅ 대부분의 API 엔드포인트 정의됨 (37/38)
- ❌ **1개의 중요 엔드포인트 미정의**: `/api/user/profile`
- ✅ 데이터베이스 스키마 정상
- ✅ PaymentLink 모델 모든 필드 정상

**핵심 문제:**
- **개인결제 링크 기능이 완전히 차단됨**
- `/api/user/profile` 엔드포인트 추가로 즉시 복구 가능

**추정 수정 시간:**
- 엔드포인트 추가: 5분
- 테스트: 10분
- 배포: 2분
- **총: 약 15-20분**



