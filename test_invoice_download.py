#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""내역서 다운로드 API 테스트"""

from app import app

with app.app_context():
    with app.test_client() as client:
        print('=== 내역서 JPG 다운로드 테스트 (토큰 없이) ===')
        
        response = client.post(
            '/api/admin/orders/invoice/download',
            json={'order_ids': ['O00001-20260127140840']}
        )
        
        print(f'Status: {response.status_code}')
        
        if response.status_code == 200:
            print(f'✅ JPG 다운로드 성공!')
            print(f'Content-Type: {response.content_type}')
            print(f'File size: {len(response.data)} bytes')
        else:
            result = response.json
            print(f'❌ 오류: {result}')
