#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""주문 생성 토큰 없이 테스트"""

from app import app
import json

with app.app_context():
    with app.test_client() as client:
        order_data = {
            'items': [{
                'category': 'book_indigo',
                'qty': 1,
                'specs': {}
            }],
            'delivery_info': {
                'recipient': 'Test User',
                'phone': '010-1234-5678',
                'address': 'Test Address'
            }
        }
        
        print('=== 주문 생성 테스트 (토큰 없이) ===')
        response = client.post('/api/orders',
            data=json.dumps(order_data),
            content_type='application/json'
        )
        print(f'Status: {response.status_code}')
        data = response.json
        success = data.get('success')
        print(f'Success: {success}')
        if success:
            print(f'Order ID: {data.get("order_id")}')
            print(f'Total Price: {data.get("total_price")}')
        else:
            print(f'Error: {data.get("message")}')
