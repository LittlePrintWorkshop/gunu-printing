from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta, timezone
import json
import bcrypt

db = SQLAlchemy()

# KST(UTC+9) 기준 시간 헬퍼
KST = timezone(timedelta(hours=9))
def now_kst():
    return datetime.now(KST)

# KST → UTC 변환 헬퍼 (ISO 문자열로 반환할 때 사용)
def to_utc_iso(kst_datetime):
    if not kst_datetime:
        return None
    # timezone-aware datetime을 UTC로 변환
    utc_time = kst_datetime.astimezone(timezone.utc)
    return utc_time.isoformat()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    company = db.Column(db.String(100))
    address = db.Column(db.Text)
    role = db.Column(db.String(20), default='user')
    created_at = db.Column(db.DateTime, default=now_kst)
    
    # Relationships
    quotes = db.relationship('Quote', backref='user', lazy=True, cascade='all, delete-orphan')
    orders = db.relationship('Order', backref='user', lazy=True, cascade='all, delete-orphan')
    cart_items = db.relationship('CartItem', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        """비밀번호 해싱"""
        self.password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def check_password(self, password):
        """비밀번호 검증"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password.encode('utf-8'))
    
    def to_dict(self):
        return {
            'id': self.user_id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'company': self.company,
            'address': self.address,
            'role': self.role,
            'created_at': to_utc_iso(self.created_at)
        }

class Quote(db.Model):
    __tablename__ = 'quotes'
    
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.String(50), unique=True, nullable=False)
    user_db_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    category = db.Column(db.String(50))
    binding = db.Column(db.String(50))
    specs = db.Column(db.Text)  # JSON string
    price = db.Column(db.Float)
    quote_details = db.Column(db.Text)  # JSON string - 상세 계산 정보 (인쇄비, 판비 등)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=now_kst)
    
    def to_dict(self):
        return {
            'id': self.quote_id,
            'user_id': self.user.user_id,
            'category': self.category,
            'binding': self.binding,
            'specs': json.loads(self.specs) if self.specs else {},
            'price': self.price,
            'quote_details': json.loads(self.quote_details) if self.quote_details else {},
            'status': self.status,
            'created_at': to_utc_iso(self.created_at)
        }

class Order(db.Model):
    __tablename__ = 'orders'
    
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.String(50), unique=True, nullable=False)
    user_db_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    items = db.Column(db.Text)  # JSON string
    total_price = db.Column(db.Float)
    delivery_info = db.Column(db.Text)  # JSON string
    order_details = db.Column(db.Text)  # JSON string - 상세 계산 정보
    status = db.Column(db.String(20), default='pending')
    mul_no = db.Column(db.String(100))  # PayApp 거래번호
    pay_type = db.Column(db.String(50))  # PayApp 결제타입
    tracking_number = db.Column(db.String(100))  # 택배 송장 번호
    created_at = db.Column(db.DateTime, default=now_kst)
    
    def to_dict(self):
        # 상태값 매핑 (영문 -> 한글, 호환성 유지)
        status_mapping = {
            'pending': '주문접수',
            'completed': '배송완료',
            'preparing': '제작중',
            'shipping': '배송중',
            'delivered': '배송완료'
        }
        
        # 이미 한글이면 그대로, 영문이면 변환
        current_status = self.status
        if current_status in status_mapping:
            converted_status = status_mapping[current_status]
        else:
            converted_status = current_status
        
        # order_details 파싱 및 변환
        order_details = {}
        if self.order_details:
            try:
                order_details = json.loads(self.order_details)
                # 리스트(복수 아이템)인 경우 첫 번째 항목을 메인 상세로 사용
                if isinstance(order_details, list) and len(order_details) > 0:
                    order_details = order_details[0]
                elif isinstance(order_details, list):
                    order_details = {}
            except:
                order_details = {}
        
        # breakdown 데이터를 직접 평면화 (script.js 호환성)
        if isinstance(order_details, dict) and 'breakdown' in order_details:
            breakdown = order_details.get('breakdown', {})
            # breakdown의 cover, inner 등을 orderDetails로 변환
            if 'cover' in breakdown:
                order_details['cover'] = {
                    'paper': breakdown['cover'].get('paper', 0),
                    'print': breakdown['cover'].get('print', 0),
                    'plate': breakdown['cover'].get('plate', 0),
                    'coat': breakdown['cover'].get('coat', 0),
                    'total': sum(breakdown['cover'].values())
                }
            if 'inner' in breakdown:
                order_details['inner'] = {
                    'paper': breakdown['inner'].get('paper', 0),
                    'print': breakdown['inner'].get('print', 0),
                    'plate': breakdown['inner'].get('plate', 0),
                    'total': sum(breakdown['inner'].values())
                }
            if 'binding' in breakdown:
                order_details['bind'] = {
                    'cost': breakdown.get('binding', 0),
                    'msg': f"제본비 {breakdown.get('binding', 0)}원"
                }
            if 'shipping' in breakdown or 'shipping' in order_details:
                ship_cost = breakdown.get('shipping', 0) or order_details.get('shipping', 0)
                order_details['shipping'] = {
                    'cost': ship_cost,
                    'boxName': '표준박스',
                    'boxes': 1
                }
            # 공금가, 부가세, 최종가 추가
            order_details['supplyPrice'] = order_details.get('supply_cost', 0)
            order_details['vat'] = order_details.get('vat', 0)
            order_details['finalPrice'] = order_details.get('total', 0)
            order_details['marginAmount'] = order_details.get('margin_amount', 0)
            order_details['marginPercent'] = order_details.get('margin_rate', 0)
        
        return {
            'id': self.order_id,
            'order_id': self.order_id,
            'user_id': self.user.user_id,
            'items': json.loads(self.items) if self.items else [],
            'total_price': self.total_price,
            'delivery_info': json.loads(self.delivery_info) if self.delivery_info else {},
            'order_details': order_details,
            'status': converted_status,
            'mul_no': self.mul_no,
            'pay_type': self.pay_type,
            'tracking_number': self.tracking_number,
            'shipping_number': self.tracking_number,
            'created_at': to_utc_iso(self.created_at),
            'customer_name': self.user.name if self.user else '',
            'shipping_address': json.loads(self.delivery_info)['address'] if self.delivery_info else ''
        }

class CartItem(db.Model):
    __tablename__ = 'cart_items'
    
    id = db.Column(db.Integer, primary_key=True)
    user_db_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    item_data = db.Column(db.Text)  # JSON string
    created_at = db.Column(db.DateTime, default=now_kst)
    
    def to_dict(self):
        data = json.loads(self.item_data) if self.item_data else {}
        # 서버에서 내려줄 때 식별자 포함 (프론트에서 단건 삭제용)
        data['_id'] = self.id
        return data


class Notice(db.Model):
    __tablename__ = 'notices'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), default='일반공지')
    content = db.Column(db.Text, nullable=False)
    is_pinned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=now_kst)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'category': self.category,
            'content': self.content,
            'is_pinned': self.is_pinned,
            'created_at': to_utc_iso(self.created_at),
            'updated_at': to_utc_iso(self.updated_at)
        }


class PopupNotice(db.Model):
    __tablename__ = 'popup_notices'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    image_path = db.Column(db.String(500), nullable=False)  # 이미지 경로
    content = db.Column(db.Text)  # 팝업 내용 (선택사항)
    badge = db.Column(db.String(50))  # "NEW", "HOT" 등 배지
    is_active = db.Column(db.Boolean, default=True)  # 활성화 여부
    created_at = db.Column(db.DateTime, default=now_kst)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'image_path': self.image_path,
            'content': self.content,
            'badge': self.badge,
            'is_active': self.is_active,
            'created_at': to_utc_iso(self.created_at),
            'updated_at': to_utc_iso(self.updated_at)
        }

class HomepageSettings(db.Model):
    __tablename__ = 'homepage_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    slides = db.Column(db.Text)  # JSON 배열로 저장
    logo = db.Column(db.String(500))
    quote_img = db.Column(db.String(500))
    favicon = db.Column(db.String(500))
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)

    def to_dict(self):
        return {
            'slides': json.loads(self.slides) if self.slides else [],
            'logo': self.logo,
            'quoteImg': self.quote_img,
            'favicon': self.favicon,
            'updated_at': to_utc_iso(self.updated_at)
        }


class PaymentLink(db.Model):
    __tablename__ = 'payment_links'

    id = db.Column(db.Integer, primary_key=True)
    link_code = db.Column(db.String(20), unique=True, nullable=False)  # 고유 링크 코드
    product_name = db.Column(db.String(200), nullable=False)  # 상품명
    price = db.Column(db.Float, nullable=False)  # 결제금액
    customer_name = db.Column(db.String(100))  # 고객명 (선택)
    customer_phone = db.Column(db.String(20))  # 고객 연락처 (선택)
    memo = db.Column(db.Text)  # 메모
    is_used = db.Column(db.Boolean, default=False)  # 사용 여부
    order_id = db.Column(db.String(50))  # 결제 완료 시 주문번호
    used_at = db.Column(db.DateTime)  # 사용(결제) 일시
    created_at = db.Column(db.DateTime, default=now_kst)
    created_by = db.Column(db.String(50))  # 생성한 관리자 ID

    def to_dict(self):
        return {
            'id': self.id,
            'link_code': self.link_code,
            'product_name': self.product_name,
            'price': self.price,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'memo': self.memo,
            'is_used': self.is_used,
            'order_id': self.order_id,
            'used_at': to_utc_iso(self.used_at),
            'created_at': to_utc_iso(self.created_at),
            'created_by': self.created_by
        }


class CategorySettings(db.Model):
    __tablename__ = 'category_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), unique=True, nullable=False)  # indigo, digital, offset, flyer_small, flyer_large
    settings_data = db.Column(db.Text, nullable=False)  # JSON 형식으로 저장
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    def to_dict(self):
        return {
            'category': self.category,
            'settings': json.loads(self.settings_data) if self.settings_data else {},
            'updated_at': to_utc_iso(self.updated_at)
        }


class PaperPrice(db.Model):
    __tablename__ = 'paper_prices'
    
    id = db.Column(db.Integer, primary_key=True)
    paper_type = db.Column(db.String(100), nullable=False)  # 모조지, 아트지, 스노우지 등
    gram = db.Column(db.Integer, nullable=False)  # 80, 100, 120, 150, 180, 200, 250, 300
    kook_price = db.Column(db.Float, nullable=False)  # 국전지 가격 (4절)
    sheet_4x6_price = db.Column(db.Float, nullable=False)  # 46전지 가격 (표지용, 대량옵셋만)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    # 복합 유니크 제약
    __table_args__ = (
        db.UniqueConstraint('paper_type', 'gram', name='uq_paper_type_gram'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'paper_type': self.paper_type,
            'gram': self.gram,
            'kook_price': self.kook_price,
            'sheet_4x6_price': self.sheet_4x6_price,
            'updated_at': to_utc_iso(self.updated_at)
        }


class PrintCost(db.Model):
    __tablename__ = 'print_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)  # indigo, digital, offset
    print_type = db.Column(db.String(50), nullable=False)  # 'mono_single', 'mono_double', 'color_single', 'color_double' 등
    cost_per_click = db.Column(db.Float, nullable=False)  # 클릭당 비용
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    # 복합 유니크 제약
    __table_args__ = (
        db.UniqueConstraint('category', 'print_type', name='uq_category_print_type'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'print_type': self.print_type,
            'cost_per_click': self.cost_per_click,
            'updated_at': to_utc_iso(self.updated_at)
        }


class PlateCost(db.Model):
    __tablename__ = 'plate_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)  # offset (대량옵셋만 해당)
    plate_unit_name = db.Column(db.String(50), nullable=False)  # 예: '전판', '2절판' 등
    base_cost = db.Column(db.Float, nullable=False)  # 기본 판비
    per_color = db.Column(db.Float, nullable=False)  # 색당 추가 판비
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    # 복합 유니크 제약
    __table_args__ = (
        db.UniqueConstraint('category', 'plate_unit_name', name='uq_category_plate_unit'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'plate_unit_name': self.plate_unit_name,
            'base_cost': self.base_cost,
            'per_color': self.per_color,
            'updated_at': to_utc_iso(self.updated_at)
        }


class PrintingCost(db.Model):
    """인쇄비 관리 (카테고리별)"""
    __tablename__ = 'printing_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False, unique=True)  # indigo, digital, offset, flyer_small, flyer_large
    cover_print_cost = db.Column(db.Float, nullable=False, default=0)  # 표지 인쇄비
    inner_print_cost = db.Column(db.Float, nullable=False, default=0)  # 내지 인쇄비
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'cover_print_cost': self.cover_print_cost,
            'inner_print_cost': self.inner_print_cost,
            'updated_at': to_utc_iso(self.updated_at)
        }


class PlateCostNew(db.Model):
    """판비 관리 (대량옵셋만)"""
    __tablename__ = 'plate_costs_new'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False, default='offset')
    plate_type = db.Column(db.String(50), nullable=False)  # 'cover', 'inner'
    cost = db.Column(db.Float, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    __table_args__ = (
        db.UniqueConstraint('category', 'plate_type', name='uq_offset_plate_type'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'plate_type': self.plate_type,
            'cost': self.cost,
            'updated_at': to_utc_iso(self.updated_at)
        }


class MarginSetting(db.Model):
    """마진율 관리 (카테고리 & 회원등급별)"""
    __tablename__ = 'margin_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)  # indigo, digital, offset, flyer_small, flyer_large
    member_type = db.Column(db.String(50), nullable=False)  # 'general', 'business'
    margin_rate = db.Column(db.Float, nullable=False)  # 마진율 (%)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    __table_args__ = (
        db.UniqueConstraint('category', 'member_type', name='uq_category_member_margin'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'member_type': self.member_type,
            'margin_rate': self.margin_rate,
            'updated_at': to_utc_iso(self.updated_at)
        }


class BindingCost(db.Model):
    """제본비 관리 (카테고리 & 바인딩 타입별)"""
    __tablename__ = 'binding_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)  # indigo, digital, offset
    binding_type = db.Column(db.String(50), nullable=False)  # 'staple', 'perfect'
    cost = db.Column(db.Float, nullable=False)
    min_qty = db.Column(db.Integer, default=0)  # 최소 수량 (옵셋의 경우 조건부 가격)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    __table_args__ = (
        db.UniqueConstraint('category', 'binding_type', 'min_qty', name='uq_binding_config'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'binding_type': self.binding_type,
            'cost': self.cost,
            'min_qty': self.min_qty,
            'updated_at': to_utc_iso(self.updated_at)
        }


class AdditionalCost(db.Model):
    """추가비용 관리 (배송료, 후가공비)"""
    __tablename__ = 'additional_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    cost_name = db.Column(db.String(100), nullable=False, unique=True)  # 'shipping', 'finishing_lamination', 'finishing_folding' 등
    description = db.Column(db.String(200))  # '기본 배송료', '라미네이션' 등
    cost = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(50), default='fixed')  # 'fixed'(고정), 'per_piece'(부당)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    def to_dict(self):
        return {
            'id': self.id,
            'cost_name': self.cost_name,
            'description': self.description,
            'cost': self.cost,
            'unit': self.unit,
            'updated_at': to_utc_iso(self.updated_at)
        }


# ========== 신규: 이중 시스템 (견적형 + 판매형) ==========

class Category(db.Model):
    """카테고리 (견적형/판매형 구분, 계층 구조 지원)"""
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # 소량 인디고, 기성 명함 등
    description = db.Column(db.Text)  # 카테고리 설명
    category_type = db.Column(db.String(20), nullable=False)  # 'quote' 또는 'sellable'
    icon = db.Column(db.String(100))  # 이모지 또는 아이콘
    image_url = db.Column(db.String(500))  # 카테고리 이미지 URL
    display_order = db.Column(db.Integer, default=0)  # 표시 순서
    is_active = db.Column(db.Boolean, default=True)  # 활성화 여부
    parent_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)  # 부모 카테고리 ID
    created_at = db.Column(db.DateTime, default=now_kst)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    # Relationships
    products = db.relationship('Product', backref='category', lazy=True, cascade='all, delete-orphan')
    children = db.relationship('Category', remote_side='Category.parent_id', lazy='select', foreign_keys='Category.parent_id')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'category_type': self.category_type,
            'icon': self.icon,
            'image_url': self.image_url,
            'display_order': self.display_order,
            'is_active': self.is_active,
            'parent_id': self.parent_id,
            'children': [child.to_dict() for child in self.children] if self.children else [],
            'created_at': to_utc_iso(self.created_at),
            'updated_at': to_utc_iso(self.updated_at)
        }


class Product(db.Model):
    """상품 (견적형/판매형 겸용)"""
    __tablename__ = 'products'
    
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)  # 상품명
    description = db.Column(db.Text)  # 상품 설명
    product_type = db.Column(db.String(20), nullable=False)  # 'quote_based' 또는 'sellable'
    
    # 공통 필드
    margin = db.Column(db.Integer, default=0)  # 마진율 (%)
    image_url = db.Column(db.String(500))  # 대표 이미지
    is_active = db.Column(db.Boolean, default=True)  # 활성화 여부
    display_order = db.Column(db.Integer, default=0)  # 표시 순서
    
    # 견적형 전용
    quote_settings = db.Column(db.Text)  # JSON: 계산용 설정 정보 (가격 알고리즘 등)
    
    # 판매형 전용
    fixed_price = db.Column(db.Float)  # 고정 판매가
    quantity = db.Column(db.Integer, default=0)  # 현재 재고
    stock_alert = db.Column(db.Integer, default=10)  # 재고 부족 알림 수량
    cost_price = db.Column(db.Float)  # 원가 (참고용)
    sellable_specs = db.Column(db.Text)  # JSON: 고정 사양 정보
    
    created_at = db.Column(db.DateTime, default=now_kst)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    # Relationships
    variants = db.relationship('ProductVariant', backref='product', lazy=True, cascade='all, delete-orphan')
    options = db.relationship('SellableProductOption', backref='product', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        data = {
            'id': self.id,
            'category_id': self.category_id,
            'name': self.name,
            'description': self.description,
            'product_type': self.product_type,
            'margin': self.margin,
            'image_url': self.image_url,
            'is_active': self.is_active,
            'display_order': self.display_order,
            'created_at': to_utc_iso(self.created_at),
            'updated_at': to_utc_iso(self.updated_at)
        }
        
        # 타입별 추가 필드
        if self.product_type == 'quote_based':
            data['quote_settings'] = json.loads(self.quote_settings) if self.quote_settings else {}
        else:  # sellable
            data['fixed_price'] = self.fixed_price
            data['quantity'] = self.quantity
            data['stock_alert'] = self.stock_alert
            data['cost_price'] = self.cost_price
            data['sellable_specs'] = json.loads(self.sellable_specs) if self.sellable_specs else {}
        
        return data


class ProductVariant(db.Model):
    """상품 바리언트 (제본 방식/옵션별)"""
    __tablename__ = 'product_variants'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    binding_type = db.Column(db.String(50))  # 'staple', 'perfect' (판매형은 NULL)
    
    # 공통
    guide_text = db.Column(db.Text)  # 제작 가이드
    ship_info = db.Column(db.Text)  # 배송 정보
    info_html = db.Column(db.Text)  # 상세 설명 (HTML)
    
    # 판매형 전용
    variant_price = db.Column(db.Float)  # 옵션별 추가/할인 가격
    variant_specs = db.Column(db.Text)  # JSON: 해당 바리언트의 사양
    display_order = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=now_kst)
    updated_at = db.Column(db.DateTime, default=now_kst, onupdate=now_kst)
    
    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'binding_type': self.binding_type,
            'guide_text': self.guide_text,
            'ship_info': self.ship_info,
            'info_html': self.info_html,
            'variant_price': self.variant_price,
            'variant_specs': json.loads(self.variant_specs) if self.variant_specs else {},
            'display_order': self.display_order,
            'created_at': to_utc_iso(self.created_at),
            'updated_at': to_utc_iso(self.updated_at)
        }


class SellableProductOption(db.Model):
    """판매형 상품 옵션 (색상, 사이즈 등)"""
    __tablename__ = 'sellable_product_options'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    option_name = db.Column(db.String(100), nullable=False)  # 색상, 크기, 코팅 등
    option_values = db.Column(db.Text, nullable=False)  # JSON 배열: ["검정", "흰색", "회색"]
    is_required = db.Column(db.Boolean, default=False)  # 필수 선택 여부
    display_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=now_kst)
    
    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'option_name': self.option_name,
            'option_values': json.loads(self.option_values) if self.option_values else [],
            'is_required': self.is_required,
            'display_order': self.display_order,
            'created_at': to_utc_iso(self.created_at)
        }
