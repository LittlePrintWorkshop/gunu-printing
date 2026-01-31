#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""주문 데이터 확인"""

from app import app, Order
import json

with app.app_context():
    order = Order.query.filter_by(order_id='O00001-20260127140840').first()
    
    if order:
        print("=== 주문 정보 ===")
        print(f"Order ID: {order.order_id}")
        print(f"Status: {order.status}")
        print(f"Total Price: {order.total_price}")
        print()
        
        print("=== Delivery Info (원본) ===")
        print(f"Raw: {order.delivery_info}")
        print()
        
        if order.delivery_info:
            try:
                delivery = json.loads(order.delivery_info)
                print("=== Delivery Info (파싱됨) ===")
                print(json.dumps(delivery, indent=2, ensure_ascii=False))
            except Exception as e:
                print(f"파싱 오류: {e}")
        
        print()
        print("=== Order Details (원본) ===")
        print(f"Raw: {order.order_details}")
        print()
        
        if order.order_details:
            try:
                details = json.loads(order.order_details)
                print("=== Order Details (파싱됨) ===")
                if isinstance(details, list):
                    print(f"List with {len(details)} items")
                    for i, item in enumerate(details):
                        print(f"\n--- Item {i} ---")
                        print(json.dumps(item, indent=2, ensure_ascii=False)[:500])
                else:
                    print(json.dumps(details, indent=2, ensure_ascii=False)[:500])
            except Exception as e:
                print(f"파싱 오류: {e}")
    else:
        print("주문을 찾을 수 없습니다")
