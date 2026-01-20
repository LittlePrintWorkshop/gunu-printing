from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
from datetime import datetime, timedelta
from functools import wraps
import jwt
from models import db, User, Quote, Order, CartItem, Notice, PopupNotice

app = Flask(__name__, static_folder='.')

# 데이터베이스 설정
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///printing.db')
if app.config['SQLALCHEMY_DATABASE_URI'].startswith('postgres://'):
    app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', app.config['SECRET_KEY'])
app.config['JWT_EXPIRATION_HOURS'] = 24

# CORS 설정 - 기본은 전체 허용(개발 편의), 배포 시 ALLOWED_ORIGINS 환경변수로 제한
allowed_origins = os.environ.get('ALLOWED_ORIGINS', '*').split(',')
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

# 데이터베이스 초기화
db.init_app(app)

# 테이블 생성
with app.app_context():
    db.create_all()
    # 기본 관리자 계정 생성 (없을 경우)
    admin_user = User.query.filter_by(user_id='admin').first()
    if not admin_user:
        admin_user = User(user_id='admin', name='관리자', role='admin', email='')
        admin_user.set_password(os.environ.get('ADMIN_DEFAULT_PASSWORD', 'admin1234'))
        db.session.add(admin_user)
        db.session.commit()

# ========== JWT 유틸리티 함수 ==========
def create_token(user_id):
    """JWT 토큰 생성"""
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=app.config['JWT_EXPIRATION_HOURS']),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, app.config['JWT_SECRET_KEY'], algorithm='HS256')

