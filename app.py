from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
from datetime import datetime, timedelta
from functools import wraps
import jwt
import requests
import secrets
from models import db, User, Quote, Order, CartItem, Notice, PopupNotice, HomepageSettings, PaymentLink, CategorySettings

app = Flask(__name__, static_folder='.')

# ========== PayApp 결제 설정 (변경 시 여기만 수정) ==========
PAYAPP_USERID = os.environ.get('PAYAPP_USERID', 'vinso112')
PAYAPP_LINKKEY = os.environ.get('PAYAPP_LINKKEY', 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=')
PAYAPP_LINKVALUE = os.environ.get('PAYAPP_LINKVALUE', 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=')
PAYAPP_CANCEL_URL = 'https://api.payapp.kr/oapi/apiLoad.html'
# ============================================================

# 데이터베이스 설정
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///printing.db')
if app.config['SQLALCHEMY_DATABASE_URI'].startswith('postgres://'):
    app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', app.config['SECRET_KEY'])
app.config['JWT_EXPIRATION_HOURS'] = 24
# 업로드 용량 제한 (20MB)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024

# 업로드 디스크 경로 설정 (Render Persistent Disk 사용 시 /images)
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'images')
# 절대 경로면 그대로 사용 (Render), 상대 경로면 프로젝트 폴더에 상대적으로
if not os.path.isabs(UPLOAD_FOLDER):
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), UPLOAD_FOLDER)

# CORS 설정 - 기본은 전체 허용(개발 편의), 배포 시 ALLOWED_ORIGINS 환경변수로 제한
allowed_origins = os.environ.get('ALLOWED_ORIGINS', '*').split(',')
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

# 데이터베이스 초기화
db.init_app(app)

# 테이블 생성
with app.app_context():
    db.create_all()
    
    # 기존 DB 마이그레이션: favicon 컬럼 추가 (없을 경우)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        # homepage_settings 테이블 확인
        if 'homepage_settings' in inspector.get_table_names():
            columns = [c['name'] for c in inspector.get_columns('homepage_settings')]
            if 'favicon' not in columns:
                # PostgreSQL 또는 SQLite 맞게 처리
                db.session.execute(text('ALTER TABLE homepage_settings ADD COLUMN favicon VARCHAR(500)'))
                db.session.commit()
                print("✅ favicon 컬럼 추가됨")

        # orders 테이블에 order_details 컬럼 없으면 추가
        if 'orders' in inspector.get_table_names():
            order_cols = [c['name'] for c in inspector.get_columns('orders')]
            if 'order_details' not in order_cols:
                db.session.execute(text('ALTER TABLE orders ADD COLUMN order_details TEXT'))
                db.session.commit()
                print("✅ orders.order_details 컬럼 추가됨")
            
            # PayApp 거래번호 필드 추가
            if 'mul_no' not in order_cols:
                db.session.execute(text('ALTER TABLE orders ADD COLUMN mul_no VARCHAR(100)'))
                db.session.commit()
                print("✅ orders.mul_no 컬럼 추가됨")
            
            if 'pay_type' not in order_cols:
                db.session.execute(text('ALTER TABLE orders ADD COLUMN pay_type VARCHAR(50)'))
                db.session.commit()
                print("✅ orders.pay_type 컬럼 추가됨")
        
        # category_settings 테이블 확인 및 생성
        if 'category_settings' not in inspector.get_table_names():
            db.session.execute(text('''
                CREATE TABLE category_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category VARCHAR(50) UNIQUE NOT NULL,
                    settings_data TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            '''))
            db.session.commit()
            print("✅ category_settings 테이블 생성됨")
    except Exception as e:
        print(f"⚠️ 마이그레이션 처리: {e}")
        db.session.rollback()
    
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

def _cancel_payapp_payment(mul_no, total_price, cancel_memo):
    """PayApp 결제 취소 함수"""
    try:
        # 취소 요청 파라미터
        cancel_params = {
            'cmd': 'paycancel',
            'userid': PAYAPP_USERID,
            'linkkey': PAYAPP_LINKKEY,
            'mul_no': mul_no,
            'cancelmemo': cancel_memo,
            'partcancel': '0'  # 0 = 전액취소
        }
        
        # POST 요청
        response = requests.post(PAYAPP_CANCEL_URL, data=cancel_params, timeout=10)
        response_text = response.text
        
        print(f"📊 PayApp 취소 응답: {response_text}")
        
        # 응답 파싱 (PayApp은 텍스트 또는 JSON으로 응답)
        try:
            # JSON 형식으로 시도
            response_data = response.json() if response.headers.get('content-type', '').count('application/json') > 0 else {}
        except:
            # 텍스트 응답 파싱
            response_data = {}
            if 'state=1' in response_text:
                response_data['state'] = '1'
            elif 'errorMessage' in response_text:
                parts = response_text.split('errorMessage=')
                if len(parts) > 1:
                    response_data['errorMessage'] = parts[1].split('&')[0]
        
        # 취소 성공 여부 확인
        success = response_data.get('state') == '1' or 'state=1' in response_text
        
        if success:
            return {
                'success': True,
                'message': '결제가 취소되었습니다.',
                'mul_no': mul_no
            }
        else:
            error_msg = response_data.get('errorMessage', '알 수 없는 오류')
            return {
                'success': False,
                'error': error_msg
            }
    
    except requests.exceptions.Timeout:
        return {
            'success': False,
            'error': 'PayApp 서버 응답 시간 초과'
        }
    except requests.exceptions.RequestException as e:
        return {
            'success': False,
            'error': f'네트워크 오류: {str(e)}'
        }
    except Exception as e:
        print(f"❌ PayApp 취소 중 오류: {e}")
        return {
            'success': False,
            'error': str(e)
        }

