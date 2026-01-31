from app import app, db, Order
import json

with app.app_context():
    order = Order.query.first()
    if order:
        print('=== 첫 번째 주문 ===')
        print(f'Order ID: {order.order_id}')
        print(f'Items (raw): {order.items}')
        print(f'Items type: {type(order.items)}')
        print(f'Order Details (raw): {order.order_details}')
        print(f'Total Price: {order.total_price}')
        print()
        print('=== to_dict() 결과 ===')
        order_dict = order.to_dict()
        items_value = order_dict.get('items')
        order_details_value = order_dict.get('order_details')
        print(f'Items (dict): {items_value}')
        print(f'Items type: {type(items_value)}')
        print(f'Order Details (dict): {order_details_value}')
        print(f'Order Details type: {type(order_details_value)}')
    else:
        print('주문이 없습니다.')
