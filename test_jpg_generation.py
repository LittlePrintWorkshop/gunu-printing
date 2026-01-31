from app import app
from models import Order
import json
import tempfile
import os

with app.app_context():
    order = Order.query.filter_by(order_id='O00001-20260130100728').first()
    if order:
        from app import create_order_invoice_html, html_to_jpg
        html = create_order_invoice_html(order)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            jpg_path = os.path.join(temp_dir, 'test.jpg')
            try:
                html_to_jpg(html, jpg_path)
                if os.path.exists(jpg_path):
                    size = os.path.getsize(jpg_path)
                    print(f'✅ JPG 생성 성공: {size} bytes')
                else:
                    print('❌ JPG 파일 생성 실패')
            except Exception as e:
                print(f'❌ 에러: {e}')
                import traceback
                traceback.print_exc()
    else:
        print('Order not found')
