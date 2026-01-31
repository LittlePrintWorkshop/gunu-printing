#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""주문 내역서 JPG 다운로드 API 테스트"""

import json
import sys
from app import app, db
from models import Order, User

def test_invoice_download():
    """API 테스트"""
    with app.app_context():
        # 테스트 유저 생성 (없으면)
        user = User.query.filter_by(user_id='test_admin').first()
        if not user:
            user = User(user_id='test_admin', name='Test Admin', role='admin')
            user.set_password('test123')
            db.session.add(user)
            db.session.commit()
            print("✅ 테스트 유저 생성")
        
        # 테스트 클라이언트로 API 호출
        with app.test_client() as client:
            # 먼저 로그인
            response = client.post('/api/users/login', 
                json={'id': 'test_admin', 'pw': 'test123'},
                content_type='application/json'
            )
            print(f"\n[로그인] Status: {response.status_code}")
            
            if response.status_code == 200:
                data = json.loads(response.data)
                token = data.get('token')
                if token:
                    print(f"✅ 로그인 성공, Token: {token[:20]}...")
                    
                    # 주문 조회
                    orders = Order.query.limit(2).all()
                    if orders:
                        order_ids = [order.order_id for order in orders]
                        print(f"\n[주문 조회] {len(order_ids)}개 주문 발견: {order_ids}")
                        
                        # JPG 다운로드 API 호출
                        response = client.post('/api/admin/orders/invoice/download',
                            json={'order_ids': order_ids},
                            headers={'Authorization': f'Bearer {token}'},
                            content_type='application/json'
                        )
                        print(f"\n[JPG 다운로드] Status: {response.status_code}")
                        
                        if response.status_code == 200:
                            print(f"✅ JPG 다운로드 성공! ({len(response.data)} bytes)")
                            if len(order_ids) > 1:
                                if response.data.startswith(b'PK'):  # ZIP 파일
                                    print("✅ ZIP 파일로 반환됨")
                            else:
                                if response.data.startswith(b'\xff\xd8\xff'):  # JPG 파일
                                    print("✅ JPG 파일로 반환됨")
                        else:
                            print(f"❌ 다운로드 실패: {response.data.decode('utf-8')}")
                    else:
                        print("❌ 테스트 주문이 없습니다")
                else:
                    print(f"❌ 로그인 응답 오류: {data}")
            else:
                print(f"❌ 로그인 실패: {response.data}")

if __name__ == '__main__':
    try:
        test_invoice_download()
        print("\n✅ 테스트 완료!")
    except Exception as e:
        print(f"\n❌ 테스트 실패: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
