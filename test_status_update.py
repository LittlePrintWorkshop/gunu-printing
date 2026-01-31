#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""테스트 헬퍼 API 테스트"""

from app import app, db
from models import Order

with app.app_context():
    with app.test_client() as client:
        order = Order.query.first()
        if order:
            print(f'초기 상태: {order.status}')
            print()
            
            # 상태 순환 업데이트
            for i in range(3):
                response = client.post('/api/test/auto-update-order-status',
                    json={'order_id': order.order_id},
                    content_type='application/json'
                )
                data = response.json
                if data.get('success'):
                    old = data.get('old_status')
                    new = data.get('new_status')
                    print(f'✅ {i+1}단계: {old} → {new}')
                else:
                    print(f'❌ {i+1}단계: {data.get("message")}')
                    break
            
            print()
            final_order = Order.query.filter_by(order_id=order.order_id).first()
            print(f'최종 상태: {final_order.status}')
