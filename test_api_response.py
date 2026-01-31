import requests
import json

# 관리자 API 호출 (로컬 테스트)
response = requests.get('http://localhost:5000/api/admin/orders/O00001-20260127141155')
print('=== API 응답 ===')
print(f'상태 코드: {response.status_code}')
result = response.json()

if result.get('success'):
    order = result.get('order', {})
    items = order.get('items')
    print(f'\nItems 타입: {type(items)}')
    print(f'Items 길이: {len(items) if isinstance(items, list) else "N/A"}')
    if isinstance(items, list):
        print(f'첫 번째 아이템:\n{json.dumps(items[0], indent=2, ensure_ascii=False)}')
    else:
        print(f'Items: {items}')
else:
    print(f'오류: {result}')