def verify_token(token):
    """JWT 토큰 검증"""
    try:
        payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        return payload['user_id']
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """JWT 인증 데코레이터"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Authorization 헤더에서 토큰 추출
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(' ')[1]  # "Bearer <token>"
            except IndexError:
                return jsonify({'success': False, 'message': '잘못된 토큰 형식입니다.'}), 401
        
        if not token:
            return jsonify({'success': False, 'message': '토큰이 필요합니다.'}), 401
        
        user_id = verify_token(token)
        if not user_id:
            return jsonify({'success': False, 'message': '유효하지 않거나 만료된 토큰입니다.'}), 401
        
        # 사용자 정보 조회
        current_user = User.query.filter_by(user_id=user_id).first()
        if not current_user:
            return jsonify({'success': False, 'message': '사용자를 찾을 수 없습니다.'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

def admin_required(f):
    """관리자 권한 데코레이터"""
    @wraps(f)
    def decorated(current_user, *args, **kwargs):
        if current_user.role != 'admin':
            return jsonify({'success': False, 'message': '관리자 권한이 필요합니다.'}), 403
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# 정적 파일 서빙
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# ========== 사용자 관련 API ==========
@app.route('/api/users/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(user_id=data.get('id')).first()
    
    if user and user.check_password(data.get('pw')):
        token = create_token(user.user_id)
        return jsonify({
            'success': True,
            'token': token,
            'user': user.to_dict()
        })
    else:
        return jsonify({'success': False, 'message': '아이디 또는 비밀번호가 일치하지 않습니다.'})

@app.route('/api/users/signup', methods=['POST'])
def signup():
    data = request.json
    
    # 중복 확인
    if User.query.filter_by(user_id=data.get('id')).first():
        return jsonify({'success': False, 'message': '이미 사용 중인 아이디입니다.'})
    
    new_user = User(
        user_id=data.get('id'),
        name=data.get('name'),
        email=data.get('email', ''),
        phone=data.get('phone', ''),
        company=data.get('company', ''),
        address=data.get('address', ''),
        role='user'
    )
    new_user.set_password(data.get('pw'))
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '회원가입이 완료되었습니다.'})

@app.route('/api/users/check-id', methods=['POST'])
def check_id():
    data = request.json
    exists = User.query.filter_by(user_id=data.get('id')).first() is not None
    return jsonify({'available': not exists})

# ========== 견적 관련 API ==========
@app.route('/api/quotes', methods=['GET'])
@token_required
def get_quotes(current_user):
    quotes = Quote.query.filter_by(user_db_id=current_user.id).all()
    
    return jsonify({'success': True, 'quotes': [q.to_dict() for q in quotes]})

@app.route('/api/quotes', methods=['POST'])
@token_required
def create_quote(current_user):
    data = request.json
    
    quote_id = f"Q{datetime.now().strftime('%Y%m%d%H%M%S')}"
    new_quote = Quote(
        quote_id=quote_id,
        user_db_id=current_user.id,
        category=data.get('category'),
        binding=data.get('binding'),
        specs=json.dumps(data.get('specs', {}), ensure_ascii=False),
        price=data.get('price'),
        status='pending'
    )
    
    db.session.add(new_quote)
    db.session.commit()
    
    return jsonify({'success': True, 'quote_id': quote_id})

@app.route('/api/quotes/<quote_id>', methods=['GET'])
@token_required
def get_quote(current_user, quote_id):
    quote = Quote.query.filter_by(quote_id=quote_id).first()
    
    if quote and quote.user_db_id == current_user.id:
        return jsonify({'success': True, 'quote': quote.to_dict()})
    else:
        return jsonify({'success': False, 'message': '견적을 찾을 수 없거나 권한이 없습니다.'})

# ========== 주문 관련 API ==========
@app.route('/api/orders', methods=['GET'])
@token_required
def get_orders(current_user):
    orders = Order.query.filter_by(user_db_id=current_user.id).all()
    
    return jsonify({'success': True, 'orders': [o.to_dict() for o in orders]})

@app.route('/api/orders', methods=['POST'])
@token_required
def create_order(current_user):
    data = request.json
    
    order_id = f"O{datetime.now().strftime('%Y%m%d%H%M%S')}"
    new_order = Order(
        order_id=order_id,
        user_db_id=current_user.id,
        items=json.dumps(data.get('items', []), ensure_ascii=False),
        total_price=data.get('total_price'),
        delivery_info=json.dumps(data.get('delivery_info', {}), ensure_ascii=False),
        status='pending'
    )
    
    db.session.add(new_order)
    db.session.commit()
    
    return jsonify({'success': True, 'order_id': order_id})

# ========== 장바구니 관련 API ==========
@app.route('/api/cart', methods=['GET'])
@token_required
def get_cart(current_user):
    cart_items = CartItem.query.filter_by(user_db_id=current_user.id).all()
    return jsonify({'success': True, 'cart': [item.to_dict() for item in cart_items]})

@app.route('/api/cart', methods=['POST'])
@token_required
def add_to_cart(current_user):
    data = request.json
    
    cart_item = CartItem(
        user_db_id=current_user.id,
        item_data=json.dumps(data, ensure_ascii=False)
    )
    
    db.session.add(cart_item)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '장바구니에 추가되었습니다.'})

@app.route('/api/cart', methods=['DELETE'])
@token_required
def clear_cart(current_user):
    CartItem.query.filter_by(user_db_id=current_user.id).delete()
    db.session.commit()
    
    return jsonify({'success': True, 'message': '장바구니가 비워졌습니다.'})

# ========== 공지사항 API ==========
@app.route('/api/notices', methods=['GET'])
def list_notices():
    notices = Notice.query.order_by(Notice.is_pinned.desc(), Notice.created_at.desc()).all()
    return jsonify({'success': True, 'notices': [n.to_dict() for n in notices]})

@app.route('/api/notices/<int:notice_id>', methods=['GET'])
def get_notice(notice_id):
    notice = Notice.query.get(notice_id)
    if not notice:
        return jsonify({'success': False, 'message': '공지사항을 찾을 수 없습니다.'}), 404
    return jsonify({'success': True, 'notice': notice.to_dict()})

@app.route('/api/admin/notices', methods=['POST'])
@token_required
@admin_required
def create_notice(current_user):
    data = request.json
    notice = Notice(
        title=data.get('title', ''),
        category=data.get('category', '일반공지'),
        content=data.get('content', ''),
        is_pinned=bool(data.get('is_pinned', False))
    )
    db.session.add(notice)
    db.session.commit()
    return jsonify({'success': True, 'notice': notice.to_dict()})

@app.route('/api/admin/notices/<int:notice_id>', methods=['PUT'])
@token_required
@admin_required
def update_notice(current_user, notice_id):
    notice = Notice.query.get(notice_id)
    if not notice:
        return jsonify({'success': False, 'message': '공지사항을 찾을 수 없습니다.'}), 404
    data = request.json
    notice.title = data.get('title', notice.title)
    notice.category = data.get('category', notice.category)
    notice.content = data.get('content', notice.content)
    notice.is_pinned = bool(data.get('is_pinned', notice.is_pinned))
    db.session.commit()
    return jsonify({'success': True, 'notice': notice.to_dict()})

@app.route('/api/admin/notices/<int:notice_id>', methods=['DELETE'])
@token_required
@admin_required
def delete_notice(current_user, notice_id):
    notice = Notice.query.get(notice_id)
    if not notice:
        return jsonify({'success': False, 'message': '공지사항을 찾을 수 없습니다.'}), 404
    db.session.delete(notice)
    db.session.commit()
    return jsonify({'success': True})

# ========== 팝업 공지사항 API ==========
@app.route('/api/upload-image', methods=['POST'])
@token_required
@admin_required
def upload_image(current_user):
    """이미지 파일 업로드"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '파일이 없습니다.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '파일이 선택되지 않았습니다.'}), 400
    
    # 허용된 확장자 확인
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    filename = file.filename.lower()
    if not any(filename.endswith('.' + ext) for ext in allowed_extensions):
        return jsonify({'success': False, 'message': '이미지 파일만 업로드 가능합니다.'}), 400
    
    # images 폴더 생성
    import os
    from werkzeug.utils import secure_filename
    from datetime import datetime
    
    upload_folder = os.path.join(os.path.dirname(__file__), 'images')
    os.makedirs(upload_folder, exist_ok=True)
    
    # 파일명 생성 (타임스탬프 포함)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    original_name = secure_filename(file.filename)
    name_parts = original_name.rsplit('.', 1)
    new_filename = f"{name_parts[0]}_{timestamp}.{name_parts[1]}"
    
    # 파일 저장
    filepath = os.path.join(upload_folder, new_filename)
    file.save(filepath)
    
    # 웹 경로 반환
    web_path = f"./images/{new_filename}"
    return jsonify({'success': True, 'path': web_path, 'filename': new_filename})

