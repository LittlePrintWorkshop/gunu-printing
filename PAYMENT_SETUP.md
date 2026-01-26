# PayApp 결제 통합 설정 가이드

## 개요
이 프로젝트는 PayApp의 JS API를 사용하여 상품 결제 기능을 구현했습니다.

## 구현된 기능

### 1. 결제 흐름
```
사용자 주문 → 결제창 팝업 → PayApp 결제 완료 → 주문완료 페이지
```

### 2. 결제 방식
- **장바구니 주문**: "주문하기" 버튼 클릭 → 결제창 → 주문 완료
- **바로 주문**: "바로주문하기" 버튼 클릭 → 결제창 → 주문 완료

## 설정 방법

### Step 1: PayApp 판매자 아이디 설정

파일: `script.js`

**라인 2575 및 2221** 에서 다음을 수정합니다:

```javascript
// 변경 전
const PAYAPP_USERID = 'YOUR_PAYAPP_USERID'; // 실제 PayApp 판매자 아이디로 변경

// 변경 후 (예시)
const PAYAPP_USERID = 'your_actual_payapp_id';
```

**PayApp 판매자 아이디 확인 방법:**
1. PayApp 판매자 사이트 로그인
2. 설정 → 연동정보 → 판매자 회원 아이디 확인

### Step 2: PayApp 결제 라이브러리 (이미 추가됨)

파일: `index.html` (라인 15)

```html
<script src="https://lite.payapp.kr/public/api/v2/payapp-lite.js"></script>
```

이미 추가되어 있으므로 별도의 작업이 필요 없습니다.

## 구현된 함수

### 1. `startPayment(totalAmount, user)` (라인 2575)
- 장바구니에서 결제 시작
- 파라미터:
  - `totalAmount`: 결제 금액
  - `user`: 사용자 정보 객체

### 2. `startPaymentDirectOrder(totalAmount, user)` (라인 2221)
- 견적에서 바로주문 시 결제 시작
- 파라미터:
  - `totalAmount`: 결제 금액
  - `user`: 사용자 정보 객체

### 3. `onPaymentComplete(paymentResult)` (라인 2610)
- 결제 완료 후 콜백 함수
- PayApp에서 자동으로 호출됨
- 주문을 DB에 저장하고 주문완료 페이지 표시

### 4. `showOrderComplete(orderId, orderCode, totalPrice)` (라인 2661)
- 주문 완료 페이지 표시
- 주문번호, 고객번호, 결제금액 표시

## API 엔드포인트

### 결제 콜백 처리
```
POST /api/payment/callback
```

**요청 본문:**
```json
{
  "mul_no": "결제요청번호",
  "pay_state": "4 (결제완료)",
  "var1": "사용자_아이디"
}
```

**응답:**
```json
{
  "success": true,
  "message": "결제가 완료되었습니다.",
  "mul_no": "결제요청번호"
}
```

## 주문 흐름 상세

### 1. 결제 전 준비 (submitOrder / orderDirectlyFromQuote)
- 장바구니/견적 정보 검증
- 임시 주문 정보를 localStorage에 저장 (`tempOrder`, `tempDirectOrder`)
- 결제 금액 계산

### 2. 결제 실행 (startPayment / startPaymentDirectOrder)
- PayApp 라이브러리 초기화
- 결제 파라미터 설정:
  - `userid`: PayApp 판매자 아이디
  - `shopname`: 상점명 ("건우프린팅")
  - `goodname`: 상품명 ("인쇄 서비스")
  - `price`: 결제 금액
  - `recvphone`: 수신 휴대폰번호
  - `var1`: 사용자 아이디
  - `var2`: 타임스탐프

### 3. 결제 완료 (onPaymentComplete)
- 임시 주문 정보 가져오기
- `/api/order` API로 주문 저장
- 주문번호, 고객번호 생성
- 주문완료 페이지 표시

## PayApp 결제 파라미터 상세

