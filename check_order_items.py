#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""주문 items 데이터 확인"""

from app import app, Order
import json

with app.app_context():
    order = Order.query.filter_by(order_id='O00001-20260127140840').first()
    
    if order:
        print("=== Order Items (원본) ===")
        print(f"Raw: {order.items}")
        print()
        
        if order.items:
            try:
                items = json.loads(order.items)
                print("=== Order Items (파싱됨) ===")
                print(json.dumps(items, indent=2, ensure_ascii=False))
            except Exception as e:
                print(f"파싱 오류: {e}")
    else:
        print("주문을 찾을 수 없습니다")
