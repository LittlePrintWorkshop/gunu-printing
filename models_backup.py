from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta, timezone
import json
import bcrypt

db = SQLAlchemy()

# KST(UTC+9) 기준 시간 헬퍼
KST = timezone(timedelta(hours=9))
def now_kst():
    return datetime.now(KST)

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
            'created_at': self.created_at.isoformat() if self.created_at else None
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
            'created_at': self.created_at.isoformat() if self.created_at else None
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
    created_at = db.Column(db.DateTime, default=now_kst)
    
    def to_dict(self):
        return {
            'id': self.order_id,
            'order_id': self.order_id,  # order_id도 명시적으로 포함
            'user_id': self.user.user_id,
            'items': json.loads(self.items) if self.items else [],
            'total_price': self.total_price,
            'delivery_info': json.loads(self.delivery_info) if self.delivery_info else {},
            'order_details': json.loads(self.order_details) if self.order_details else {},
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None
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
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
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
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
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
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
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
            'used_at': self.used_at.isoformat() if self.used_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by
        }


class CategorySettings(db.Model):
    __tablename__ = 'category_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), unique=True, nullable=False)  # indigo, digital, offset, flyer_small, flyer_large
    settings_data = db.Column(db.Text, nullable=False)  # JSON 형식으로 저장
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'category': self.category,
            'settings': json.loads(self.settings_data) if self.settings_data else {},
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