# 정적 파일 서빙
@app.route('/', methods=['GET', 'POST'])
def index():
    return send_from_directory('.', 'index.html')

@app.route('/payment-complete.html', methods=['GET', 'POST', 'HEAD'])
def payment_complete():
    """결제 완료 페이지"""
    return send_from_directory('.', 'payment-complete.html', mimetype='text/html')

@app.route('/api/payment-callback', methods=['POST'])
def payment_callback():
    """PayApp 결제 완료 콜백 - feedbackurl"""
    try:
        # PayApp에서 POST로 전송되는 결제 정보 받기 (form 데이터)
        data = request.form.to_dict()
        print(f"📡 PayApp 콜백 수신 (전체): {data}")
        
        # 필수 정보 추출
        state = data.get('state')  # 1이면 성공
        mul_no = data.get('mul_no')  # 결제요청번호
        pay_type = data.get('pay_type')  # 결제 타입
        order_id = data.get('var1')  # 주문번호 (PayApp 요청 시 var1에 넣음)
        
        print(f"🔍 결제 상태: state={state}, mul_no={mul_no}, order_id={order_id}, pay_type={pay_type}")
        
        # mul_no와 order_id가 있으면 저장 시도
        if mul_no and order_id:
            try:
                # 주문 찾기
                order = Order.query.filter_by(order_id=order_id).first()
                if order:
                    # [Fix] mul_no, pay_type 저장
                    order.mul_no = mul_no
                    order.pay_type = pay_type
                    
                    # [Fix] pay_type이 있을 때만 상태를 'completed'로 변경
                    # pay_type이 없으면 = 아직 미결제 상태 유지 (프론트에서 결제가 완료되지 않았다는 뜻)
                    if pay_type:
                        order.status = 'completed'
                        print(f"✅ 주문 {order_id}에 mul_no={mul_no}, pay_type={pay_type}, status=completed 저장 완료")
                    else:
                        print(f"⚠️ 주문 {order_id}에 mul_no={mul_no} 저장만 (pay_type 미수신 - 상태 유지)")
                    
                    db.session.commit()
                else:
                    print(f"⚠️ 주문을 찾을 수 없음: {order_id} (나중에 업데이트될 수도 있음)")
            except Exception as e:
                print(f"⚠️ mul_no 저장 중 에러 (무시하고 계속): {e}")
        else:
            print(f"⚠️ mul_no 또는 order_id 없음 (무시)")
        
        # PayApp에 무조건 성공 응답 반환 (200 OK)
        return 'OK', 200
            
    except Exception as e:
        print(f"❌ PayApp 콜백 처리 에러: {e}")
        import traceback
        traceback.print_exc()
        # 에러가 발생해도 OK 반환 (PayApp 재시도 방지)
        return 'OK', 200

@app.route('/payment-complete-close')
def payment_complete_close():
    """PayApp returnurl - 팝업 닫기 신호 전송"""
    print("[payment_complete_close] PayApp에서 리다이렉트됨 - 팝업 닫기")
    
    # PayApp 팝업 내에서 실행되는 페이지
    # opener(부모 창)에 메시지를 보내서 팝업을 닫도록 함
    html = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>결제 완료</title>
</head>
<body>
    <script>
        // 팝업이 opener(부모 창)의 제어를 받을 수 있는지 확인
        if (window.opener) {
            console.log('[payment_complete_close] opener 감지됨 - 부모 창에 신호 전송');
            try {
                // 부모 창에 완료 신호 전송
                window.opener.postMessage({
                    type: 'payment_completed_from_payapp',
                    message: 'PayApp에서 결제 완료됨'
                }, '*');
                console.log('[payment_complete_close] 신호 전송 완료');
            } catch (e) {
                console.error('[payment_complete_close] 신호 전송 실패:', e);
            }
            
            // 팝업 자동 닫기 시도
            setTimeout(() => {
                console.log('[payment_complete_close] 팝업 닫기 시도 중...');
                window.close();
            }, 500);
        } else {
            console.log('[payment_complete_close] opener 없음 - 일반 페이지로 이동');
            window.location.href = '/';
        }
    </script>
    <p>결제가 완료되었습니다. 잠시만 기다려주세요...</p>
