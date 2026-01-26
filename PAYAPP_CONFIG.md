# PayApp 결제 설정 가이드

## ⚠️ 결제 자격증명 변경 시 수정 필요한 파일들

### 1. 서버 설정 (app.py)
**위치**: `app.py` 파일 최상단 (11-15번 라인)

```python
# ========== PayApp 결제 설정 (변경 시 여기만 수정) ==========
PAYAPP_USERID = os.environ.get('PAYAPP_USERID', 'vinso112')
PAYAPP_LINKKEY = os.environ.get('PAYAPP_LINKKEY', 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=')
PAYAPP_LINKVALUE = os.environ.get('PAYAPP_LINKVALUE', 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=')
PAYAPP_CANCEL_URL = 'https://api.payapp.kr/oapi/apiLoad.html'
# ============================================================
```

**역할**:
- 환불 처리 시 PayApp API 호출
- 결제 완료 콜백 수신

---

### 2. 클라이언트 설정 (script.js)
**위치**: `script.js` 파일에서 **2군데**

#### 📍 첫 번째 - 견적 직접 주문 (3336-3339번 라인)
```javascript
// ========== PayApp 결제 설정 (견적 직접 주문용) ==========
const PAYAPP_USERID = 'vinso112';
const PAYAPP_LINKKEY = 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=';
const PAYAPP_LINKVALUE = 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=';
// =========================================================
```

#### 📍 두 번째 - 장바구니 결제 (4161-4164번 라인)
```javascript
// ========== PayApp 결제 설정 (장바구니 결제용) ==========
const PAYAPP_USERID = 'vinso112';
const PAYAPP_LINKKEY = 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=';
const PAYAPP_LINKVALUE = 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=';
// =========================================================
```

**역할**:
- 결제 요청 시 PayApp 초기화
- 결제 페이지 호출

---

## 🔐 환경변수로 설정하기 (권장)

Render 대시보드 → Environment 탭에서 설정:

```
PAYAPP_USERID=새아이디
PAYAPP_LINKKEY=새연동키
PAYAPP_LINKVALUE=새연동밸류
```

환경변수 설정 시 `app.py`는 자동으로 환경변수를 사용합니다.
단, `script.js`는 클라이언트 코드이므로 **직접 수정 필요**합니다.

---

## ✅ 변경 체크리스트

- [ ] `app.py` 11-15번 라인 수정
- [ ] `script.js` 3336-3339번 라인 수정 (견적 직접 주문)
- [ ] `script.js` 4161-4164번 라인 수정 (장바구니 결제)
- [ ] git commit & push
- [ ] 테스트 결제 진행
- [ ] 환불 테스트

---

## 📋 관련 API 엔드포인트

### 결제 콜백
- **URL**: `/api/payment-callback`
- **Method**: POST
- **역할**: PayApp에서 결제 완료 시 mul_no 저장

### 환불 승인
- **URL**: `/api/admin/orders/<order_id>/refund/approve`
- **Method**: PUT
- **역할**: PayApp 취소 API 호출 후 주문 상태 변경

---

## 🚨 주의사항

1. **linkkey와 linkvalue는 절대 노출 금지** - GitHub public repo 업로드 시 환경변수 사용
2. **script.js는 2군데** - 견적 직접 주문과 장바구니 결제 각각 설정
3. **변경 후 반드시 테스트** - 결제 → 환불 전체 플로우 확인
