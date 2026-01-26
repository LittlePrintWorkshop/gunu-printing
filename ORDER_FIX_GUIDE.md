# 주문 관리 기능 수정 가이드

## 문제점
1. ✗ 고객 주문내역에 주문이 안 나옴 (localStorage만 확인)
2. ✗ 관리자 주문관리에서 상품 정보 표기 안됨
3. ✗ 취소 처리 기능 없음

## 해결 방법

### 1. 고객 주문내역 수정 (script.js 약 3138번째 줄)

**교체할 함수:** `renderOrderHistory()`

**위치:** `patch_order_history.js` 파일의 전체 내용을 복사하여 script.js의 기존 renderOrderHistory() 함수를 완전히 교체

**변경 사항:**
- 서버 API(`/api/orders`)에서 주문 목록 가져오기
- items 필드 JSON 파싱 처리
- 주문번호 `order.order_id` 사용
- 상태 pending인 주문에만 "주문취소" 버튼 표시
- `cancelUserOrder()` 함수 추가

---

### 2. 관리자 주문 관리 수정 (script.js 약 1648번째 줄)

**교체할 함수:** `renderAdminOrderTable(orders)`

**위치:** `patch_admin_orders.js` 파일의 전체 내용을 복사하여 script.js의 기존 renderAdminOrderTable() 함수를 완전히 교체

**변경 사항:**
- items 필드 JSON 파싱하여 상품명 표시
- 상태에 따라 다음 단계 버튼 동적 생성:
  - pending → "제작" / "취소"
  - preparing → "배송"
  - shipping → "완료"
- `updateAdminOrderStatus()` 함수 추가

---

## 적용 방법

### VSCode에서 수정하기:

1. **고객 주문내역 수정:**
   ```
   Ctrl+F로 "function renderOrderHistory()" 검색
   → 해당 함수 전체를 patch_order_history.js 내용으로 교체
   ```

2. **관리자 주문 관리 수정:**
   ```
   Ctrl+F로 "function renderAdminOrderTable(orders)" 검색
   → 해당 함수 전체를 patch_admin_orders.js 내용으로 교체
   ```

3. **저장 및 푸시:**
   ```powershell
   cd "c:\Users\seal1\Desktop\새 폴더"
   git add script.js
   git commit -m "주문 관리 기능 개선

   - 고객 주문내역 서버 API 연동
   - 관리자 주문 관리 상품 정보 표시
   - 주문 상태 변경 및 취소 기능 추가"
   git push origin master
   ```

---

## 테스트 체크리스트

### 고객 화면:
- [ ] 로그인 후 주문내역 클릭 시 주문 목록 표시
- [ ] 주문 상품명이 제대로 표시됨
- [ ] pending 상태 주문에 "주문취소" 버튼 표시
- [ ] 주문취소 클릭 시 상태가 취소로 변경됨

### 관리자 화면:
- [ ] 관리자 → 주문관리에서 주문 목록 표시
- [ ] 상품 정보가 "상품명 외 N개" 형식으로 표시됨
- [ ] pending 주문에 "제작", "취소" 버튼 표시
- [ ] 상태 변경 버튼 클릭 시 상태가 업데이트됨
- [ ] 상태 변경 후 목록이 자동 새로고침됨

---

## 주요 기능

### 상태 흐름:
```
pending(접수) → preparing(제작중) → shipping(배송중) → completed(완료)
              ↘ cancelled(취소)
```

### API 엔드포인트:
- GET `/api/orders` - 내 주문 목록
- GET `/api/admin/orders` - 전체 주문 목록 (관리자)
- PUT `/api/admin/orders/{order_id}/status` - 주문 상태 변경
