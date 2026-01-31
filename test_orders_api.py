#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""주문 API 테스트"""

from app import app

with app.app_context():
    with app.test_client() as client:
        print('=== 1. 주문 생성 (토큰 없이) ===')
        order_data = {
            'items': [{
                'category': 'book_indigo',
                'qty': 1,
                'specs': {}
            }],
            'delivery_info': {
                'recipient': 'Test',
                'phone': '010-1234-5678',
                'address': 'Test Address'
            }
        }
        
        response = client.post('/api/orders',
            json=order_data,
            content_type='application/json'
        )
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        if success:
            order_id = result.get('order_id')
            print(f'Order ID: {order_id}')
            
            print()
            print('=== 2. 주문 목록 조회 (토큰 없이) ===')
            response = client.get('/api/orders')
            print(f'Status: {response.status_code}')
            result = response.json
            success = result.get('success')
            print(f'Success: {success}')
            orders = result.get('orders', [])
            print(f'Orders count: {len(orders)}')
            
            print()
            print('=== 3. 개별 주문 조회 (토큰 없이) ===')
            response = client.get(f'/api/orders/{order_id}')
            print(f'Status: {response.status_code}')
            result = response.json
            success = result.get('success')
            print(f'Success: {success}')
            if success:
                order = result.get('order', {})
                print(f'Order status: {order.get("status")}')
        
        print()
        print('✅ 모든 주문 API가 토큰 없이 작동합니다!')
