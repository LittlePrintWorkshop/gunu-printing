from app import app, db
from models import Category

app.app_context().push()

print('=== 자식 카테고리 추가 (제본 방식) ===\n')

# 책자 카테고리 찾기
indigo = Category.query.filter_by(name='소량 인디고').first()
digital = Category.query.filter_by(name='흑백 디지털').first()
offset = Category.query.filter_by(name='대량 옵셋').first()

book_categories = [
    (indigo, '소량 인디고'),
    (digital, '흑백 디지털'),
    (offset, '대량 옵셋')
]

binding_types = [
    {'name': '중철', 'code': 'saddle', 'icon': '📎', 'order': 1},
    {'name': '무선', 'code': 'perfect', 'icon': '📕', 'order': 2}
]

for parent_cat, parent_name in book_categories:
    if parent_cat:
        print(f'[{parent_name}] 자식 추가:')
        for bind_data in binding_types:
            child = Category(
                name=bind_data['name'],
                description=f"{parent_name} - {bind_data['name']} 제본",
                category_type='quote',
                icon=bind_data['icon'],
                display_order=bind_data['order'],
                is_active=True,
                parent_id=parent_cat.id
            )
            db.session.add(child)
            print(f"  {bind_data['icon']} {bind_data['name']} 추가")
        print()

db.session.commit()

print('\n=== 최종 카테고리 구조 ===')
all_cats = Category.query.filter_by(parent_id=None).order_by(Category.display_order).all()
for cat in all_cats:
    print(f'{cat.icon} {cat.name}')
    children = Category.query.filter_by(parent_id=cat.id).order_by(Category.display_order).all()
    for child in children:
        print(f'  └─ {child.icon} {child.name}')

print('\n완료!')