@app.route('/api/popup-notice', methods=['GET'])
def get_popup_notice():
    """활성화된 팝업 공지 조회"""
    popup = PopupNotice.query.filter_by(is_active=True).order_by(PopupNotice.created_at.desc()).first()
    if not popup:
        return jsonify({'success': False, 'message': '팝업 공지사항이 없습니다.'}), 404
    return jsonify({'success': True, 'popup_notice': popup.to_dict()})

@app.route('/api/popup-notice-list', methods=['GET'])
def get_popup_notice_list():
    """활성화된 팝업 공지 전체 조회"""
    popups = PopupNotice.query.filter_by(is_active=True).order_by(PopupNotice.created_at.desc()).all()
    return jsonify({'success': True, 'popup_notices': [p.to_dict() for p in popups]})

@app.route('/api/admin/popup-notice', methods=['GET'])
@token_required
@admin_required
def list_popup_notices(current_user):
    """팝업 공지 목록 조회 (관리자용)"""
    popups = PopupNotice.query.order_by(PopupNotice.created_at.desc()).all()
    return jsonify({'success': True, 'popup_notices': [p.to_dict() for p in popups]})

@app.route('/api/admin/popup-notice', methods=['POST'])
@token_required
@admin_required
def create_popup_notice(current_user):
    """팝업 공지 생성"""
    data = request.json
    popup = PopupNotice(
        title=data.get('title', ''),
        image_path=data.get('image_path', ''),
        content=data.get('content', ''),
        badge=data.get('badge', ''),
        is_active=bool(data.get('is_active', True))
    )
    db.session.add(popup)
    db.session.commit()
    return jsonify({'success': True, 'popup_notice': popup.to_dict()})

@app.route('/api/admin/popup-notice/<int:popup_id>', methods=['PUT'])
@token_required
@admin_required
def update_popup_notice(current_user, popup_id):
    """팝업 공지 수정"""
    popup = PopupNotice.query.get(popup_id)
    if not popup:
        return jsonify({'success': False, 'message': '팝업 공지사항을 찾을 수 없습니다.'}), 404
    data = request.json
    popup.title = data.get('title', popup.title)
    popup.image_path = data.get('image_path', popup.image_path)
    popup.content = data.get('content', popup.content)
    popup.badge = data.get('badge', popup.badge)
    popup.is_active = bool(data.get('is_active', popup.is_active))
    db.session.commit()
    return jsonify({'success': True, 'popup_notice': popup.to_dict()})

@app.route('/api/admin/popup-notice/<int:popup_id>', methods=['DELETE'])
@token_required
@admin_required
def delete_popup_notice(current_user, popup_id):
    """팝업 공지 삭제"""
    popup = PopupNotice.query.get(popup_id)
    if not popup:
        return jsonify({'success': False, 'message': '팝업 공지사항을 찾을 수 없습니다.'}), 404
    db.session.delete(popup)
    db.session.commit()
    return jsonify({'success': True})

# ========== 관리자 API ==========
@app.route('/api/admin/stats', methods=['GET'])
@token_required
@admin_required
def get_admin_stats(current_user):
    total_users = User.query.count()
    total_quotes = Quote.query.count()
    total_orders = Order.query.count()
    pending_quotes = Quote.query.filter_by(status='pending').count()
    pending_orders = Order.query.filter_by(status='pending').count()
    
    return jsonify({
        'success': True,
        'stats': {
            'total_users': total_users,
            'total_quotes': total_quotes,
            'total_orders': total_orders,
            'pending_quotes': pending_quotes,
            'pending_orders': pending_orders
        }
    })

if __name__ == '__main__':
    print("🚀 Flask 서버를 시작합니다...")
    print("📍 URL: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