| 파라미터 | 설명 | 필수 | 예시 |
|---------|------|------|------|
| userid | PayApp 판매자 아이디 | ✓ | payapptest |
| shopname | 상점명 | ✓ | 건우프린팅 |
| goodname | 상품명 | ✓ | 인쇄 서비스 |
| price | 결제 금액 | ✓ | 10000 |
| recvphone | 수신 휴대폰번호 | ✓ | 01012345678 |
| memo | 메모 | - | 고객: 홍길동 |
| smsuse | SMS 발송 여부 | - | n (발송안함) |
| redirectpay | 바로 결제창 이동 | - | 1 (이동) |
| var1 | 임의 변수 1 | - | user_id |
| var2 | 임의 변수 2 | - | timestamp |

## 결제 가능 금액
- **최소**: 1,000원
- **최대**: 제한 없음

## 테스트 방법

### 1. 로컬 테스트
```bash
# Flask 서버 실행
python app.py

# 브라우저에서 접속
http://localhost:5000
```

### 2. 결제 테스트
1. 회원가입 또는 로그인
2. 견적 계산 또는 상품 선택
3. "바로주문하기" 또는 "주문하기" 클릭
4. PayApp 결제 팝업 확인
5. 결제 완료 페이지 확인

## 주의사항

### 보안
- PayApp 판매자 아이디는 `script.js`에 평문으로 저장되어 있습니다
- **프로덕션 환경에서는 환경변수를 통해 관리하세요**:
  ```javascript
  const PAYAPP_USERID = process.env.REACT_APP_PAYAPP_USERID;
  ```

### 결제 최소액
- 1,000원 미만의 결제는 불가능합니다
- 검증은 클라이언트 단에서 수행됩니다

### 파일 용량
- 5MB 이상의 파일은 기본 정보만 저장됩니다
- 파일 데이터는 base64로 인코딩되어 저장됩니다

## 결제 상태 코드

| 상태 | 설명 |
|------|------|
| 1 | 결제 요청 |
| 4 | 결제 완료 |
| 8 | 요청 취소 |
| 9 | 승인 취소 |
| 10 | 결제 대기 (가상계좌) |

## 문제 해결

### 결제 창이 열리지 않음
1. PayApp 라이브러리 로드 확인
2. 판매자 아이디 설정 확인
3. 브라우저 콘솔에서 에러 메시지 확인

### 결제 후 주문이 저장되지 않음
1. 백엔드 서버 상태 확인
2. 네트워크 요청 확인 (F12 개발자 도구 → Network)
3. 로그에서 에러 메시지 확인

### 결제는 되지만 페이지 이동이 안 됨
- `onPaymentComplete` 함수 호출 확인
- `showOrderComplete` 함수 작동 확인

## 추가 기능 확장

### 1. 결제 영수증 URL
PayApp 응답에 포함된 `csturl`을 사용하여 영수증 제공:
```javascript
const receiptUrl = paymentResult.csturl;
window.open(receiptUrl, '_blank');
```

### 2. 현금영수증 발행
```javascript
// /api/payment/receipt API 추가 필요
POST /api/payment/receipt
{
  "mul_no": "결제요청번호",
  "buyer_name": "구매자명",
  "buyer_phone": "휴대폰번호"
}
```

### 3. 환불 처리
```javascript
// /api/payment/refund API 추가 필요
POST /api/payment/refund
{
  "mul_no": "결제요청번호",
  "refund_amount": "환불금액",
  "reason": "환불사유"
}
```

## 참고 자료

- [PayApp 개발자 센터](https://www.payapp.kr/dev_center/dev_center01.html)
- [PayApp JS API 문서](https://www.payapp.kr/dev_center/dev_center01.html#결제요청-연동-구성)

## 지원

문제가 발생하면:
1. 브라우저 개발자 도구 (F12) 확인
2. 서버 로그 확인
3. PayApp 지원팀 문의