</body>
</html>'''
    
    return html

@app.route('/<path:path>', methods=['GET', 'POST', 'HEAD', 'OPTIONS'])
def static_files(path):
    # JavaScript 파일의 MIME type을 명시적으로 설정
    if path.endswith('.js'):
        return send_from_directory('.', path, mimetype='application/javascript')
    elif path.endswith('.css'):
        return send_from_directory('.', path, mimetype='text/css')
    elif path.endswith('.html'):
        return send_from_directory('.', path, mimetype='text/html')
    return send_from_directory('.', path)

@app.route('/images/<path:filename>')
def serve_images(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

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

# 현재 사용자 정보 조회 (개인결제 링크용)
@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile(current_user):
    """현재 로그인한 사용자의 프로필 정보 조회"""
    return jsonify({
        'success': True,
        'user': current_user.to_dict()
    })

# 회원 목록 조회 (관리자 전용)
@app.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': '권한이 없습니다.'}), 403
    
    users = User.query.all()
    users_list = [{
        'db_id': u.id,
        'user_id': u.user_id,
        'name': u.name,
        'email': u.email,
        'phone': u.phone,
        'addr': u.address,
        'addr_detail': '',
        'role': u.role,
        'biz_name': u.company if u.role == 'business' else '',
        'biz_num': '',
        'status': 'active',
        'created_at': u.created_at.isoformat() if u.created_at else None
    } for u in users]
    
    return jsonify({'success': True, 'users': users_list})

# 회원 정보 수정
@app.route('/api/users/<user_id>', methods=['PUT'])
@token_required
def update_user(current_user, user_id):
    # 본인 또는 관리자만 수정 가능
    if current_user.user_id != user_id and current_user.role != 'admin':
        return jsonify({'success': False, 'message': '권한이 없습니다.'}), 403
    
    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return jsonify({'success': False, 'message': '사용자를 찾을 수 없습니다.'}), 404
    
    data = request.json
    
    # 비밀번호 변경 요청이 있는 경우
    if 'current_pw' in data and 'new_pw' in data:
        if not user.check_password(data['current_pw']):
            return jsonify({'success': False, 'message': '현재 비밀번호가 일치하지 않습니다.'}), 400
        user.set_password(data['new_pw'])
    
    # 기타 정보 업데이트
    if 'name' in data:
        user.name = data['name']
    if 'phone' in data:
        user.phone = data['phone']
    if 'addr' in data:
        user.address = data['addr']
    if 'email' in data:
        user.email = data['email']
    if 'biz_name' in data:
        user.company = data['biz_name']
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': '회원정보가 수정되었습니다.'})

# 회원 삭제 (관리자 전용)
@app.route('/api/users/<user_id>', methods=['DELETE'])
@token_required
def delete_user(current_user, user_id):
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': '권한이 없습니다.'}), 403
    
    if user_id == 'admin':
        return jsonify({'success': False, 'message': '관리자 계정은 삭제할 수 없습니다.'}), 400
    
    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return jsonify({'success': False, 'message': '사용자를 찾을 수 없습니다.'}), 404
    
    db.session.delete(user)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '회원이 삭제되었습니다.'})

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
        quote_details=json.dumps(data.get('quote_details', {}), ensure_ascii=False),
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
    # [Fix] completed 상태인 주문만 반환 (pending은 숨김)
    orders = Order.query.filter_by(user_db_id=current_user.id, status='completed').order_by(Order.created_at.desc()).all()
    
    return jsonify({'success': True, 'orders': [o.to_dict() for o in orders]})

@app.route('/api/orders', methods=['POST'])
@token_required
def create_order(current_user):
    try:
        data = request.json
        
        # 주문번호: O고객번호-날짜시간 (예: O00001-20260121123456)
        customer_num = f"{current_user.id:05d}"
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        order_id = f"O{customer_num}-{timestamp}"
        customer_code = f"C{current_user.id:05d}"
        
        payment_info = data.get('payment_info', {})
        
        new_order = Order(
            order_id=order_id,
            user_db_id=current_user.id,
            items=json.dumps(data.get('items', []), ensure_ascii=False),
            total_price=data.get('total_price'),
            delivery_info=json.dumps(data.get('delivery_info', {}), ensure_ascii=False),
            order_details=json.dumps(data.get('order_details', {}), ensure_ascii=False),
            status='pending',
            mul_no=payment_info.get('mul_no'),
            pay_type=payment_info.get('pay_type')
        )
        
        db.session.add(new_order)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'order_id': order_id,
            'customer_code': customer_code,
            'order_code': order_id  # order_id가 이미 고객번호 포함
        })
    except Exception as e:
        db.session.rollback()
        print(f"❌ 주문 생성 에러: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'주문 생성 실패: {str(e)}'}), 500

@app.route('/api/orders/<order_id>', methods=['GET'])
@token_required
def get_order_detail(current_user, order_id):
    """개별 주문 정보 조회"""
    try:
        order = Order.query.filter_by(order_id=order_id, user_db_id=current_user.id).first()
        
        if not order:
            return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다'}), 404
        
        return jsonify({
            'success': True,
            'order': order.to_dict()
        })
    except Exception as e:
        print(f"❌ 주문 조회 에러: {e}")
        return jsonify({'success': False, 'message': f'주문 조회 실패: {str(e)}'}), 500

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

    return jsonify({'success': True, 'message': '장바구니에 추가되었습니다.', 'item': cart_item.to_dict()})

@app.route('/api/cart/<int:item_id>', methods=['DELETE'])
@token_required
def delete_cart_item(current_user, item_id):
    item = CartItem.query.filter_by(user_db_id=current_user.id, id=item_id).first()
    if not item:
        return jsonify({'success': False, 'message': '항목을 찾을 수 없습니다.'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'success': True, 'message': '장바구니 항목이 삭제되었습니다.'})

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
    max_size = app.config.get('MAX_CONTENT_LENGTH')
    if max_size and request.content_length and request.content_length > max_size:
        return jsonify({'success': False, 'message': '파일 용량이 너무 큽니다. 최대 20MB까지 가능합니다.'}), 413
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
    
    upload_folder = UPLOAD_FOLDER
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
    web_path = f"/images/{new_filename}"
    return jsonify({'success': True, 'path': web_path, 'filename': new_filename})

@app.route('/api/homepage-settings', methods=['GET'])
def get_homepage_settings():
    """홈페이지 설정 조회"""
    settings = HomepageSettings.query.first()
    if not settings:
        return jsonify({'success': True, 'settings': {'slides': [], 'logo': '', 'quoteImg': '', 'favicon': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjI1NiIgeT0iMzgwIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiPkc8L3RleHQ+PC9zdmc+'}})
    return jsonify({'success': True, 'settings': settings.to_dict()})

@app.route('/api/homepage-settings', methods=['POST'])
@token_required
@admin_required
def save_homepage_settings(current_user):
    """홈페이지 설정 저장"""
    import os
    data = request.json
    settings = HomepageSettings.query.first()
    
    if not settings:
        settings = HomepageSettings()
        db.session.add(settings)
    
    # 기존 로고 삭제
    if 'logo' in data and data['logo']:
        if settings.logo and settings.logo != data['logo']:
            try:
                # /images/filename 형식에서 filename 추출
                old_filename = settings.logo.split('/')[-1]
                old_file = os.path.join(UPLOAD_FOLDER, old_filename)
                if os.path.exists(old_file):
                    os.remove(old_file)
                    print(f"기존 로고 삭제됨: {old_file}")
            except Exception as e:
                print(f"기존 로고 삭제 실패: {e}")
        settings.logo = data['logo']
    
    # 기존 견적 이미지 삭제
    if 'quoteImg' in data and data['quoteImg']:
        if settings.quote_img and settings.quote_img != data['quoteImg']:
            try:
                old_filename = settings.quote_img.split('/')[-1]
                old_file = os.path.join(UPLOAD_FOLDER, old_filename)
                if os.path.exists(old_file):
                    os.remove(old_file)
                    print(f"기존 견적 이미지 삭제됨: {old_file}")
            except Exception as e:
                print(f"기존 견적 이미지 삭제 실패: {e}")
        settings.quote_img = data['quoteImg']
    
    # 파비콘 처리
    if 'favicon' in data and data['favicon']:
        if settings.favicon and settings.favicon != data['favicon']:
            try:
                # /images/filename 형식에서 filename 추출
                old_filename = settings.favicon.split('/')[-1]
                old_file = os.path.join(UPLOAD_FOLDER, old_filename)
                if os.path.exists(old_file) and old_filename != 'favicon_temp.svg':
                    os.remove(old_file)
                    print(f"기존 파비콘 삭제됨: {old_file}")
            except Exception as e:
                print(f"기존 파비콘 삭제 실패: {e}")
        settings.favicon = data['favicon']
    
    # 슬라이드 이미지 삭제
    if 'slides' in data:
        try:
            # 기존 슬라이드 파싱
            if settings.slides:
                old_slides = json.loads(settings.slides)
            else:
                old_slides = []
            
            new_slides = data['slides']
            
            # 슬라이드가 문자열 배열인 경우 처리
            if old_slides and isinstance(old_slides[0], str):
                old_slide_images = set(old_slides)
                new_slide_images = set(new_slides)
            else:
                # 슬라이드가 객체 배열인 경우 처리
                old_slide_images = {s.get('image') if isinstance(s, dict) else s for s in old_slides if s}
                new_slide_images = {s.get('image') if isinstance(s, dict) else s for s in new_slides if s}
            
            # 제거된 슬라이드의 이미지 삭제
            deleted_images = old_slide_images - new_slide_images
            print(f"삭제할 이미지: {deleted_images}")
            
            for image in deleted_images:
                if image:
                    try:
                        image_filename = image.split('/')[-1]
                        image_file = os.path.join(UPLOAD_FOLDER, image_filename)
                        print(f"이미지 삭제 시도: {image_file}")
                        if os.path.exists(image_file):
                            os.remove(image_file)
                            print(f"슬라이드 이미지 삭제됨: {image_file}")
                        else:
                            print(f"파일이 존재하지 않음: {image_file}")
                    except Exception as e:
                        print(f"슬라이드 이미지 삭제 실패: {e}")
        except Exception as e:
            print(f"슬라이드 처리 중 에러: {e}")
            import traceback
            traceback.print_exc()
        
        settings.slides = json.dumps(data['slides'])
    
    db.session.commit()
    return jsonify({'success': True, 'message': '홈페이지 설정이 저장되었습니다.'})

# ==================== 카테고리 설정 API ====================
@app.route('/api/category-settings', methods=['GET'])
def get_category_settings():
    """모든 카테고리 설정 조회"""
    categories = CategorySettings.query.all()
    result = {}
    for cat in categories:
        result[cat.category] = json.loads(cat.settings_data) if cat.settings_data else {}
    return jsonify({'success': True, 'settings': result})

@app.route('/api/category-settings/<category>', methods=['GET'])
def get_category_setting(category):
    """특정 카테고리 설정 조회"""
    cat_setting = CategorySettings.query.filter_by(category=category).first()
    if not cat_setting:
        return jsonify({'success': True, 'settings': {}})
    return jsonify({'success': True, 'settings': json.loads(cat_setting.settings_data)})

@app.route('/api/category-settings', methods=['POST'])
@token_required
@admin_required
def save_category_settings(current_user):
    """카테고리 설정 저장"""
    data = request.json
    category = data.get('category')
    settings = data.get('settings')
    
    if not category or not settings:
        return jsonify({'success': False, 'message': '카테고리와 설정 데이터가 필요합니다.'}), 400
    
    cat_setting = CategorySettings.query.filter_by(category=category).first()
    
    if not cat_setting:
        cat_setting = CategorySettings(category=category)
        db.session.add(cat_setting)
    
    cat_setting.settings_data = json.dumps(settings, ensure_ascii=False)
    cat_setting.updated_at = datetime.utcnow()
    
    db.session.commit()
    return jsonify({'success': True, 'message': f'{category} 설정이 저장되었습니다.'})

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
    import os
    popup = PopupNotice.query.get(popup_id)
    if not popup:
        return jsonify({'success': False, 'message': '팝업 공지사항을 찾을 수 없습니다.'}), 404
    data = request.json
    
    # 기존 이미지 삭제
    if 'image_path' in data and data['image_path'] and popup.image_path != data['image_path']:
        try:
            old_filename = popup.image_path.split('/')[-1]
            old_file = os.path.join(UPLOAD_FOLDER, old_filename)
            if os.path.exists(old_file):
                os.remove(old_file)
                print(f"기존 팝업 이미지 삭제됨: {old_file}")
        except Exception as e:
            print(f"기존 팝업 이미지 삭제 실패: {e}")
    
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

@app.route('/api/admin/images', methods=['GET'])
@token_required
@admin_required
def list_images(current_user):
    """업로드된 이미지 목록 조회"""
    import os
    try:
        if not os.path.exists(UPLOAD_FOLDER):
            return jsonify({'success': True, 'images': [], 'count': 0})
        
        files = os.listdir(UPLOAD_FOLDER)
        image_files = []
        for f in files:
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                filepath = os.path.join(UPLOAD_FOLDER, f)
                size = os.path.getsize(filepath)
                mtime = os.path.getmtime(filepath)
                image_files.append({
                    'filename': f,
                    'size': size,
                    'modified': mtime,
                    'url': f'/images/{f}'
                })
        
        # 수정 시간 기준 내림차순 정렬
        image_files.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({'success': True, 'images': image_files, 'count': len(image_files)})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/images/<filename>', methods=['DELETE'])
@token_required
@admin_required
def delete_image(current_user, filename):
    """이미지 파일 삭제"""
    import os
    try:
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            return jsonify({'success': False, 'message': '파일이 존재하지 않습니다.'}), 404
        
        os.remove(filepath)
        return jsonify({'success': True, 'message': f'{filename} 삭제됨'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

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

@app.route('/api/admin/orders', methods=['GET'])
@token_required
@admin_required
def list_admin_orders(current_user):
    """관리자용 주문 목록 조회 및 검색"""
    search_query = request.args.get('search', '').strip()
    
    if search_query:
        # 주문번호 또는 고객명으로 검색 (completed만)
        orders = Order.query.filter(
            (Order.status == 'completed') &
            ((Order.order_id.contains(search_query)) |
             (Order.user.has(User.name.contains(search_query))))
        ).order_by(Order.created_at.desc()).all()
    else:
        # [Fix] completed 상태인 주문만 반환 (pending은 숨김)
        orders = Order.query.filter_by(status='completed').order_by(Order.created_at.desc()).all()
    
    return jsonify({
        'success': True,
        'orders': [o.to_dict() for o in orders],
        'count': len(orders)
    })

@app.route('/api/admin/orders/<order_id>', methods=['GET'])
@token_required
@admin_required
def get_admin_order(current_user, order_id):
    """관리자용 주문 상세 조회"""
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    return jsonify({'success': True, 'order': order.to_dict()})

@app.route('/api/admin/orders/<order_id>/status', methods=['PUT'])
@token_required
@admin_required
def update_order_status(current_user, order_id):
    """관리자용 주문 상태 업데이트"""
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    data = request.json
    new_status = data.get('status', '').strip()
    
    # 허용된 상태
    allowed_statuses = ['pending', 'preparing', 'shipping', 'completed']
    if new_status not in allowed_statuses:
        return jsonify({'success': False, 'message': '유효하지 않은 상태입니다.'}), 400
    
    order.status = new_status
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': f'주문 상태가 업데이트되었습니다.',
        'order': order.to_dict()
    })

@app.route('/api/orders/<order_id>/cancel', methods=['PUT', 'POST'])
@token_required
def cancel_user_order(current_user, order_id):
    """사용자가 자신의 주문을 취소 또는 삭제"""
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    # 현재 사용자의 주문인지 확인
    if order.user_db_id != current_user.id:
        return jsonify({'success': False, 'message': '다른 사용자의 주문은 취소할 수 없습니다.'}), 403
    
    # [Fix] 결제 미완료(pending) 상태면 삭제, 아니면 취소 상태로 변경
    if order.status == 'pending':
        # pending 상태면 DELETE처럼 처리
        db.session.delete(order)
        db.session.commit()
        print(f"[cancel_user_order] ✅ 미결제 주문 삭제 완료: {order_id}")
        return jsonify({
            'success': True,
            'message': '결제 미완료 주문이 삭제되었습니다.',
            'order_id': order_id
        })
    elif order.status == 'cancelled':
        return jsonify({'success': False, 'message': '이미 취소된 주문입니다.'}), 400
    else:
        # 다른 상태면 취소 처리
        order.status = 'cancelled'
        db.session.commit()
        print(f"[cancel_user_order] ✅ 주문 취소 완료: {order_id}")
        return jsonify({
            'success': True,
            'message': '주문이 취소되었습니다.',
            'order': order.to_dict()
        })

@app.route('/api/orders/<order_id>', methods=['PUT'])
@token_required
def update_order_payment(current_user, order_id):
    """주문의 결제 정보 업데이트 (mul_no, pay_type 등)"""
    print(f"[PUT /api/orders/{order_id}] 요청 사용자: {current_user.id}")
    
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        print(f"[PUT] 주문을 찾을 수 없음: {order_id}")
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    # 현재 사용자의 주문인지 확인
    if order.user_db_id != current_user.id:
        print(f"[PUT] 권한 없음: 요청자={current_user.id}, 주문자={order.user_db_id}")
        return jsonify({'success': False, 'message': '다른 사용자의 주문은 수정할 수 없습니다.'}), 403
    
    data = request.json
    
    # mul_no, pay_type 업데이트
    if 'mul_no' in data:
        order.mul_no = data['mul_no']
        print(f"[PUT] mul_no 업데이트: {data['mul_no']}")
    
    if 'pay_type' in data:
        order.pay_type = data['pay_type']
        print(f"[PUT] pay_type 업데이트: {data['pay_type']}")
    
    db.session.commit()
    print(f"[PUT] ✅ 주문 정보 업데이트 완료: {order_id}")
    
    return jsonify({
        'success': True,
        'message': '주문이 업데이트되었습니다.',
        'order_id': order_id
    })

# [Fix] PATCH: 결제 완료 후 상태 업데이트
@app.route('/api/orders/<order_id>', methods=['PATCH'])
@token_required
def update_order_status_on_payment(current_user, order_id):
    """주문 상태 업데이트 (pending → completed) - 결제 완료 시"""
    print(f"[PATCH /api/orders/{order_id}] 요청 사용자: {current_user.id}")
    
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        print(f"[PATCH] 주문을 찾을 수 없음: {order_id}")
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    # 현재 사용자의 주문인지 확인
    if order.user_db_id != current_user.id:
        print(f"[PATCH] 권한 없음: 요청자={current_user.id}, 주문자={order.user_db_id}")
        return jsonify({'success': False, 'message': '다른 사용자의 주문은 수정할 수 없습니다.'}), 403
    
    data = request.json
    
    # status 업데이트 (pending → completed)
    if 'status' in data:
        order.status = data['status']
        print(f"[PATCH] status 업데이트: {data['status']}")
    
    db.session.commit()
    print(f"[PATCH] ✅ 주문 상태 업데이트 완료: {order_id} → {order.status}")
    
    return jsonify({
        'success': True,
        'message': f'주문 상태가 {order.status}로 업데이트되었습니다.',
        'order_id': order_id,
        'status': order.status
    })

@app.route('/api/orders/<order_id>', methods=['DELETE'])
@token_required
def delete_user_order(current_user, order_id):
    """
    사용자가 미완료 주문 또는 취소된 주문을 삭제
    - 결제 미완료 (mul_no 없음): 바로 삭제 가능
    - 취소된 주문: 삭제 가능
    """
    print(f"[DELETE /api/orders/{order_id}] 요청 사용자: {current_user.id}")
    
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        print(f"[DELETE] 주문을 찾을 수 없음: {order_id}")
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    print(f"[DELETE] 주문 정보 - status: {order.status}, mul_no: {order.mul_no}, user_db_id: {order.user_db_id}, current_user.id: {current_user.id}")
    
    # 현재 사용자의 주문인지 확인
    if order.user_db_id != current_user.id:
        print(f"[DELETE] 권한 없음: 요청자={current_user.id}, 주문자={order.user_db_id}")
        return jsonify({'success': False, 'message': '다른 사용자의 주문은 삭제할 수 없습니다.'}), 403
    
    # 삭제 가능한 경우:
    # 1. 결제 미완료 상태 (mul_no가 없고 pending 상태)
    # 2. 취소된 주문 (status='cancelled')
    is_unpaid = not order.mul_no and order.status == 'pending'
    is_cancelled = order.status == 'cancelled'
    
    print(f"[DELETE] 삭제 가능 여부 - is_unpaid: {is_unpaid}, is_cancelled: {is_cancelled}")
    
    if not (is_unpaid or is_cancelled):
        print(f"[DELETE] 삭제 불가능: status={order.status}, mul_no={order.mul_no}")
        return jsonify({
            'success': False, 
            'message': '결제 미완료 또는 취소된 주문만 삭제할 수 있습니다.',
            'order_status': order.status,
            'mul_no': order.mul_no,
            'is_unpaid': is_unpaid,
            'is_cancelled': is_cancelled
        }), 400
    
    db.session.delete(order)
    db.session.commit()
    print(f"[DELETE] ✅ 주문 삭제 완료: {order_id}")
    
    return jsonify({
        'success': True,
        'message': '주문이 삭제되었습니다.'
    })

@app.route('/api/orders/<order_id>/refund', methods=['POST'])
@token_required
def request_refund(current_user, order_id):
    """사용자가 환불을 요청"""
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    # 현재 사용자의 주문인지 확인
    if order.user_db_id != current_user.id:
        return jsonify({'success': False, 'message': '다른 사용자의 주문은 환불 요청할 수 없습니다.'}), 403
    
    # 환불 가능한 상태 확인 (접수완료, 제작중만 가능)
    if order.status not in ['pending', '접수완료', 'preparing', '제작중']:
        return jsonify({'success': False, 'message': '이 상태에서는 환불을 요청할 수 없습니다.'}), 400
    
    # 이미 환불 요청했거나 환불 완료된 경우
    if order.status in ['refund_requested', 'refunded']:
        return jsonify({'success': False, 'message': '이미 환불이 요청되었거나 완료되었습니다.'}), 400
    
    order.status = 'refund_requested'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '환불 요청이 접수되었습니다.',
        'order': order.to_dict()
    })

@app.route('/api/admin/orders/<order_id>/refund/approve', methods=['PUT'])
@token_required
@admin_required
def approve_refund(current_user, order_id):
    """관리자가 환불을 승인 - PayApp 결제 취소"""
    print(f"🔄 환불 승인 시작: {order_id}")
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        print(f"❌ 주문을 찾을 수 없음: {order_id}")
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    print(f"📋 주문 상태: {order.status}, mul_no: {order.mul_no}")
    
    if order.status != 'refund_requested':
        print(f"❌ 환불 요청 상태 아님: {order.status}")
        return jsonify({'success': False, 'message': '환불 요청 상태의 주문만 승인할 수 있습니다.'}), 400
    
    try:
        # PayApp 결제 취소 처리 (mul_no가 있는 경우만)
        if order.mul_no:
            print(f"🔗 PayApp 취소 API 호출 시작: mul_no={order.mul_no}")
            payapp_response = _cancel_payapp_payment(
                mul_no=order.mul_no,
                total_price=order.total_price,
                cancel_memo='테스트 환불 처리'
            )
            
            if not payapp_response.get('success'):
                return jsonify({
                    'success': False, 
                    'message': f'PayApp 취소 실패: {payapp_response.get("error", "알 수 없는 오류")}'
                }), 500
            
            print(f"✅ PayApp 취소 성공: {order_id}")
        else:
            # mul_no가 없는 경우 수동 환불로 처리
            print(f"📋 수동 환불 처리: {order_id} (결제번호 없음)")
        
        # 주문 상태 업데이트
        order.status = 'refunded'
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '환불이 처리되었습니다.',
            'order': order.to_dict()
        })
    
    except Exception as e:
        print(f"❌ 환불 처리 중 오류: {e}")
        return jsonify({
            'success': False,
            'message': f'환불 처리 중 오류 발생: {str(e)}'
        }), 500

@app.route('/api/admin/orders/<order_id>/refund/reject', methods=['PUT'])
@token_required
@admin_required
def reject_refund(current_user, order_id):
    """관리자가 환불을 거절"""
    data = request.json or {}
    reason = data.get('reason', '관리자 판단')
    
    order = Order.query.filter_by(order_id=order_id).first()
    if not order:
        return jsonify({'success': False, 'message': '주문을 찾을 수 없습니다.'}), 404
    
    if order.status != 'refund_requested':
        return jsonify({'success': False, 'message': '환불 요청 상태의 주문만 거절할 수 있습니다.'}), 400
    
    # 환불 거절 시 이전 상태로 복원 (pending)
    order.status = 'pending'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': f'환불이 거절되었습니다. 사유: {reason}',
        'order': order.to_dict()
    })

# ==================== 개인결제 링크 API ====================

@app.route('/api/payment-links', methods=['GET'])
@token_required
@admin_required
def get_payment_links(current_user):
    """관리자: 생성한 개인결제 링크 목록 조회"""
    try:
        links = PaymentLink.query.order_by(PaymentLink.created_at.desc()).all()
        return jsonify({
            'success': True,
            'links': [link.to_dict() for link in links]
        })
    except Exception as e:
        print(f"❌ 링크 목록 조회 오류: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payment-links', methods=['POST'])
@token_required
@admin_required
def create_payment_link(current_user):
    """관리자: 개인결제 링크 생성"""
    try:
        data = request.json or {}
        product_name = data.get('product_name', '').strip()
        price = data.get('price', 0)
        customer_name = data.get('customer_name', '').strip()
        customer_phone = data.get('customer_phone', '').strip()
        memo = data.get('memo', '').strip()

        if not product_name:
            return jsonify({'success': False, 'message': '상품명을 입력해주세요.'}), 400
        
        if not price or price < 1000:
            return jsonify({'success': False, 'message': '결제금액은 1,000원 이상이어야 합니다.'}), 400

        # 고유 링크 코드 생성 (8자리 영문+숫자)
        link_code = secrets.token_urlsafe(6).upper()[:8]
        while PaymentLink.query.filter_by(link_code=link_code).first():
            link_code = secrets.token_urlsafe(6).upper()[:8]

        new_link = PaymentLink(
            link_code=link_code,
            product_name=product_name,
            price=float(price),
            customer_name=customer_name or None,
            customer_phone=customer_phone or None,
            memo=memo or None,
            created_by=current_user.user_id
        )

        db.session.add(new_link)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': '개인결제 링크가 생성되었습니다.',
            'link': new_link.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        print(f"❌ 링크 생성 오류: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payment-links/<link_code>', methods=['GET'])
def get_payment_link_by_code(link_code):
    """고객: 링크 코드로 결제 정보 조회 (인증 불필요)"""
    try:
        link = PaymentLink.query.filter_by(link_code=link_code).first()
        if not link:
            return jsonify({'success': False, 'message': '유효하지 않은 링크입니다.'}), 404
        
        if link.is_used:
            return jsonify({'success': False, 'message': '이미 사용된 링크입니다.'}), 400

        return jsonify({
            'success': True,
            'link': link.to_dict()
        })
    except Exception as e:
        print(f"❌ 링크 조회 오류: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payment-links/<link_code>/use', methods=['POST'])
def use_payment_link(link_code):
    """고객: 개인결제 링크로 결제 완료 후 주문 생성 (인증 불필요)"""
    try:
        data = request.json or {}
        order_id = data.get('order_id')
        
        if not order_id:
            return jsonify({'success': False, 'message': '주문번호가 필요합니다.'}), 400

        link = PaymentLink.query.filter_by(link_code=link_code).first()
        if not link:
            return jsonify({'success': False, 'message': '유효하지 않은 링크입니다.'}), 404

        if link.is_used:
            return jsonify({'success': False, 'message': '이미 사용된 링크입니다.'}), 400

        # 링크 사용 처리
        link.is_used = True
        link.order_id = order_id
        link.used_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'success': True,
            'message': '결제가 완료되었습니다.',
            'link': link.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        print(f"❌ 링크 사용 처리 오류: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payment-links/<int:link_id>', methods=['DELETE'])
@token_required
@admin_required
def delete_payment_link(current_user, link_id):
    """관리자: 링크 삭제 (미사용만 가능)"""
    try:
        link = PaymentLink.query.get(link_id)
        if not link:
            return jsonify({'success': False, 'message': '링크를 찾을 수 없습니다.'}), 404

        if link.is_used:
            return jsonify({'success': False, 'message': '이미 사용된 링크는 삭제할 수 없습니다.'}), 400

        db.session.delete(link)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': '링크가 삭제되었습니다.'
        })

    except Exception as e:
        db.session.rollback()
        print(f"❌ 링크 삭제 오류: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    print("🚀 Flask 서버를 시작합니다...")
    print("📍 URL: http://localhost:5000")
    app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)

