from app import app, db
from models import Category, Product

app.app_context().push()

print('=== 1단계: 판매형 카테고리 및 상품 삭제 ===')
# 판매형 카테고리 삭제 (ID 1-27)
sellable_cats = Category.query.filter_by(category_type='sellable').all()
for cat in sellable_cats:
    print(f'삭제: {cat.name} (ID: {cat.id})')
    db.session.delete(cat)

# 기존 quote_based 상품 삭제
quote_products = Product.query.filter_by(product_type='quote_based').all()
for prod in quote_products:
    print(f'상품 삭제: {prod.name} (ID: {prod.id})')
    db.session.delete(prod)

# 기존 견적형 카테고리 삭제 (ID 28)
old_quote_cat = Category.query.filter_by(category_type='quote').first()
if old_quote_cat:
    print(f'기존 견적형 카테고리 삭제: {old_quote_cat.name} (ID: {old_quote_cat.id})')
    db.session.delete(old_quote_cat)

db.session.commit()

print('\n=== 2단계: 새로운 견적형 카테고리 생성 ===')
categories = [
    {'name': '소량 인디고', 'code': 'indigo', 'order': 1, 'icon': '📘'},
    {'name': '흑백 디지털', 'code': 'digital', 'order': 2, 'icon': '⚫'},
    {'name': '대량 옵셋', 'code': 'offset', 'order': 3, 'icon': '📚'},
    {'name': '소량 전단', 'code': 'flyer_small', 'order': 4, 'icon': '📄'},
    {'name': '대량 전단', 'code': 'flyer_large', 'order': 5, 'icon': '📰'}
]

for cat_data in categories:
    cat = Category(
        name=cat_data['name'],
        description=f"{cat_data['name']} 견적 서비스",
        category_type='quote',
        icon=cat_data['icon'],
        display_order=cat_data['order'],
        is_active=True
    )
    db.session.add(cat)
    print(f"생성: {cat.name} (순서: {cat.display_order})")

db.session.commit()

print('\n=== 3단계: 최종 확인 ===')
final_cats = Category.query.order_by(Category.display_order).all()
for c in final_cats:
    print(f"{c.icon} {c.name} (Type: {c.category_type}, Order: {c.display_order})")

print(f'\n총 {len(final_cats)}개 카테고리')
print('\n완료!')
