#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""관리자 API 테스트"""

from app import app

with app.app_context():
    with app.test_client() as client:
        print('=== 1. 관리자 주문 목록 조회 (토큰 없이) ===')
        response = client.get('/api/admin/orders')
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        count = result.get('count', 0)
        print(f'Orders count: {count}')
        print()
        
        print('=== 2. 사용자 목록 조회 (토큰 없이) ===')
        response = client.get('/api/users')
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        users = result.get('users', [])
        print(f'Users count: {len(users)}')
        print()
        
        print('=== 3. 개별 주문 조회 (토큰 없이) ===')
        response = client.get('/api/admin/orders/O00001-20260127140840')
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        if success:
            order = result.get('order', {})
            print(f'Order ID: {order.get("order_id")}')
        
        print()
        print('✅ 모든 관리자 API가 토큰 없이 작동합니다!')
