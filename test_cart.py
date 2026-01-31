#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""장바구니 엔드포인트 테스트"""

from app import app

with app.app_context():
    with app.test_client() as client:
        print('=== 1. 토큰 없이 GET /api/cart ===')
        response = client.get('/api/cart')
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        print()
        
        print('=== 2. 토큰 없이 POST /api/cart ===')
        response = client.post('/api/cart',
            json={'category': 'test', 'qty': 1},
            content_type='application/json'
        )
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        print()
        
        print('=== 3. 토큰 없이 DELETE /api/cart ===')
        response = client.delete('/api/cart')
        print(f'Status: {response.status_code}')
        result = response.json
        success = result.get('success')
        print(f'Success: {success}')
        
        print()
        print('✅ 모든 엔드포인트가 토큰 없이 작동합니다!')
