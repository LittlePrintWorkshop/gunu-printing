function get(id) {
  return document.getElementById(id);
}

// Payment Link Context - centralized state management
window.paymentLinkContext = {
  isActive: false,
  code: null,
  link: null,
  isChecked: false,

  start(payCode) {
    this.code = payCode;
    this.isActive = true;
    this.isChecked = false;
    this.link = null;
  },

  setLink(linkData) {
    this.link = linkData;
    this.isChecked = true;
  },

  complete() {
    this.isActive = false;
    this.code = null;
    this.link = null;
    this.isChecked = false;
  },

  isProcessing() {
    return this.isActive && !this.isChecked;
  }
};

// ===== 결제 완료 처리 =====
// PayApp 결제 후 돌아올 때 결제 완료 처리
function checkPaymentComplete() {
  const params = new URLSearchParams(window.location.search);
  console.log('현재 URL 파라미터:', window.location.search);
  console.log('order_complete 값:', params.get('order_complete'));
  const returnedOrderId = params.get('order_id');
  const payCode = params.get('pay_code'); // 개인결제 링크 코드
  
  if (params.get('order_complete') === 'true') {
    console.log('결제 완료 감지됨');
    // 결제중 상태 제거
    hidePaymentProcessing();
    
    // URL에서 order_complete 파라미터 제거
    // 결제 완료 후에는 URL 파라미터를 정리하되, 기본 상태(view-home)를 유지하도록 상태를 덮어쓴다.
    window.history.replaceState({ view: 'view-home' }, document.title, window.location.pathname);
    
    // 개인결제 링크로 결제한 경우
    if (payCode) {
      console.log('개인결제 링크로 결제 완료:', payCode);
      handlePaymentLinkComplete(payCode, returnedOrderId);
      return;
    }
    
    // 1. URL 파라미터에서 order_id가 있는 경우
    if (returnedOrderId) {
      console.log('order_id로 복구:', returnedOrderId);
      finalizeOrderById(returnedOrderId);
      return;
    }
    
    // 2. localStorage에 저장된 lastOrderId가 있는 경우 (바로주문)
    const lastOrderId = localStorage.getItem('lastOrderId');
    if (lastOrderId) {
      console.log('localStorage의 lastOrderId로 복구:', lastOrderId);
      localStorage.removeItem('lastOrderId');
      finalizeOrderById(lastOrderId);
      return;
    }

    // 3. 임시 주문 정보가 있으면 처리 (옛날 방식)
    const tempOrder = localStorage.getItem('tempOrder');
    const tempDirectOrder = localStorage.getItem('tempDirectOrder');
    
    console.log('tempOrder:', tempOrder);
    console.log('tempDirectOrder:', tempDirectOrder);
    
    if (tempOrder) {
      const orderData = JSON.parse(tempOrder);
      console.log('장바구니 주문 처리 시작');
      saveOrderFromPayment(orderData);
    } else if (tempDirectOrder) {
      const orderData = JSON.parse(tempDirectOrder);
      console.log('직접주문 처리 시작');
      saveDirectOrderFromPayment(orderData);
    } else {
      console.log('임시 주문 정보 없음');
      alert('주문 정보를 찾을 수 없습니다. 주문 조회 메뉴에서 확인해주세요.');
    }
  }
}

// 팝업 창에서 보내는 메시지 받기
window.addEventListener('message', (event) => {
  // 보안: 같은 오리진에서만 받기
  if (event.origin !== window.location.origin) {
    return;
  }
  
  console.log('메시지 수신:', event.data);
  
  if (event.data.type === 'paymentComplete') {
    console.log('팝업 창에서 결제 완료 메시지 수신:', event.data);
    
    if (event.data.orderComplete && event.data.orderId) {
      console.log('결제 완료 처리 시작:', event.data.orderId);
      finalizeOrderById(event.data.orderId);
    }
  }
});

// Page load event - check URL parameters and initialize context if needed
window.addEventListener('load', async () => {
  console.log('Page load complete');
  
  // Load category settings from server
  await loadCategorySettingsFromServer();
  
  // Check for payment link context or pay parameter
  const payParam = new URLSearchParams(window.location.search).get('pay');
  const hasPayParam = payParam !== null;
  
  // If payment link context is active OR pay parameter present, skip home restore
  if ((window.paymentLinkContext && window.paymentLinkContext.isActive) || hasPayParam) {
    console.log('Initial load: Payment link flow detected - skipping home restore');
    if (hasPayParam && window.paymentLinkContext) {
      window.paymentLinkContext.start(payParam);
    }
    try { hideAll(); } catch (e) {}
    // Record state to stabilize back button behavior
    window.history.replaceState({ view: 'payment-link' }, document.title, window.location.pathname + (window.location.hash || ''));
  } else {
    // On initial entry, record default view if state doesn't exist
    const initialView = (window.location.hash || '').replace('#', '') || DEFAULT_VIEW;
    if (!window.history.state || !window.history.state.view) {
      window.history.replaceState({ view: initialView }, document.title, window.location.pathname + (window.location.hash || ''));
      restoreView({ view: initialView });
    }
  }
  checkPaymentComplete();
});

// 서버에서 생성된 주문 아이디로 완료 처리 (정상 복구)
async function finalizeOrderById(orderId, retryCount = 0) {
  try {
    const MAX_RETRIES = 3;
    console.log(`=== finalizeOrderById 호출됨 (시도 ${retryCount + 1}) ===`);
    console.log('orderId:', orderId);

    if (retryCount === 0) {
      // 첫 시도에서 결제중 상태 제거
      hidePaymentProcessing();
    }

    const token = getToken();
    if (!token) {
      alert('로그인 정보가 만료되었습니다. 다시 로그인해주세요.');
      goLogin();
      return;
    }

    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error(data.message || '주문 목록을 불러올 수 없습니다');

    const order = (data.orders || []).find(o => o.order_id === orderId || o.id === orderId);
    if (!order) {
      // 재시도
      if (retryCount < MAX_RETRIES) {
        console.log(`${retryCount + 1}초 후 재시도...`);
        setTimeout(() => finalizeOrderById(orderId, retryCount + 1), (retryCount + 1) * 1000);
        return;
      }
      // 재시도 초과 시 안내
      const goHistory = confirm('주문 정보를 찾을 수 없습니다.\n\n결제는 완료되었을 수 있습니다.\n주문 조회 메뉴에서 확인해주세요.\n\n[확인] 주문 조회로 이동 / [취소] 홈으로 이동');
      if (goHistory) {
        renderOrderHistory();
      } else {
        goHome();
      }
      return;
    }

    // 주문을 찾았으면 장바구니 초기화
    await clearCartEverywhere();

    const cartView = document.getElementById('view-cart');
    if (cartView && cartView.style.display !== 'none') {
      renderCartView();
    }

    const orderCode = order.order_code || order.order_id || order.id;
    const totalPrice = order.total_price || 0;
    showOrderComplete(order.id || orderId, orderCode, totalPrice);
  } catch (e) {
    console.error('주문 조회 중 오류:', e);
    hidePaymentProcessing();
    if (retryCount < 3) {
      setTimeout(() => finalizeOrderById(orderId, retryCount + 1), (retryCount + 1) * 1000);
    } else {
      alert('주문 처리 중 오류가 발생했습니다.\n\n결제는 완료되었을 수 있습니다.\n주문 조회 메뉴에서 확인해주세요.\n\n오류: ' + e.message);
      goHome();
    }
  }
}

// ===== NOTICE (공개) =====
let noticeCache = [];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')}`;
}

async function loadNotices(force = false) {
  if (noticeCache.length > 0 && !force) return noticeCache;
  try {
    const res = await fetch('/api/notices');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    if (data.success) {
      noticeCache = data.notices || [];
      renderHomeNotices();
      renderNoticeList();
    } else {
      throw new Error(data.message || 'load failed');
    }
  } catch (e) {
    console.error('공지 불러오기 실패', e);
    const listEl = get('notice-list');
    if (listEl) listEl.innerHTML = '<div style="padding:16px; color:#ef4444;">공지 불러오기에 실패했습니다. 서버가 실행 중인지 확인하세요.</div>';
    const home = get('home-notice-list');
    if (home) home.innerHTML = '<div class="notice-item">공지 불러오기 오류</div>';
  }
  return noticeCache;
}

function renderHomeNotices() {
  const wrap = get('home-notice-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const items = noticeCache.slice(0, 4);
  if (items.length === 0) {
    wrap.innerHTML = '<div class="notice-item">등록된 공지가 없습니다.</div>';
    return;
  }
  items.forEach(n => {
    const div = document.createElement('div');
    div.className = 'notice-item';
    div.innerHTML = `<span class="notice-tag">[${n.category || '공지'}]</span><span class="notice-title">${n.title}</span>`;
    div.onclick = () => openNotice(n.id, true);
    wrap.appendChild(div);
  });
}

function renderNoticeList() {
  const listEl = get('notice-list-container');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (noticeCache.length === 0) {
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8; font-size:14px;">등록된 공지가 없습니다.</div>';
    return;
  }
  noticeCache.forEach(n => {
    const item = document.createElement('div');
    item.style.padding = '16px';
    item.style.border = '1px solid var(--line)';
    item.style.borderRadius = '8px';
    item.style.cursor = 'pointer';
    item.style.transition = 'all 0.2s';
    item.style.background = '#f8fafc';
    item.style.marginBottom = '12px';
    item.onmouseover = () => {
      item.style.background = '#ecfdf5';
      item.style.transform = 'translateX(4px)';
      item.style.borderColor = 'var(--primary)';
    };
    item.onmouseout = () => {
      item.style.background = '#f8fafc';
      item.style.transform = 'translateX(0)';
      item.style.borderColor = 'var(--line)';
    };
    item.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <span style="font-size:11px; color:white; background:var(--primary); padding:2px 6px; border-radius:4px; font-weight:700;">${n.category || '공지'}</span>
          ${n.is_pinned ? '<span style="font-size:12px;">📌</span>' : ''}
        </div>
        <span style="font-weight:700; color:#0f172a; font-size:15px;">${n.title}</span>
        <span style="font-size:12px; color:#94a3b8;">${formatDate(n.created_at)}</span>
      </div>`;
    item.onclick = () => openNotice(n.id);
    listEl.appendChild(item);
  });
}

function openNotice(id, navigateToPage = false) {
  const notice = noticeCache.find(n => n.id === id);
  if (!notice) return;
  
  // navigateToPage가 true면 전체 페이지 표시 + 히스토리 추가
  if (navigateToPage) {
    navigate('view-notice');
  }
  
  // 목록 모드 숨기고 상세 모드 표시
  get('notice-list-mode').style.display = 'none';
  get('notice-detail-mode').style.display = 'block';
  
  // 상세 내용 표시
  get('notice-detail-title').textContent = notice.title;
  get('notice-detail-meta').textContent = `${notice.category || ''} · ${formatDate(notice.created_at)}`;
  get('notice-detail-content').innerHTML = sanitizeHTML(notice.content || '');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToNoticeList() {
  get('notice-list-mode').style.display = 'block';
  get('notice-detail-mode').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function goNoticeList() {
  navigate('view-notice');
  get('notice-list-mode').style.display = 'block';
  get('notice-detail-mode').style.display = 'none';
  await loadNotices(true);
  renderNoticeList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== COMMON FUNCTIONS =====
function hideAll() {
  ['view-home', 'view-login', 'view-signup', 'view-cart', 'view-cs', 'view-admin', 'view-find', 'view-quotation', 'view-order', 'view-notice', 'view-account-edit'].forEach(id => {
    const el = get(id);
    if (el) el.style.display = 'none';
  });
  const mc = document.querySelector('.main-content');
  if (mc) mc.style.display = 'none';
  
  // 관리자 패널은 hideAll에서 숨기지 않음 - 관리자 로그인 상태 유지를 위해
  // const adminPanel = get('admin-panel');
  // if (adminPanel) adminPanel.style.display = 'none';
}

const DEFAULT_VIEW = 'view-home';

function navigate(viewId, options = {}) {
  const display = options.display || 'block';
  const push = options.push !== false;
  const scroll = options.scroll !== false;
  const state = options.state || { view: viewId || DEFAULT_VIEW };

  hideAll();
  const el = get(viewId || DEFAULT_VIEW);
  if (el) el.style.display = display;

  if (push) {
    window.history.pushState(state, document.title, window.location.pathname + '#' + (viewId || DEFAULT_VIEW));
  }

  if (scroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function restoreView(state) {
  const viewId = (state && state.view) || DEFAULT_VIEW;
  const display = viewId === 'view-cs' ? 'flex' : 'block';

  // 견적 카테고리 정보가 있으면 해당 카테고리로 복원
  if (viewId === 'view-quotation' && state && state.cat) {
    setCategory(state.cat, state.bind, true);
    return;
  }

  navigate(viewId, { push: false, display, scroll: false });
}

window.addEventListener('popstate', (event) => {
  restoreView(event.state);
});

// 간단한 HTML sanitize: script 제거, on* 핸들러 제거, javascript: 차단
function sanitizeHTML(html) {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';

    const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      // script, style 제거
      if (el.tagName && (el.tagName.toLowerCase() === 'script' || el.tagName.toLowerCase() === 'style')) {
        el.remove();
        continue;
      }
      // on* 이벤트 제거, javascript: 제거
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value || '';
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if ((name === 'href' || name === 'src') && value.trim().toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    }
    return tmp.innerHTML;
  } catch (e) {
    // 실패 시 plain text로 처리
    const esc = (html || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc;
  }
}

function toast(msg) {
  const t = get('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

// 견적 요약서에 현재 페이지/제본 라벨 표시용
function buildSummaryCategoryLabel() {
  const bindNames = { staple: '중철', perfect: '무선' };
  const modeNames = {
    book_indigo: '소량 인디고',
    book_digital: '흑백 디지털',
    book_offset: '대량 옵셋',
    flyer_small: '소량 전단',
    flyer_large: '대량 전단'
  };
  const modeMap = {
    indigo: 'book_indigo',
    digital: 'book_digital',
    offset: 'book_offset',
    flyer_small: 'flyer_small',
    flyer_large: 'flyer_large'
  };

  const modeKey = (typeof currentQuoteMode !== 'undefined' && currentQuoteMode)
    ? currentQuoteMode
    : (modeMap[window.currentCategory] || 'book_indigo');

  const base = modeNames[modeKey] || '인쇄 상품';
  const bindKey = window.currentBindType || getRadio('ind-bind') || '';
  const bindText = bindNames[bindKey] || '';

  if (modeKey.startsWith('book_') && bindText) {
    return `${base} ${bindText}`;
  }
  return base;
}

function updateSummaryCategoryLabel() {
  const sumCat = get('sum-cat');
  if (sumCat) sumCat.textContent = buildSummaryCategoryLabel();
}

// 책자 기본 용지 설정: 표지=스노우지, 내지=모조지
function setDefaultBookPapers() {
  const isBook = (typeof currentQuoteMode !== 'undefined' && currentQuoteMode.startsWith('book')) ||
                 (window.currentCategory && !window.currentCategory.startsWith('flyer'));
  if (!isBook) return;

  const coverTypeEl = get('ind-coverType');
  if (coverTypeEl && coverTypeEl.querySelector('option[value="스노우지"]')) {
    coverTypeEl.value = '스노우지';
    if (typeof updateIndGram === 'function') updateIndGram('cover');
  }

  const innerTypeEl = get('ind-innerType');
  if (innerTypeEl && innerTypeEl.querySelector('option[value="모조지"]')) {
    innerTypeEl.value = '모조지';
    if (typeof updateIndGram === 'function') updateIndGram('inner');
  }
}

function goHome() {
  // Skip navigation if payment link context is active
  if (window.paymentLinkContext && window.paymentLinkContext.isActive) {
    console.log('[goHome] Payment link context active - skipping navigation');
    return;
  }
  
  navigate('view-home');
  // Remove active class from all category links
  document.querySelectorAll('.cat-link').forEach(link => {
    link.classList.remove('active');
  });
  
  // Reset quote summary
  const sumCat = get('sum-cat');
  const sumQty = get('sum-qty');
  const sumTotal = get('sum-total');
  const sumSupply = get('sum-supply');
  const sumVat = get('sum-vat');
  const sumShip = get('sum-ship');
  if (sumCat) sumCat.textContent = '-';
  if (sumQty) sumQty.textContent = '-';
  if (sumTotal) sumTotal.textContent = '0원';
  if (sumSupply) sumSupply.textContent = '-';
  if (sumVat) sumVat.textContent = '-';
  if (sumShip) sumShip.textContent = '-';
}

function goLogin() {
  console.log('[goLogin] Called, URL:', window.location.href);
  
  // Check if payment link context is active - preserve context state
  const contextCode = window.paymentLinkContext ? window.paymentLinkContext.code : null;
  
  // Check sessionStorage for payment link code
  // (showPaymentLinkPage should have already saved it)
  const storedPayLink = sessionStorage.getItem('_pendingPaymentLink') || contextCode;
  console.log('[goLogin] sessionStorage check:', storedPayLink ? 'found' : 'not found');
  
  // Also check URL ?pay= parameter as backup
  if (!storedPayLink) {
    const urlParams = new URLSearchParams(window.location.search);
    const payCode = urlParams.get('pay');
    if (payCode) {
      sessionStorage.setItem('_pendingPaymentLink', payCode);
      console.log('[goLogin] Payment link saved from URL:', payCode);
    }
  }
  
  // Hide other views, show login only
  ['view-home', 'view-signup', 'view-cart', 'view-cs', 'view-admin', 'view-find', 'view-quotation', 'view-order', 'view-notice', 'view-account-edit'].forEach(id => {
    const el = get(id);
    if (el) el.style.display = 'none';
  });
  
  // Hide main content (so login form is clickable)
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.style.display = 'none';
    console.log('[goLogin] Main content hidden');
  }
  
  const loginView = get('view-login');
  if (loginView) loginView.style.display = 'block';
  
  get('login-id').value = '';
  get('login-pw').value = '';
  console.log('[goLogin] Login screen displayed');
}

function goSignup() {
  navigate('view-signup');
  get('signup-step-1').style.display = 'block';
  get('signup-step-2').style.display = 'none';
  get('sign-id').value = '';
  get('sign-pw').value = '';
  get('sign-pw2').value = '';
  get('sign-name').value = '';
  get('sign-phone').value = '';
  get('sign-addr').value = '';
  get('sign-addr-detail').value = '';
  get('check-all').checked = false;
  get('term1').checked = false;
  get('term2').checked = false;
}

function goCart() {
  navigate('view-cart');
  renderCartView();
}

function goFindAccount() {
  navigate('view-find');
  switchFindTab('id');
  // 입력값 초기화
  get('find-id-name').value = '';
  get('find-id-phone').value = '';
  get('find-pw-id').value = '';
  get('find-pw-name').value = '';
  get('find-pw-phone').value = '';
  get('find-id-result').style.display = 'none';
  get('find-pw-result').style.display = 'none';
}

function switchFindTab(tab) {
  const idTab = get('find-id-tab');
  const pwTab = get('find-pw-tab');
  const idPanel = get('find-id-panel');
  const pwPanel = get('find-pw-panel');

  if (tab === 'id') {
    idTab.style.background = 'var(--home-primary)';
    idTab.style.color = '#fff';
    pwTab.style.background = '#fff';
    pwTab.style.color = '#64748b';
    idPanel.style.display = 'block';
    pwPanel.style.display = 'none';
    get('find-id-result').style.display = 'none';
  } else {
    pwTab.style.background = 'var(--home-primary)';
    pwTab.style.color = '#fff';
    idTab.style.background = '#fff';
    idTab.style.color = '#64748b';
    pwPanel.style.display = 'block';
    idPanel.style.display = 'none';
    get('find-pw-result').style.display = 'none';
  }
}

function findId() {
  const name = get('find-id-name').value.trim();
  const phone = get('find-id-phone').value.trim();

  if (!name || !phone) {
    return alert('이름과 휴대폰번호를 입력해주세요.');
  }

  const users = JSON.parse(localStorage.getItem(USER_DB_KEY) || '[]');
  const found = users.find(u => u.name === name && u.phone === phone);

  if (found) {
    get('found-id').textContent = found.id;
    get('find-id-result').style.display = 'block';
  } else {
    alert('일치하는 회원 정보가 없습니다.');
  }
}

function findPassword() {
  const id = get('find-pw-id').value.trim();
  const name = get('find-pw-name').value.trim();
  const phone = get('find-pw-phone').value.trim();

  if (!id || !name || !phone) {
    return alert('모든 정보를 입력해주세요.');
  }

  const users = JSON.parse(localStorage.getItem(USER_DB_KEY) || '[]');
  const found = users.find(u => u.id === id && u.name === name && u.phone === phone);

  if (found) {
    get('found-pw').textContent = found.pw;
    get('find-pw-result').style.display = 'block';
  } else {
    alert('일치하는 회원 정보가 없습니다.');
  }
}

function showCS() {
  get('view-cs').style.display = 'flex';
}

function hideCS() {
  get('view-cs').style.display = 'none';
}

function goAdmin() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  
  // 관리자가 아닌 경우 접근 불가
  if (!user || user.role !== 'admin') {
    toast('관리자만 접근할 수 있습니다.');
    goHome();
    return;
  }
  
  navigate('view-admin');
  
  // 토큰이 있는 관리자라면 바로 패널 표시
  const hasToken = getToken();
  const loginCard = get('admin-pw')?.parentElement?.parentElement?.parentElement;
  
  if (hasToken && user.role === 'admin') {
    if (loginCard) loginCard.style.display = 'none';
    get('admin-panel').style.display = 'block';
    // 데이터 로드
    loadAdminOrderList();
    renderUserList();
    loadAdminNotices();
    toast('관리자 페이지');
  } else {
    // 로그인 폼 표시, 패널 숨김
    if (loginCard) loginCard.style.display = 'block';
    get('admin-panel').style.display = 'none';
    get('admin-pw').focus();
  }
}

async function adminLogin() {
  const existing = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null');
  // 이미 관리자 계정으로 로그인되어 있다면 바로 진입
  if (existing && existing.role === 'admin' && getToken()) {
    get('admin-pw').parentElement.parentElement.parentElement.style.display = 'none';
    get('admin-panel').style.display = 'block';
    loadAdminOrderList();
    renderUserList();
    loadAdminNotices();
    toast('관리자 모드로 접속했습니다');
    return;
  }

  const pw = get('admin-pw').value.trim();
  if (!pw) return alert('관리자 비밀번호를 입력하세요.');
  try {
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'admin', pw })
    });
    const data = await res.json();
    if (!data.success || data.user.role !== 'admin') {
      alert('관리자 인증에 실패했습니다.');
      return;
    }
    saveToken(data.token);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
    get('admin-pw').parentElement.parentElement.parentElement.style.display = 'none';
    get('admin-panel').style.display = 'block';
    loadAdminOrderList();
    renderUserList();
    loadAdminNotices();
    toast('관리자 모드로 접속했습니다');
  } catch (e) {
    console.error('관리자 로그인 실패', e);
    alert('관리자 로그인 중 오류가 발생했습니다.');
  }
}

function adminLogout() {
  if (confirm('관리자 모드를 종료하시겠습니까?')) {
    get('admin-pw').value = '';
    get('admin-panel').style.display = 'none';
    get('admin-pw').parentElement.parentElement.parentElement.style.display = 'block';
    goHome();
  }
}

// ===== 상품 마진/상세 콘텐츠 관리 =====
const CONTENT_DB_KEY = 'print_content_db';
const DEFAULT_CONTENT = {
  indigo: {
    margin: 100,
    img: {
      staple: '',
      perfect: ''
    },
    info: {
      staple: '<p>HP Indigo 7K 프리미엄 인쇄</p>',
      perfect: '<p>HP Indigo (무선) 프리미엄 인쇄</p>'
    },
    guide: {
      staple: 'PDF 권장',
      perfect: 'PDF 권장 (무선)'
    },
    ship: {
      staple: '착불/택배',
      perfect: '착불/택배'
    }
  },
  digital: {
    margin: 100,
    img: {
      staple: '',
      perfect: ''
    },
    info: {
      staple: '<p>흑백 디지털 마스터 (중철)</p>',
      perfect: '<p>흑백 디지털 마스터 (무선)</p>'
    },
    guide: {
      staple: 'Grayscale 권장',
      perfect: 'Grayscale 권장'
    },
    ship: {
      staple: '착불/택배',
      perfect: '착불/택배'
    }
  },
  offset: {
    margin: 30,
    img: {
      staple: '',
      perfect: ''
    },
    info: {
      staple: '<p>대량 옵셋 인쇄 (중철)</p>',
      perfect: '<p>대량 옵셋 인쇄 (무선)</p>'
    },
    guide: {
      staple: 'CMYK 필수',
      perfect: 'CMYK 필수'
    },
    ship: {
      staple: '용달 착불',
      perfect: '용달 착불'
    }
  },
  flyer_small: {
    margin: 50,
    img: {
      staple: '',
      perfect: ''
    },
    info: {
      staple: '<p>소량 전단 안내 (단면)</p>',
      perfect: '<p>소량 전단 안내 (양면)</p>'
    },
    guide: {
      staple: '단면/양면 선택',
      perfect: '단면/양면 선택'
    },
    ship: {
      staple: '착불/택배',
      perfect: '착불/택배'
    }
  },
  flyer_large: {
    margin: 20,
    img: {
      staple: '',
      perfect: ''
    },
    info: {
      staple: '<p>대량 전단 안내 (중철)</p>',
      perfect: '<p>대량 전단 안내 (무선)</p>'
    },
    guide: {
      staple: '대량 제작 문의',
      perfect: '대량 제작 문의'
    },
    ship: {
      staple: '용달/착불',
      perfect: '용달/착불'
    }
  }
};
let contentDB = JSON.parse(localStorage.getItem(CONTENT_DB_KEY) || 'null') || DEFAULT_CONTENT;

// 서버에서 카테고리 설정 불러오기
async function loadCategorySettingsFromServer() {
  try {
    const res = await fetch('/api/category-settings');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        // 서버 데이터를 contentDB에 병합
        Object.keys(data.settings).forEach(cat => {
          if (data.settings[cat] && Object.keys(data.settings[cat]).length > 0) {
            contentDB[cat] = { ...contentDB[cat], ...data.settings[cat] };
          }
        });
        localStorage.setItem(CONTENT_DB_KEY, JSON.stringify(contentDB));
        console.log('[loadCategorySettingsFromServer] 서버에서 설정 로드 완료');
      }
    }
  } catch (error) {
    console.error('[loadCategorySettingsFromServer] 오류:', error);
  }
}

function mergeContentDefaults() {
  const merged = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
  Object.keys(merged).forEach(cat => {
    if (contentDB[cat]) merged[cat] = { ...merged[cat],
      ...contentDB[cat]
    };
  });
  contentDB = merged;
  localStorage.setItem(CONTENT_DB_KEY, JSON.stringify(contentDB));
}
mergeContentDefaults();

// 디버그: 현재 contentDB를 새 창에 예쁘게 출력
function dumpContentDB() {
  try {
    const w = window.open('', '_blank');
    const pre = w.document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.padding = '12px';
    pre.textContent = JSON.stringify(contentDB, null, 2);
    w.document.body.appendChild(pre);
    w.document.title = 'contentDB dump';
  } catch (e) {
    alert('새 창을 열 수 없습니다. 콘솔에 출력합니다.');
    console.log('contentDB', contentDB);
    alert('콘솔에 contentDB를 출력했습니다. (개발자 도구 확인)');
  }
}

function initAdminContentEditor() {
  if (window.jQuery && $('#adm-info-txt').length && !$('#adm-info-txt').data('summernote')) {
    $('#adm-info-txt').summernote({
      height: 300,
      lang: 'ko-KR',
      callbacks: {
        onChange: function() {
          // 상세설명 변경 시 통계 업데이트
          if (typeof updateAdminPreview === 'function') {
            updateAdminPreview();
          }
        }
      }
    });
  }
  
  // 실시간 미리보기 업데이트 이벤트 리스너 추가
  const imgUrlInput = get('adm-img-url');
  const marginInput = get('adm-margin-val');
  const guideInput = get('adm-guide-txt');
  const catSelect = get('adm-cat-select');
  const bindingSelect = get('adm-binding-select');
  
  // 이미지 URL 입력 시 즉시 미리보기 업데이트
  if (imgUrlInput && !imgUrlInput.dataset.previewListener) {
    imgUrlInput.addEventListener('input', function() {
      const previewImg = get('adm-img-preview-img');
      const previewPlaceholder = get('adm-img-placeholder');
      
      if (this.value.trim()) {
        if (previewImg) {
          previewImg.src = this.value;
          previewImg.style.display = 'block';
          previewImg.onerror = function() {
            this.style.display = 'none';
            if (previewPlaceholder) previewPlaceholder.style.display = 'block';
          };
        }
        if (previewPlaceholder) previewPlaceholder.style.display = 'none';
      } else {
        if (previewImg) previewImg.style.display = 'none';
        if (previewPlaceholder) previewPlaceholder.style.display = 'block';
      }
      
      if (typeof updateAdminPreview === 'function') {
        updateAdminPreview();
      }
    });
    imgUrlInput.dataset.previewListener = 'true';
  }
  
  // 마진, 가이드 입력 시 통계 업데이트
  if (marginInput && !marginInput.dataset.previewListener) {
    marginInput.addEventListener('input', function() {
      if (typeof updateAdminPreview === 'function') {
        updateAdminPreview();
      }
    });
    marginInput.dataset.previewListener = 'true';
  }
  
  if (guideInput && !guideInput.dataset.previewListener) {
    guideInput.addEventListener('input', function() {
      if (typeof updateAdminPreview === 'function') {
        updateAdminPreview();
      }
    });
    guideInput.dataset.previewListener = 'true';
  }
}

function loadAdminContent() {
  initAdminContentEditor();
  // sync admin select with current category if available
  if (window.currentCategory && get('adm-cat-select')) {
    try { get('adm-cat-select').value = window.currentCategory; } catch(e){}
  }
  const cat = get('adm-cat-select').value;
  const data = contentDB[cat];
  if (!data) return;
  
  // 마진율 (카테고리 공통)
  get('adm-margin-val').value = data.margin ?? 100;
  
  // 전단 카테고리인 경우 제본 선택기 숨기기
  const bindingWrapper = get('binding-select-wrapper');
  const isFlyerCategory = cat.startsWith('flyer_');
  if (bindingWrapper) {
    bindingWrapper.style.display = isFlyerCategory ? 'none' : 'flex';
  }
  
  // 바인딩 선택값 확인
  // sync binding select with currentBindType if available
  if (window.currentBindType && get('adm-binding-select')) {
    try { get('adm-binding-select').value = window.currentBindType; } catch(e){}
  }
  const binding = get('adm-binding-select') ? get('adm-binding-select').value : 'staple';
  
  // 1. 이미지 로드
  // 수정: 관리자 모드에서는 해당 바인딩에 설정된 값만 정확히 가져옵니다 (fallback 제거)
  let imgVal = '';
  if (data.img) {
    if (typeof data.img === 'string') {
        // 기존 데이터가 문자열이면 그대로 사용
        imgVal = data.img; 
    } else if (typeof data.img === 'object') {
        // 객체라면 현재 바인딩 키값만 확인
        imgVal = data.img[binding] || ''; 
    }
  }
  get('adm-img-url').value = imgVal || '';
  
  // 미리보기 이미지 표시
  const previewImg = get('adm-img-preview-img');
  const previewPlaceholder = get('adm-img-placeholder');
  if (imgVal) {
    if (previewImg) {
      previewImg.src = imgVal;
      previewImg.style.display = 'block';
    }
    if (previewPlaceholder) previewPlaceholder.style.display = 'none';
  } else {
    if (previewImg) previewImg.style.display = 'none';
    if (previewPlaceholder) previewPlaceholder.style.display = 'block';
  }

  // 2. 상세설명(Info) 로드
  let infoVal = '';
  if (data.info) {
    if (typeof data.info === 'string') infoVal = data.info;
    else if (typeof data.info === 'object') infoVal = data.info[binding] || '';
  }
  if (window.jQuery && $('#adm-info-txt').length) $('#adm-info-txt').summernote('code', infoVal || '');

  // 3. 가이드(Guide) 로드
  let guideVal = '';
  if (data.guide) {
    if (typeof data.guide === 'string') guideVal = data.guide;
    else if (typeof data.guide === 'object') guideVal = data.guide[binding] || '';
  }
  get('adm-guide-txt').value = guideVal || '';

  // 4. 배송안내(Ship) 로드
  let shipVal = '';
  if (data.ship) {
    if (typeof data.ship === 'string') shipVal = data.ship;
    else if (typeof data.ship === 'object') shipVal = data.ship[binding] || '';
  }
  get('adm-ship-txt').value = shipVal || '';
  
  // 5. 미리보기 정보 업데이트
  updateAdminPreview();
}

// 관리자 미리보기 정보 업데이트 함수
function updateAdminPreview() {
  const catSelect = get('adm-cat-select');
  const bindingSelect = get('adm-binding-select');
  
  if (!catSelect || !bindingSelect) return;
  
  const cat = catSelect.value;
  const binding = bindingSelect.value;
  
  // 카테고리명 매핑
  const catNames = {
    indigo: '소량 인디고',
    digital: '흑백 디지털',
    offset: '대량 옵셋',
    flyer_small: '소량 전단',
    flyer_large: '대량 전단'
  };
  
  const bindingNames = {
    staple: '중철',
    perfect: '무선'
  };
  
  // 상품명 표시
  const titleEl = get('adm-preview-title');
  if (titleEl) {
    titleEl.textContent = `${catNames[cat] || cat} - ${bindingNames[binding] || binding}`;
  }
  
  // 제본 표시
  const bindingEl = get('adm-preview-binding');
  if (bindingEl) {
    bindingEl.textContent = `제본: ${bindingNames[binding] || binding}`;
  }
  
  // 통계 정보 업데이트
  const marginInput = get('adm-margin-val');
  const imgUrlInput = get('adm-img-url');
  const guideInput = get('adm-guide-txt');
  
  if (get('adm-stat-margin')) {
    get('adm-stat-margin').textContent = marginInput && marginInput.value ? marginInput.value + '%' : '-';
  }
  
  if (get('adm-stat-img')) {
    get('adm-stat-img').textContent = imgUrlInput && imgUrlInput.value ? '✓' : '✗';
  }
  
  if (get('adm-stat-info')) {
    let infoLength = 0;
    if (window.jQuery && $('#adm-info-txt').length) {
      const code = $('#adm-info-txt').summernote('code');
      infoLength = code ? code.replace(/<[^>]*>/g, '').trim().length : 0;
    }
    get('adm-stat-info').textContent = infoLength > 0 ? '✓' : '✗';
  }
  
  if (get('adm-stat-guide')) {
    get('adm-stat-guide').textContent = guideInput && guideInput.value.trim() ? '✓' : '✗';
  }
}

// ===== HOMEPAGE CONTENT MANAGEMENT =====
const HOMEPAGE_DB_KEY = 'print_homepage_v1';
const DEFAULT_HOMEPAGE = {
  slides: [],  // 초기값을 빈 배열로 변경
  quoteImg: '',
  logo: ''
};

// 초기 로드: localStorage가 있으면 사용, 없으면 빈 상태로 시작
let homepageDB = JSON.parse(localStorage.getItem(HOMEPAGE_DB_KEY) || 'null') || { slides: [], quoteImg: '', logo: '', favicon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjI1NiIgeT0iMzgwIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiPkc8L3RleHQ+PC9zdmc+' };

function loadAdminHomepage() {
  // localStorage에서 로드, 없으면 기본값으로 시작
  const stored = localStorage.getItem(HOMEPAGE_DB_KEY);
  if (stored) {
    homepageDB = JSON.parse(stored);
  } else {
    homepageDB = { slides: [], quoteImg: '', logo: '', favicon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjI1NiIgeT0iMzgwIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiPkc8L3RleHQ+PC9zdmc+' };
  }
  // favicon이 없으면 기본값 설정
  if (!homepageDB.favicon) {
    homepageDB.favicon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjI1NiIgeT0iMzgwIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiPkc8L3RleHQ+PC9zdmc+';
  }
  renderSlideUploadUI();
  const q = get('adm-home-quote-preview');
  if (q) q.src = homepageDB.quoteImg || '';
  const l = get('adm-home-logo-preview');
  if (l) l.src = homepageDB.logo || '';
  
  // 파비콘 미리보기
  const f = get('adm-home-favicon-preview');
  if (f) {
    if (homepageDB.favicon) {
      f.src = homepageDB.favicon;
      f.style.display = 'block';
    } else {
      f.style.display = 'none';
    }
  }
}

function renderSlideUploadUI() {
  const container = get('adm-slides-container');
  if (!container) return;
  container.innerHTML = '';
  
  const slides = homepageDB.slides || [];
  slides.forEach((slideSrc, index) => {
    const slideDiv = document.createElement('div');
    slideDiv.style.cssText = 'text-align:center; position:relative; flex:1; min-width:120px;';
    slideDiv.innerHTML = `
      <img id="adm-home-slide-${index}-preview" src="${slideSrc || ''}" alt="슬라이드${index + 1}" 
        style="width:100%; height:80px; object-fit:cover; border:1px solid #e2e8f0; border-radius:8px; display:block; margin-bottom:6px;" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div style=\\'width:100%; height:80px; display:flex; align-items:center; justify-content:center; border:1px solid #e2e8f0; border-radius:8px; background:#f1f5f9; color:#64748b; font-size:13px; font-weight:700; margin-bottom:6px;\\'>No Image</div>');">
      <input type="file" accept="image/*" onchange="handleHomepageImageUpload(event, 'slides', ${index})" style="font-size:12px;">
      <button class="btn" onclick="deleteSlide(${index})" style="margin-top:6px; width:100%; padding:6px; font-size:11px; background:#ef4444; color:#fff; border:none;">삭제</button>
    `;
    container.appendChild(slideDiv);
  });
}

function addSlide() {
  if (!homepageDB.slides) homepageDB.slides = [];
  homepageDB.slides.push('');
  renderSlideUploadUI();
  toast(`슬라이드 #${homepageDB.slides.length} 추가됨`);
}

function deleteSlide(index) {
  if (!confirm(`슬라이드 #${index + 1}을 삭제하시겠습니까?`)) return;
  homepageDB.slides.splice(index, 1);
  renderSlideUploadUI();
  toast('슬라이드 삭제됨');
}

async function uploadImageFile(file) {
  if (!file) throw new Error('파일이 없습니다');
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 업로드 가능합니다');
  if (file.size > 5 * 1024 * 1024) throw new Error('파일 크기는 5MB 이하로 업로드 가능합니다');

  const formData = new FormData();
  formData.append('file', file);

  const token = getToken();
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const err = await res.json(); msg = err.message || msg; } catch (e) {}
    throw new Error(msg || '업로드 실패');
  }
  const data = await res.json();
  return data.path;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
}

async function handleHomepageImageUpload(event, key, index) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const uploadedPath = await uploadImageFile(file);
    if (key === 'slides') {
      homepageDB.slides = homepageDB.slides || [];
      homepageDB.slides[index] = uploadedPath;
      const prev = get('adm-home-slide-' + index + '-preview');
      if (prev) prev.src = uploadedPath;
    } else if (key === 'quote') {
      homepageDB.quoteImg = uploadedPath;
      const prev = get('adm-home-quote-preview');
      if (prev) prev.src = uploadedPath;
    } else if (key === 'logo') {
      homepageDB.logo = uploadedPath;
      const prev = get('adm-home-logo-preview');
      if (prev) prev.src = uploadedPath;
    } else if (key === 'favicon') {
      homepageDB.favicon = uploadedPath;
      const prev = get('adm-home-favicon-preview');
      if (prev) prev.src = uploadedPath;
    }
    // 서버에 자동 저장
    await saveHomepageContent();
    applyHomepageContent(true);
    toast('이미지 업로드 및 저장 완료');
  } catch (err) {
    console.error(err);
    toast(err.message || '업로드 실패');
  }
}

async function saveHomepageContent() {
  try {
    // 로컬 localStorage에 먼저 저장
    localStorage.setItem(HOMEPAGE_DB_KEY, JSON.stringify(homepageDB));
    
    const token = getToken();
    const res = await fetch('/api/homepage-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(homepageDB)
    });
    if (!res.ok) throw new Error('저장 실패');
    const data = await res.json();
    toast(data.message || '홈페이지 설정이 저장되었습니다.');
  } catch (err) {
    console.error(err);
    toast('저장 실패: ' + err.message);
  }
}

async function applyHomepageContent(preserveAdminOpen) {
  // 서버에서 홈페이지 설정 불러오기
  const defaultFaviconDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjI1NiIgeT0iMzgwIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiPkc8L3RleHQ+PC9zdmc+';
  try {
    const res = await fetch('/api/homepage-settings');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        // 백엔드에서 받은 데이터 우선 사용, 없는 항목만 기본값으로 채우기
        homepageDB = {
          slides: data.settings.slides || [],  // 빈 배열일 수 있음
          quoteImg: data.settings.quoteImg || '',
          logo: data.settings.logo || '',
          favicon: data.settings.favicon || defaultFaviconDataUrl
        };
        // 로컬 localStorage에도 저장
        localStorage.setItem(HOMEPAGE_DB_KEY, JSON.stringify(homepageDB));
      }
    }
  } catch (err) {
    console.error('홈페이지 설정 로드 실패:', err);
    // 오류 발생 시에도 기본 파비콘 설정
    homepageDB.favicon = homepageDB.favicon || defaultFaviconDataUrl;
  }
  
  // 슬라이더 동적 렌더링 - 슬라이드 개수만큼 생성
  const slider = get('home-slider');
  if (slider) {
    const slideCount = (homepageDB.slides || []).length;
    const pagerContainer = slider.querySelector('.home-pager')?.parentElement;
    
    // 기존 슬라이드 모두 제거
    const oldSlides = slider.querySelectorAll('.home-slide');
    oldSlides.forEach(slide => slide.remove());
    
    // 새로운 슬라이드 생성
    if (slideCount > 0) {
      homepageDB.slides.forEach((slideUrl, i) => {
        const newSlide = document.createElement('div');
        newSlide.className = 'home-slide' + (i === 0 ? ' active' : '');
        newSlide.innerHTML = `<img src="${slideUrl || ''}" alt="slide${i + 1}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<div style=&quot;width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#64748b; font-size:18px; font-weight:700;&quot;>No Image</div><div class=&quot;home-slide-overlay&quot;></div>';" /><div class="home-slide-overlay"></div>`;
        slider.insertBefore(newSlide, pagerContainer);
      });
    } else {
      // 슬라이드가 없으면 기본 배경색 슬라이드 1개 생성
      const defaultSlide = document.createElement('div');
      defaultSlide.className = 'home-slide active';
      defaultSlide.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      defaultSlide.innerHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:18px; font-weight:700;">건우프린팅</div><div class="home-slide-overlay"></div>';
      slider.insertBefore(defaultSlide, pagerContainer);
    }
    
    // 슬라이드 네비게이션 업데이트
    updateHomeSliderPager();
  }
  
  // 견적 이미지 적용 (카테고리별 대표 이미지 우선)
  const quoteImgEl = get('quote-indigo-img');
  if (quoteImgEl) {
    const cat = window.currentCategory;
    const bind = window.currentBindType || 'staple';
    let catImg = '';
    if (cat && typeof contentDB !== 'undefined' && contentDB[cat] && contentDB[cat].img) {
      if (typeof contentDB[cat].img === 'string') {
        catImg = contentDB[cat].img;
      } else {
        catImg = contentDB[cat].img[bind] || contentDB[cat].img.staple || contentDB[cat].img.perfect || '';
      }
    }
    if (catImg) {
      quoteImgEl.src = catImg;
    } else if (homepageDB.quoteImg) {
      quoteImgEl.src = homepageDB.quoteImg;
    }
  }

  // 홈 베스트 썸네일 교체 (카테고리 대표 이미지 우선)
  setBestThumbnails();
  // 로고 적용 (header img inside .brand)
  const headerLogo = document.querySelector('.brand img');
  if (headerLogo) {
    if (homepageDB.logo) {
      headerLogo.src = homepageDB.logo;
      headerLogo.style.display = 'block';
    } else {
      headerLogo.style.display = 'none';
    }
  }

  // 파비콘 적용
  if (homepageDB.favicon) {
    let faviconLink = document.querySelector('link[rel="icon"]');
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }
    faviconLink.href = homepageDB.favicon;
  } else {
    // 기본 파비콘 (data URL)
    const defaultFavicon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjI1NiIgeT0iMzgwIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiPkc8L3RleHQ+PC9zdmc+';
    let faviconLink = document.querySelector('link[rel="icon"]');
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }
    faviconLink.href = defaultFavicon;
  }

  if (!preserveAdminOpen) loadAdminHomepage();
}

function resetHomepageCache() {
  if (!confirm('로컬 캐시를 초기화하고 서버에서 다시 불러옵니다. 계속하시겠습니까?')) return;
  localStorage.removeItem(HOMEPAGE_DB_KEY);
  homepageDB = { slides: [], quoteImg: '', logo: '', favicon: '' };
  toast('캐시가 초기화되었습니다. 새로고침합니다...');
  setTimeout(() => location.reload(), 1000);
}

function updateHomeSliderPager() {
  const slides = Array.from(document.querySelectorAll('#home-slider .home-slide'));
  const pager = get('home-pager');
  if (pager) {
    pager.innerHTML = '';
    slides.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block; width:10px; height:10px; margin:0 4px; border-radius:50%; background:rgba(255,255,255,0.5); cursor:pointer; transition:all 0.3s;';
      dot.onclick = () => goToSlide(i);
      if (i === 0) dot.style.background = 'rgba(255,255,255,0.9)';
      pager.appendChild(dot);
    });
  }
}


async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const uploadedPath = await uploadImageFile(file);
    get('adm-img-url').value = uploadedPath;
    get('adm-img-preview').style.display = 'block';
    get('adm-img-preview-img').src = uploadedPath;
    const placeholder = get('adm-img-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    toast('이미지 업로드 완료');
  } catch (err) {
    console.error(err);
    toast(err.message || '업로드 실패');
  }
}

// ===== 견적서 파일 첨부 =====
let quoteAttachedFiles = [];

function handleQuoteFileUpload(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  files.forEach(file => {
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      alert(`${file.name}은(는) 너무 큽니다. 최대 20MB까지 첨부 가능합니다.`);
      return;
    }

    quoteAttachedFiles.push({
      name: file.name,
      size: file.size,
      type: file.type,
      file: file
    });
  });

  updateQuoteFileList();
  event.target.value = ''; // 같은 파일 재선택 가능하도록
}

function updateQuoteFileList() {
  const listEl = get('quote-file-list');
  if (quoteAttachedFiles.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = quoteAttachedFiles.map((f, idx) => {
    const sizeKB = (f.size / 1024).toFixed(1);
    const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
    const sizeText = f.size > 1024 * 1024 ? `${sizeMB}MB` : `${sizeKB}KB`;

    return `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:#0f172a; border-radius:6px; margin-bottom:6px; font-size:11px;">
            <div style="flex:1; overflow:hidden;">
              <div style="color:#f8fafc; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.name}</div>
              <div style="color:#94a3b8; margin-top:2px;">${sizeText}</div>
            </div>
            <button onclick="removeQuoteFile(${idx})" style="background:#ef4444; border:none; color:white; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:700;">삭제</button>
          </div>
        `;
  }).join('');
}

function removeQuoteFile(idx) {
  quoteAttachedFiles.splice(idx, 1);
  updateQuoteFileList();
}

function saveAdminContent() {
  const cat = get('adm-cat-select').value;
  const marginVal = Number(get('adm-margin-val').value) || 0;
  const binding = get('adm-binding-select') ? get('adm-binding-select').value : 'staple';
  const imgVal = get('adm-img-url').value.trim();

  // Ensure contentDB[cat] exists
  contentDB[cat] = contentDB[cat] || {
    margin: 100,
    img: {
      staple: '',
      perfect: ''
    },
    info: {
      staple: '',
      perfect: ''
    },
    guide: {
      staple: '',
      perfect: ''
    },
    ship: {
      staple: '',
      perfect: ''
    }
  };
  
  // 데이터 구조 정규화: 기존에 문자열로 저장된 데이터가 있다면 객체 형태로 변환 (마이그레이션)
  // img
  if (!contentDB[cat].img || typeof contentDB[cat].img === 'string') {
    const prev = contentDB[cat].img || '';
    contentDB[cat].img = {
      staple: prev,
      perfect: prev
    };
  }
  // info
  if (!contentDB[cat].info || typeof contentDB[cat].info === 'string') {
    const prev = contentDB[cat].info || '';
    contentDB[cat].info = {
      staple: prev,
      perfect: prev
    };
  }
  // guide
  if (!contentDB[cat].guide || typeof contentDB[cat].guide === 'string') {
    const prev = contentDB[cat].guide || '';
    contentDB[cat].guide = {
      staple: prev,
      perfect: prev
    };
  }
  // ship
  if (!contentDB[cat].ship || typeof contentDB[cat].ship === 'string') {
    const prev = contentDB[cat].ship || '';
    contentDB[cat].ship = {
      staple: prev,
      perfect: prev
    };
  }

  // 선택된 바인딩에 대해서만 값 업데이트
  contentDB[cat].margin = marginVal;
  contentDB[cat].img[binding] = imgVal;

  const infoVal = (window.jQuery && $('#adm-info-txt').length) ? $('#adm-info-txt').summernote('code') : '';
  contentDB[cat].info[binding] = infoVal;
  contentDB[cat].guide[binding] = get('adm-guide-txt').value;
  contentDB[cat].ship[binding] = get('adm-ship-txt').value;
  
  // 로컬 스토리지에도 저장 (백업용)
  localStorage.setItem(CONTENT_DB_KEY, JSON.stringify(contentDB));
  
  // 서버에 저장
  saveCategoryToServer(cat, contentDB[cat]);
  
  // 디버그 로그: 저장된 내용 확인
  try { console.log('[saveAdminContent] saved', { cat, binding, marginVal, infoLen: (infoVal||'').length }); } catch(e){}

  // 저장 후 공개 뷰에 즉시 반영 (현재 보고있는 카테고리와 상관없이 적용 시도)
  try { applyContentToDetailTabs(cat); } catch(e) { console.error('applyContentToDetailTabs failed', e); }

  // 현재 보고 있는 화면이 해당 카테고리라면 추가 동기화(라디오/제목)
  if (typeof window.currentCategory !== 'undefined' && window.currentCategory === cat) {
    // 동기화: 공개 뷰의 바인딩을 관리자에서 저장한 바인딩으로 맞추고 즉시 반영
    const prevBind = window.currentBindType;
    window.currentBindType = binding;
    // 라디오 버튼 상태 및 스타일 업데이트
    const radios = document.getElementsByName('ind-bind');
    radios.forEach(r => { if (r.value === binding) r.checked = true; });
    try { updateRadioStyles('ind-bind'); } catch (e) {}
    // 타이틀 업데이트
    try {
      const titles = { indigo: '소량 인디고', digital: '흑백 디지털', offset: '대량 옵셋' };
      const bindNames = { staple: '중철', perfect: '무선' };
      if (titles[window.currentCategory]) {
        get('quote-title').textContent = titles[window.currentCategory] + ' - ' + bindNames[binding];
      }
    } catch (e) {}
    applyContentToDetailTabs(cat);
    // 이전 바인딩 보존 필요하면 복원 (주석 처리: 복원하지 않음 so user sees saved binding)
    // window.currentBindType = prevBind;
  }
}

async function saveCategoryToServer(category, settings) {
  try {
    const token = getToken();
    const res = await fetch('/api/category-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ category, settings })
    });
    
    const data = await res.json();
    if (data.success) {
      toast('서버에 저장되었습니다.');
    } else {
      console.error('서버 저장 실패:', data.message);
      toast('서버 저장 실패: ' + data.message);
    }
  } catch (error) {
    console.error('서버 저장 오류:', error);
    toast('서버 저장 중 오류 발생');
  }
}

function generateAIContent() {
  if (!confirm('AI로 상세설명을 생성하시겠습니까? 기존 내용은 대체됩니다.')) return;
  const sample = `<h2>상품 특징</h2><p>프리미엄 인쇄 품질과 선명한 컬러를 제공합니다.</p><ul><li>고급 종이 사용</li><li>선명한 색감</li><li>빠른 제작</li></ul>`;
  if (window.jQuery && $('#adm-info-txt').length) $('#adm-info-txt').summernote('code', sample);
  alert('기본 템플릿이 적용되었습니다. 수정 후 저장해주세요.');
}

// [수정] 상세설명/가이드/배송안내 탭 내용을 현재 제본 방식에 맞춰 업데이트하는 함수
function applyContentToDetailTabs(cat) {
  // DB에서 해당 카테고리 데이터 가져오기
  const data = contentDB[cat];
  if (!data) return;
  // 디버그: 어떤 카테고리와 바인딩 값으로 렌더되는지 로깅
  try {
    const checked = document.querySelector('input[name="ind-bind"]:checked');
    const dbgBind = checked ? checked.value : (window.currentBindType || 'staple');
    console.log('[applyContentToDetailTabs] cat=', cat, 'binding=', dbgBind, 'hasInfo=', !!data.info, 'infoKeys=', data.info && typeof data.info === 'object' ? Object.keys(data.info) : typeof data.info);
  } catch (e) {}
  
  // 1. 현재 선택된 제본 방식 확인: 라디오 버튼을 우선 사용해서 UI와 일치시킵니다.
  const checkedRadio = document.querySelector('input[name="ind-bind"]:checked');
  let binding = checkedRadio ? checkedRadio.value : (window.currentBindType || 'staple');

  // 2. 이미지 업데이트
  const imgEl = document.getElementById('quote-indigo-img');
  if (imgEl && data.img) {
      // 해당 제본 방식의 이미지가 있으면 사용, 없으면 staple(기본) 사용
      let imgSrc = (data.img[binding] || data.img.staple || data.img.perfect || '');
      // 만약 데이터가 옛날 방식(문자열)이면 그대로 사용
      if (typeof data.img === 'string') imgSrc = data.img;
      
      if (imgSrc) {
        imgEl.src = imgSrc;
        imgEl.style.display = 'block';
        // 이미지 로드 실패 시 처리
        imgEl.onerror = function() {
          this.style.display = 'none';
          const placeholder = this.nextElementSibling;
          if (placeholder && placeholder.classList && placeholder.classList.contains('img-placeholder')) {
            placeholder.style.display = 'flex';
          }
        };
      } else {
        imgEl.style.display = 'none';
        const placeholder = imgEl.nextElementSibling;
        if (placeholder && placeholder.classList && placeholder.classList.contains('img-placeholder')) {
          placeholder.style.display = 'flex';
        }
      }
  }

  // 3. 상세설명 (Detail) 업데이트
  const detail = document.getElementById('tab-detail-content');
  if (detail && data.info) {
    let infoHtml = '';
    if (typeof data.info === 'string') {
      infoHtml = data.info;
      console.log('[applyContentToDetailTabs] using info string fallback');
    } else if (typeof data.info === 'object') {
      infoHtml = data.info[binding] || data.info.staple || data.info.perfect || '';
      console.log('[applyContentToDetailTabs] resolved info for binding:', binding, 'len=', (infoHtml||'').length);
    }
    detail.innerHTML = infoHtml;
  }

  // 4. 가이드 (Guide) 업데이트
  const guide = document.getElementById('tab-guide-content');
  if (guide && data.guide) {
    let guideTxt = (data.guide[binding] || data.guide.staple || data.guide.perfect || '');
    if (typeof data.guide === 'string') guideTxt = data.guide;
    guide.innerHTML = `<div style="background:#fff; border-radius:12px; padding:30px;"><h2 style="font-size:20px; font-weight:900; color:#0f172a; margin:0 0 20px 0; border-left:4px solid var(--primary); padding-left:12px;">제작 가이드</h2><div style="line-height:1.8; color:#475569;">${(guideTxt || '').replace(/\n/g,'<br>')}</div></div>`;
  }

  // 5. 배송안내 (Shipping) 업데이트
  const ship = document.getElementById('tab-shipping-content');
  if (ship && data.ship) {
    let shipTxt = (data.ship[binding] || data.ship.staple || data.ship.perfect || '');
    if (typeof data.ship === 'string') shipTxt = data.ship;
    ship.innerHTML = `<div style="background:#fff; border-radius:12px; padding:30px;"><h2 style="font-size:20px; font-weight:900; color:#0f172a; margin:0 0 20px 0; border-left:4px solid var(--primary); padding-left:12px;">배송 안내</h2><div style="line-height:1.8; color:#475569;">${(shipTxt || '').replace(/\n/g,'<br>')}</div></div>`;
  }
}

function showAdminTab(tabId) {
  ['adm-orders', 'adm-content', 'adm-users', 'adm-homepage', 'adm-popup', 'adm-notice', 'adm-payment-links'].forEach(id => {
    const el = get(id);
    if (el) el.style.display = 'none';
  });
  const activeTab = get(tabId);
  if (activeTab) activeTab.style.display = 'block';
  if (tabId === 'adm-content') {
    // 관리자에서 열 때 현재 보고 있는 카테고리/바인딩으로 셀렉트를 동기화
    if (window.currentCategory && get('adm-cat-select')) {
      try { get('adm-cat-select').value = window.currentCategory; } catch(e){}
    }
    if (window.currentBindType && get('adm-binding-select')) {
      try { get('adm-binding-select').value = window.currentBindType; } catch(e){}
    }
    loadAdminContent();
  }
  if (tabId === 'adm-users') renderUserList();
  if (tabId === 'adm-orders') loadAdminOrderList();
  if (tabId === 'adm-homepage') loadAdminHomepage();
  if (tabId === 'adm-notice') { loadAdminNotices(); }
  if (tabId === 'adm-popup') { loadAdminPopupNotices(); }
  if (tabId === 'adm-payment-links') { 
    loadPaymentLinks();
  }
}

// ===== 관리자 공지 관리 =====
function resetNoticeForm() {
  if (get('notice-id')) get('notice-id').value = '';
  if (get('notice-title')) get('notice-title').value = '';
  if (get('notice-category')) get('notice-category').value = '일반공지';
  if (get('notice-pinned')) get('notice-pinned').checked = false;
  if (get('notice-content')) get('notice-content').value = '';
}

function fillNoticeForm(n) {
  get('notice-id').value = n.id;
  get('notice-title').value = n.title || '';
  get('notice-category').value = n.category || '일반공지';
  get('notice-pinned').checked = !!n.is_pinned;
  get('notice-content').value = n.content || '';
}

async function loadAdminNotices() {
  await loadNotices(true);
  const listEl = get('admin-notice-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (noticeCache.length === 0) {
    listEl.innerHTML = '<div style="padding:12px; color:#64748b;">공지 없음</div>';
    return;
  }
  noticeCache.forEach(n => {
    const item = document.createElement('div');
    item.style.border = '1px solid var(--line)';
    item.style.borderRadius = '8px';
    item.style.padding = '10px';
    item.style.cursor = 'pointer';
    item.style.background = n.is_pinned ? '#fef9c3' : '#fff';
    item.innerHTML = `<div style="font-weight:800; color:#0f172a;">${n.title}</div><div style="font-size:12px; color:#94a3b8; margin-top:4px;">${n.category || ''} · ${formatDate(n.created_at)}</div>`;
    item.onclick = () => {
      fillNoticeForm(n);
      openNotice(n.id);
    };
    listEl.appendChild(item);
  });
}

async function saveNotice() {
  const id = get('notice-id').value;
  const payload = {
    title: get('notice-title').value.trim(),
    category: get('notice-category').value,
    content: get('notice-content').value,
    is_pinned: get('notice-pinned').checked
  };
  if (!payload.title || !payload.content) return alert('제목과 내용을 입력하세요.');
  try {
    const url = id ? `/api/admin/notices/${id}` : '/api/admin/notices';
    const method = id ? 'PUT' : 'POST';
    const res = await apiCall(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.success) return alert(data.message || '저장 실패');
    await loadNotices(true);
    resetNoticeForm();
    toast('저장되었습니다.');
    showAdminTab('adm-notice');
  } catch (e) {
    console.error('공지 저장 실패', e);
    alert('저장 중 오류가 발생했습니다. 관리자 계정으로 로그인했는지 확인하세요.');
  }
}

async function deleteNotice() {
  const id = get('notice-id').value;
  if (!id) return alert('삭제할 공지를 선택하세요.');
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    const res = await apiCall(`/api/admin/notices/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) return alert(data.message || '삭제 실패');
    await loadNotices(true);
    resetNoticeForm();
    get('notice-detail').style.display = 'none';
    get('notice-empty').style.display = 'block';
    toast('삭제되었습니다.');
  } catch (e) {
    console.error('공지 삭제 실패', e);
    const errorMsg = e.message || '삭제 중 오류가 발생했습니다.';
    alert(errorMsg + '\n\n관리자 계정으로 로그인했는지 확인하세요.');
  }
}

function renderOrderList() {
  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  // 취소된 주문 제외
  const activeOrders = orders.filter(order => order.status !== '취소');
  const body = get('order-list-body');
  body.innerHTML = '';

  if (activeOrders.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="padding:30px; text-align:center; color:#64748b;">아직 주문이 없습니다.</td></tr>';
  } else {
    activeOrders.forEach((order, i) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e6edf3';
      const orderId = order.orderId || `ORDER-${i}`;
      const statusColor = order.status === '접수완료' ? '#10b981' : order.status === '제작중' ? '#3b82f6' : order.status === '배송중' ? '#f59e0b' : order.status === '배송완료' ? '#6366f1' : '#64748b';
      tr.innerHTML = `
            <td style="padding:10px; font-weight:700; color:#037a3f;">${orderId}</td>
            <td style="padding:10px;">${order.date || order.orderDate || '-'}</td>
            <td style="padding:10px;">${order.userName || '비회원'}</td>
            <td style="padding:10px;">${order.name || '상품'}</td>
            <td style="padding:10px;">${(order.price || 0).toLocaleString()}원</td>
            <td style="padding:10px; text-align:center;">
              <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                <span style="padding:4px 10px; background:${statusColor}15; color:${statusColor}; border-radius:4px; font-size:11px; font-weight:700;">${order.status || '접수완료'}</span>
                <button onclick="viewAdminOrderDetail('${orderId}')" style="padding:4px 8px; background:#037a3f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700; transition:all 0.2s;" onmouseover="this.style.background='#025a2f'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='#037a3f'; this.style.transform='scale(1)'">상세보기</button>
                <button onclick="cancelOrder('${orderId}')" style="padding:4px 8px; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700; transition:all 0.2s;" onmouseover="this.style.background='#dc2626'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='#ef4444'; this.style.transform='scale(1)'">취소</button>
              </div>
            </td>
          `;
      body.appendChild(tr);
    });
  }
}

async function loadAdminOrderList() {
  const token = getToken();
  if (!token) {
    toast('로그인이 필요합니다.');
    return;
  }

  // 기본 날짜 설정 (오늘)
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  get('admin-order-date-from').value = todayStr;
  get('admin-order-date-to').value = todayStr;

  try {
    const response = await fetch('/api/admin/orders', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (result.success && result.orders) {
      renderAdminOrderTable(result.orders);
      updateAdminOrderStats(result.orders);
    } else {
      renderAdminOrderTable([]);
      updateAdminOrderStats([]);
    }
  } catch (error) {
    console.error('주문 로드 에러:', error);
    renderAdminOrderTable([]);
    updateAdminOrderStats([]);
  }
}

// 주문 상태별 통계 업데이트
function updateAdminOrderStats(orders) {
  const stats = {
    pending: 0,
    preparing: 0,
    shipping: 0,
    completed: 0
  };
  
  orders.forEach(order => {
    if (order.status === 'pending') stats.pending++;
    else if (order.status === 'preparing') stats.preparing++;
    else if (order.status === 'shipping') stats.shipping++;
    else if (order.status === 'completed') stats.completed++;
  });
  
  const statPending = get('stat-pending');
  const statPreparing = get('stat-preparing');
  const statShipping = get('stat-shipping');
  const statCompleted = get('stat-completed');
  
  if (statPending) statPending.textContent = stats.pending + '건';
  if (statPreparing) statPreparing.textContent = stats.preparing + '건';
  if (statShipping) statShipping.textContent = stats.shipping + '건';
  if (statCompleted) statCompleted.textContent = stats.completed + '건';
}

// 관리자 주문 날짜 범위 설정
function setAdminOrderDateRange(range) {
  const today = new Date();
  let startDate = new Date(today);
  let endDate = new Date(today);
  
  if (range === 'today') {
    // 오늘
  } else if (range === 'week') {
    // 1주일
    startDate.setDate(today.getDate() - 7);
  } else if (range === 'month') {
    // 1개월
    startDate.setDate(today.getDate() - 30);
  } else if (range === 'all') {
    // 전체 (2년 전부터)
    startDate.setFullYear(today.getFullYear() - 2);
  }
  
  const fromStr = startDate.toISOString().split('T')[0];
  const toStr = endDate.toISOString().split('T')[0];
  
  // 입력 필드 업데이트 후 필터 적용
  const fromInput = get('admin-order-date-from');
  const toInput = get('admin-order-date-to');
  
  if (fromInput && toInput) {
    fromInput.value = fromStr;
    toInput.value = toStr;
    applyAdminOrderDateFilter();
  }
}

// 관리자 주문 날짜 필터 적용
async function applyAdminOrderDateFilter() {
  const dateFrom = get('admin-order-date-from').value;
  const dateTo = get('admin-order-date-to').value;
  
  if (!dateFrom || !dateTo) {
    alert('시작날짜와 종료날짜를 선택해주세요.');
    return;
  }
  
  if (new Date(dateFrom) > new Date(dateTo)) {
    alert('시작날짜가 종료날짜보다 클 수 없습니다.');
    return;
  }

  const token = getToken();
  if (!token) {
    toast('로그인이 필요합니다.');
    return;
  }

  try {
    const response = await fetch('/api/admin/orders', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (result.success && result.orders) {
      // 클라이언트에서 날짜 필터링
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      
      const filteredOrders = result.orders.filter(order => {
        const orderDate = new Date(order.created_at);
        return orderDate >= from && orderDate <= to;
      });
      
      renderAdminOrderTable(filteredOrders);
    } else {
      renderAdminOrderTable([]);
    }
  } catch (error) {
    console.error('날짜 필터 에러:', error);
    renderAdminOrderTable([]);
  }
}

// 관리자 주문 상태별 필터
async function filterAdminOrderByStatus(status) {
  const token = getToken();
  if (!token) {
    toast('로그인이 필요합니다.');
    return;
  }

  // 버튼 스타일 업데이트
  const buttons = document.querySelectorAll('.admin-status-filter');
  buttons.forEach(btn => {
    if (btn.dataset.status === status) {
      btn.style.opacity = '1';
      btn.style.fontWeight = 'bold';
    } else {
      btn.style.opacity = '0.6';
      btn.style.fontWeight = 'normal';
    }
  });

  try {
    const response = await fetch('/api/admin/orders', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (result.success && result.orders) {
      let filteredOrders = result.orders;
      
      if (status !== 'all') {
        filteredOrders = result.orders.filter(order => order.status === status);
      }
      
      renderAdminOrderTable(filteredOrders);
    } else {
      renderAdminOrderTable([]);
    }
  } catch (error) {
    console.error('상태 필터 에러:', error);
    renderAdminOrderTable([]);
  }
}

async function searchAdminOrders() {
  const searchInput = get('adm-order-search');
  if (!searchInput) return;
  
  const searchQuery = searchInput.value.trim();
  const token = getToken();
  if (!token) {
    toast('로그인이 필요합니다.');
    return;
  }

  try {
    const url = searchQuery 
      ? `/api/admin/orders?search=${encodeURIComponent(searchQuery)}`
      : `/api/admin/orders`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (result.success && result.orders) {
      renderAdminOrderTable(result.orders);
      if (searchQuery) {
        toast(`${result.count}개의 주문을 찾았습니다.`);
      }
    } else {
      renderAdminOrderTable([]);
    }
  } catch (error) {
    console.error('검색 에러:', error);
    toast('검색 중 오류가 발생했습니다.');
    renderAdminOrderTable([]);
  }
}

function renderAdminOrderTable(orders) {
  const body = get('order-list-body');
  body.innerHTML = '';

  if (orders.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="padding:30px; text-align:center; color:#64748b;">주문이 없습니다.</td></tr>';
    return;
  }

  orders.forEach((order) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #e6edf3';
    const orderId = order.id || order.order_id || 'N/A';
    
    const statusMap = {
      'pending': { color: '#f59e0b', text: '접수' },
      'preparing': { color: '#3b82f6', text: '준비중' },
      'shipping': { color: '#8b5cf6', text: '배송출발' },
      'completed': { color: '#10b981', text: '완료' },
      'cancelled': { color: '#ef4444', text: '취소' },
      'refund_requested': { color: '#f97316', text: '환불요청' },
      'refunded': { color: '#6b7280', text: '환불완료' }
    };
    
    const statusInfo = statusMap[order.status] || { color: '#64748b', text: order.status || '대기' };
    const createdDate = order.created_at ? new Date(order.created_at).toLocaleString('ko-KR') : '-';
    const userName = order.user_id || '비회원';
    
    let itemSummary = '상품';
    let isPersonalPay = false;

    // order_details에서 개인결제 여부 확인
    let orderDetailsObj = {};
    if (order.order_details) {
      try {
        orderDetailsObj = typeof order.order_details === 'string' ? JSON.parse(order.order_details) : order.order_details;
        if (orderDetailsObj?.payment_link_code) isPersonalPay = true;
      } catch (e) {
        orderDetailsObj = {};
      }
    }

    if (order.items && typeof order.items === 'string') {
      try {
        const items = JSON.parse(order.items);
        if (Array.isArray(items) && items.length > 0) {
          itemSummary = items.length === 1 
            ? items[0].name || items[0].title || '상품'
            : `${items[0].name || items[0].title || '상품'} 외 ${items.length - 1}개`;
          if (items[0].category === '개인결제') isPersonalPay = true;
        }
      } catch (e) {
        itemSummary = '상품';
      }
    }

    const personalBadge = isPersonalPay
      ? `<span style="margin-right:6px; padding:4px 8px; background:#ecfeff; color:#0ea5e9; border:1px solid #bae6fd; border-radius:999px; font-size:11px; font-weight:800;">개인결제</span>`
      : '';
    
    tr.innerHTML = `
      <td style="padding:10px; font-weight:700; color:#037a3f; font-family:monospace;">${orderId}</td>
      <td style="padding:10px; font-size:12px;">${createdDate}</td>
      <td style="padding:10px;">${userName}</td>
      <td style="padding:10px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">${personalBadge}<span>${itemSummary}</span></td>
      <td style="padding:10px;">${(order.total_price || 0).toLocaleString()}원</td>
      <td style="padding:10px; text-align:center;">
        <div style="display:flex; gap:6px; justify-content:center; align-items:center; flex-wrap:wrap;">
          <span style="padding:4px 10px; background:${statusInfo.color}15; color:${statusInfo.color}; border-radius:4px; font-size:11px; font-weight:700;">${statusInfo.text}</span>
          <button onclick="viewAdminOrderDetail('${orderId}')" style="padding:4px 8px; background:#037a3f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">상세</button>
          ${order.status === 'refund_requested' ? `
            <button onclick="approveRefund('${orderId}')" style="padding:4px 8px; background:#10b981; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">환불승인</button>
            <button onclick="rejectRefund('${orderId}')" style="padding:4px 8px; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">환불거절</button>
          ` : order.status === 'pending' ? `
            <button onclick="updateAdminOrderStatus('${orderId}', 'preparing')" style="padding:4px 8px; background:#3b82f6; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">제작</button>
            <button onclick="updateAdminOrderStatus('${orderId}', 'cancelled')" style="padding:4px 8px; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">취소</button>
          ` : order.status === 'preparing' ? `
            <button onclick="updateAdminOrderStatus('${orderId}', 'shipping')" style="padding:4px 8px; background:#8b5cf6; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">배송</button>
          ` : order.status === 'shipping' ? `
            <button onclick="updateAdminOrderStatus('${orderId}', 'completed')" style="padding:4px 8px; background:#10b981; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">완료</button>
          ` : ''}
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
}

async function updateAdminOrderStatus(orderId, newStatus) {
  const statusText = {
    'preparing': '제작중',
    'shipping': '배송중',
    'completed': '완료',
    'cancelled': '취소'
  }[newStatus] || newStatus;
  
  if (!confirm(`주문을 "${statusText}" 상태로 변경하시겠습니까?`)) return;
  
  try {
    const token = getToken();
    const response = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    
    const result = await response.json();
    if (result.success) {
      toast(`주문 상태가 "${statusText}"(으)로 변경되었습니다.`);
      loadAdminOrderList();
    } else {
      alert(result.message || '상태 변경에 실패했습니다.');
    }
  } catch (error) {
    console.error('상태 변경 에러:', error);
    alert('상태 변경 중 오류가 발생했습니다.');
  }
}

// 환불 승인 함수
async function approveRefund(orderId) {
  console.log('🔄 approveRefund 호출됨:', orderId);
  if (!confirm('환불을 승인하시겠습니까?\n\n승인 후에는 취소할 수 없습니다.')) return;
  
  try {
    const token = getToken();
    console.log('🔑 토큰:', token ? '있음' : '없음');
    const response = await fetch(`/api/admin/orders/${orderId}/refund/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('📡 응답 상태:', response.status);
    const result = await response.json();
    console.log('📊 응답 데이터:', result);
    
    if (result.success) {
      toast('환불이 승인되었습니다.');
      loadAdminOrderList();
    } else {
      alert(result.message || '환불 승인에 실패했습니다.');
    }
  } catch (error) {
    console.error('❌ 환불 승인 에러:', error);
    alert('환불 승인 중 오류가 발생했습니다.');
  }
}

// 환불 거절 함수
async function rejectRefund(orderId) {
  const reason = prompt('환불 거절 사유를 입력하세요:');
  if (!reason || reason.trim() === '') {
    alert('거절 사유를 입력해주세요.');
    return;
  }
  
  try {
    const token = getToken();
    const response = await fetch(`/api/admin/orders/${orderId}/refund/reject`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ reason: reason.trim() })
    });
    
    const result = await response.json();
    if (result.success) {
      toast('환불이 거절되었습니다.');
      loadAdminOrderList();
    } else {
      alert(result.message || '환불 거절에 실패했습니다.');
    }
  } catch (error) {
    console.error('환불 거절 에러:', error);
    alert('환불 거절 중 오류가 발생했습니다.');
  }
}

function downloadOrderFile(orderId, fileIndex) {
  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  const order = orders.find(o => o.orderId === orderId);
  
  if (!order || !order.files || !order.files[fileIndex]) {
    alert('파일을 찾을 수 없습니다.');
    return;
  }
  
  const file = order.files[fileIndex];
  
  if (!file.data || !file.data.startsWith('data:')) {
    alert('이 파일은 다운로드할 수 없습니다. (파일 데이터가 저장되지 않았거나 5MB를 초과한 파일입니다.)');
    return;
  }
  
  // base64 데이터를 Blob으로 변환
  const base64Data = file.data.split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: file.type || 'application/octet-stream' });
  
  // 다운로드
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function cancelOrder(orderId) {
  if (!confirm('정말로 이 주문을 취소하시겠습니까?\n취소된 주문은 복구할 수 없습니다.')) {
    return;
  }
  
  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  const orderIndex = orders.findIndex(o => o.orderId === orderId || o.orderId === `ORDER-${orders.indexOf(o)}`);
  
  if (orderIndex === -1) {
    // orderId로 찾지 못하면 인덱스로 시도
    const index = parseInt(orderId.replace('ORDER-', ''));
    if (!isNaN(index) && orders[index]) {
      orders[index].status = '취소';
    } else {
      alert('주문 정보를 찾을 수 없습니다.');
      return;
    }
  } else {
    orders[orderIndex].status = '취소';
  }
  
  localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  renderOrderList();
  toast('주문이 취소되었습니다.');
}

async function viewAdminOrderDetail(orderId) {
  const token = getToken();
  if (!token) {
    toast('로그인이 필요합니다.');
    return;
  }

  console.log('=== 관리자 주문 상세 조회 ===');
  console.log('orderId:', orderId);

  try {
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('응답 상태:', response.status);
    
    const result = await response.json();
    console.log('응답 결과:', result);
    
    if (!result.success || !result.order) {
      alert('주문 정보를 찾을 수 없습니다.');
      return;
    }
    
    const order = result.order;
    console.log('주문 객체:', order);
    displayOrderDetailModal(order);
  } catch (error) {
    console.error('주문 조회 에러:', error);
    alert('주문 정보를 불러올 수 없습니다: ' + error.message);
  }
}

function displayOrderDetailModal(order) {
  const orderId = order.id || order.order_id || 'N/A';
  
  console.log('=== displayOrderDetailModal 호출 ===');
  console.log('order:', order);
  console.log('order.items 타입:', typeof order.items);
  console.log('order.items:', order.items);
  
  // 상태별 색상 및 텍스트
  const statusMap = {
    'pending': { color: '#f59e0b', text: '접수' },
    'preparing': { color: '#3b82f6', text: '준비중' },
    'shipping': { color: '#8b5cf6', text: '배송출발' },
    'completed': { color: '#10b981', text: '완료' },
    'refund_requested': { color: '#f97316', text: '환불요청' },
    'refunded': { color: '#6b7280', text: '환불완료' }
  };
  
  const statusInfo = statusMap[order.status] || { color: '#64748b', text: order.status || '대기' };
  const createdDate = order.created_at ? new Date(order.created_at).toLocaleString('ko-KR') : '-';
  const userName = order.user_id || '비회원';
  
  // order_details가 문자열로 올 때도 파싱해서 판비 등 세부 항목을 표시
  let orderDetails = order.order_details;
  console.log('원본 orderDetails:', orderDetails);
  if (typeof orderDetails === 'string') {
    try {
      orderDetails = JSON.parse(orderDetails);
    } catch (e) {
      console.warn('order_details parse error:', e);
      orderDetails = {};
    }
  }
  console.log('파싱 후 orderDetails:', orderDetails);
  
  // 주문 항목 파싱
  let items = [];
  let itemSummary = '상품';
  let itemsDetail = '';
  let isPersonalPay = false;
  
  if (order.items) {
    if (typeof order.items === 'string') {
      try {
        items = JSON.parse(order.items);
        console.log('파싱된 items:', items);
      } catch (e) {
        console.error('items 파싱 오류:', e);
        items = [];
      }
    } else if (Array.isArray(order.items)) {
      items = order.items;
      console.log('items가 이미 배열:', items);
    }
  }
  
  if (Array.isArray(items) && items.length > 0) {
    itemSummary = items.length === 1 
    ? items[0].name || items[0].title || '상품'
    : `${items[0].name || items[0].title || '상품'} 외 ${items.length - 1}개`;
    if (items[0].category === '개인결제') isPersonalPay = true;
    
    console.log('items 개수:', items.length);
    
    // 개인결제라면 상세를 단순화 (사양 + 금액)
    if (isPersonalPay || orderDetails?.payment_link_code) {
      const specs = orderDetails?.payment_link_specs || {};
      const note = orderDetails?.payment_link_note || '';
      const specsList = specs.type === 'book'
        ? `
            <li>표지 용지: ${specs.coverPaper || '-'}</li>
            <li>내지 용지: ${specs.innerPaper || '-'}</li>
            <li>총 페이지: ${specs.totalPages || '-'}p</li>
            <li>제본 방식: ${specs.binding || '-'}</li>
            <li>인쇄 부수: ${specs.printQuantity || '-'}부</li>
            ${specs.finishing ? `<li>후가공: ${specs.finishing}</li>` : ''}
          `
        : `
            <li>용지: ${specs.singlePaper || '-'}</li>
            <li>인쇄 부수: ${specs.printQuantity || '-'}부</li>
            <li>후가공: ${specs.finishing || '-'}</li>
          `;

      itemsDetail = `
        <div style="background:#fff; padding:20px; border-radius:8px; margin-bottom:16px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <span style="padding:4px 10px; background:#ecfeff; color:#0ea5e9; border:1px solid #bae6fd; border-radius:999px; font-size:12px; font-weight:800;">개인결제</span>
            <span style="font-size:15px; font-weight:800; color:#0f172a;">${items[0].name || items[0].title || '개인결제'}</span>
          </div>
          <div style="margin-bottom:12px; font-size:14px; color:#0f172a; font-weight:800;">금액: ${(order.total_price || 0).toLocaleString()}원</div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
            <div style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:8px;">주문 사양</div>
            <ul style="margin:0; padding-left:18px; color:#334155; font-size:13px; line-height:1.7;">
              ${specsList}
              ${note ? `<li>메모: ${note}</li>` : ''}
            </ul>
          </div>
        </div>
      `;
    } else {
      // 일반 주문: 기존 상세 옵션 표시
      items.forEach((item, idx) => {
        console.log(`아이템 ${idx + 1}:`, item);
        console.log(`아이템 ${idx + 1} options:`, item.options);
        
        const opts = item.options || {};
        const qtyText = opts.qty ? (typeof opts.qty === 'string' && /부\s*$/.test(opts.qty) ? opts.qty : `${opts.qty}부`) : '';
        
        itemsDetail += `
          <div style="background:#fff; padding:20px; border-radius:8px; margin-bottom:16px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #037a3f;">
              📦 ${item.name || '상품'}${items.length > 1 ? ` (${idx + 1})` : ''}
            </div>
            
            ${opts.qty ? `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:3px solid #037a3f;">
                <span style="font-size:14px; color:#64748b;">수량:</span>
                <span style="color:#037a3f; font-size:18px; font-weight:700;">${qtyText}</span>
              </div>
            ` : ''}
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px;">
              <div style="background:#fafafa; padding:14px; border-radius:6px;">
                <div style="font-size:13px; font-weight:700; color:#037a3f; margin-bottom:10px;">📘 표지</div>
                ${opts.coverType ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">용지: <strong>${opts.coverType}${opts.coverGram ? ' ' + opts.coverGram : ''}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">용지: 미선택</div>'}
                ${opts.coverPages ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">페이지: <strong>${opts.coverPages}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">페이지: 미선택</div>'}
                ${opts.coverPrint ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">인쇄: <strong>${opts.coverPrint}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">인쇄: 미선택</div>'}
                ${opts.coverColor ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">색상: <strong>${opts.coverColor === 'color' ? '컬러' : '흑백'}</strong></div>` : ''}
                ${(() => {
                  const coatMap = {
                    'none': '코팅없음',
                    '0': '코팅없음',
                    '코팅없음': '코팅없음',
                    'matte': '무광코팅',
                    'matt': '무광코팅',
                    '1': '무광코팅',
                    '단면무광코팅': '무광코팅',
                    'gloss': '유광코팅',
                    'glossy': '유광코팅',
                    '3': '유광코팅',
                    '단면유광코팅': '유광코팅'
                  };
                  const label = coatMap[opts.coating] || opts.coating;
                  return opts.coating
                    ? `<div style="font-size:13px; color:#334155;">코팅: <strong>${label}</strong></div>`
                    : '<div style="font-size:13px; color:#94a3b8;">코팅: 미선택</div>';
                })()}
              </div>
              
              <div style="background:#fafafa; padding:14px; border-radius:6px;">
                <div style="font-size:13px; font-weight:700; color:#037a3f; margin-bottom:10px;">📄 내지</div>
                ${opts.innerType ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">용지: <strong>${opts.innerType}${opts.innerGram ? ' ' + opts.innerGram : ''}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">용지: 미선택</div>'}
                ${opts.innerPages ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">페이지: <strong>${opts.innerPages}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">페이지: 미선택</div>'}
                ${opts.innerPrint ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">인쇄: <strong>${opts.innerPrint}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">인쇄: 미선택</div>'}
                ${opts.innerColor ? `<div style="font-size:13px; color:#334155;">색상: <strong>${opts.innerColor === 'color' ? '컬러' : '흑백'}</strong></div>` : ''}
              </div>
              
              <div style="background:#fafafa; padding:14px; border-radius:6px;">
                <div style="font-size:13px; font-weight:700; color:#037a3f; margin-bottom:10px;">📌 제본</div>
                ${opts.binding ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">방식: <strong>${opts.binding === 'staple' ? '중철' : opts.binding === 'perfect' ? '무선' : opts.binding}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">방식: 미선택</div>'}
                ${opts.bindingDirection ? `<div style="font-size:14px; color:#037a3f; font-weight:700;">방향: ${opts.bindingDirection}</div>` : '<div style="font-size:13px; color:#94a3b8;">방향: 미선택</div>'}
              </div>
            </div>
          </div>
        `;
      });
    }
  } else {
    console.log('items가 비어있거나 배열이 아님');
    itemsDetail = '<div style="padding:20px; text-align:center; color:#94a3b8;">주문 상세 정보가 없습니다.</div>';
  }
  
  console.log('최종 itemsDetail 길이:', itemsDetail.length);
  console.log('itemsDetail:', itemsDetail);

  const detailHtml = `
    <div style="max-width:700px; margin:0 auto;">
      <h3 style="margin:0 0 20px 0; font-weight:1100; color:#0f172a;">주문 상세 정보</h3>
      
      <div style="background:#fff; border:1px solid var(--line); border-radius:0; padding:24px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #e2e8f0;">
          <div>
            <div style="font-weight:900; font-size:18px; color:#0f172a; margin-bottom:8px;">${order.user_id || '비회원'}</div>
            <div style="font-size:13px; color:#64748b;">주문번호: ${orderId}</div>
            <div style="font-size:13px; color:#64748b; margin-top:4px;">주문일: ${createdDate}</div>
          </div>
          <span style="padding:6px 16px; background:${statusInfo.color}15; color:${statusInfo.color}; border-radius:8px; font-size:13px; font-weight:700;">${statusInfo.text}</span>
        </div>
        
        <div style="margin-bottom:16px;">
          <div style="font-size:12px; color:#64748b; margin-bottom:8px; font-weight:600;">상태 변경</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button onclick="updateOrderStatus('${orderId}', 'pending')" style="padding:8px 12px; background:${order.status === 'pending' ? '#f59e0b' : '#e2e8f0'}; color:${order.status === 'pending' ? '#fff' : '#475569'}; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">접수</button>
            <button onclick="updateOrderStatus('${orderId}', 'preparing')" style="padding:8px 12px; background:${order.status === 'preparing' ? '#3b82f6' : '#e2e8f0'}; color:${order.status === 'preparing' ? '#fff' : '#475569'}; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">준비중</button>
            <button onclick="updateOrderStatus('${orderId}', 'shipping')" style="padding:8px 12px; background:${order.status === 'shipping' ? '#8b5cf6' : '#e2e8f0'}; color:${order.status === 'shipping' ? '#fff' : '#475569'}; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">배송출발</button>
            <button onclick="updateOrderStatus('${orderId}', 'completed')" style="padding:8px 12px; background:${order.status === 'completed' ? '#10b981' : '#e2e8f0'}; color:${order.status === 'completed' ? '#fff' : '#475569'}; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">완료</button>
          </div>
        </div>
        
        <div style="margin-bottom:16px; padding-top:16px; border-top:1px solid #e2e8f0;">
          <div style="font-size:12px; color:#64748b; margin-bottom:6px;">고객명</div>
          <div style="font-size:14px; color:#0f172a; font-weight:600;">${userName}</div>
        </div>
        
        <div style="margin-bottom:16px;">
          <div style="font-size:12px; color:#64748b; margin-bottom:8px; font-weight:600;">주문 상세 내역</div>
          ${itemsDetail}
        </div>
        
        ${orderDetails && typeof orderDetails === 'object' && Object.keys(orderDetails).length > 0 ? `
        <div style="margin-bottom:16px; padding:16px; background:#f0fdf4; border-radius:8px; border-left:4px solid #037a3f;">
          <div style="font-size:14px; font-weight:700; color:#037a3f; margin-bottom:12px;">📋 견적 상세 내역</div>
          ${(() => {
            const details = orderDetails;
            let html = '';
            
            if (details.cover) {
              html += '<div style="margin-bottom:12px; padding:10px; background:#fff; border-radius:6px;">';
              html += '<div style="font-size:12px; font-weight:700; color:#037a3f; margin-bottom:8px;">표지 비용</div>';
              html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px;">';
              html += '<div>종이비: <strong>' + (details.cover.paper || 0).toLocaleString() + '원</strong></div>';
              html += '<div>인쇄비: <strong>' + (details.cover.print || 0).toLocaleString() + '원</strong></div>';
              html += '<div>판비: <strong>' + (details.cover.plate || 0).toLocaleString() + '원</strong></div>';
              html += '<div>코팅비: <strong>' + (details.cover.coat || 0).toLocaleString() + '원</strong></div>';
              html += '</div>';
              html += '<div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px; text-align:right; font-weight:700; color:#0f172a;">소계: ' + (details.cover.total || 0).toLocaleString() + '원</div>';
              html += '</div>';
            }
            
            if (details.inner) {
              html += '<div style="margin-bottom:12px; padding:10px; background:#fff; border-radius:6px;">';
              html += '<div style="font-size:12px; font-weight:700; color:#0f7ba7; margin-bottom:8px;">내지 비용</div>';
              html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px;">';
              html += '<div>종이비: <strong>' + (details.inner.paper || 0).toLocaleString() + '원</strong></div>';
              html += '<div>인쇄비: <strong>' + (details.inner.print || 0).toLocaleString() + '원</strong></div>';
              html += '<div>판비: <strong>' + (details.inner.plate || 0).toLocaleString() + '원</strong></div>';
              html += '</div>';
              if (details.inner.sheets) html += '<div style="font-size:11px; color:#64748b; margin-top:6px;">소요장수: ' + details.inner.sheets + '장</div>';
              if (details.inner.daesu) html += '<div style="font-size:11px; color:#64748b;">대수: ' + details.inner.daesu + '</div>';
              html += '<div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px; text-align:right; font-weight:700; color:#0f172a;">소계: ' + (details.inner.total || 0).toLocaleString() + '원</div>';
              html += '</div>';
            }
            
            if (details.bind) {
              html += '<div style="margin-bottom:12px; padding:10px; background:#fff; border-radius:6px;">';
              html += '<div style="font-size:12px; font-weight:700; color:#f59e0b; margin-bottom:8px;">제본 비용</div>';
              html += '<div style="font-size:12px;">제본비: <strong>' + (details.bind.cost || 0).toLocaleString() + '원</strong></div>';
              if (details.bind.msg) html += '<div style="font-size:11px; color:#64748b; margin-top:4px;">' + details.bind.msg + '</div>';
              html += '</div>';
            }
            
            if (details.shipping) {
              html += '<div style="margin-bottom:12px; padding:10px; background:#fff; border-radius:6px;">';
              html += '<div style="font-size:12px; font-weight:700; color:#8b5cf6; margin-bottom:8px;">배송 비용</div>';
              html += '<div style="font-size:12px;">배송비: <strong>' + (details.shipping.cost || 0).toLocaleString() + '원</strong></div>';
              html += '<div style="font-size:11px; color:#64748b; margin-top:4px;">' + details.shipping.boxName + ' ' + details.shipping.boxes + '개</div>';
              html += '</div>';
            }
            
            // 마진, 부가세, 공급가액 표시 (순서: 마진 → 부가세 → 공급가액)
            if (details.supplyPrice) {
              html += '<div style="margin-top:16px; padding:10px; background:#fff; border-radius:6px; border-top:2px solid #e2e8f0;">';
              if (typeof details.marginAmount === 'number' && typeof details.marginPercent === 'number') {
                html += '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">';
                html += '<span style="font-size:12px; color:#64748b;">마진 (' + details.marginPercent + '%)</span>';
                html += '<span style="font-size:13px; font-weight:700; color:#0f172a;">' + Math.round(details.marginAmount).toLocaleString() + '원</span>';
                html += '</div>';
              }
              if (details.vat) {
                html += '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">';
                html += '<span style="font-size:12px; color:#64748b;">부가세 (10%)</span>';
                html += '<span style="font-size:13px; font-weight:700; color:#0f172a;">' + Math.round(details.vat).toLocaleString() + '원</span>';
                html += '</div>';
              }
              html += '<div style="display:flex; justify-content:space-between;">';
              html += '<span style="font-size:12px; color:#64748b;">공급가액</span>';
              html += '<span style="font-size:13px; font-weight:700; color:#0f172a;">' + Math.round(details.supplyPrice).toLocaleString() + '원</span>';
              html += '</div>';
              html += '</div>';
            }
            
            return html;
          })()}
          
          ${(orderDetails && orderDetails.finalPrice) ? `
          <div style="padding:12px; background:#fff; border-radius:6px; border:2px solid #037a3f;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:13px; font-weight:700; color:#0f172a;">최종 견적가</span>
              <span style="font-size:18px; font-weight:900; color:#037a3f;">${(orderDetails.finalPrice || 0).toLocaleString()}원</span>
            </div>
            ${orderDetails.perUnitPrice ? '<div style="text-align:right; font-size:12px; color:#64748b; margin-top:4px;">권당: ' + orderDetails.perUnitPrice.toLocaleString() + '원</div>' : ''}
          </div>
          ` : ''}
        </div>
        ` : `
        <div style="margin-bottom:16px; padding:16px; background:#fef3c7; border-radius:8px; border-left:4px solid #f59e0b;">
          <div style="font-size:13px; font-weight:700; color:#b45309; margin-bottom:8px;">⚠️ 견적 상세 정보 없음</div>
          <div style="font-size:12px; color:#92400e;">이 주문은 견적 상세 계산 정보가 저장되지 않았습니다. 주문 정보에서 옵션을 확인하세요.</div>
        </div>
        `}
        
        <div style="padding-top:16px; border-top:2px solid #e2e8f0; margin-top:16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:14px; color:#64748b;">상품금액</span>
            <span style="font-size:14px; color:#0f172a; font-weight:700;">${(order.total_price || 0).toLocaleString()}원</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding-top:12px; border-top:1px dashed #e2e8f0; margin-top:12px;">
            <span style="font-size:16px; color:#0f172a; font-weight:900;">총 금액</span>
            <span style="font-size:20px; color:var(--primary); font-weight:1100;">${(order.total_price || 0).toLocaleString()}원</span>
          </div>
        </div>
      </div>
      
      ${order.status === 'refund_requested' ? `
        <div style="padding:12px; background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; margin-bottom:12px; text-align:center; color:#92400e; font-weight:600;">
          ⚠️ 고객이 환불을 요청하였습니다.
        </div>
        <div style="display:flex; gap:12px; margin-bottom:12px;">
          <button id="approve-refund-btn" class="btn" style="flex:1; background:#10b981; color:#fff; border:none; padding:12px; font-weight:700; cursor:pointer;">환불 승인</button>
          <button id="reject-refund-btn" class="btn" style="flex:1; background:#ef4444; color:#fff; border:none; padding:12px; font-weight:700; cursor:pointer;">환불 거절</button>
        </div>
      ` : ''}
      <button id="close-order-modal-btn" class="btn btn-primary" style="width:100%;">닫기</button>
    </div>
  `;

  // 모달로 표시
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:2000; padding:20px; overflow-y:auto;';
  modal.innerHTML = `
    <div style="background:#fff; border-radius:0; padding:24px; max-width:800px; width:100%; max-height:90vh; overflow-y:auto;">
      ${detailHtml}
    </div>
  `;
  
  // 닫기 버튼 및 환불 버튼 이벤트
  modal.addEventListener('click', async function(e) {
    if (e.target === modal || e.target.id === 'close-order-modal-btn') {
      document.body.removeChild(modal);
    }
    if (e.target.id === 'approve-refund-btn') {
      await approveRefund(orderId);
      document.body.removeChild(modal);
    }
    if (e.target.id === 'reject-refund-btn') {
      await rejectRefund(orderId);
      document.body.removeChild(modal);
    }
  });
  
  document.body.appendChild(modal);
}

async function updateOrderStatus(orderId, newStatus) {
  const token = getToken();
  if (!token) {
    toast('로그인이 필요합니다.');
    return;
  }

  try {
    const response = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    
    const result = await response.json();
    if (result.success) {
      toast('상태가 변경되었습니다.');
      // 현재 모달 닫기
      const modal = document.querySelector('[style*="position:fixed"][style*="inset:0"]');
      if (modal) document.body.removeChild(modal);
      // 주문 목록 새로고침
      loadAdminOrderList();
    } else {
      alert('상태 변경에 실패했습니다: ' + (result.message || ''));
    }
  } catch (error) {
    console.error('상태 변경 에러:', error);
    alert('상태 변경 중 오류가 발생했습니다.');
  }
}

async function renderUserList() {
  const body = get('user-list-body');
  body.innerHTML = '<tr><td colspan="11" style="padding:30px; text-align:center; color:#64748b;">불러오는 중...</td></tr>';

  try {
    const token = getToken();
    const res = await fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (!data.success) {
      body.innerHTML = '<tr><td colspan="11" style="padding:30px; text-align:center; color:#ef4444;">회원 목록을 불러올 수 없습니다.</td></tr>';
      return;
    }

    const users = data.users || [];
    body.innerHTML = '';

    if (users.length === 0) {
      body.innerHTML = '<tr><td colspan="11" style="padding:30px; text-align:center; color:#64748b;">등록된 회원이 없습니다.</td></tr>';
    } else {
      users.forEach((user, i) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e6edf3';
        const roleText = user.role === 'business' ? '사업자' : (user.role === 'admin' ? '관리자' : '일반');
        const statusText = user.status === 'pending' ? '승인대기' : (user.status === 'active' ? '활성' : '-');
        const statusColor = user.status === 'pending' ? '#f59e0b' : (user.status === 'active' ? '#10b981' : '#64748b');
        const addr = user.addr ? (user.addr + ' ' + (user.addr_detail || '')).trim() : '-';
        
        tr.innerHTML = `
              <td style="padding:10px;">${user.db_id || '-'}</td>
              <td style="padding:10px;">${user.user_id || '-'}</td>
              <td style="padding:10px;">${user.name || '-'}</td>
              <td style="padding:10px;">${user.phone || '-'}</td>
              <td style="padding:10px; max-width:200px; word-break:break-all;">${addr}</td>
              <td style="padding:10px;">${roleText}</td>
              <td style="padding:10px;">${user.biz_name || '-'}</td>
              <td style="padding:10px;">${user.biz_num || '-'}</td>
              <td style="padding:10px;"><span style="color:${statusColor}; font-weight:700;">${statusText}</span></td>
              <td style="padding:10px;">${user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
              <td style="padding:10px; text-align:center;">
                ${user.role !== 'admin' ? `<button onclick="deleteUser('${user.user_id}')" style="padding:6px 12px; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='#dc2626'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='#ef4444'; this.style.transform='scale(1)'">삭제</button>` : '<span style="color:#64748b;">-</span>'}
              </td>
            `;
        body.appendChild(tr);
      });
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = '<tr><td colspan="11" style="padding:30px; text-align:center; color:#ef4444;">서버 오류가 발생했습니다.</td></tr>';
  }
}

async function deleteUser(userId) {
  if (!confirm(`정말로 회원 "${userId}"을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }
  
  try {
    const token = getToken();
    const res = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    if (!data.success) {
      alert(data.message || '회원 삭제에 실패했습니다.');
      return;
    }
    
    toast('회원이 삭제되었습니다.');
    renderUserList(); // 목록 새로고침
  } catch (err) {
    console.error(err);
    alert('서버 오류가 발생했습니다.');
  }
}

function resetAllData() {
  if (confirm('⚠️ 모든 데이터를 초기화하시겠습니까?\n(복구 불가능합니다)')) {
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(ORDER_KEY);
    localStorage.removeItem(USER_DB_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    // 컨텐츠 DB도 리셋
    localStorage.removeItem(CONTENT_DB_KEY);
    localStorage.removeItem(HOMEPAGE_DB_KEY);
    alert('초기화 완료되었습니다');
    location.reload();
  }
}

// ===== QUOTATION (견적) 함수 =====
async function addQuoteToCart() {
  const coating = get('quote-coating').value;
  const paper = get('quote-paper').value;
  const color = get('quote-color').value;
  const size = get('quote-size').value;
  const qty = get('quote-qty').value;
  const totalPrice = get('quote-total-price').textContent;

  const title = get('quote-title').textContent;
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');

  // 첨부 파일 정보
  const fileInfo = quoteAttachedFiles.length > 0 ?
    `📎 첨부파일 ${quoteAttachedFiles.length}개: ${quoteAttachedFiles.map(f => f.name).join(', ')}` :
    '';

  cart.push({
    name: `${title} (${size}, ${qty})`,
    qty: parseInt(qty),
    price: parseInt(totalPrice.replace(/[^0-9]/g, '')),
    shipping: 0,
    specs: `코팅: ${coating}, 용지: ${paper}, 색상: ${color}, 사이즈: ${size}`,
    files: quoteAttachedFiles.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type
    })),
    fileInfo: fileInfo,
    date: new Date().toLocaleString()
  });

  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  await syncCartToServer(cart);
  alert('견적이 장바구니에 추가되었습니다!' + (fileInfo ? '\n' + fileInfo : ''));

  // 파일 목록 초기화
  quoteAttachedFiles = [];
  updateQuoteFileList();

  goHome();
}

// 선택된 옵션 정보 수집
function collectQuoteOptions() {
  const options = {};
  
  try {
    // 사이즈 정보
    const sizeType = document.querySelector('input[name="size-type"]:checked');
    if (sizeType && sizeType.value === 'working') {
      const w = get('ind-size-working-width')?.value;
      const h = get('ind-size-working-height')?.value;
      if (w && h) options.size = `작업사이즈: ${w}×${h}mm`;
    } else {
      const w = get('ind-size-width')?.value;
      const h = get('ind-size-height')?.value;
      if (w && h) options.size = `재단사이즈: ${w}×${h}mm`;
    }
    
    // 표지 정보
    const coverTypeEl = get('ind-coverType');
    const coverGramEl = get('ind-coverGram');
    if (coverTypeEl && coverTypeEl.value && coverTypeEl.value !== '') {
      options.coverType = coverTypeEl.value;
    }
    if (coverGramEl && coverGramEl.value && coverGramEl.value !== '') {
      options.coverGram = coverGramEl.value + 'g';
    }
    
    const coverPagesEl = get('ind-coverPages');
    if (coverPagesEl && coverPagesEl.value && coverPagesEl.value !== '' && coverPagesEl.value !== '페이지선택') {
      const coverPages = coverPagesEl.value;
      options.coverPages = coverPages === '2' ? '2p' : coverPages === '4' ? '4p' : coverPages + 'p';
    }
    
    const coverPrintSelect = get('ind-coverPrint-select');
    if (coverPrintSelect && coverPrintSelect.value) {
      const printValue = coverPrintSelect.value;
      if (printValue === '2-color') options.coverPrint = '양면 컬러';
      else if (printValue === '2-mono') options.coverPrint = '양면 흑백';
      else if (printValue === '1-color') options.coverPrint = '단면 컬러';
      else if (printValue === '1-mono') options.coverPrint = '단면 흑백';
    }
    
    const coverColor = getRadio('ind-coverColor');
    if (coverColor) options.coverColor = coverColor;
    
    const coatingSelect = get('ind-coating-select');
    if (coatingSelect) {
      const coatingValue = coatingSelect.value;
      if (coatingValue === '0' || coatingValue === '') {
        options.coating = '코팅없음';
      } else if (coatingValue === '1') {
        options.coating = '단면무광코팅';
      } else if (coatingValue === '3') {
        options.coating = '단면유광코팅';
      } else if (coatingValue) {
        options.coating = coatingValue;
      }
    }
    
    // 내지 정보
    const innerTypeEl = get('ind-innerType');
    const innerGramEl = get('ind-innerGram');
    if (innerTypeEl && innerTypeEl.value && innerTypeEl.value !== '') {
      options.innerType = innerTypeEl.value;
    }
    if (innerGramEl && innerGramEl.value && innerGramEl.value !== '') {
      options.innerGram = innerGramEl.value + 'g';
    }
    
    const innerPagesEl = get('ind-innerPages');
    if (innerPagesEl && innerPagesEl.value && innerPagesEl.value !== '' && innerPagesEl.value !== '페이지선택') {
      options.innerPages = innerPagesEl.value + '페이지';
    }
    
    const innerPrintSelect = get('ind-innerPrint-select');
    if (innerPrintSelect && innerPrintSelect.value) {
      const printValue = innerPrintSelect.value;
      if (printValue === '2-color') options.innerPrint = '양면 컬러';
      else if (printValue === '2-mono') options.innerPrint = '양면 흑백';
      else if (printValue === '1-color') options.innerPrint = '단면 컬러';
      else if (printValue === '1-mono') options.innerPrint = '단면 흑백';
    }
    
    const innerColor = getRadio('ind-innerColor');
    if (innerColor) options.innerColor = innerColor;
    
    // 제본 정보
    const binding = window.currentBindType || getRadio('ind-bind');
    if (binding) options.binding = binding;
    
    // 제본방향
    const bindingDirectionEl = get('ind-binding-direction');
    if (bindingDirectionEl && bindingDirectionEl.value && bindingDirectionEl.value !== '') {
      const bindingDirection = bindingDirectionEl.value;
      if (bindingDirection === 'vertical-left') options.bindingDirection = '세로형좌철';
      else if (bindingDirection === 'vertical-right') options.bindingDirection = '세로형우철';
      else if (bindingDirection === 'horizontal-top') options.bindingDirection = '가로형상철';
      else if (bindingDirection === 'horizontal-bottom') options.bindingDirection = '가로형하철';
      else options.bindingDirection = bindingDirection;
    }
    
    // 수량
    const qtyEl = get('ind-qty');
    if (qtyEl && qtyEl.value && qtyEl.value !== '') {
      options.qty = parseInt(qtyEl.value) || qtyEl.value;
    }
    
    // 마진율
    const marginEl = get('ind-margin');
    if (marginEl && marginEl.value && marginEl.value !== '') {
      options.margin = parseInt(marginEl.value) || 0;
    }
    
    // 111.html 계산용 추가 정보
    // 표지
    if (coverTypeEl && coverTypeEl.value && coverTypeEl.value !== '') {
      options.coverType = coverTypeEl.value;
    }
    if (coverGramEl && coverGramEl.value && coverGramEl.value !== '') {
      options.coverGram = parseInt(coverGramEl.value) || 0;
    }
    const coverDetailEl = get('ind-coverDetail');
    if (coverDetailEl && coverDetailEl.value) {
      options.coverDetail = coverDetailEl.value;
    }
    
    // 내지
    if (innerTypeEl && innerTypeEl.value && innerTypeEl.value !== '') {
      options.innerType = innerTypeEl.value;
    }
    if (innerGramEl && innerGramEl.value && innerGramEl.value !== '') {
      options.innerGram = parseInt(innerGramEl.value) || 0;
    }
    const innerDetailEl = get('ind-innerDetail');
    if (innerDetailEl && innerDetailEl.value) {
      options.innerDetail = innerDetailEl.value;
    }
    
    // 내지 페이지 수 (정수)
    if (innerPagesEl && innerPagesEl.value && innerPagesEl.value !== '' && innerPagesEl.value !== '페이지선택') {
      options.innerPages = parseInt(innerPagesEl.value) || 0;
    }
    
    // 제본 종류
    const bindTypeEl = get('ind-bindType');
    if (bindTypeEl && bindTypeEl.value) {
      options.bindType = bindTypeEl.value;
    }
    
    // 코팅 (111.html용)
    if (coatingSelect) {
      const coatingValue = coatingSelect.value;
      if (coatingValue === '0' || coatingValue === '' || coatingValue === 'none') {
        options.coating = 'none';
      } else if (coatingValue === '1') {
        options.coating = 'matte';
      } else if (coatingValue === '3') {
        options.coating = 'glossy';
      } else {
        options.coating = coatingValue;
      }
    }
    
    // 모드 (111.html용) - currentCategory를 최우선으로 사용
    const resolveModeFromCategory = (catVal) => {
      if (catVal === 'indigo') return 'book_indigo';
      if (catVal === 'digital') return 'book_digital';
      if (catVal === 'offset') return 'book_offset';
      return 'book_indigo';
    };

    const categoryEl = document.querySelector('[data-category]');
    if (categoryEl) {
      const cat = categoryEl.getAttribute('data-category');
      options.mode = resolveModeFromCategory(window.currentCategory || cat);
    } else {
      // category 엘리먼트가 없을 때도 현재 선택된 카테고리 기준으로 mode 설정
      options.mode = resolveModeFromCategory(window.currentCategory);
    }
    
    // 사이즈 (111.html용 - 표준 사이즈로 변환)
    const sizeSelectEl = get('ind-size');
    if (sizeSelectEl && sizeSelectEl.value) {
      options.size = sizeSelectEl.value;
    }
    
  } catch (e) {
    console.error('옵션 수집 중 오류:', e);
  }
  
  return options;
}

// 파일을 base64로 변환하는 헬퍼 함수
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 견적요약서에서 장바구니에 추가
async function addToCartFromQuote() {
  console.log('[quote] addToCartFromQuote clicked');
  if (window._addingCart) return;
  window._addingCart = true;
  // 먼저 계산 실행
  if (typeof calculateIndigo === 'function') {
    calculateIndigo();
  }

  // 파일 확인
  // 견적 요약서 정보 가져오기
  const cat = get('sum-cat')?.textContent || '-';
  const qty = get('sum-qty')?.textContent || '-';
  const total = get('sum-total')?.textContent || '0원';
  const totalPrice = parseInt(total.replace(/[^0-9]/g, '')) || 0;

  if (totalPrice === 0) {
    alert('먼저 견적을 계산해주세요.');
    return;
  }

  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');

  // 파일 정보
  const fileInfo = quoteAttachedFiles.length > 0 ?
    `📎 첨부파일 ${quoteAttachedFiles.length}개: ${quoteAttachedFiles.map(f => f.name).join(', ')}` :
    '';

  // 옵션 정보 수집
  const options = collectQuoteOptions();

  // 배송비 및 상세 계산 재계산(111 로직 재사용)
  // 기본값은 화면에 표시된 요약값을 그대로 사용해 계산 불일치를 막는다.
  let shipCost = parseInt((get('sum-ship')?.textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
  let itemPriceExShip = Math.max(0, totalPrice - shipCost);
  try {
    // 옵션 값 정규화
    let sizeValue = 'A4';
    if (options.size) {
      const sizeMatch = options.size.toString().match(/(\d+)×(\d+)/);
      if (sizeMatch) {
        const w = parseInt(sizeMatch[1], 10);
        const h = parseInt(sizeMatch[2], 10);
        if (w === 210 && h === 297) sizeValue = 'A4';
        else if (w === 148 && h === 210) sizeValue = 'A5';
        else if (w === 182 && h === 257) sizeValue = 'B5';
      } else if (['A4','A5','B5'].includes(options.size)) {
        sizeValue = options.size;
      }
    }

    const qtyValue = typeof options.qty === 'number'
      ? options.qty
      : parseInt((qty || '').toString().replace(/[^0-9]/g, ''), 10) || 0;

    const innerPagesValue = typeof options.innerPages === 'number'
      ? options.innerPages
      : parseInt((options.innerPages || '').toString().replace(/[^0-9]/g, ''), 10) || 16;

    const coverGramValue = typeof options.coverGram === 'number'
      ? options.coverGram
      : parseInt((options.coverGram || '').toString().replace(/[^0-9]/g, ''), 10) || 200;

    const innerGramValue = typeof options.innerGram === 'number'
      ? options.innerGram
      : parseInt((options.innerGram || '').toString().replace(/[^0-9]/g, ''), 10) || 80;

    let coverDetail = options.coverDetail || 'color_double';
    if (!options.coverDetail && options.coverPrint) {
      if (options.coverPrint === '양면 컬러') coverDetail = 'color_double';
      else if (options.coverPrint === '양면 흑백') coverDetail = 'mono_double';
      else if (options.coverPrint === '단면 컬러') coverDetail = 'color_single';
      else if (options.coverPrint === '단면 흑백') coverDetail = 'mono_single';
    }

    let innerDetail = options.innerDetail || 'mono_double';
    if (!options.innerDetail && options.innerPrint) {
      if (options.innerPrint === '양면 컬러') innerDetail = 'color_double';
      else if (options.innerPrint === '양면 흑백') innerDetail = 'mono_double';
      else if (options.innerPrint === '단면 컬러') innerDetail = 'color_single';
      else if (options.innerPrint === '단면 흑백') innerDetail = 'mono_single';
    }

    let coatingValue = 'none';
    if (options.coating) {
      if (['코팅없음','none','0'].includes(options.coating)) coatingValue = 'none';
      else if (['단면무광코팅','matte','1'].includes(options.coating)) coatingValue = 'matt';
      else if (['단면유광코팅','glossy','3'].includes(options.coating)) coatingValue = 'gloss';
      else coatingValue = options.coating;
    }

    const calcDetails = calculateAndSaveQuoteDetails_111({
      size: sizeValue,
      qty: qtyValue,
      margin: options.margin || 0,
      innerPages: innerPagesValue,
      bindType: options.bindType || options.binding || 'perfect',
      mode: options.mode || 'book_indigo',
      coating: coatingValue,
      coverType: options.coverType || '모조지',
      coverGram: coverGramValue,
      coverDetail: coverDetail,
      innerType: options.innerType || '모조지',
      innerGram: innerGramValue,
      innerDetail: innerDetail
    });
    
    console.log('[파이프 검증] addToCartFromQuote - calcDetails 생성:', {
      cover: calcDetails?.cover,
      inner: calcDetails?.inner,
      bind: calcDetails?.bind,
      shipping: calcDetails?.shipping,
      finalPrice: calcDetails?.finalPrice
    });

    // 화면에 표시된 요약 금액을 우선 신뢰해 가격 차이를 없앤다
    const shownSupply = parseInt((get('sum-supply')?.textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
    const shownVat = parseInt((get('sum-vat')?.textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
    const shownShip = parseInt((get('sum-ship')?.textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
    const shownTotal = parseInt((get('sum-total')?.textContent || '').replace(/[^0-9]/g, ''), 10) || 0;

    shipCost = shownShip || calcDetails?.shipping?.cost || 0;
    const finalFromCalc = calcDetails?.finalPrice || shownTotal || totalPrice;
    // 장바구니 상품가는 최종가에서 배송비를 뺀 값으로 저장 (표시값 기준)
    itemPriceExShip = Math.max(0, shownTotal ? (shownTotal - shipCost) : (finalFromCalc - shipCost));

    // admin breakdown 일치를 위해 계산된 상세를 아이템에도 저장하되, 화면 표시값으로 보정
    if (calcDetails) {
      calcDetails.finalPrice = shownTotal || finalFromCalc;
      calcDetails.supplyPrice = shownSupply || calcDetails.supplyPrice;
      calcDetails.vat = shownVat || calcDetails.vat;
      calcDetails.shipping = calcDetails.shipping || {};
      calcDetails.shipping.cost = shipCost;
      const qtyForUnit = qtyValue || 0;
      if (qtyForUnit > 0) calcDetails.perUnitPrice = Math.round(calcDetails.finalPrice / qtyForUnit);
      options._calcDetails = calcDetails;
    }
  } catch (e) {
    console.warn('장바구니 배송/금액 계산 실패:', e);
  }

  // 파일을 base64로 변환 (5MB 이하만)
  const maxFileSize = 5 * 1024 * 1024; // 5MB
  const filesWithData = [];
  
  for (const f of quoteAttachedFiles) {
    if (f.file && f.file.size <= maxFileSize) {
      try {
        const base64 = await convertFileToBase64(f.file);
        filesWithData.push({
          name: f.name,
          size: f.size,
          type: f.type,
          data: base64
        });
      } catch (e) {
        console.error('파일 변환 실패:', f.name, e);
        filesWithData.push({
          name: f.name,
          size: f.size,
          type: f.type
        });
      }
    } else if (f.file && f.file.size > maxFileSize) {
      alert(`${f.name}은(는) 5MB를 초과하여 파일 데이터가 저장되지 않습니다. 파일명만 저장됩니다.`);
      filesWithData.push({
        name: f.name,
        size: f.size,
        type: f.type
      });
    } else {
      filesWithData.push({
        name: f.name,
        size: f.size,
        type: f.type,
        data: f.data // 이미 base64 데이터가 있는 경우
      });
    }
  }

  cart.push({
    name: `${cat} (${qty})`,
    qty: qty,
    price: itemPriceExShip,
    shipping: shipCost,
    specs: `카테고리: ${cat}, 수량: ${qty}`,
    options: options,
    files: filesWithData,
    fileInfo: fileInfo,
    date: new Date().toLocaleString()
  });

  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  await syncCartToServer(cart);
  alert('장바구니에 추가되었습니다!');
  window._addingCart = false;
}

// 견적요약서에서 바로 주문
async function orderDirectlyFromQuote() {
  console.log('[quote] orderDirectlyFromQuote clicked');
  if (window._ordering) return; // 클릭 중복 방지
  window._ordering = true;
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) {
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  // 먼저 계산 실행
  if (typeof calculateIndigo === 'function') {
    calculateIndigo();
  }

  // 파일 확인
  // 견적 요약서 정보 가져오기
  const cat = get('sum-cat')?.textContent || '-';
  const qty = get('sum-qty')?.textContent || '-';
  const total = get('sum-total')?.textContent || '0원';
  const totalPrice = parseInt(total.replace(/[^0-9]/g, '')) || 0;

  if (totalPrice === 0) {
    alert('먼저 견적을 계산해주세요.');
    return;
  }

  // 파일 정보
  const fileInfo = quoteAttachedFiles.length > 0 ?
    `📎 첨부파일 ${quoteAttachedFiles.length}개: ${quoteAttachedFiles.map(f => f.name).join(', ')}` :
    '';

  // 옵션 정보 수집
  const options = collectQuoteOptions();

  // 파일을 base64로 변환 (5MB 이하만)
  const maxFileSize = 5 * 1024 * 1024; // 5MB
  const filesWithData = [];
  
  for (const f of quoteAttachedFiles) {
    if (f.file && f.file.size <= maxFileSize) {
      try {
        const base64 = await convertFileToBase64(f.file);
        filesWithData.push({
          name: f.name,
          size: f.size,
          type: f.type,
          data: base64
        });
      } catch (e) {
        console.error('파일 변환 실패:', f.name, e);
        filesWithData.push({
          name: f.name,
          size: f.size,
          type: f.type
        });
      }
    } else if (f.file && f.file.size > maxFileSize) {
      alert(`${f.name}은(는) 5MB를 초과하여 파일 데이터가 저장되지 않습니다. 파일명만 저장됩니다.`);
      filesWithData.push({
        name: f.name,
        size: f.size,
        type: f.type
      });
    } else {
      filesWithData.push({
        name: f.name,
        size: f.size,
        type: f.type,
        data: f.data // 이미 base64 데이터가 있는 경우
      });
    }
  }

  // 서버에 먼저 주문 생성 (대기 상태)
  // 견적 기반 상세 계산 정보 생성
  let orderDetails = {};
  try {
    // options에서 값 추출 및 타입 변환
    let sizeValue = 'A4';
    if (options.size) {
      const sizeMatch = options.size.match(/(\d+)×(\d+)/);
      if (sizeMatch) {
        const w = parseInt(sizeMatch[1]);
        const h = parseInt(sizeMatch[2]);
        if (w === 210 && h === 297) sizeValue = 'A4';
        else if (w === 148 && h === 210) sizeValue = 'A5';
        else if (w === 182 && h === 257) sizeValue = 'B5';
        else sizeValue = 'A4';
      }
    }
    
    const qtyValue = typeof options.qty === 'number' ? options.qty : 
                     (typeof qty === 'string' ? parseInt(qty.replace(/[^0-9]/g, '')) : 100);
    
    const innerPagesValue = typeof options.innerPages === 'number' ? options.innerPages :
                            (typeof options.innerPages === 'string' ? parseInt(options.innerPages) : 16);
    
    const coverGramValue = typeof options.coverGram === 'number' ? options.coverGram :
                           (typeof options.coverGram === 'string' ? parseInt(options.coverGram) : 200);
    
    const innerGramValue = typeof options.innerGram === 'number' ? options.innerGram :
                           (typeof options.innerGram === 'string' ? parseInt(options.innerGram) : 80);
    
    // coverDetail 결정
    let coverDetail = 'color_double';
    if (options.coverDetail) {
      coverDetail = options.coverDetail;
    } else if (options.coverPrint) {
      if (options.coverPrint === '양면 컬러') coverDetail = 'color_double';
      else if (options.coverPrint === '양면 흑백') coverDetail = 'mono_double';
      else if (options.coverPrint === '단면 컬러') coverDetail = 'color_single';
      else if (options.coverPrint === '단면 흑백') coverDetail = 'mono_single';
    }
    
    // innerDetail 결정
    let innerDetail = 'mono_double';
    if (options.innerDetail) {
      innerDetail = options.innerDetail;
    } else if (options.innerPrint) {
      if (options.innerPrint === '양면 컬러') innerDetail = 'color_double';
      else if (options.innerPrint === '양면 흑백') innerDetail = 'mono_double';
      else if (options.innerPrint === '단면 컬러') innerDetail = 'color_single';
      else if (options.innerPrint === '단면 흑백') innerDetail = 'mono_single';
    }
    
    // coating 결정
    let coatingValue = 'none';
    if (options.coating) {
      if (options.coating === '코팅없음' || options.coating === 'none') coatingValue = 'none';
      else if (options.coating === '단면무광코팅' || options.coating === 'matte') coatingValue = 'matt';
      else if (options.coating === '단면유광코팅' || options.coating === 'glossy') coatingValue = 'gloss';
      else coatingValue = options.coating;
    }
    
    orderDetails = calculateAndSaveQuoteDetails_111({
      size: sizeValue,
      qty: qtyValue,
      margin: options.margin || 0,
      innerPages: innerPagesValue,
      bindType: options.bindType || options.binding || 'perfect',
      mode: options.mode || 'book_indigo',
      coating: coatingValue,
      coverType: options.coverType || '모조지',
      coverGram: coverGramValue,
      coverDetail: coverDetail,
      innerType: options.innerType || '모조지',
      innerGram: innerGramValue,
      innerDetail: innerDetail
    });
    
    console.log('[파이프 검증] orderDirectlyFromQuote - orderDetails 생성:', {
      cover: orderDetails?.cover,
      inner: orderDetails?.inner,
      bind: orderDetails?.bind,
      shipping: orderDetails?.shipping,
      finalPrice: orderDetails?.finalPrice
    });
  } catch (e) {
    console.warn('직주문 상세 계산 정보 생성 실패:', e);
    console.error(e);
  }

  const finalPrice = (orderDetails && orderDetails.finalPrice)
    ? orderDetails.finalPrice
    : totalPrice;

  const token = getToken();
  if (isLocalEnv() && (!user || !token)) {
    const orderId = 'OLOCAL-' + Date.now();
    localStorage.setItem('lastOrderId', orderId);
    await clearCartEverywhere();
    showOrderComplete(orderId, orderId, finalPrice);
    return;
  }

  const shipCost = orderDetails?.shipping?.cost || 0;
  const itemPriceExShip = Math.max(0, finalPrice - shipCost);

  const orderItem = {
    name: `${cat} (${qty})`,
    qty: qty,
    price: itemPriceExShip,
    shipping: shipCost,
    specs: `카테고리: ${cat}, 수량: ${qty}`,
    options: options,
    files: filesWithData,
    fileInfo: fileInfo,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    date: new Date().toLocaleString()
  };

  try {
    console.log('[파이프 검증] orderDirectlyFromQuote - API 전송 데이터:', {
      finalPrice: finalPrice,
      order_details: orderDetails
    });
    
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({
        items: [orderItem],
        total_price: finalPrice,
        delivery_info: {
          recipient: user.name,
          phone: user.phone,
          address: user.addr || '',
          requirements: ''
        },
        order_details: orderDetails
      })
    });
    const result = await response.json();
    if (!result.success) {
      alert('주문 생성에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    const orderId = result.order_id;
    localStorage.setItem('lastOrderId', orderId);
    // 결제 실행 (주문번호 포함 복귀)
    startPaymentDirectOrder(finalPrice, user, orderId);
  } catch (e) {
    console.error('주문 생성 오류:', e);
    alert('주문 생성 중 오류가 발생했습니다.');
  } finally {
    window._ordering = false;
  }
}

// 결제중 상태 표시
function showPaymentProcessing() {
  const overlay = document.createElement('div');
  overlay.id = 'payment-processing-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  
  overlay.innerHTML = `
    <div style="background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
      <div style="font-size: 48px; margin-bottom: 20px; animation: spin 2s linear infinite;">⏳</div>
      <h2 style="color: #0f172a; margin-bottom: 10px; font-size: 20px;">결제 진행 중입니다</h2>
      <p style="color: #64748b; margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
        결제 창이 열립니다.<br>
        결제를 완료해주세요.
      </p>
      <p style="color: #94a3b8; font-size: 12px;">
        이 창을 닫지 마세요.
      </p>
      <style>
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

// 결제중 상태 제거
function hidePaymentProcessing() {
  const overlay = document.getElementById('payment-processing-overlay');
  if (overlay) overlay.remove();
}

// 결제 팝업 닫힘 감지 및 취소 메시지 표시
function monitorPaymentWindow(payappWindow) {
  console.log('[monitorPaymentWindow] 팝업 모니터링 시작');
  
  if (!payappWindow) {
    console.log('[monitorPaymentWindow] 팝업이 열리지 않음');
    return;
  }
  
  let isClosed = false;
  
  // 매 500ms마다 팝업 상태 확인
  const checkInterval = setInterval(async () => {
    try {
      // ✅ 만약 sesssionStorage에서 추적 ID가 제거되었다면 (결제 완료됨), 모니터링 중단
      const pendingOrderId = sessionStorage.getItem('pendingOrderId') || 
                              sessionStorage.getItem('pendingPaymentLinkOrderId');
      if (!pendingOrderId) {
        console.log('[monitorPaymentWindow] 결제 완료됨 - 모니터링 중단');
        clearInterval(checkInterval);
        return;
      }
      
      if (payappWindow.closed && !isClosed) {
        isClosed = true;
        console.log('[monitorPaymentWindow] 팝업이 닫혔습니다');
        clearInterval(checkInterval);
        
        // ✅ 먼저 sessionStorage에서 주문ID를 저장 (삭제하기 전에!)
        const deleteOrderId = sessionStorage.getItem('pendingOrderId') || 
                              sessionStorage.getItem('pendingPaymentLinkOrderId');
        console.log('[monitorPaymentWindow] 저장된 주문ID:', deleteOrderId);
        
        // ✅ 그 다음 sessionStorage 제거
        sessionStorage.removeItem('pendingOrderId');
        sessionStorage.removeItem('pendingPaymentLinkOrderId');
        
        // ✅ onPaymentComplete가 실행될 시간을 주기 위해 500ms 대기
        // 그 후 tempOrder.mul_no를 다시 확인
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const tempOrder = JSON.parse(localStorage.getItem('tempOrder') || '{}');
        console.log('[monitorPaymentWindow] 500ms 대기 후 tempOrder.mul_no:', tempOrder.mul_no);
        
        if (!tempOrder.mul_no) {
          // 결제 완료 없이 팝업만 닫힘 → 주문 삭제
          console.log('[monitorPaymentWindow] 결제 미완료 - 팝업만 닫힘');
          hidePaymentProcessing();
          
          if (deleteOrderId) {
            console.log('[monitorPaymentWindow] 결제 실패 주문 삭제:', deleteOrderId);
            try {
              const token = getToken();
              console.log('[monitorPaymentWindow] 토큰:', token ? 'O' : 'X');
              console.log('[monitorPaymentWindow] 삭제 요청 시작...');
              
              const deleteRes = await fetch(`/api/orders/${deleteOrderId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              console.log('[monitorPaymentWindow] 응답 상태:', deleteRes.status);
              const deleteData = await deleteRes.json();
              console.log('[monitorPaymentWindow] 응답 데이터:', JSON.stringify(deleteData, null, 2));
              
              if (deleteRes.ok && deleteData.success) {
                console.log('[monitorPaymentWindow] ✅ 주문 삭제 완료');
              } else {
                console.error('[monitorPaymentWindow] ❌ 주문 삭제 실패:', deleteRes.status, deleteData.message);
                console.error('[monitorPaymentWindow] 상세:', {
                  status: deleteData.order_status,
                  mul_no: deleteData.mul_no,
                  is_unpaid: deleteData.is_unpaid,
                  is_cancelled: deleteData.is_cancelled
                });
              }
            } catch (e) {
              console.error('[monitorPaymentWindow] 🔴 주문 삭제 오류:', e);
            }
          } else {
            console.log('[monitorPaymentWindow] 삭제할 주문ID를 찾을 수 없음');
          }
          
          alert('결제가 취소되었습니다.');
        } else {
          console.log('[monitorPaymentWindow] ✅ 주문이 이미 결제됨 - 삭제 안 함');
        }
      }
    } catch (error) {
      console.log('[monitorPaymentWindow] 팝업 상태 확인 오류:', error.message);
      clearInterval(checkInterval);
    }
  }, 500);
  
  // 5분 후 자동 정리 (방어)
  setTimeout(() => {
    clearInterval(checkInterval);
  }, 5 * 60 * 1000);
}

// 견적에서 바로주문 결제
async function startPaymentDirectOrder(totalAmount, user, orderId) {
  const host = window.location.hostname || '';
  const params = new URLSearchParams(window.location.search);
  const isLocalEnv = host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.startsWith('192.168.')
    || host.startsWith('10.')
    || host.endsWith('.local')
    || window.location.protocol === 'file:'
    || params.get('skipPay') === '1'
    || localStorage.getItem('SKIP_PAYMENT') === '1';

  if (isLocalEnv) {
    toast('테스트 모드: 결제 없이 주문 완료 처리');
    await clearCartEverywhere();
    showOrderComplete(orderId, orderId, totalAmount);
    return;
  }

  // PayApp 설정 (실제 상점 정보)
  const PAYAPP_USERID = 'vinso112';
  const PAYAPP_LINKKEY = 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=';
  const PAYAPP_LINKVALUE = 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=';
  
  // 최소 결제액 1000원 이상 확인
  if (totalAmount < 1000) {
    alert('최소 결제금액은 1,000원입니다.');
    return;
  }

  // PayApp 파라미터 설정
  PayApp.setDefault('userid', PAYAPP_USERID);
  PayApp.setDefault('linkkey', PAYAPP_LINKKEY);
  PayApp.setDefault('linkvalue', PAYAPP_LINKVALUE);
  PayApp.setDefault('shopname', '건우프린팅');
  
  // 견적의 카테고리 및 수량 정보로부터 상품명 생성
  const category = get('sum-cat')?.textContent || '인쇄 상품';
  const quantity = get('sum-qty')?.textContent || '';
  const displayGoodname = quantity ? `${category} (${quantity})` : category;
  
  // returnurl을 홈으로 설정 (실제 완료는 feedback에서만 처리)
  const returnUrl = window.location.origin + '/';
  
  PayApp.setParam({
    'goodname': displayGoodname || '인쇄 서비스',
    'goodname': '직주문',
    'price': totalAmount.toString(),
    'recvphone': user.phone || '01000000000',
    'memo': `고객: ${user.name}`,
    'smsuse': 'n',
    'redirectpay': '1',
    'returnurl': returnUrl,
    'feedbackurl': window.location.origin + '/api/payment-callback',
    'var1': orderId || '', // 주문번호
    'var2': user.user_id, // 사용자 아이디
    'skip_cstpage': 'y' // 매출전표 페이지 이동 안함
  });

  // 결제중 상태 표시
  showPaymentProcessing();
  
  // 결제 취소 시 삭제할 수 있도록 임시 저장 (일반 주문)
  if (orderId) {
    sessionStorage.setItem('pendingOrderId', orderId);
    console.log('[startPaymentDirectOrder] 생성된 주문ID 저장:', orderId);
  }
  
  // 팝업 창에서 결제 (너비 600px, 높이 1200px - 세로형 확대)
  // 미리 팝업을 열고 PayApp이 그 안에 결제 페이지를 로드하도록 함
  const payappWindow = window.open('', 'PayAppWindow', 'width=600,height=1200,scrollbars=yes');
  console.log('[startPaymentDirectOrder] PayApp.setTarget 및 payrequest 호출 중...');
  PayApp.setTarget('PayAppWindow');
  PayApp.payrequest();
  console.log('[startPaymentDirectOrder] 결제 요청 완료');
  
  // 팝업 닫힘 감지
  monitorPaymentWindow(payappWindow);
}

function showCS() {
  navigate('view-cs', { display: 'flex' });
  get('cs-message').value = '';
}

function hideCS() {
  navigate('view-home');
}

function submitCS() {
  const msg = get('cs-message').value.trim();
  if (!msg) return alert('문의 내용을 입력해주세요.');
  toast('문의가 접수되었습니다.');
  hideCS();
}

// ===== SIGNUP LOGIC =====
const USER_DB_KEY = 'print_users_v2';
const CART_KEY = 'print_cart_v2';
const ORDER_KEY = 'print_order_v2';
const CURRENT_USER_KEY = 'print_current_user';
const TOKEN_KEY = 'auth_token';
let currentSignupType = 'general';
// ===== AUTH/TOKEN HELPERS =====
function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.error('토큰 저장 실패:', e);
  }
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.error('토큰 조회 실패:', e);
    return null;
  }
}

function removeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.error('토큰 삭제 실패:', e);
  }
}

// 로컬/테스트 환경 여부 판단
function isLocalEnv() {
  try {
    const host = window.location.hostname || '';
    const params = new URLSearchParams(window.location.search);
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || host.startsWith('192.168.')
      || host.startsWith('10.')
      || host.endsWith('.local')
      || window.location.protocol === 'file:'
      || params.get('skipPay') === '1'
      || localStorage.getItem('SKIP_PAYMENT') === '1';
  } catch (e) {
    return false;
  }
}

// API 호출 헬퍼: 자동으로 JWT 토큰 포함
async function apiCall(url, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers
  });
}

// ===== CART SYNC HELPERS =====
async function fetchCartFromServer() {
  const token = getToken();
  if (!token) {
    // 비로그인: 로컬 장바구니 사용
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  }
  try {
    const res = await fetch('/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error('장바구니 불러오기 실패');
    const data = await res.json();
    const cart = Array.isArray(data.cart) ? data.cart : [];
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
    return cart;
  } catch (err) {
    console.error('서버 장바구니 로드 실패:', err);
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  }
}

async function syncCartToServer(cart) {
  const token = getToken();
  if (!token) return; // 비로그인 시 서버 동기화 생략
  try {
    // 간단 동기화: 서버 장바구니 비우고 현재 로컬 항목 전송
    await fetch('/api/cart', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    for (const item of cart) {
      await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(item)
      });
    }
  } catch (err) {
    console.error('서버 장바구니 동기화 실패:', err);
  }
}

// 장바구니 전체 비우기(로컬 + 서버)
async function clearCartEverywhere() {
  const token = getToken();
  if (token) {
    try {
      await fetch('/api/cart', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    } catch (err) {
      console.error('서버 장바구니 비우기 실패:', err);
    }
  }
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

function startSignup(type) {
  currentSignupType = type;
  const isBiz = type === 'business';
  get('signup-step-1').style.display = 'none';
  get('signup-step-2').style.display = 'block';
  get('area-business').style.display = isBiz ? 'block' : 'none';
}

function backToStep1() {
  get('signup-step-1').style.display = 'block';
  get('signup-step-2').style.display = 'none';
}

function toggleAllTerms() {
  const isChecked = get('check-all').checked;
  get('term1').checked = isChecked;
  get('term2').checked = isChecked;
}

async function checkIdDuplicate() {
  const id = get('sign-id').value.trim();
  if (!id) return alert('아이디를 입력해주세요');
  
  try {
    const response = await fetch('/api/users/check-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await response.json();
    alert(data.available ? '사용 가능한 아이디입니다.' : '이미 사용중인 아이디입니다.');
  } catch (error) {
    console.error('아이디 중복 확인 오류:', error);
    alert('아이디 중복 확인 중 오류가 발생했습니다.');
  }
}

function openAddressSearch() {
  if (typeof daum === 'undefined') {
    alert('주소 API 준비 중입니다.');
    return;
  }
  new daum.Postcode({
    oncomplete: function(data) {
      const addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
      get('sign-addr').value = addr;
      get('sign-addr-detail').focus();
    }
  }).open();
}

async function submitSignup() {
  if (!get('term1').checked || !get('term2').checked) {
    return alert('모든 약관에 동의해야 가입할 수 있습니다.');
  }
  const id = get('sign-id').value.trim();
  const pw = get('sign-pw').value.trim();
  const pw2 = get('sign-pw2').value.trim();
  const name = get('sign-name').value.trim();
  const phone = get('sign-phone').value.trim();
  const addr = get('sign-addr').value.trim();
  const detail = get('sign-addr-detail').value.trim();

  if (!id || !pw || !name || !phone) return alert('필수 정보를 입력해주세요.');
  if (pw !== pw2) return alert('비밀번호가 일치하지 않습니다.');
  
  try {
    const response = await fetch('/api/users/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        pw,
        name,
        phone,
        email: '',
        company: currentSignupType === 'business' ? get('sign-biz-name')?.value?.trim() : '',
        address: addr ? `${addr} ${detail}` : ''
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('회원가입이 완료되었습니다!');
      goLogin();
    } else {
      alert(data.message || '회원가입에 실패했습니다.');
    }
  } catch (error) {
    console.error('회원가입 오류:', error);
    alert('회원가입 중 오류가 발생했습니다.');
  }
}

// ===== LOGIN LOGIC =====
async function login(event) {
  console.log('🔑 [login] 함수 호출됨! event:', event ? 'event객체있음' : 'null');
  
  if (event) {
    console.log('🔑 [login] event.preventDefault() 실행');
    event.preventDefault();
  }
  
  const userId = document.getElementById('userId')?.value || document.getElementById('login-id')?.value;
  const userPassword = document.getElementById('userPassword')?.value || document.getElementById('login-pw')?.value;
  
  console.log('🔑 [login] 입력값:', { userId: userId ? '✅있음' : '❌없음', userPassword: userPassword ? '✅있음' : '❌없음' });

  if (!userId || !userPassword) {
    console.log('🔑 [login] ❌ 입력값 누락');
    alert('아이디와 비밀번호를 입력해주세요.');
    return false;
  }
  
  console.log('🔑 [login] 📡 서버에 로그인 요청 중...');
  try {
    const response = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, pw: userPassword })
    });
    
    console.log('🔑 [login] 📡 응답 상태:', response.status);
    const data = await response.json();
    console.log('🔑 [login] 📊 응답 데이터:', data.success ? '✅성공' : '❌실패');
    
    if (data.success) {
      console.log('[login] Login success, saving token');
      // Save JWT token
      saveToken(data.token);
      // Save user info
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
      // Load server cart
      await fetchCartFromServer();
      updateNav();
      updateHomeLoginCard();
      toast('Logged in successfully.');
      
      // Check for pending payment link from context or sessionStorage
      const contextCode = window.paymentLinkContext ? window.paymentLinkContext.code : null;
      const sessionCode = sessionStorage.getItem('_pendingPaymentLink');
      const pendingCode = contextCode || sessionCode;
      
      console.log('[login] Payment link check:', { contextCode, sessionCode, pendingCode });
      
      if (pendingCode) {
        console.log('[login] Restoring payment link:', pendingCode);
        sessionStorage.removeItem('_pendingPaymentLink');
        
        // Update URL to reflect payment link state
        const newUrl = `/?pay=${pendingCode}`;
        window.history.pushState({ view: 'payment-link' }, '', newUrl);
        console.log('[login] URL updated:', newUrl);
        
        // Hide login view, show main content
        const loginView = get('view-login');
        if (loginView) loginView.style.display = 'none';
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.style.display = 'block';
        console.log('[login] Login view hidden, main content shown');
        
        // Display payment screen after short delay
        setTimeout(() => {
          console.log('[login] Calling checkPaymentLinkAccess after login');
          // Reset duplicate call guard and retry
          try { window._paymentLinkChecked = false; } catch (e) {}
          if (typeof callPaymentLinkCheck === 'function') {
            console.log('[login] Executing callPaymentLinkCheck (skipTokenCheck=true)');
            callPaymentLinkCheck(true);
            return;
          }
          
          if (typeof checkPaymentLinkAccess === 'function') {
            console.log('[login] Executing checkPaymentLinkAccess (skipTokenCheck=true)');
            checkPaymentLinkAccess(true); // Skip token re-validation right after login
          } else {
            console.error('[login] checkPaymentLinkAccess function not found!');
          }
        }, 100);
      } else {
        console.log('[login] No payment link - going to home');
        goHome();
      }
    } else {
      console.log('🔑 [login] ❌ 로그인 실패:', data.message);
      alert(data.message || '로그인에 실패했습니다.');
    }
  } catch (error) {
    console.error('로그인 오류:', error);
    alert('로그인 중 오류가 발생했습니다.');
    return false;
  }
}

async function logout() {
  if (confirm('로그아웃 하시겠습니까?')) {
    removeToken();
    localStorage.removeItem(CURRENT_USER_KEY);
    await clearCartEverywhere();  // 장바구니도 함께 비우기 (서버 포함)
    updateNav();
    updateHomeLoginCard();
    goHome();
  }
}

function goAccountEdit() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) {
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  navigate('view-account-edit');
  
  // 현재 사용자 정보 채우기
  get('edit-id').value = user.user_id;
  get('edit-name').value = user.name || '';
  get('edit-phone').value = user.phone || '';
  get('edit-addr').value = user.addr || '';
  get('edit-addr-detail').value = user.addr_detail || '';
  
  // 비밀번호 필드는 비움
  get('edit-current-pw').value = '';
  get('edit-new-pw').value = '';
  get('edit-new-pw2').value = '';
  
  // 사업자 정보가 있으면 표시
  if (user.role === 'business') {
    get('edit-business-area').style.display = 'block';
    get('edit-biz-name').value = user.biz_name || '';
    get('edit-biz-num').value = user.biz_num || '';
  } else {
    get('edit-business-area').style.display = 'none';
  }
  
  toast('회원정보 수정');
}

// 정보수정용 주소검색
function openAddressSearchForEdit() {
  new daum.Postcode({
    oncomplete: function(data) {
      const addr = data.roadAddress || data.jibunAddress;
      get('edit-addr').value = addr;
      get('edit-addr-detail').focus();
    }
  }).open();
}

// 회원정보 수정 제출
async function submitAccountEdit() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) {
    alert('로그인이 필요합니다.');
    return;
  }

  const name = get('edit-name').value.trim();
  const phone = get('edit-phone').value.trim();
  const addr = get('edit-addr').value.trim();
  const addrDetail = get('edit-addr-detail').value.trim();
  
  const currentPw = get('edit-current-pw').value.trim();
  const newPw = get('edit-new-pw').value.trim();
  const newPw2 = get('edit-new-pw2').value.trim();

  if (!name) return alert('이름을 입력하세요.');
  if (!phone) return alert('휴대폰번호를 입력하세요.');

  // 비밀번호 변경하려는 경우
  if (currentPw || newPw || newPw2) {
    if (!currentPw) return alert('현재 비밀번호를 입력하세요.');
    if (!newPw) return alert('새 비밀번호를 입력하세요.');
    if (newPw !== newPw2) return alert('새 비밀번호가 일치하지 않습니다.');
    if (newPw.length < 4) return alert('비밀번호는 4자 이상이어야 합니다.');
  }

  const updateData = {
    name,
    phone,
    addr,
    addr_detail: addrDetail
  };

  // 비밀번호 변경 요청이 있으면 추가
  if (currentPw && newPw) {
    updateData.current_pw = currentPw;
    updateData.new_pw = newPw;
  }

  // 사업자 정보 추가
  if (user.role === 'business') {
    updateData.biz_name = get('edit-biz-name').value.trim();
    updateData.biz_num = get('edit-biz-num').value.trim();
  }

  try {
    const token = getToken();
    const res = await fetch(`/api/users/${user.user_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updateData)
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.message || '정보 수정에 실패했습니다.');
      return;
    }

    // 로컬 스토리지 업데이트
    const updatedUser = { ...user, ...updateData };
    // 비밀번호 관련 필드는 제거
    delete updatedUser.current_pw;
    delete updatedUser.new_pw;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));

    alert('회원정보가 수정되었습니다.');
    updateNav();
    updateHomeLoginCard();
    goHome();
  } catch (err) {
    console.error(err);
    alert('서버 오류가 발생했습니다.');
  }
}

function updateNav() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  const nav = get('nav-links');
  const adminLink = get('footer-admin-link');
  
  if (!nav) return;

  if (user) {
    const adminNavLink = user.role === 'admin' ? '<a onclick="goAdmin()" style="color:#3b82f6; font-weight:700;">🛠️ 관리자</a>' : '';
    nav.innerHTML = `
          <a>${user.name}님</a>
          <a onclick="logout()" style="color:#ef4444;">로그아웃</a>
          ${adminNavLink}
          <a onclick="goFindAccount()">ID·PW찾기</a>
          <a onclick="goOrderHistory()">주문내역</a>
          <a onclick="goCart()" class="nav-cart">장바구니 <span class="cart-badge" id="cart-badge">0</span></a>
        `;
    
    // 관리자만 footer 링크 표시
    if (adminLink) adminLink.style.display = user.role === 'admin' ? 'block' : 'none';
  } else {
    nav.innerHTML = `
          <a onclick="goLogin()">로그인</a>
          <a onclick="goSignup()">회원가입</a>
          <a onclick="goFindAccount()">ID·PW찾기</a>
          <a onclick="goOrderHistory()">주문내역</a>
          <a onclick="goCart()" class="nav-cart">장바구니 <span class="cart-badge" id="cart-badge">0</span></a>
        `;
    
    // 비로그인 상태: footer 링크 숨김
    if (adminLink) adminLink.style.display = 'none';
  }
  updateCartBadge();

  // 홈 화면 로그인 카드 업데이트
  updateHomeLoginCard();
}

function updateHomeLoginCard() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  const loginForm = get('home-login-form');
  const userWelcome = get('home-user-welcome');
  const userNameEl = get('home-user-name');

  if (!loginForm || !userWelcome) return;

  if (user) {
    // 로그인 상태: 환영 메시지 표시
    loginForm.style.display = 'none';
    userWelcome.style.display = 'block';
    if (userNameEl) userNameEl.textContent = user.name + ' 회원님';
  } else {
    // 비로그인 상태: 로그인 폼 표시
    loginForm.style.display = 'block';
    userWelcome.style.display = 'none';
  }
}

// ===== CART LOGIC =====
function updateCartBadge() {
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  const badge = get('cart-badge');
  if (badge) badge.textContent = cart.length;
}

function renderCartView() {
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  const list = get('cart-list');
  list.innerHTML = '';

  let totalP = 0,
    totalS = 0;

  if (cart.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:30px 20px; background:#f8fafc; border-radius:16px; border:2px dashed var(--line); color:#64748b; margin:0 auto; max-width:100%;">🛒 장바구니가 비어있습니다</div>`;
  } else {
    cart.forEach((item, i) => {
      // 표시 금액은 상품가+배송비를 합쳐 사용자가 본 총액과 일치시킨다
      const itemTotal = (item.price || 0) + (item.shipping || 0);
      totalP += (item.price || 0);
      totalS += (item.shipping || 0);

      // 옵션 정보 추출
      const opts = item.options || {};
      const bindingDirection = opts.bindingDirection || '';
      const binding = opts.binding === 'staple' ? '중철' : (opts.binding === 'perfect' ? '무선' : '');
      const coverType = opts.coverType || '';
      const innerType = opts.innerType || '';
      
      // 제본 방향 및 제본 정보
      const bindingInfo = [];
      if (binding) bindingInfo.push(`제본: ${binding}`);
      if (bindingDirection) bindingInfo.push(`방향: ${bindingDirection}`);
      const bindingHtml = bindingInfo.length > 0 
        ? `<div style="margin-top:6px; font-size:12px; color:#64748b;">${bindingInfo.join(' | ')}</div>`
        : '';
      
      // 종이 정보
      const paperInfo = [];
      if (coverType) paperInfo.push(`표지: ${coverType}${opts.coverGram ? ` ${opts.coverGram}g` : ''}`);
      if (innerType) paperInfo.push(`내지: ${innerType}${opts.innerGram ? ` ${opts.innerGram}g` : ''}`);
      const paperHtml = paperInfo.length > 0
        ? `<div style="margin-top:6px; font-size:12px; color:#64748b;">${paperInfo.join(' | ')}</div>`
        : '';

      // 첨부파일 정보 표시 (상품 바로 밑에)
      const filesHtml = (item.files && item.files.length > 0) ?
        `<div style="margin-top:8px; padding:8px; background:#f1f5f9; border-radius:6px; font-size:11px; color:#475569;">
                 📎 첨부파일 ${item.files.length}개: ${item.files.map(f => f.name).join(', ')}
               </div>` :
        '';

      list.innerHTML += `
            <div style="display:flex; justify-content:space-between; background:#fff; border:1px solid var(--line); border-radius:16px; padding:18px; align-items:flex-start; width:100%; box-sizing:border-box;">
              <div style="flex:1;">
                <h4 style="margin:0 0 8px 0; font-weight:900; color:#0f172a;">${item.name || '상품'}</h4>
                <p style="margin:0; font-size:12px; color:#64748b;">수량: ${item.qty || 0}</p>
                ${bindingHtml}
                ${paperHtml}
                ${filesHtml}
              </div>
              <div style="text-align:right; margin-left:16px;">
                <div style="font-size:18px; font-weight:1100; color:#0f172a;">${itemTotal.toLocaleString()}원</div>
                <button class="btn btn-secondary" onclick="removeCart(${i})" style="width:80px; padding:6px; margin-top:8px; font-size:12px;">삭제</button>
              </div>
            </div>
          `;
    });
  }

  get('ct-price').textContent = totalP.toLocaleString() + '원';
  get('ct-ship').textContent = totalS.toLocaleString() + '원';
  // 총합은 사용자가 본 금액과 동일하게 상품가+배송비로 계산
  get('ct-total').textContent = (totalP + totalS).toLocaleString() + '원';
}

async function removeCart(i) {
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  cart.splice(i, 1);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartView();
  updateCartBadge();
  await syncCartToServer(cart);
}

async function submitOrder() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  const token = getToken();
  if (isLocalEnv() && (!user || !token)) {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (cart.length === 0) { alert('장바구니가 비었습니다.'); return; }
    const totalPrice = cart.reduce((sum, item) => sum + (item.price || 0), 0);
    const totalShipping = cart.reduce((sum, item) => sum + (item.shipping || 0), 0);
    const orderId = 'OLOCAL-' + Date.now();
    localStorage.setItem('lastOrderId', orderId);
    await clearCartEverywhere();
    showOrderComplete(orderId, orderId, totalPrice + totalShipping);
    return;
  }
  if (!user) return alert('로그인이 필요합니다.');

  // 서버와 동기화된 장바구니 사용
  const cart = await fetchCartFromServer();
  if (cart.length === 0) return alert('장바구니가 비었습니다.');

  // 총 금액 계산
  const totalPrice = cart.reduce((sum, item) => sum + (item.price || 0), 0);
  const totalShipping = cart.reduce((sum, item) => sum + (item.shipping || 0), 0);
  
  // 배송 정보
  const deliveryInfo = {
    recipient: document.querySelector('#delivery-name')?.value || user.name,
    phone: document.querySelector('#delivery-phone')?.value || user.phone,
    address: document.querySelector('#delivery-address')?.value || '',
    requirements: document.querySelector('#delivery-requirements')?.value || ''
  };

  // 각 상품의 상세 계산 정보 수집
  let orderDetails = {};
  
  if (cart.length > 0) {
    const firstItem = cart[0];
    // cart item에서 spec 정보를 활용하여 상세정보 계산
    if (firstItem.options) {
      try {
        const options = firstItem.options;

        // 장바구니에 저장해 둔 계산결과가 있으면 그대로 사용해 일관된 견적 상세를 전달
        if (options._calcDetails) {
          orderDetails = { ...options._calcDetails };
          // 배송비와 최종가는 전체 합산 금액과 동기화
          orderDetails.shipping = orderDetails.shipping || {};
          orderDetails.shipping.cost = totalShipping;
          orderDetails.finalPrice = totalPrice + totalShipping;
          const totalQty = cart.reduce((sum, item) => {
            const q = parseInt(item.options?.qty || item.qty || 0, 10);
            return sum + (isNaN(q) ? 0 : q);
          }, 0);
          if (totalQty > 0) orderDetails.perUnitPrice = Math.round(orderDetails.finalPrice / totalQty);
          orderDetails.supplyPrice = orderDetails.supplyPrice || Math.round(orderDetails.finalPrice / 1.1);
        }
        
        // options에서 값 추출 및 타입 변환
        let sizeValue = 'A4';
        if (options.size) {
          const sizeMatch = options.size.match(/(\d+)×(\d+)/);
          if (sizeMatch) {
            const w = parseInt(sizeMatch[1]);
            const h = parseInt(sizeMatch[2]);
            if (w === 210 && h === 297) sizeValue = 'A4';
            else if (w === 148 && h === 210) sizeValue = 'A5';
            else if (w === 182 && h === 257) sizeValue = 'B5';
            else sizeValue = 'A4';
          }
        }
        
        const qtyValue = typeof options.qty === 'number' ? options.qty : 
                         (typeof firstItem.qty === 'string' ? parseInt(firstItem.qty.replace(/[^0-9]/g, '')) : 100);
        
        const innerPagesValue = typeof options.innerPages === 'number' ? options.innerPages :
                                (typeof options.innerPages === 'string' ? parseInt(options.innerPages) : 16);
        
        const coverGramValue = typeof options.coverGram === 'number' ? options.coverGram :
                               (typeof options.coverGram === 'string' ? parseInt(options.coverGram) : 200);
        
        const innerGramValue = typeof options.innerGram === 'number' ? options.innerGram :
                               (typeof options.innerGram === 'string' ? parseInt(options.innerGram) : 80);
        
        // coverDetail 결정
        let coverDetail = 'color_double';
        if (options.coverDetail) {
          coverDetail = options.coverDetail;
        } else if (options.coverPrint) {
          if (options.coverPrint === '양면 컬러') coverDetail = 'color_double';
          else if (options.coverPrint === '양면 흑백') coverDetail = 'mono_double';
          else if (options.coverPrint === '단면 컬러') coverDetail = 'color_single';
          else if (options.coverPrint === '단면 흑백') coverDetail = 'mono_single';
        }
        
        // innerDetail 결정
        let innerDetail = 'mono_double';
        if (options.innerDetail) {
          innerDetail = options.innerDetail;
        } else if (options.innerPrint) {
          if (options.innerPrint === '양면 컬러') innerDetail = 'color_double';
          else if (options.innerPrint === '양면 흑백') innerDetail = 'mono_double';
          else if (options.innerPrint === '단면 컬러') innerDetail = 'color_single';
          else if (options.innerPrint === '단면 흑백') innerDetail = 'mono_single';
        }
        
        // coating 결정
        let coatingValue = 'none';
        if (options.coating) {
          if (options.coating === '코팅없음' || options.coating === 'none') coatingValue = 'none';
          else if (options.coating === '단면무광코팅' || options.coating === 'matte') coatingValue = 'matt';
          else if (options.coating === '단면유광코팅' || options.coating === 'glossy') coatingValue = 'gloss';
          else coatingValue = options.coating;
        }
        
        orderDetails = calculateAndSaveQuoteDetails_111({
          size: sizeValue,
          qty: qtyValue,
          margin: options.margin || 0,
          innerPages: innerPagesValue,
          bindType: options.bindType || options.binding || 'perfect',
          mode: options.mode || 'book_indigo',
          coating: coatingValue,
          coverType: options.coverType || '모조지',
          coverGram: coverGramValue,
          coverDetail: coverDetail,
          innerType: options.innerType || '모조지',
          innerGram: innerGramValue,
          innerDetail: innerDetail
        });
      } catch (e) {
        console.warn('상세 계산 정보 생성 실패:', e);
        console.error(e);
      }
    }
  }

  // 최종 청구 금액은 장바구니 금액(상품+배송) 합계를 우선 사용해 고객이 본 견적과 일치하도록 한다.
  const finalPrice = cart.length > 0
    ? (totalPrice + totalShipping)
    : ((orderDetails && orderDetails.finalPrice) ? orderDetails.finalPrice : totalPrice);

  // 주문 상세에 최종 결제 금액을 동기화해 관리자 화면의 견적가가 결제 총액과 어긋나지 않도록 한다.
  if (orderDetails && typeof orderDetails === 'object') {
    orderDetails.finalPrice = finalPrice;
    // 장바구니에 담긴 총 수량 기준으로 권당 단가를 추정 (없으면 생략)
    const totalQty = cart.reduce((sum, item) => {
      const q = parseInt(item.options?.qty || item.qty || 0, 10);
      return sum + (isNaN(q) ? 0 : q);
    }, 0);
    if (totalQty > 0) {
      orderDetails.perUnitPrice = Math.round(finalPrice / totalQty);
    }
    // 배송비가 따로 합산된 경우 상세에도 반영
    if (!orderDetails.shipping) orderDetails.shipping = {};
    orderDetails.shipping.cost = totalShipping;
  }
  // 서버에 주문을 먼저 생성(대기 상태)하고 order_id로 복귀
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({
        items: cart,
        total_price: finalPrice,
        delivery_info: deliveryInfo,
        order_details: orderDetails
      })
    });
    
    // 응답 확인
    if (!response.ok) {
      const errorText = await response.text();
      console.error('주문 생성 실패 - HTTP 상태:', response.status, '응답:', errorText);
      alert(`주문 생성 실패 (${response.status}): ${errorText}`);
      return;
    }
    
    const result = await response.json();
    if (!result.success) {
      console.error('주문 생성 실패:', result);
      alert('주문 생성에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    const orderId = result.order_id;
    localStorage.setItem('lastOrderId', orderId);
    // 결제 실행 (주문번호를 returnurl에 포함)
    startPayment(finalPrice, user, orderId);
  } catch (e) {
    console.error('주문 생성 오류:', e);
    alert('주문 생성 중 오류가 발생했습니다: ' + e.message);
  }
}

// PayApp 결제 시작
async function startPayment(totalAmount, user, orderId) {
  // 로컬/사설망/테스트 플래그 시 실제 결제 생략
  const host = window.location.hostname || '';
  const params = new URLSearchParams(window.location.search);
  const isLocalEnv = host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.startsWith('192.168.')
    || host.startsWith('10.')
    || host.endsWith('.local')
    || window.location.protocol === 'file:'
    || params.get('skipPay') === '1'
    || localStorage.getItem('SKIP_PAYMENT') === '1';

  if (isLocalEnv) {
    toast('테스트 모드: 결제 없이 주문 완료 처리');
    await clearCartEverywhere();
    showOrderComplete(orderId, orderId, totalAmount);
    return;
  }

  // PayApp 설정 (실제 상점 정보)
  const PAYAPP_USERID = 'vinso112';
  const PAYAPP_LINKKEY = 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=';
  const PAYAPP_LINKVALUE = 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=';
  
  // 최소 결제액 1000원 이상 확인
  if (totalAmount < 1000) {
    alert('최소 결제금액은 1,000원입니다.');
    return;
  }

  // PayApp 파라미터 설정
  PayApp.setDefault('userid', PAYAPP_USERID);
  PayApp.setDefault('linkkey', PAYAPP_LINKKEY);
  PayApp.setDefault('linkvalue', PAYAPP_LINKVALUE);
  PayApp.setDefault('shopname', '건우프린팅');
  
  // 장바구니의 상품명들로부터 좋은 상품명 생성
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  const goodnames = cart.map(item => item.name || '인쇄 상품').join(', ');
  const displayGoodname = goodnames.length > 30 ? goodnames.substring(0, 30) + '...' : goodnames;
  
  // returnurl을 홈으로 설정 (실제 완료는 feedback에서만 처리)
  const returnUrl = window.location.origin + '/';
  
  PayApp.setParam({
    'goodname': displayGoodname || '인쇄 서비스',
    'price': totalAmount.toString(),
    'recvphone': user.phone || '01000000000',
    'memo': `고객: ${user.name}`,
    'smsuse': 'n',
    'redirectpay': '1',
    'returnurl': returnUrl,
    'feedbackurl': window.location.origin + '/api/payment-callback',
    'var1': orderId || '', // 주문번호
    'var2': user.user_id, // 사용자 아이디
    'skip_cstpage': 'y' // 매출전표 페이지 이동 안함
  });

  // 결제중 상태 표시
  showPaymentProcessing();
  
  // 결제 취소 시 삭제할 수 있도록 임시 저장 (장바구니 주문)
  if (orderId) {
    sessionStorage.setItem('pendingOrderId', orderId);
    console.log('[startPayment] 생성된 주문ID 저장:', orderId);
  }
  
  // 팝업 창에서 결제 (너비 600px, 높이 1200px - 세로형 확대)
  const payappWindow = window.open('', 'PayAppWindow', 'width=600,height=1200,scrollbars=yes');
  console.log('[startPayment] PayApp.setTarget 및 payrequest 호출 중...');
  PayApp.setTarget('PayAppWindow');
  PayApp.payrequest();
  console.log('[startPayment] 결제 요청 완료');
  
  // 팝업 닫힘 감지
  monitorPaymentWindow(payappWindow);
}

// 결제 완료 후 콜백 (PayApp에서 호출)
async function onPaymentComplete(paymentResult) {
  console.log('🔍 결제 완료 전체 응답:', paymentResult);
  console.log('🔍 mul_no:', paymentResult.mul_no);
  console.log('🔍 pay_type:', paymentResult.pay_type);
  
  if (paymentResult.state !== '1' && paymentResult.pay_state !== '4') {
    alert('결제가 취소되었습니다.');
    return;
  }

  // ✅ 결제 완료됨 - 임시 주문 ID 삭제 (팝업 모니터링이 삭제하지 않도록)
  sessionStorage.removeItem('pendingOrderId');
  sessionStorage.removeItem('pendingPaymentLinkOrderId');
  console.log('[onPaymentComplete] ✅ 결제 완료 - 임시 주문 추적 제거');

  // ✅ 임시 주문 데이터에도 mul_no를 저장 (monitorPaymentWindow에서 감지하도록)
  let tempOrder = JSON.parse(localStorage.getItem('tempOrder') || '{}');
  if (!tempOrder.order_id) {
    const paymentLinkOrder = JSON.parse(localStorage.getItem('tempPaymentLinkOrder') || '{}');
    if (paymentLinkOrder.order_id) {
      tempOrder = paymentLinkOrder;
    }
  }
  
  // tempOrder에 mul_no를 저장해서 monitorPaymentWindow가 삭제하지 않도록 함
  tempOrder.mul_no = paymentResult.mul_no;
  if (tempOrder.linkCode) {
    localStorage.setItem('tempPaymentLinkOrder', JSON.stringify(tempOrder));
  } else {
    localStorage.setItem('tempOrder', JSON.stringify(tempOrder));
  }
  console.log('[onPaymentComplete] ✅ tempOrder에 mul_no 저장:', paymentResult.mul_no);

  // 임시 주문 정보 가져오기 (결제링크용 + 일반주문용 둘다 확인)
  let tempOrderForAPI = JSON.parse(localStorage.getItem('tempOrder') || '{}');
  if (!tempOrderForAPI.order_id) {
    // 결제링크에서 온 경우
    const paymentLinkOrder = JSON.parse(localStorage.getItem('tempPaymentLinkOrder') || '{}');
    if (paymentLinkOrder.order_id) {
      tempOrderForAPI = paymentLinkOrder;
      console.log('[onPaymentComplete] 결제링크 주문 데이터 사용:', tempOrderForAPI);
    }
  }
  
  try {
    const paymentInfo = {
      mul_no: paymentResult.mul_no,
      pay_type: paymentResult.pay_type,
      pay_date: paymentResult.pay_date
    };
    
    console.log('📤 서버로 보낼 payment_info:', paymentInfo);
    
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`
      },
      body: JSON.stringify({
        items: tempOrderForAPI.items,
        total_price: tempOrderForAPI.total_price,
        delivery_info: tempOrderForAPI.delivery_info,
        payment_info: paymentInfo
      })
    });

    const result = await response.json();
    console.log('📥 서버 응답:', result);
    
    if (result.success) {
      const orderId = result.order_id;
      const customerCode = result.customer_code;
      const orderCode = result.order_code || `${orderId}-${customerCode || ''}`;
      
      // 결제링크 사용 처리 (링크로 결제한 경우에만)
      const paymentLinkCode = tempOrderForAPI.linkCode;
      if (paymentLinkCode) {
        try {
          console.log('[onPaymentComplete] 결제링크 사용 처리:', paymentLinkCode);
          const linkRes = await fetch(`/api/payment-links/${paymentLinkCode}/use`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
          });
          const linkData = await linkRes.json();
          console.log('[onPaymentComplete] 결제링크 사용 처리 결과:', linkData);
        } catch (e) {
          console.error('[onPaymentComplete] 결제링크 사용 처리 중 오류:', e);
        }
      }
      
      // 임시 주문 정보 삭제 + 장바구니 초기화
      localStorage.removeItem('tempOrder');
      localStorage.removeItem('tempPaymentLinkOrder'); // 결제링크 임시 데이터도 정리
      await clearCartEverywhere();
      
      // 주문 완료 페이지로 이동
      showOrderComplete(orderId, orderCode, tempOrderForAPI.total_price);
    } else {
      alert('주문 처리에 실패했습니다: ' + (result.message || ''));
    }
  } catch (error) {
    console.error('❌ 주문 에러:', error);
    alert('주문 처리 중 오류가 발생했습니다.');
  }
}

// 주문 완료 페이지 표시
function showOrderComplete(orderId, orderCode, totalPrice) {
  const completeHtml = `
    <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;">
      <div style="max-width:500px; width:90%; padding:40px; text-align:center; background:white; border-radius:16px; box-shadow:0 4px 20px rgba(0,0,0,0.2);">
        <div style="font-size:64px; margin-bottom:20px; animation:scaleIn 0.5s ease-out;">✅</div>
        <h1 style="color:#10b981; margin-bottom:15px; font-size:28px;">주문이 완료되었습니다!</h1>
        <p style="color:#64748b; margin-bottom:30px; line-height:1.8; font-size:16px;">
          결제가 정상적으로 완료되었습니다.<br>
          주문 내역은 [주문조회] 메뉴에서 확인할 수 있습니다.
        </p>
        <div style="background:#f1f5f9; padding:25px; border-radius:12px; margin-bottom:30px; border-left:4px solid #10b981;">
          <div style="font-size:13px; color:#64748b; margin-bottom:10px; font-weight:600;">주문번호</div>
          <div style="font-size:22px; font-weight:bold; color:#0f172a; font-family:'Courier New', monospace; margin-bottom:20px; letter-spacing:1px;">${orderCode}</div>
          <div style="font-size:13px; color:#64748b; margin-bottom:10px; font-weight:600;">결제금액</div>
          <div style="font-size:22px; font-weight:bold; color:#10b981;">${(totalPrice || 0).toLocaleString()}원</div>
        </div>
        <button onclick="goHome()" style="width:100%; padding:14px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:700; font-size:16px; cursor:pointer; margin-bottom:10px; transition:background 0.3s;">확인</button>
        <button onclick="goOrderHistory()" style="width:100%; padding:12px; background:#f1f5f9; color:#0f172a; border:none; border-radius:8px; font-weight:600; font-size:14px; cursor:pointer; transition:background 0.3s;">주문 조회하기</button>
        <style>
          @keyframes scaleIn {
            from { transform: scale(0); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          button:hover { opacity: 0.9; }
        </style>
      </div>
    </div>
  `;
  
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.innerHTML = completeHtml;
    mainContent.style.display = 'block';
    document.querySelectorAll('[id^="view-"]').forEach(el => el.style.display = 'none');
  }
}

function goOrderHistory() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) {
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  navigate('view-order');
  renderOrderHistory();
}

async function renderOrderHistory() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) return;
  
  const listEl = get('order-history-list');
  const emptyEl = get('order-empty');
  
  try {
    const token = getToken();
    const response = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    
    if (!result.success) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }
    
    const userOrders = result.orders || [];

    if (userOrders.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';

    userOrders.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
    
    listEl.innerHTML = userOrders.map((order, i) => {
      const orderDate = order.created_at ? new Date(order.created_at).toLocaleString('ko-KR') : '-';
      
      // 수량 표기를 통일 (괄호/중복 제거 후 숫자만 추출)
      const formatQty = (q, defaultUnit = '권') => {
        if (q === undefined || q === null || q === '') return '';
        const asText = String(q).trim();
        // 괄호와 반복된 단위 제거, 숫자만 추출
        const cleaned = asText.replace(/[()]/g, '').replace(/권부/g, '').trim();
        const numberMatch = cleaned.match(/^\d+/);
        if (numberMatch) {
          return `${numberMatch[0]}${defaultUnit}`;
        }
        return cleaned || '';
      };
      
      let items = [];
      if (order.items && typeof order.items === 'string') {
        try {
          items = JSON.parse(order.items);
        } catch (e) {
          console.error('items 파싱 오류:', e);
        }
      } else if (Array.isArray(order.items)) {
        items = order.items;
      }
      
      const firstItem = items[0] || {};
      const itemName = firstItem.name || '주문 상품';
      const itemQty = formatQty(firstItem.qty || items.length, '권');
      
      const statusColors = {
        '접수완료': '#10b981',
        'pending': '#10b981',
        '제작중': '#3b82f6',
        'preparing': '#3b82f6',
        '배송중': '#f59e0b',
        'shipping': '#f59e0b',
        '배송완료': '#6366f1',
        'completed': '#6366f1',
        '취소': '#ef4444',
        'cancelled': '#ef4444',
        'refund_requested': '#f97316',
        'refunded': '#6b7280'
      };
      const statusColor = statusColors[order.status] || '#64748b';
      
      const statusText = {
        'pending': '접수완료',
        'preparing': '제작중',
        'shipping': '배송중',
        'completed': '배송완료',
        'cancelled': '취소',
        'refund_requested': '환불요청',
        'refunded': '환불완료'
      }[order.status] || order.status || '접수완료';
      
      return `
          <div style="background:#fff; border:1px solid var(--line); border-radius:16px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
              <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                  <div style="font-weight:900; font-size:16px; color:#0f172a;">${itemName}</div>
                  <span style="padding:4px 12px; background:${statusColor}15; color:${statusColor}; border-radius:6px; font-size:12px; font-weight:700;">${statusText}</span>
                </div>
                <div style="font-size:13px; color:#64748b; margin-bottom:4px;">주문번호: ${order.order_id || 'N/A'}</div>
                <div style="font-size:13px; color:#64748b;">주문일시: ${orderDate}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:20px; font-weight:1100; color:#0f172a; margin-bottom:8px;">${(order.total_price || 0).toLocaleString()}원</div>
                <div style="font-size:12px; color:#64748b;">수량: ${itemQty}</div>
              </div>
            </div>
            
            ${items.length > 0 ? `
              <div style="padding:12px; background:#f8fafc; border-radius:8px; margin-bottom:12px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:8px; font-weight:700;">주문 상품 (${items.length}개)</div>
                ${items.map(item => {
                  const qtyText = formatQty(item.qty, '권');
                  const nameText = item.name || '상품';
                  const qtyPart = qtyText ? ` (${qtyText})` : '';
                  return `<div style="font-size:13px; color:#475569; margin-bottom:4px;">• ${nameText}${qtyPart} - ${(item.price || 0).toLocaleString()}원</div>`;
                }).join('')}
              </div>
            ` : ''}
            
            <div style="display:flex; gap:10px; margin-top:12px;">
              <button onclick="viewOrderDetail('${order.order_id || i}')" style="flex:1; padding:10px; background:var(--primary); color:#fff; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">상세보기</button>
              ${order.status === 'pending' ? `<button onclick="cancelUserOrder('${order.order_id}')" style="flex:1; padding:10px; background:#ef4444; color:#fff; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">주문취소</button>` : (order.status === 'cancelled' ? `<button onclick="deleteUserOrder('${order.order_id}')" style="flex:1; padding:10px; background:#94a3b8; color:#fff; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">삭제</button>` : `<button onclick="toast('문의 기능 준비중')" style="flex:1; padding:10px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">문의하기</button>`)}
            </div>
          </div>
        `;
    }).join('');
  } catch (error) {
    console.error('주문 로드 에러:', error);
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
  }
}

async function cancelUserOrder(orderId) {
  if (!confirm('주문을 취소하시겠습니까?')) return;
  
  try {
    const token = getToken();
    if (!token) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    console.log('주문 취소 요청:', orderId);
    
    const response = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('응답 상태:', response.status);
    
    const result = await response.json();
    console.log('응답 결과:', result);
    
    if (result.success) {
      toast('주문이 취소되었습니다.');
      // 주문 목록 새로고침
      renderOrderHistory();
    } else {
      alert(result.message || '주문 취소에 실패했습니다.');
    }
  } catch (error) {
    console.error('주문 취소 에러:', error);
    alert('주문 취소 중 오류가 발생했습니다: ' + error.message);
  }
}

async function deleteUserOrder(orderId) {
  if (!confirm('취소된 주문을 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)')) return;
  
  try {
    const token = getToken();
    if (!token) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    console.log('주문 삭제 요청:', orderId);
    
    const response = await fetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    console.log('삭제 응답:', result);
    
    if (result.success) {
      toast('주문이 삭제되었습니다.');
      // 주문 목록 새로고침
      renderOrderHistory();
    } else {
      alert(result.message || '주문 삭제에 실패했습니다.');
    }
  } catch (error) {
    console.error('주문 삭제 에러:', error);
    alert('주문 삭제 중 오류가 발생했습니다: ' + error.message);
  }
}

// 환불 요청 함수
async function requestRefund(orderId) {
  try {
    const token = getToken();
    if (!token) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    console.log('환불 요청:', orderId);
    
    const response = await fetch(`/api/orders/${orderId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        reason: '고객 환불 요청'
      })
    });
    
    const result = await response.json();
    console.log('환불 요청 응답:', result);
    
    if (result.success) {
      toast('환불 요청이 접수되었습니다.');
      // 주문 목록 새로고침
      renderOrderHistory();
    } else {
      alert(result.message || '환불 요청에 실패했습니다.');
    }
  } catch (error) {
    console.error('환불 요청 에러:', error);
    alert('환불 요청 중 오류가 발생했습니다: ' + error.message);
  }
}

async function viewOrderDetail(orderId) {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) {
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  const token = getToken();
  if (!token) {
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  let order;
  let items = [];

  try {
    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`주문 조회 실패 (status ${res.status})`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || '주문 목록을 불러올 수 없습니다');
    }

    const found = (data.orders || []).find(o => o.order_id === orderId || o.id === orderId);
    if (!found) {
      alert('주문 정보를 찾을 수 없습니다.');
      return;
    }

    // items 파싱
    if (typeof found.items === 'string') {
      try {
        items = JSON.parse(found.items);
      } catch (e) {
        console.error('items 파싱 오류:', e);
        items = [];
      }
    } else if (Array.isArray(found.items)) {
      items = found.items;
    }

    const firstItem = items[0] || {};

    // order_details 파싱
    let orderDetails = found.order_details;
    console.log('[파이프 검증] 고객 상세 보기 - 원본 orderDetails:', orderDetails);
    if (typeof orderDetails === 'string') {
      try {
        orderDetails = JSON.parse(orderDetails);
      } catch (e) {
        console.warn('order_details 파싱 오류:', e);
        orderDetails = {};
      }
    }
    console.log('[파이프 검증] 고객 상세 보기 - 파싱 후 orderDetails:', orderDetails);

    order = {
      ...found,
      orderId: found.order_id || found.id,
      orderDate: found.created_at || found.date,
      status: found.status || 'pending',
      items: items,
      options: firstItem.options || found.options || {},
      specs: firstItem.specs || found.specs,
      files: firstItem.files || found.files || [],
      price: found.total_price || firstItem.price || 0,
      shipping: found.shipping || 0,
      qty: firstItem.qty || items.length || 0,
      name: firstItem.name || '주문 상품',
      orderDetails: orderDetails
    };

  } catch (err) {
    console.error('주문 상세 조회 오류:', err);
    alert('주문 정보를 불러오지 못했습니다. 다시 시도해주세요.');
    return;
  }

  const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleString('ko-KR') : (order.date || '-');
  const statusColors = {
    '접수완료': '#10b981',
    '제작중': '#3b82f6',
    '배송중': '#f59e0b',
    '배송완료': '#6366f1',
    '취소': '#ef4444',
    'refund_requested': '#f97316',
    'refunded': '#6b7280'
  };
  const statusLabels = {
    '접수완료': '접수완료',
    '제작중': '제작중',
    '배송중': '배송중',
    '배송완료': '배송완료',
    '취소': '취소',
    'refund_requested': '환불요청',
    'refunded': '환불완료'
  };
  const statusColor = statusColors[order.status] || '#64748b';
  const statusLabel = statusLabels[order.status] || order.status || '접수완료';

  // 옵션 정보 표시
  let optionsHtml = '';
  const opts = order.options || {};
  
  // 옵션이 하나라도 있으면 표시
  const hasOptions = opts.coverType || opts.innerType || opts.coverPrint || opts.innerPrint || opts.binding || opts.bindingDirection || opts.coating;
  
  if (hasOptions || Object.keys(opts).length > 0) {
    optionsHtml = `
      <div style="margin-bottom:16px; padding:16px; background:#f8fafc; border-radius:8px;">
        <div style="font-size:14px; font-weight:800; color:#475569; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid #e2e8f0;">📋 선택된 옵션</div>
        ${opts.qty ? `<div style="font-size:13px; color:#0f172a; margin-bottom:8px; font-weight:600;">• 수량: ${opts.qty}</div>` : ''}
        ${opts.size ? `<div style="font-size:13px; color:#0f172a; margin-bottom:8px;">• 사이즈: ${opts.size}</div>` : ''}
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0;">
          <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:8px;">📘 표지</div>
          ${opts.coverType ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 종이: ${opts.coverType} ${opts.coverGram || ''}</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 종이: 선택 안 됨</div>'}
          ${opts.coverPages ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 페이지: ${opts.coverPages}</div>` : ''}
          ${opts.coverPrint ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 인쇄: ${opts.coverPrint}</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 인쇄: 선택 안 됨</div>'}
          ${opts.coverColor ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 색상: ${opts.coverColor === 'color' ? '컬러' : '흑백'}</div>` : ''}
          ${opts.coating ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 코팅: ${
                            opts.coating === 'matte' ? '무광코팅' :
                            opts.coating === 'gloss' ? '유광코팅' :
                            opts.coating === 'none' ? '코팅없음' :
                            opts.coating === '단면무광코팅' ? '무광코팅' :
                            opts.coating === '단면유광코팅' ? '유광코팅' :
                            opts.coating === '코팅없음' ? '코팅없음' :
                            opts.coating
                          }</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 코팅: 선택 안 됨</div>'}
        </div>
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0;">
          <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:8px;">📄 내지</div>
          ${opts.innerType ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 종이: ${opts.innerType} ${opts.innerGram || ''}</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 종이: 선택 안 됨</div>'}
          ${opts.innerPages ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 페이지: ${opts.innerPages}</div>` : ''}
          ${opts.innerPrint ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 인쇄: ${opts.innerPrint}</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 인쇄: 선택 안 됨</div>'}
          ${opts.innerColor ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 색상: ${opts.innerColor === 'color' ? '컬러' : '흑백'}</div>` : ''}
        </div>
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0;">
          ${opts.binding ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px;">• 제본: ${opts.binding === 'staple' ? '중철' : '무선'}</div>` : ''}
          ${opts.bindingDirection ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px;">• 제본방향: ${opts.bindingDirection}</div>` : ''}
          ${opts.margin ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px;">• 마진율: ${opts.margin}%</div>` : ''}
        </div>
      </div>
    `;
  } else if (order.specs) {
    // 옵션이 없지만 specs가 있으면 표시
    optionsHtml = `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px; color:#64748b; margin-bottom:6px;">주문 사양</div>
        <div style="font-size:14px; color:#0f172a; font-weight:600;">${order.specs}</div>
      </div>
    `;
  }

  const filesHtml = order.files && order.files.length > 0 
    ? order.files.map((f, idx) => {
        const hasData = f.data && f.data.startsWith('data:');
        const downloadBtn = hasData 
          ? `<button onclick="downloadOrderFile('${order.orderId}', ${idx})" style="margin-left:8px; padding:4px 8px; background:#3b82f6; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">다운로드</button>`
          : '';
        return `<div style="font-size:13px; color:#0f172a; margin-top:4px; display:flex; align-items:center;">📎 ${f.name || '파일'} ${f.size ? `(${(f.size / 1024).toFixed(1)}KB)` : ''}${downloadBtn}</div>`;
      }).join('')
    : '';

  const detailHtml = `
        <div style="max-width:600px; margin:0 auto;">
          <h3 style="margin:0 0 20px 0; font-weight:1100; color:#0f172a;">주문 상세</h3>
          
          <div style="background:#fff; border:1px solid var(--line); border-radius:16px; padding:24px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #e2e8f0;">
              <div>
                <div style="font-weight:900; font-size:18px; color:#0f172a; margin-bottom:8px;">${order.name || '상품'}</div>
                <div style="font-size:13px; color:#64748b;">주문번호: ${order.orderId || 'N/A'}</div>
              </div>
              <span style="padding:6px 16px; background:${statusColor}15; color:${statusColor}; border-radius:8px; font-size:13px; font-weight:700;">${statusLabel}</span>
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">주문일시</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${orderDate}</div>
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">수량</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${(order.qty || 0).toString().replace(/권개/g, '권').replace(/개개/g, '개')}</div>
            </div>
            
            ${order.items && order.items.length > 0 ? `
              <div style="margin-bottom:16px; padding:16px; background:#f8fafc; border-radius:8px;">
                <div style="font-size:13px; font-weight:700; color:#475569; margin-bottom:12px;">📦 주문 상품 (${order.items.length}개)</div>
                ${order.items.map((item, idx) => {
                  const itemOptions = item.options || {};
                  // 각 상품의 첨부파일
                  const itemFiles = item.files || [];
                  const itemFilesHtml = itemFiles.length > 0 
                    ? `<div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0;">
                        <div style="font-size:11px; color:#64748b; margin-bottom:6px; font-weight:600;">📎 첨부파일 (${itemFiles.length}개)</div>
                        ${itemFiles.map((f, fileIdx) => {
                          const fileIndex = order.files ? order.files.findIndex((of, oi) => {
                            return of.name === f.name && of.size === f.size;
                          }) : -1;
                          const hasData = f.data && f.data.startsWith('data:');
                          const downloadBtn = hasData && fileIndex >= 0
                            ? `<button onclick="downloadOrderFile('${order.orderId}', ${fileIndex})" style="margin-left:8px; padding:4px 8px; background:#3b82f6; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">다운로드</button>`
                            : '';
                          return `<div style="font-size:12px; color:#0f172a; margin-top:4px; display:flex; align-items:center;">📎 ${f.name || '파일'} ${f.size ? `(${(f.size / 1024).toFixed(1)}KB)` : ''}${downloadBtn}</div>`;
                        }).join('')}
                      </div>`
                    : '';
                  
                  const qtyText = itemOptions.qty ? (typeof itemOptions.qty === 'string' && /부\s*$/.test(itemOptions.qty) ? itemOptions.qty : `${itemOptions.qty}부`) : '';
                  
                  return `
                    <div style="background:#fff; padding:20px; border-radius:8px; margin-bottom:16px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                      <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #037a3f;">
                        📦 ${item.name || '상품'}${order.items.length > 1 ? ` (${idx + 1})` : ''}
                      </div>
                      
                      ${qtyText ? `
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:3px solid #037a3f;">
                          <span style="font-size:14px; color:#64748b;">수량:</span>
                          <span style="color:#037a3f; font-size:18px; font-weight:700;">${qtyText}</span>
                        </div>
                      ` : ''}
                      
                      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:16px;">
                        <div style="background:#fafafa; padding:14px; border-radius:6px;">
                          <div style="font-size:13px; font-weight:700; color:#037a3f; margin-bottom:10px;">📘 표지</div>
                          ${itemOptions.coverType ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">용지: <strong>${itemOptions.coverType}${itemOptions.coverGram ? ' ' + itemOptions.coverGram : ''}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">용지: 미선택</div>'}
                          ${itemOptions.coverPages ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">페이지: <strong>${itemOptions.coverPages}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">페이지: 미선택</div>'}
                          ${itemOptions.coverPrint ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">인쇄: <strong>${itemOptions.coverPrint}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">인쇄: 미선택</div>'}
                          ${itemOptions.coverColor ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">색상: <strong>${itemOptions.coverColor === 'color' ? '컬러' : '흑백'}</strong></div>` : ''}
                          ${(() => {
                            const coatMap = {
                              'none': '코팅없음',
                              '0': '코팅없음',
                              '코팅없음': '코팅없음',
                              'matte': '무광코팅',
                              'matt': '무광코팅',
                              '1': '무광코팅',
                              '단면무광코팅': '무광코팅',
                              'gloss': '유광코팅',
                              'glossy': '유광코팅',
                              '3': '유광코팅',
                              '단면유광코팅': '유광코팅'
                            };
                            const label = coatMap[itemOptions.coating] || itemOptions.coating;
                            return itemOptions.coating
                              ? `<div style="font-size:13px; color:#334155;">코팅: <strong>${label}</strong></div>`
                              : '<div style="font-size:13px; color:#94a3b8;">코팅: 미선택</div>';
                          })()}
                        </div>
                        
                        <div style="background:#fafafa; padding:14px; border-radius:6px;">
                          <div style="font-size:13px; font-weight:700; color:#037a3f; margin-bottom:10px;">📄 내지</div>
                          ${itemOptions.innerType ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">용지: <strong>${itemOptions.innerType}${itemOptions.innerGram ? ' ' + itemOptions.innerGram : ''}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">용지: 미선택</div>'}
                          ${itemOptions.innerPages ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">페이지: <strong>${itemOptions.innerPages}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">페이지: 미선택</div>'}
                          ${itemOptions.innerPrint ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">인쇄: <strong>${itemOptions.innerPrint}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">인쇄: 미선택</div>'}
                          ${itemOptions.innerColor ? `<div style="font-size:13px; color:#334155;">색상: <strong>${itemOptions.innerColor === 'color' ? '컬러' : '흑백'}</strong></div>` : ''}
                        </div>
                        
                        <div style="background:#fafafa; padding:14px; border-radius:6px;">
                          <div style="font-size:13px; font-weight:700; color:#037a3f; margin-bottom:10px;">📌 제본</div>
                          ${itemOptions.binding ? `<div style="font-size:13px; color:#334155; margin-bottom:4px;">방식: <strong>${itemOptions.binding === 'staple' ? '중철' : itemOptions.binding === 'perfect' ? '무선' : itemOptions.binding}</strong></div>` : '<div style="font-size:13px; color:#94a3b8;">방식: 미선택</div>'}
                          ${itemOptions.bindingDirection ? `<div style="font-size:14px; color:#037a3f; font-weight:700;">방향: ${itemOptions.bindingDirection}</div>` : '<div style="font-size:13px; color:#94a3b8;">방향: 미선택</div>'}
                        </div>
                      </div>
                      
                      <div style="font-size:14px; color:#0f172a; font-weight:600; margin-bottom:12px;">금액: ${(item.price || 0).toLocaleString()}원</div>
                      ${itemFilesHtml}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : optionsHtml}
            
            ${!order.items || order.items.length === 0 ? `
              <div style="margin-bottom:16px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:6px;">첨부파일</div>
                ${filesHtml || '<div style="font-size:13px; color:#64748b;">첨부파일 없음</div>'}
              </div>
            ` : ''}
            
            <div style="padding-top:16px; border-top:2px solid #e2e8f0; margin-top:16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:14px; color:#64748b;">상품금액</span>
                <span style="font-size:14px; color:#0f172a; font-weight:700;">${(order.price || 0).toLocaleString()}원</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:14px; color:#64748b;">배송비</span>
                <span style="font-size:14px; color:#0f172a; font-weight:700;">${(order.shipping || 0).toLocaleString()}원</span>
              </div>
              
              <div style="display:flex; justify-content:space-between; padding-top:12px; border-top:1px dashed #e2e8f0; margin-top:12px;">
                <span style="font-size:16px; color:#0f172a; font-weight:900;">총 결제금액</span>
                <span style="font-size:20px; color:var(--primary); font-weight:1100;">${((order.price || 0) + (order.shipping || 0)).toLocaleString()}원</span>
              </div>
            </div>
          </div>
          
          ${(order.status === '접수완료' || order.status === '제작중' || order.status === 'pending' || order.status === 'preparing') && order.status !== 'refund_requested' && order.status !== 'refunded' ? `
            <button id="request-refund-btn" class="btn" style="width:100%; margin-bottom:12px; background:#f97316; color:#fff; border:none; padding:12px; font-weight:700; cursor:pointer;">환불 요청</button>
          ` : ''}
          ${order.status === 'refund_requested' ? `
            <div style="padding:12px; background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; margin-bottom:12px; text-align:center; color:#92400e; font-weight:600;">환불 요청이 접수되었습니다. 관리자 검토 중입니다.</div>
          ` : ''}
          <button id="close-order-detail-modal-btn" class="btn btn-primary" style="width:100%;">닫기</button>
        </div>
      `;

  // 모달로 표시
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:2000; padding:20px; overflow-y:auto;';
  modal.innerHTML = `
        <div style="background:#fff; border-radius:16px; padding:24px; max-width:700px; width:100%; max-height:90vh; overflow-y:auto;">
          ${detailHtml}
        </div>
      `;
  // 닫기 버튼 및 환불요청 이벤트
  modal.addEventListener('click', async function(e) {
    if (e.target === modal || e.target.id === 'close-order-detail-modal-btn') {
      document.body.removeChild(modal);
    }
    if (e.target.id === 'request-refund-btn') {
      if (confirm('환불을 요청하시겠습니까?\n\n관리자가 확인 후 처리됩니다.')) {
        await requestRefund(order.orderId);
        document.body.removeChild(modal);
      }
    }
  });
  
  document.body.appendChild(modal);
}

// ===== HOME LOGIC =====
// Top nav (비로그인 기본)
function renderNav() {
  updateNav();
}

// Home navigation stubs
function getScrollbarWidth() {
  // 스크롤바 너비 계산
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll';
  outer.style.msOverflowStyle = 'scrollbar';
  document.body.appendChild(outer);

  const inner = document.createElement('div');
  outer.appendChild(inner);

  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;

  outer.parentNode.removeChild(outer);
  return scrollbarWidth;
}

function toggleFullMenu() {
  const panel = get('full-menu-panel');
  if (!panel) return;

  const isOpen = panel.classList.contains('show');
  if (isOpen) {
    panel.classList.remove('show');
    // 스크롤바 복원 시 레이아웃 시프트 방지
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
  } else {
    // 스크롤바 숨김 시 레이아웃 시프트 방지
    const scrollbarWidth = getScrollbarWidth();
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    panel.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

// 메뉴 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  const panel = get('full-menu-panel');
  const menuBtn = document.querySelector('.menu-btn');
  if (!panel || !panel.classList.contains('show')) return;

  // 메뉴 버튼이나 패널 내부 클릭이 아니면 닫기
  if (!panel.contains(e.target) && !menuBtn.contains(e.target)) {
    panel.classList.remove('show');
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
  }
});

// 견적 입력값 초기화 함수
function resetQuoteInputs() {
  // 수량 초기화
  const qtyInput = get('ind-qty');
  if (qtyInput) qtyInput.value = '';
  
  // 표지 종이 초기화
  const coverType = get('ind-coverType');
  if (coverType) {
    coverType.selectedIndex = 0;
    updateIndGram('cover');
  }
  
  // 표지 페이지 초기화
  const coverPages = get('ind-coverPages');
  if (coverPages) {
    const defaultOpt = coverPages.querySelector('option[value=""]');
    if (defaultOpt) {
      coverPages.value = '';
      defaultOpt.selected = true;
    }
  }
  
  // 내지 종이 초기화
  const innerType = get('ind-innerType');
  if (innerType) {
    innerType.selectedIndex = 0;
    updateIndGram('inner');
  }
  
  // 내지 페이지 초기화
  const innerPages = get('ind-innerPages');
  if (innerPages) {
    const defaultOpt = innerPages.querySelector('option[value=""]');
    if (defaultOpt) {
      innerPages.value = '';
      defaultOpt.selected = true;
    }
  }
  
  // 표지 인쇄 초기화
  const coverPrint = get('ind-coverPrint');
  if (coverPrint) coverPrint.value = '';
  
  // 표지 색상 초기화
  const coverColor = document.querySelectorAll('input[name="ind-coverColor"]');
  coverColor.forEach(radio => radio.checked = false);
  
  // 내지 인쇄 초기화
  const innerPrint = get('ind-innerPrint');
  if (innerPrint) innerPrint.value = '';
  
  // 내지 색상 초기화
  const innerColor = document.querySelectorAll('input[name="ind-innerColor"]');
  innerColor.forEach(radio => radio.checked = false);
  
  // 코팅 초기화
  const coating = get('ind-coating-select');
  if (coating) {
    const defaultOpt = coating.querySelector('option[value="코팅없음"]');
    if (defaultOpt) {
      coating.value = '코팅없음';
      defaultOpt.selected = true;
    } else {
      coating.selectedIndex = 0;
    }
  }
  
  // 사이즈 초기화 (규격 사이즈인 경우 - A4 기본값 유지)
  const bookSizeStandard = get('ind-bookSize-standard');
  if (bookSizeStandard) {
    // A4 (210×297)를 기본값으로 설정
    bookSizeStandard.value = '210×297';
    
    // updateSizeFromStandard 함수로 입력란 채우기
    if (typeof updateSizeFromStandard === 'function') {
      updateSizeFromStandard();
    }
  }
  
  // 참고: 재단 사이즈는 updateSizeFromStandard()에서 자동으로 처리되므로 여기서는 초기화하지 않음
  
  // 전단지 사이즈 초기화
  const flyerSize = get('ind-flyerSize');
  if (flyerSize) flyerSize.selectedIndex = 0;
  
  // 전단지 인쇄 초기화
  const flyerPrint = get('ind-flyerPrint');
  if (flyerPrint) flyerPrint.value = '';
  
  // 전단지 색상 초기화
  const flyerColor = document.querySelectorAll('input[name="ind-flyerColor"]');
  flyerColor.forEach(radio => radio.checked = false);
  
  // 전단지 코팅 초기화
  const flyerCoating = get('ind-flyerCoating');
  if (flyerCoating) {
    const defaultOpt = flyerCoating.querySelector('option[value="코팅없음"]');
    if (defaultOpt) {
      flyerCoating.value = '코팅없음';
      defaultOpt.selected = true;
    } else {
      flyerCoating.selectedIndex = 0;
    }
  }
  
  // 가격 표시 초기화
  const priceDisplay = get('ind-price');
  if (priceDisplay) priceDisplay.textContent = '0원';
  
  const shippingDisplay = get('ind-ship');
  if (shippingDisplay) shippingDisplay.textContent = '0원';
  
  const totalDisplay = get('ind-total');
  if (totalDisplay) totalDisplay.textContent = '0원';
}

function setCategory(cat, bindType, skipHistory) {
  navigate('view-quotation', { push: !skipHistory, state: { view: 'view-quotation', cat } });
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  // 견적 입력값 초기화
  resetQuoteInputs();
  
  // 견적요약서 초기화
  const sumCat = get('sum-cat');
  const sumQty = get('sum-qty');
  const sumTotal = get('sum-total');
  const sumSupply = get('sum-supply');
  const sumVat = get('sum-vat');
  const sumShip = get('sum-ship');
  if (sumCat) sumCat.textContent = '-';
  if (sumQty) sumQty.textContent = '-';
  if (sumTotal) sumTotal.textContent = '0원';
  if (sumSupply) sumSupply.textContent = '-';
  if (sumVat) sumVat.textContent = '-';
  if (sumShip) sumShip.textContent = '-';

  // 카테고리에 맞는 계산기 모드 매핑
  const modeMap = {
    'indigo': 'book_indigo',
    'digital': 'book_digital',
    'offset': 'book_offset',
    'flyer_small': 'flyer_small',
    'flyer_large': 'flyer_large'
  };

  // 카테고리명이 이미 모드명인 경우 (flyer_small, flyer_large)
  const targetMode = modeMap[cat] || (cat.startsWith('flyer_') ? cat : 'book_indigo');

  // 모드 직접 설정 (탭이 없으므로)
  setTimeout(() => {
    // 종이 초기화 (아직 안 되어 있다면)
    if (typeof initIndPaper === 'function') {
      initIndPaper();
    }
    if (typeof initPaper_111 === 'function') {
      initPaper_111();
    }

    // 모드 직접 설정
    if (typeof setQuoteMode === 'function') {
      setQuoteMode(targetMode, null);
    } else {
      // setQuoteMode가 아직 정의되지 않았으면 직접 모드 설정
      if (typeof currentQuoteMode !== 'undefined') {
        currentQuoteMode = targetMode;
        // UI 업데이트는 setQuoteMode 내부에서 처리됨
      }
    }

    // 제본 방식에 따른 페이지 옵션 동기화
    if (typeof updateInnerPagesByBinding === 'function') {
      updateInnerPagesByBinding();
    }

    // 책자 기본 용지: 표지 스노우지 / 내지 모조지 (setTimeout 내에서 설정하여 초기화 후 적용)
    if (!cat.startsWith('flyer') && typeof setDefaultBookPapers === 'function') {
      setDefaultBookPapers();
    }

  }, 100);

  const prevCategory = window.currentCategory;
  window.currentCategory = cat;
  // 결정된 바인딩 우선순위: 전달된 bindType > (카테고리 전환 시 기본 staple) > 저장된 카테고리별 내용 > 이전값 > 기본 'staple'
  if (bindType) {
    window.currentBindType = bindType;
  } else if (prevCategory && prevCategory !== cat) {
    window.currentBindType = 'staple';
  } else {
    const data = contentDB[cat] || {};
    // prefer the binding which has non-empty content (img or info)
    const stapleHas = (data.img && typeof data.img === 'object' && (data.img.staple || '').toString().trim()) || (data.info && typeof data.info === 'object' && (data.info.staple || '').toString().trim());
    const perfectHas = (data.img && typeof data.img === 'object' && (data.img.perfect || '').toString().trim()) || (data.info && typeof data.info === 'object' && (data.info.perfect || '').toString().trim());
    if (stapleHas && !perfectHas) window.currentBindType = 'staple';
    else if (!stapleHas && perfectHas) window.currentBindType = 'perfect';
    else window.currentBindType = window.currentBindType || 'staple';
  }

  // 제본별 페이지 제한 반영
  if (typeof updateInnerPagesByBinding === 'function') {
    updateInnerPagesByBinding();
  }

  // 요약서 카테고리 라벨 즉시 반영
  updateSummaryCategoryLabel();

  // 모든 카테고리 링크에서 active 클래스 제거
  document.querySelectorAll('.cat-link').forEach(link => {
    link.classList.remove('active');
  });

  // 선택된 카테고리에 active 클래스 추가
  const catMap = {
    'indigo': '소량 인디고',
    'digital': '흑백 디지털',
    'offset': '대량 옵셋',
    'flyer_small': '소량 전단',
    'flyer_large': '대량 전단'
  };

  // 선택된 카테고리 링크 찾기
  const catText = catMap[cat];
  document.querySelectorAll('.cat-link').forEach(link => {
    if (link.textContent.trim() === catText) {
      link.classList.add('active');
    }
  });

  // 기본으로 상세 탭을 활성화 (요소가 존재하는 경우만)
  if (typeof switchProductTab === 'function' && document.getElementById('tab-detail-btn')) {
    switchProductTab('detail');
  }

  const titles = {
    indigo: '소량 인디고',
    digital: '흑백 디지털',
    offset: '대량 옵셋',
    flyer_small: '소량 전단',
    flyer_large: '대량 전단'
  };

  const bindNames = {
    staple: '중철',
    perfect: '무선'
  };

  let titleText = titles[cat] || '견적 계산기';
  if ((cat === 'indigo' || cat === 'digital' || cat === 'offset') && bindType) {
    titleText += ' - ' + bindNames[bindType];
  }

  const titleEl = get('quote-title');
  if (titleEl) titleEl.textContent = titleText;

  // 카테고리별 마진율 자동 설정 (관리자 페이지에서 설정한 값 적용)
  if (typeof contentDB !== 'undefined' && contentDB[cat] && contentDB[cat].margin !== undefined) {
    const marginInput = get('ind-margin');
    if (marginInput) {
      marginInput.value = contentDB[cat].margin;
    }
  }

  // 인디고, 디지털, 옵셋인 경우 제본 타입에 따라 라디오 버튼 자동 선택
  if (cat === 'indigo' || cat === 'digital' || cat === 'offset') {
    setTimeout(() => {
      const radios = document.getElementsByName('ind-bind');
      radios.forEach(r => {
        if (r.value === window.currentBindType) {
          r.checked = true;
          // 라디오 버튼 스타일 업데이트
          const label = r.parentElement;
          if (label) {
            // 같은 그룹의 모든 label 초기화
            document.querySelectorAll('input[name="ind-bind"]').forEach(radio => {
              const lbl = radio.parentElement;
              if (lbl) {
                lbl.style.border = '1px solid #cbd5e1';
                lbl.style.background = '#fff';
                lbl.style.color = '#475569';
                lbl.style.fontWeight = '600';
              }
            });
            // 선택된 항목 스타일 변경
            label.style.border = '2px solid var(--primary)';
            label.style.background = '#ecfdf5';
            label.style.color = 'var(--primary)';
            label.style.fontWeight = '700';
          }
        }
      });
      // 라디오 변경이 반영되면 페이지 제한도 즉시 갱신
      if (typeof updateInnerPagesByBinding === 'function') {
        updateInnerPagesByBinding();
      }
      // 라디오 체크 후 명시적 탭 업데이트
      if (typeof applyContentToDetailTabs === 'function') {
        applyContentToDetailTabs(cat);
      }
    }, 100);
  }

  if (typeof contentDB !== 'undefined' && contentDB[cat]) {
    applyContentToDetailTabs(cat);
    const imgEl = get('quote-indigo-img');
    if (imgEl && contentDB[cat].img) {
      let imgSrc = '';
      if (typeof contentDB[cat].img === 'string') imgSrc = contentDB[cat].img;
      else if (typeof contentDB[cat].img === 'object') {
        imgSrc = contentDB[cat].img[window.currentBindType] || contentDB[cat].img.staple || contentDB[cat].img.perfect || '';
      }
      if (imgSrc) imgEl.src = imgSrc;
    }
    // Apply text (info/guide/ship) per binding if present
    const data = contentDB[cat];
    const binding = window.currentBindType || 'staple';
    const detail = get('tab-detail-content');
    const guide = get('tab-guide-content');
    const ship = get('tab-shipping-content');

    let infoHtml = '';
    if (data.info) {
      if (typeof data.info === 'string') infoHtml = data.info;
      else if (typeof data.info === 'object') infoHtml = data.info[binding] || data.info.staple || data.info.perfect || '';
    }
    if (detail) detail.innerHTML = infoHtml || '';

    let guideHtml = '';
    if (data.guide) {
      if (typeof data.guide === 'string') guideHtml = data.guide;
      else if (typeof data.guide === 'object') guideHtml = data.guide[binding] || data.guide.staple || data.guide.perfect || '';
    }
    if (guide) guide.innerHTML = `<div style="background:#fff; border-radius:12px; padding:30px;"><h2 style="font-size:20px; font-weight:900; color:#0f172a; margin:0 0 20px 0; border-left:4px solid var(--primary); padding-left:12px;">제작 가이드</h2><div style="line-height:1.8; color:#475569;">${(guideHtml || '').replace(/\n/g,'<br>')}</div></div>`;

    let shipHtml = '';
    if (data.ship) {
      if (typeof data.ship === 'string') shipHtml = data.ship;
      else if (typeof data.ship === 'object') shipHtml = data.ship[binding] || data.ship.staple || data.ship.perfect || '';
    }
    if (ship) ship.innerHTML = `<div style="background:#fff; border-radius:12px; padding:30px;"><h2 style="font-size:20px; font-weight:900; color:#0f172a; margin:0 0 20px 0; border-left:4px solid var(--primary); padding-left:12px;">배송 안내</h2><div style="line-height:1.8; color:#475569;">${(shipHtml || '').replace(/\n/g,'<br>')}</div></div>`;
  }
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Slider
let homeIdx = 0;

function slides() {
  return Array.from(document.querySelectorAll('#home-slider .home-slide'));
}

function goToSlide(index) {
  const s = slides();
  if (index >= 0 && index < s.length) {
    homeIdx = index;
    updatePager();
    resetAutoSlide();
  }
}

function updatePager() {
  const s = slides();
  s.forEach((el, i) => el.classList.toggle('active', i === homeIdx));

  const p = get('home-pager');
  if (p) {
    p.innerHTML = '';
    s.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'home-pager-dot' + (i === homeIdx ? ' active' : '');
      dot.onclick = () => {
        homeIdx = i;
        updatePager();
        resetAutoSlide();
      };
      p.appendChild(dot);
    });
  }
}

function homeNext() {
  const s = slides();
  if (!s.length) return;
  homeIdx = (homeIdx + 1) % s.length;
  updatePager();
  resetAutoSlide();
}

function homePrev() {
  const s = slides();
  if (!s.length) return;
  homeIdx = (homeIdx - 1 + s.length) % s.length;
  updatePager();
  resetAutoSlide();
}

// 바인딩 토글 UI/함수 제거: 상단 카테고리에서 바인딩을 선택하도록 변경됨

// 자동 슬라이드
let autoSlideTimer = null;

function startAutoSlide() {
  autoSlideTimer = setInterval(() => {
    homeNext();
  }, 4000); // 4초마다 자동 넘김
}

function stopAutoSlide() {
  if (autoSlideTimer) {
    clearInterval(autoSlideTimer);
    autoSlideTimer = null;
  }
}

function resetAutoSlide() {
  stopAutoSlide();
  startAutoSlide();
}

// Initialize
(async function init() {
  renderNav();
  await applyHomepageContent(true); // 메인 슬라이더/로고/견적 이미지를 서버에서 로드 후 적용
  // 로그인 상태라면 서버 장바구니 동기화
  if (getToken()) {
    await fetchCartFromServer();
  }
  updatePager();
  updateCartBadge();
  updateHomeLoginCard();
  startAutoSlide();
  loadNotices();
})();

// 슬라이더에 마우스 올리면 자동 슬라이드 일시정지
const slider = get('home-slider');
if (slider) {
  slider.addEventListener('mouseenter', stopAutoSlide);
  slider.addEventListener('mouseleave', startAutoSlide);
}

// 라디오 버튼 스타일 전환
document.addEventListener('DOMContentLoaded', function() {
  // 표지 인쇄 상세 드롭다운 변경 시 라디오 버튼 업데이트
  const coverPrintSelect = document.getElementById('ind-coverPrint-select');
  if (coverPrintSelect) {
    // 포커스 이벤트에서 테두리 강제 제거
    coverPrintSelect.addEventListener('focus', function() {
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('outline', 'none', 'important');
      this.style.setProperty('box-shadow', 'none', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
    }, true);

    coverPrintSelect.addEventListener('mousedown', function() {
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
    });

    coverPrintSelect.addEventListener('mouseup', function() {
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
    });

    coverPrintSelect.addEventListener('change', function() {
      const value = this.value;
      const [print, color] = value.split('-');

      // 테두리 즉시 제거
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('outline', 'none', 'important');
      this.style.setProperty('box-shadow', 'none', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
      this.blur();

      // 라디오 버튼 업데이트
      const printRadio = document.getElementById('ind-coverPrint-' + print);
      const colorRadio = document.getElementById('ind-coverColor-' + color);

      if (printRadio) {
        printRadio.checked = true;
        printRadio.dispatchEvent(new Event('change'));
      }
      if (colorRadio) {
        colorRadio.checked = true;
        colorRadio.dispatchEvent(new Event('change'));
      }

      // 추가 확인
      setTimeout(() => {
        this.style.setProperty('border-color', '#cbd5e1', 'important');
        this.style.setProperty('border', '1px solid #cbd5e1', 'important');
      }, 0);
    });
  }

  // 내지 인쇄 상세 드롭다운 변경 시 라디오 버튼 업데이트
  const innerPrintSelect = document.getElementById('ind-innerPrint-select');
  if (innerPrintSelect) {
    // 포커스 이벤트에서 테두리 강제 제거
    innerPrintSelect.addEventListener('focus', function() {
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('outline', 'none', 'important');
      this.style.setProperty('box-shadow', 'none', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
    }, true);

    innerPrintSelect.addEventListener('mousedown', function() {
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
    });

    innerPrintSelect.addEventListener('mouseup', function() {
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
    });

    innerPrintSelect.addEventListener('change', function() {
      const value = this.value;
      const [print, color] = value.split('-');

      // 테두리 즉시 제거
      this.style.setProperty('border-color', '#cbd5e1', 'important');
      this.style.setProperty('outline', 'none', 'important');
      this.style.setProperty('box-shadow', 'none', 'important');
      this.style.setProperty('border', '1px solid #cbd5e1', 'important');
      this.blur();

      // 라디오 버튼 업데이트
      const printRadio = document.getElementById('ind-innerPrint-' + print);
      const colorRadio = document.getElementById('ind-innerColor-' + color);

      if (printRadio) {
        printRadio.checked = true;
        printRadio.dispatchEvent(new Event('change'));
      }
      if (colorRadio) {
        colorRadio.checked = true;
        colorRadio.dispatchEvent(new Event('change'));
      }

      // 추가 확인
      setTimeout(() => {
        this.style.setProperty('border-color', '#cbd5e1', 'important');
        this.style.setProperty('border', '1px solid #cbd5e1', 'important');
      }, 0);
    });
  }

  // 코팅 드롭다운 변경 시 라디오 버튼 업데이트
  const coatingSelect = document.getElementById('ind-coating-select');
  if (coatingSelect) {
    coatingSelect.addEventListener('change', function() {
      const value = this.value;
      // 코팅 라디오 버튼 업데이트
      const coatRadio0 = document.getElementById('ind-coat-0');
      const coatRadio1 = document.getElementById('ind-coat-1');

      if (value === '0') {
        if (coatRadio0) {
          coatRadio0.checked = true;
          coatRadio0.dispatchEvent(new Event('change'));
        }
      } else {
        if (coatRadio1) {
          coatRadio1.checked = true;
          coatRadio1.dispatchEvent(new Event('change'));
        }
      }
    });
  }

  // 표지 페이지 드롭다운 변경 시 단면/양면 자동 선택
  const coverPagesSelect = document.getElementById('ind-coverPages');
  if (coverPagesSelect) {
    const syncCoverPrintByPages = () => {
      const pages = coverPagesSelect.value;
      const coverPrintSelect = document.getElementById('ind-coverPrint-select');
      if (!coverPrintSelect) return;

      // 옵션 가용성 제어
      const opts = Array.from(coverPrintSelect.options || []);
      opts.forEach(opt => {
        const isDouble = opt.value.startsWith('2-');
        const isSingle = opt.value.startsWith('1-');
        opt.disabled = false;
        if (pages === '2' && isDouble) opt.disabled = true; // 2p => 단면만
        if (pages === '4' && isSingle) opt.disabled = true; // 4p => 양면만
      });

      // 값 강제 설정
      if (pages === '2') {
        coverPrintSelect.value = opts.find(o => o.value === '1-color' && !o.disabled) ? '1-color' : '1-mono';
      } else if (pages === '4') {
        coverPrintSelect.value = opts.find(o => o.value === '2-color' && !o.disabled) ? '2-color' : '2-mono';
      }
      coverPrintSelect.dispatchEvent(new Event('change'));
    };

    coverPagesSelect.addEventListener('change', syncCoverPrintByPages);
    // 초기 동기화
    syncCoverPrintByPages();
  }

  // 모든 라디오 버튼에 대해 이벤트 리스너 추가
  const radioGroups = ['ind-bind', 'ind-coverPrint', 'ind-coverColor', 'ind-coat', 'ind-innerPrint', 'ind-innerColor'];

  radioGroups.forEach(groupName => {
    const radios = document.querySelectorAll(`input[name="${groupName}"]`);
    radios.forEach(radio => {
      radio.addEventListener('change', function() {
        // 같은 그룹의 모든 label 초기화 (라벨이 존재할 때만)
        document.querySelectorAll(`input[name="${groupName}"]`).forEach(r => {
          // 우선 라디오가 감싸인 label을 찾고, 없으면 label[for="id"] 형태로 찾음
          const lbl = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
          if (lbl && lbl.style) {
            lbl.style.border = '1px solid #cbd5e1';
            lbl.style.background = '#fff';
            lbl.style.color = '#475569';
            lbl.style.fontWeight = '600';
          }
        });

        // 선택된 항목 스타일 변경 (라벨이 있을 때만)
        const selLbl = this.closest('label') || document.querySelector(`label[for="${this.id}"]`);
        if (selLbl && selLbl.style) {
          selLbl.style.border = '2px solid var(--primary)';
          selLbl.style.background = '#ecfdf5';
          selLbl.style.color = 'var(--primary)';
          selLbl.style.fontWeight = '700';
        }
      });
    });
  });
});

// 상품 상세 탭 전환 함수
function switchProductTab(tabName) {
  // 요소가 없으면 함수 종료
  const detailBtn = document.getElementById('tab-detail-btn');
  const guideBtn = document.getElementById('tab-guide-btn');
  const shippingBtn = document.getElementById('tab-shipping-btn');
  
  if (!detailBtn || !guideBtn || !shippingBtn) {
    return;
  }
  
  // 모든 탭 버튼 초기화
  detailBtn.style.background = '#f1f5f9';
  detailBtn.style.color = '#64748b';
  detailBtn.style.fontWeight = '600';

  guideBtn.style.background = '#f1f5f9';
  guideBtn.style.color = '#64748b';
  guideBtn.style.fontWeight = '600';

  shippingBtn.style.background = '#f1f5f9';
  document.getElementById('tab-shipping-btn').style.color = '#64748b';
  document.getElementById('tab-shipping-btn').style.fontWeight = '600';

  // 모든 탭 콘텐츠 숨기기
  document.getElementById('tab-detail-content').style.display = 'none';
  document.getElementById('tab-guide-content').style.display = 'none';
  document.getElementById('tab-shipping-content').style.display = 'none';

  // 선택된 탭 활성화
  if (tabName === 'detail') {
    document.getElementById('tab-detail-btn').style.background = 'var(--primary)';
    document.getElementById('tab-detail-btn').style.color = '#fff';
    document.getElementById('tab-detail-btn').style.fontWeight = '700';
    document.getElementById('tab-detail-content').style.display = 'block';
  } else if (tabName === 'guide') {
    document.getElementById('tab-guide-btn').style.background = 'var(--primary)';
    document.getElementById('tab-guide-btn').style.color = '#fff';
    document.getElementById('tab-guide-btn').style.fontWeight = '700';
    document.getElementById('tab-guide-content').style.display = 'block';
  } else if (tabName === 'shipping') {
    document.getElementById('tab-shipping-btn').style.background = 'var(--primary)';
    document.getElementById('tab-shipping-btn').style.color = '#fff';
    document.getElementById('tab-shipping-btn').style.fontWeight = '700';
    document.getElementById('tab-shipping-content').style.display = 'block';
  }
}

// ==========================================
//  견적 계산기 로직
// ==========================================
const YEON_PRICE = {
  "모조지": {
    "80": 50750,
    "100": 62920,
    "120": 75460,
    "150": 94320
  },
  "미색모조지": {
    "80": 52270,
    "100": 64790
  },
  "플러스지백색": {
    "80": 57270,
    "100": 64790
  },
  "플러스지미색": {
    "80": 53840,
    "100": 66700
  },
  "하이플러스연미": {
    "90": 61500
  },
  "스노우지": {
    "100": 62590,
    "120": 75040,
    "150": 95480,
    "180": 114540,
    "200": 127270,
    "250": 159070
  },
  "아트지": {
    "100": 62590,
    "120": 75040,
    "150": 95480,
    "180": 114540,
    "200": 127270,
    "250": 159070
  },
  "아르떼": {
    "105": 119200,
    "130": 147600,
    "160": 181600,
    "190": 215600,
    "210": 238700,
    "230": 261000
  }
};
const OFFSET_PRICE_PER_COLOR = 8000;
const INDIGO_CLICK = {
  color: 200,
  mono: 40
};
const DIGITAL_CLICK = 20;

let currentQuoteMode = 'book_indigo';

function getRadio(name) {
  const radio = document.querySelector(`input[name="${name}"]:checked`);
  return radio ? radio.value : null;
}

function comma(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 모드 변경 함수
function setQuoteMode(mode, el) {
  currentQuoteMode = mode;
  // 탭이 있는 경우에만 스타일 변경
  if (el) {
    document.querySelectorAll('.mode-tab-btn').forEach(b => {
      b.style.background = '#f3f4f6';
      b.style.color = '#4b5563';
      b.style.borderColor = '#e5e7eb';
    });
    el.style.background = '#1f2937';
    el.style.color = '#fff';
    el.style.borderColor = '#1f2937';
  }

  const isFlyer = mode.startsWith('flyer');

  // UI 제어
  if (isFlyer) {
    // 전단지 모드: 표지, 제본, 내지 페이지, 내지 인쇄, 제본방향 숨김
    const coverArea = get('ind-area-cover');
    const bindingArea = get('ind-area-binding');
    const bindingDirectionArea = get('ind-area-binding-direction');
    const innerPagesArea = get('ind-area-inner-pages');
    const innerPrintArea = get('ind-area-inner-print');

    if (coverArea) coverArea.style.display = 'none';
    if (bindingArea) bindingArea.style.display = 'none';
    if (bindingDirectionArea) bindingDirectionArea.style.display = 'none';
    if (innerPagesArea) innerPagesArea.style.display = 'none';
    if (innerPrintArea) innerPrintArea.style.display = 'none';

    // 내지 섹션은 전단지용으로 재활용 (표시하되 라벨만 변경)
    const innerArea = get('ind-area-inner');
    if (innerArea) innerArea.style.display = 'block';

    // 전단지 모드일 때는 좌우 분할 레이아웃을 단일 컬럼으로 변경
    const paperPrintContainer = get('ind-paper-print-container');
    const paperPrintDivider = get('ind-paper-print-divider');
    if (paperPrintContainer) {
      paperPrintContainer.style.display = 'block';
      paperPrintContainer.style.gridTemplateColumns = '1fr';
    }
    if (paperPrintDivider) {
      paperPrintDivider.style.display = 'none';
    }

    const titleInner = get('ind-title-inner');
    if (titleInner) titleInner.innerText = "📌 용지 및 인쇄";

    const labelInnerType = get('ind-innerType')?.previousElementSibling;
    if (labelInnerType) labelInnerType.innerText = "용지 상세";

    const labelInnerColor = get('ind-label-inner-color');
    if (labelInnerColor) labelInnerColor.innerText = "인쇄 상세";

    // 인쇄 상세 드롭다운 테두리 강제 제거
    setTimeout(() => {
      const coverPrintSelect = get('ind-coverPrint-select');
      const innerPrintSelect = get('ind-innerPrint-select');
      if (coverPrintSelect) {
        coverPrintSelect.blur();
        coverPrintSelect.style.setProperty('border-color', '#cbd5e1', 'important');
        coverPrintSelect.style.setProperty('border', '1px solid #cbd5e1', 'important');
        coverPrintSelect.style.setProperty('outline', 'none', 'important');
        coverPrintSelect.style.setProperty('box-shadow', 'none', 'important');
      }
      if (innerPrintSelect) {
        innerPrintSelect.blur();
        innerPrintSelect.style.setProperty('border-color', '#cbd5e1', 'important');
        innerPrintSelect.style.setProperty('border', '1px solid #cbd5e1', 'important');
        innerPrintSelect.style.setProperty('outline', 'none', 'important');
        innerPrintSelect.style.setProperty('box-shadow', 'none', 'important');
      }
    }, 100);
  } else {
    // 책자 모드
    const coverArea = get('ind-area-cover');
    const bindingArea = get('ind-area-binding');
    const bindingDirectionArea = get('ind-area-binding-direction');
    const innerPagesArea = get('ind-area-inner-pages');
    const innerPrintArea = get('ind-area-inner-print');

    if (coverArea) coverArea.style.display = 'block';
    if (bindingDirectionArea) bindingDirectionArea.style.display = 'block';
    if (innerPagesArea) innerPagesArea.style.display = 'block';
    if (innerPrintArea) innerPrintArea.style.display = 'block';

    // 책자 모드일 때는 좌우 분할 레이아웃으로 복원
    const paperPrintContainer = get('ind-paper-print-container');
    const paperPrintDivider = get('ind-paper-print-divider');
    if (paperPrintContainer) {
      paperPrintContainer.style.display = 'grid';
      paperPrintContainer.style.gridTemplateColumns = '1fr 1px 1fr';
    }
    if (paperPrintDivider) {
      paperPrintDivider.style.display = 'block';
    }

    // 소량 인디고, 흑백 디지털, 대량 옵셋 모드일 때는 후가공 섹션 숨김 (드롭다운에서 이미 선택함)
    if (mode === 'book_indigo' || mode === 'book_digital' || mode === 'book_offset') {
      if (bindingArea) bindingArea.style.display = 'none';
    }

    const titleCover = get('ind-title-cover');
    if (titleCover) titleCover.innerText = "📌 표지";
    
    const titleInner = get('ind-title-inner');
    if (titleInner) titleInner.innerText = "📌 내지";

    const labelInnerType = get('ind-innerType')?.previousElementSibling;
    if (labelInnerType) labelInnerType.innerText = "용지 상세";

    // 인쇄 상세 드롭다운 테두리 강제 제거
    setTimeout(() => {
      const coverPrintSelect = get('ind-coverPrint-select');
      const innerPrintSelect = get('ind-innerPrint-select');
      if (coverPrintSelect) {
        coverPrintSelect.blur();
        coverPrintSelect.style.setProperty('border-color', '#cbd5e1', 'important');
        coverPrintSelect.style.setProperty('border', '1px solid #cbd5e1', 'important');
        coverPrintSelect.style.setProperty('outline', 'none', 'important');
        coverPrintSelect.style.setProperty('box-shadow', 'none', 'important');
      }
      if (innerPrintSelect) {
        innerPrintSelect.blur();
        innerPrintSelect.style.setProperty('border-color', '#cbd5e1', 'important');
        innerPrintSelect.style.setProperty('border', '1px solid #cbd5e1', 'important');
        innerPrintSelect.style.setProperty('outline', 'none', 'important');
        innerPrintSelect.style.setProperty('box-shadow', 'none', 'important');
      }
    }, 100);

    const labelInnerColor = get('ind-label-inner-color');
    if (labelInnerColor) labelInnerColor.innerText = "내지 색상";
  }

  // 흑백 모드 제어
  if (mode.includes('digital')) {
    const monoRadio = document.querySelector('input[name="ind-innerColor"][value="mono"]');
    if (monoRadio) {
      monoRadio.checked = true;
      monoRadio.dispatchEvent(new Event('change'));
    }
    const colorRadio = document.querySelector('input[name="ind-innerColor"][value="color"]');
    if (colorRadio) colorRadio.disabled = true;

    // 흑백 디지털 모드일 때 인쇄 상세 드롭다운을 흑백 옵션만 표시
    const innerPrintSelect = get('ind-innerPrint-select');
    if (innerPrintSelect) {
      // 현재 선택된 값 확인
      const currentValue = innerPrintSelect.value;
      const [printType] = currentValue.split('-');

      // 흑백 옵션만 남기고 컬러 옵션 제거 (양면흑백 → 단면흑백 순서)
      innerPrintSelect.innerHTML = '';
      const option2Mono = document.createElement('option');
      option2Mono.value = '2-mono';
      option2Mono.textContent = '양면 흑백';
      innerPrintSelect.appendChild(option2Mono);

      const option1Mono = document.createElement('option');
      option1Mono.value = '1-mono';
      option1Mono.textContent = '단면 흑백';
      innerPrintSelect.appendChild(option1Mono);

      // 현재 값이 흑백이면 유지, 아니면 양면 흑백으로 설정
      const newValue = (currentValue.includes('-mono')) ? currentValue : '2-mono';
      innerPrintSelect.value = newValue;

      // 테두리 강제 제거
      innerPrintSelect.style.setProperty('border-color', '#cbd5e1', 'important');
      innerPrintSelect.style.setProperty('border', '1px solid #cbd5e1', 'important');
      innerPrintSelect.style.setProperty('outline', 'none', 'important');
      innerPrintSelect.style.setProperty('box-shadow', 'none', 'important');
      innerPrintSelect.blur();

      // 라디오 버튼 업데이트
      const [finalPrintType] = newValue.split('-');
      const printRadio = document.getElementById('ind-innerPrint-' + finalPrintType);
      const colorRadioInner = document.getElementById('ind-innerColor-mono');
      if (printRadio) printRadio.checked = true;
      if (colorRadioInner) colorRadioInner.checked = true;

      // 추가 확인
      setTimeout(() => {
        innerPrintSelect.style.setProperty('border-color', '#cbd5e1', 'important');
        innerPrintSelect.style.setProperty('border', '1px solid #cbd5e1', 'important');
        innerPrintSelect.blur();
      }, 0);
    }
  } else {
    const colorRadio = document.querySelector('input[name="ind-innerColor"][value="color"]');
    if (colorRadio) colorRadio.disabled = false;

    // 다른 모드일 때는 모든 옵션 표시
    const innerPrintSelect = get('ind-innerPrint-select');
    if (innerPrintSelect) {
      // 옵션이 이미 있으면 그대로 유지, 없으면 다시 생성
      if (innerPrintSelect.children.length === 2) {
        innerPrintSelect.innerHTML = '';
        const options = [
          { value: '2-color', text: '양면 컬러' },
          { value: '2-mono', text: '양면 흑백' },
          { value: '1-color', text: '단면 컬러' },
          { value: '1-mono', text: '단면 흑백' }
        ];
        options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.text;
          innerPrintSelect.appendChild(option);
        });

        // 기본값 설정 (현재 값이 유효하면 유지)
        const currentValue = innerPrintSelect.value;
        if (!currentValue || !options.find(o => o.value === currentValue)) {
          innerPrintSelect.value = '2-color';
        }
      }
    }
  }

  // 모드 전환 시 견적요약서 카테고리 라벨 동기화
  updateSummaryCategoryLabel();
}

// 종이 초기화
function initIndPaper() {
  const c = get('ind-coverType');
  const i = get('ind-innerType');
  if (!c || !i) return;

  for (let k in YEON_PRICE) {
    let opt = document.createElement('option');
    opt.value = k;
    opt.innerText = k;
    c.appendChild(opt.cloneNode(true));
    i.appendChild(opt.cloneNode(true));
  }
  updateIndGram('cover');
  updateIndGram('inner');

  // 내지 페이지 옵션 생성 (4페이지부터 500페이지까지 4페이지 단위)
  const innerPagesSelect = get('ind-innerPages');
  if (innerPagesSelect) {
    innerPagesSelect.innerHTML = '';
    // 페이지선택 옵션을 먼저 추가
    let defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.innerText = '페이지선택';
    defaultOpt.selected = true;
    innerPagesSelect.appendChild(defaultOpt);
    // 페이지 옵션 추가 (기본: 전체, 이후 제본방식에 따라 조정)
    for (let p = 4; p <= 500; p += 4) {
      let opt = document.createElement('option');
      opt.value = p;
      opt.innerText = p + '페이지';
      innerPagesSelect.appendChild(opt);
    }
  }
}

// 제본 방식에 따른 페이지 선택 범위 조정
function updateInnerPagesByBinding() {
  const innerPagesSelect = get('ind-innerPages');
  if (!innerPagesSelect) return;

  const bindRadio = document.querySelector('input[name="ind-bind"]:checked');
  const bindType = (bindRadio && bindRadio.value) || window.currentBindType || 'staple';

  const minPages = bindType === 'staple' ? 4 : 30;
  const maxPages = bindType === 'staple' ? 48 : 500;
  const defaultPage = bindType === 'perfect' ? 64 : 16;

  const currentVal = parseInt(innerPagesSelect.value, 10);

  // 옵션 재구성
  const options = innerPagesSelect.querySelectorAll('option');
  options.forEach(opt => {
    if (opt.value === '') {
      // keep default option
      return;
    }
    const val = parseInt(opt.value, 10);
    if (val < minPages || val > maxPages) {
      opt.disabled = true;
      opt.style.display = 'none';
    } else {
      opt.disabled = false;
      opt.style.display = '';
    }
  });

  // 값 보정
  let newVal = currentVal;
  const hasDefaultOption = !!innerPagesSelect.querySelector('option[value=""]');

  if (!newVal || newVal < minPages || newVal > maxPages || newVal % 4 !== 0) {
    newVal = hasDefaultOption ? '' : defaultPage; // default to "페이지선택" when available
  }

  innerPagesSelect.value = newVal;
}

// 평량 업데이트
function updateIndGram(t) {
  const typeEl = get('ind-' + t + 'Type');
  const gramEl = get('ind-' + t + 'Gram');
  if (!typeEl || !gramEl) return;

  const type = typeEl.value;
  gramEl.innerHTML = "";
  if (YEON_PRICE[type]) {
    for (let g in YEON_PRICE[type]) {
      let opt = document.createElement('option');
      opt.value = g;
      opt.innerText = g + "g";
      gramEl.appendChild(opt);
    }
  }
}

// 사이즈 타입 선택 함수
function selectSizeType(type) {
  const standardBtn = get('size-type-standard');
  const customBtn = get('size-type-custom');
  const standardContainer = get('size-standard-container');
  const customContainer = get('size-custom-container');

  if (type === 'standard') {
    standardBtn.style.background = '#1f2937';
    standardBtn.style.color = '#fff';
    customBtn.style.background = '#f3f4f6';
    customBtn.style.color = '#64748b';
    standardContainer.style.display = 'block';
    customContainer.style.display = 'none';
    // 규격사이즈 선택 시 값 업데이트
    updateSizeFromStandard();
  } else {
    standardBtn.style.background = '#f3f4f6';
    standardBtn.style.color = '#64748b';
    customBtn.style.background = '#1f2937';
    customBtn.style.color = '#fff';
    standardContainer.style.display = 'none';
    customContainer.style.display = 'block';
  }
}

// 규격사이즈 선택 시 가로×세로 값 업데이트
function updateSizeFromStandard() {
  const standardSelect = get('ind-bookSize-standard');
  if (!standardSelect) return;

  const selectedValue = standardSelect.value;
  const cuttingContainer = get('size-cutting-container');

  if (selectedValue === 'custom') {
    // 사이즈입력 선택 시 재단사이즈 입력 필드 활성화
    if (cuttingContainer) {
      cuttingContainer.style.display = 'flex';
    }
    const widthInput = get('ind-size-width');
    const heightInput = get('ind-size-height');
    if (widthInput && heightInput) {
      widthInput.value = '';
      heightInput.value = '';
      widthInput.focus();
    }
  } else {
    // 표준 사이즈 선택 시 값 자동 입력
    const [width, height] = selectedValue.split('×').map(v => parseInt(v));

    const widthInput = get('ind-size-width');
    const heightInput = get('ind-size-height');
    const workingWidthInput = get('ind-size-working-width');
    const workingHeightInput = get('ind-size-working-height');

    if (widthInput && heightInput) {
      widthInput.value = width;
      heightInput.value = height;
    }

    // 작업사이즈는 재단사이즈보다 약간 크게 설정 (기본 +4mm)
    if (workingWidthInput && workingHeightInput) {
      workingWidthInput.value = width + 4;
      workingHeightInput.value = height + 4;
    }

    // 재단사이즈 컨테이너는 표시
    if (cuttingContainer) {
      cuttingContainer.style.display = 'flex';
    }
  }
}

// 수량 변경 함수
function changeQty(delta) {
  const qtyInput = get('ind-qty');
  if (!qtyInput) return;

  const currentQty = parseInt(qtyInput.value) || 0;
  const newQty = Math.max(0, currentQty + delta);
  qtyInput.value = newQty;
}

// 빠른 수량 추가 함수
function quickAddQty(amount) {
  const qtyInput = get('ind-qty');
  if (!qtyInput) return;

  const currentQty = parseInt(qtyInput.value) || 0;
  qtyInput.value = currentQty + amount;
}

// 계산 함수
function calculateIndigo() {
  // 재단사이즈 또는 작업사이즈 선택 확인
  const sizeType = document.querySelector('input[name="size-type"]:checked');
  let width, height;

  if (sizeType && sizeType.value === 'working') {
    // 작업사이즈 사용
    width = parseInt(get('ind-size-working-width').value) || 0;
    height = parseInt(get('ind-size-working-height').value) || 0;
  } else {
    // 재단사이즈 사용 (기본)
    width = parseInt(get('ind-size-width').value) || 0;
    height = parseInt(get('ind-size-height').value) || 0;
  }

  if (!width || !height) {
    toast('가로와 세로 사이즈를 입력해주세요.');
    return;
  }

  // 표준 사이즈 판단 (mm 기준)
  let size = '';
  if (width === 210 && height === 297) size = 'A4';
  else if (width === 148 && height === 210) size = 'A5';
  else if (width === 182 && height === 257) size = 'B5';
  else {
    // 비표준 사이즈인 경우 가로 기준으로 가장 가까운 사이즈 선택
    if (width <= 160) size = 'A5';
    else if (width <= 200) size = 'B5';
    else size = 'A4';
  }

  const qty = parseInt(get('ind-qty').value) || 0;
  const margin = parseInt(get('ind-margin').value) || 0;

  if (currentQuoteMode.startsWith('flyer')) {
    calculateFlyer(size, qty, margin, width, height);
  } else {
    calculateBook(size, qty, margin, width, height);
  }
}

// 전단지 계산
function calculateFlyer(size, qty, margin, width, height) {
  const inType = get('ind-innerType').value;
  const inGram = get('ind-innerGram').value;
  if (!YEON_PRICE[inType] || !YEON_PRICE[inType][inGram]) {
    toast('종이 종류와 평량을 선택해주세요.');
    return;
  }
  const inPrice = YEON_PRICE[inType][inGram];

  // 전단지 모드에서는 인쇄 상세 드롭다운에서 단면/양면 및 색상 정보 가져오기
  let isDouble = true; // 기본값 양면
  let inColor = 'color'; // 기본값 컬러
  const innerPrintSelect = get('ind-innerPrint-select');
  if (innerPrintSelect) {
    const printValue = innerPrintSelect.value;
    // "2-color" 형식에서 첫 번째 숫자가 2면 양면, 1이면 단면
    const [printType, colorType] = printValue.split('-');
    isDouble = (printType === '2');
    inColor = colorType || 'color';
  } else {
    // 드롭다운이 없으면 라디오 버튼에서 가져오기 (하위 호환)
    inColor = getRadio('ind-innerColor') || 'color';
    // 드롭다운이 없으면 양면으로 기본값 설정
    isDouble = true;
  }

  let yieldSmall = 0;
  let yieldLarge = 0;

  if (size === 'A4') {
    yieldSmall = 2;
    yieldLarge = 8;
  } else if (size === 'A5') {
    yieldSmall = 4;
    yieldLarge = 16;
  } else if (size === 'B5') {
    yieldSmall = 2;
    yieldLarge = 8;
  }

  let pPaper = 0,
    pPrint = 0,
    pPlate = 0;

  if (currentQuoteMode === 'flyer_small') {
    const sheetsA3 = Math.ceil(qty / yieldSmall);
    const priceA3 = inPrice / 2000;
    pPaper = Math.round(sheetsA3 * priceA3);

    const clickUnit = INDIGO_CLICK[inColor];
    const finalClick = isDouble ? clickUnit : (clickUnit / 2);
    pPrint = sheetsA3 * finalClick;
  } else {
    // [대량 전단지 옵셋] - 여분 100장 추가
    const plateUnit = size.startsWith('B') ? 8000 : 11000;
    const plates = (inColor === 'color' ? 4 : 1) * (isDouble ? 2 : 1);
    pPlate = plates * plateUnit;

    const sheetsFull = Math.ceil(qty / yieldLarge) + 100; // ← 여분 100장 추가
    const yeon = sheetsFull / 500;
    pPaper = Math.round(yeon * inPrice);

    const degrees = (inColor === 'color' ? 4 : 1) * (isDouble ? 2 : 1);
    const printYeon = Math.max(1, yeon);
    pPrint = Math.round(printYeon * degrees * OFFSET_PRICE_PER_COLOR);
  }

  // 배송비 계산 추가
  const ship = calculateShipping_111(qty, size, 0, 0, parseInt(inGram), true);
  
  const totalRaw = pPaper + pPrint + pPlate + ship.cost;
  const totalMargin = totalRaw * (1 + margin / 100);
  const vat = totalMargin * 0.1;
  const final = Math.floor((totalMargin + vat) / 10) * 10;
  const perUnit = Math.round(final / qty);

  // 결과 표시
  updateSummaryCategoryLabel();
  get('sum-qty').textContent = qty + '장';
  get('sum-supply').textContent = comma(Math.round(totalMargin)) + '원';
  get('sum-vat').textContent = comma(Math.round(vat)) + '원';
  get('sum-ship').textContent = comma(ship.cost) + '원';
  get('sum-total').textContent = comma(final) + '원';
}

// 책자 계산
function calculateBook(size, qty, margin, width, height) {
  const innerPages = parseInt(get('ind-innerPages').value) || 0;
  const cvType = get('ind-coverType').value;
  const cvGram = get('ind-coverGram').value;
  const inType = get('ind-innerType').value;
  const inGram = get('ind-innerGram').value;

  if (!YEON_PRICE[cvType] || !YEON_PRICE[cvType][cvGram]) {
    toast('표지 종이 종류와 평량을 선택해주세요.');
    return;
  }
  if (!YEON_PRICE[inType] || !YEON_PRICE[inType][inGram]) {
    toast('내지 종이 종류와 평량을 선택해주세요.');
    return;
  }

  const cvPrice = YEON_PRICE[cvType][cvGram];
  const inPrice = YEON_PRICE[inType][inGram];
  const bindType = window.currentBindType || getRadio('ind-bind') || 'perfect';
  
  // 코팅 값 가져오기
  let coating = '0';
  const coatingSelect = get('ind-coating-select');
  if (coatingSelect) {
    coating = coatingSelect.value === '0' ? '0' : '1';
  } else {
    coating = getRadio('ind-coat') || '0';
  }
  
  const cvColor = getRadio('ind-coverColor') || 'color';
  const inColor = getRadio('ind-innerColor') || 'color';

  // 표지 페이지 (2p 또는 4p) 결정: 인쇄 상세 드롭다운에서 파싱
  let coverPage = 4; // 기본값 4p (양면)
  const coverPrintSelect = get('ind-coverPrint-select');
  if (coverPrintSelect) {
    const printValue = coverPrintSelect.value; // "2-color", "1-color" 등
    const [printType] = printValue.split('-');
    coverPage = (printType === '2') ? 4 : 2; // 2면=4p, 1면=2p
  }

  let cvP = 0, cvPr = 0, cvPl = 0, cvC = 0;
  let inP = 0, inPr = 0, inPl = 0;
  let bind = 0;

  if (currentQuoteMode === 'book_offset') {
    // [대량 책자 옵셋]
    const pagesPerForm = (size === 'A5') ? 32 : 16;
    const plateUnit = (size === 'B5') ? 8000 : 11000;
    
    // 제철 조건: 중철 + 표지/내지 종이&평량 동일
    const isSelfCover = (bindType === 'staple' && cvType === inType && cvGram === inGram);

    if (isSelfCover) {
      // [제철] 표지를 내지에 합산
      if (coating !== 'none' && coating !== '0') cvC = (qty <= 500) ? 45000 : 80000;
      
      const totalPages = innerPages + coverPage; // 4p 또는 2p 추가
      const daesu = Math.ceil((totalPages / pagesPerForm) * 2) / 2;
      const totalSheets = (daesu * qty) + (daesu * 100); // ← 여분 100장 추가
      const yeon = totalSheets / 500;
      
      const plates = Math.ceil(daesu * (inColor === 'color' ? 8 : 2));
      inPl = plates * plateUnit;
      inP = Math.round(yeon * inPrice);
      inPr = Math.round(Math.max(1, yeon) * (inColor === 'color' ? 8 : 2) * OFFSET_PRICE_PER_COLOR);
      
    } else {
      // [표지 별도]
      const cvPlates = (cvColor === 'color') ? 4 : 1;
      cvPl = cvPlates * 8000;
      
      const coversPerSheet = (size === 'A5') ? 4 : 2;
      const cvSheetsFull = (qty / coversPerSheet) + 100; // ← 여분 100장
      const cvYeon = cvSheetsFull / 500;
      cvP = Math.round(cvYeon * (cvPrice / 2));
      
      // 인쇄비: 2p면 단면(1배), 4p면 양면(2배)
      const printSideFactor = (coverPage === 4) ? 2 : 1;
      const printDegrees = cvPlates * printSideFactor;
      cvPr = Math.round(Math.max(1, cvYeon) * printDegrees * OFFSET_PRICE_PER_COLOR);
      
      if (coating !== 'none' && coating !== '0') cvC = (qty <= 500) ? 45000 : 80000;

      // 내지
      const daesu = Math.ceil((innerPages / pagesPerForm) * 2) / 2;
      const inSheetsTotal = (daesu * qty) + (daesu * 100); // ← 여분 100장
      const yeon = inSheetsTotal / 500;
      
      inPl = Math.ceil(daesu * (inColor === 'color' ? 8 : 2)) * plateUnit;
      inP = Math.round(yeon * inPrice);
      inPr = Math.round(Math.max(1, yeon) * (inColor === 'color' ? 8 : 2) * OFFSET_PRICE_PER_COLOR);
    }
    bind = 50000 + (qty * 300);
    
  } else {
    // [소량 책자 - 인디고/디지털]
    const cvSheet = cvPrice / 2000;
    cvP = Math.round(qty * cvSheet);
    
    const cClick = (currentQuoteMode === 'book_digital' || cvColor === 'color') ? INDIGO_CLICK.color : INDIGO_CLICK.mono;
    // 표지 인쇄비: 2p면 절반, 4p면 전체
    const finalClick = (coverPage === 4) ? cClick : (cClick / 2);
    cvPr = qty * finalClick;
    
    if (coating !== 'none' && coating !== '0') cvC = qty * 300;

    const inSheet = inPrice / 2000;
    const factor = (size === 'A5') ? 8 : 4;
    const sheets = Math.ceil(innerPages / factor) * qty;
    inP = Math.round(sheets * inSheet);
    
    let iClick = (currentQuoteMode === 'book_digital') ? DIGITAL_CLICK : INDIGO_CLICK[inColor];
    inPr = sheets * iClick;
    bind = qty * (bindType === 'staple' ? 200 : 400);
  }

  // 배송비 계산 추가
  const ship = calculateShipping_111(qty, size, innerPages, parseInt(cvGram), parseInt(inGram), false);
  
  const totalRaw = cvP + cvPr + cvPl + cvC + inP + inPr + inPl + bind + ship.cost;
  const totalMargin = totalRaw * (1 + margin / 100);
  const vat = totalMargin * 0.1;
  const final = Math.floor((totalMargin + vat) / 10) * 10;
  const perUnit = Math.round(final / qty);

  // 결과 표시
  const selectedBindType = window.currentBindType || getRadio('ind-bind') || 'perfect';
  window.currentBindType = selectedBindType; // keep 글로벌 상태 최신
  const sumCatEl = get('sum-cat');
  if (sumCatEl) sumCatEl.textContent = buildSummaryCategoryLabel();
  get('sum-qty').textContent = qty + '권';
  get('sum-supply').textContent = comma(Math.round(totalMargin)) + '원';
  get('sum-vat').textContent = comma(Math.round(vat)) + '원';
  get('sum-ship').textContent = comma(ship.cost) + '원';
  get('sum-total').textContent = comma(final) + '원';
}

// 전단지 라디오 버튼도 스타일 처리
document.addEventListener('DOMContentLoaded', function() {
  // 사이즈 초기화
  if (get('ind-bookSize-standard')) {
    updateSizeFromStandard();
  }

  // 재단사이즈 입력 시 작업사이즈 자동 계산
  const widthInput = get('ind-size-width');
  const heightInput = get('ind-size-height');
  if (widthInput && heightInput) {
    widthInput.addEventListener('input', function() {
      updateWorkingSize();
    });
    heightInput.addEventListener('input', function() {
      updateWorkingSize();
    });
  }

  function updateWorkingSize() {
    const width = parseInt(get('ind-size-width').value) || 0;
    const height = parseInt(get('ind-size-height').value) || 0;
    const workingWidthInput = get('ind-size-working-width');
    const workingHeightInput = get('ind-size-working-height');
    if (workingWidthInput && workingHeightInput && width > 0 && height > 0) {
      workingWidthInput.value = width + 4;
      workingHeightInput.value = height + 4;
    }
  }

  // 종이 초기화
  if (get('ind-coverType')) {
    initIndPaper();
    initPaper_111(); // 111.html 종이 데이터 초기화
    // 탭이 없으므로 null 전달
    if (typeof setQuoteMode === 'function') {
      setQuoteMode('book_indigo', null);
    }
    // 제본에 따른 페이지 제한 적용
    updateInnerPagesByBinding();
    // 책자 기본 용지 설정
    setDefaultBookPapers();
  }
  
  // 초기 카테고리 마진율 설정 (기본: indigo)
  if (typeof contentDB !== 'undefined') {
    const defaultCat = window.currentCategory || 'indigo';
    if (contentDB[defaultCat] && contentDB[defaultCat].margin !== undefined) {
      const marginInput = get('ind-margin');
      if (marginInput) {
        marginInput.value = contentDB[defaultCat].margin;
      }
    }
  }
});
// [추가] 제본 방식(중철/무선) 라디오 버튼 클릭 시 즉시 화면 갱신 이벤트
document.addEventListener('DOMContentLoaded', function() {
  const bindRadios = document.querySelectorAll('input[name="ind-bind"]');
  bindRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      // 1. 현재 선택된 방식 전역 변수에 저장
      window.currentBindType = this.value; 

      // 요약서 카테고리 라벨 즉시 반영
      updateSummaryCategoryLabel();
      
      // 2. 현재 카테고리 확인
      const currentCat = window.currentCategory || 'indigo';
      
      // 3. 제목 변경 (예: 소량 인디고 - 무선)
      const titles = { indigo: '소량 인디고', digital: '흑백 디지털', offset: '대량 옵셋' };
      const bindNames = { staple: '중철', perfect: '무선' };
      const titleEl = document.getElementById('quote-title');
      if (titleEl && titles[currentCat]) {
          titleEl.textContent = `${titles[currentCat]} - ${bindNames[this.value]}`;
      }

      // 4. 상세페이지/이미지/가이드 내용 즉시 교체
      if (typeof applyContentToDetailTabs === 'function') {
          applyContentToDetailTabs(currentCat);
      }

      // 5. 제본별 페이지 제한 동기화
      if (typeof updateInnerPagesByBinding === 'function') {
        updateInnerPagesByBinding();
      }
      
      // 5. 가격 재계산 (기존 기능 유지)
      if (typeof calculateIndigo === 'function') {
          calculateIndigo();
      }
    });
  });
});

// ===== 팝업 공지 관리 =====
let popupNoticeCache = [];

async function loadAdminPopupNotices() {
  try {
    const response = await apiCall('/api/admin/popup-notice', { method: 'GET' });
    const result = await response.json();
    console.log('팝업 공지 목록 로드:', result);
    
    // API 응답 형식: {success: true, popup_notices: [...]}
    popupNoticeCache = result.popup_notices || [];
    renderPopupNoticeList();
    resetPopupForm();
  } catch(err) {
    console.error('Failed to load popup notices:', err);
    toast('팝업 공지 로드 실패');
  }
}

function renderPopupNoticeList() {
  const listEl = get('admin-popup-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!popupNoticeCache || popupNoticeCache.length === 0) {
    listEl.innerHTML = '<div style="padding:12px; color:#64748b; font-size:12px;">팝업 없음</div>';
    return;
  }
  popupNoticeCache.forEach(popup => {
    const item = document.createElement('div');
    item.style.border = '1px solid var(--line)';
    item.style.borderRadius = '8px';
    item.style.padding = '8px';
    item.style.cursor = 'pointer';
    item.style.background = popup.is_active ? '#ecfdf5' : '#f1f5f9';
    const status = popup.is_active ? '🟢' : '⚫';
    item.innerHTML = `<div style="font-weight:700; font-size:12px; color:#0f172a;">${status} ${popup.title || '제목없음'}</div><div style="font-size:11px; color:#94a3b8; margin-top:3px;">${formatDate(popup.created_at)}</div>`;
    item.onclick = () => fillPopupForm(popup);
    listEl.appendChild(item);
  });
}

function fillPopupForm(popup) {
  get('popup-id').value = popup.id;
  get('popup-title').value = popup.title || '';
  get('popup-image').value = popup.image_path || '';
  get('popup-badge').value = popup.badge || '';
  get('popup-content').value = popup.content || '';
  get('popup-active').checked = popup.is_active;
  // 이미지 미리보기 업데이트
  const preview = get('popup-image-preview');
  if (popup.image_path) {
    preview.src = popup.image_path;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

function resetPopupForm() {
  get('popup-id').value = '';
  get('popup-title').value = '';
  get('popup-image').value = '';
  get('popup-badge').value = '';
  get('popup-content').value = '';
  get('popup-active').checked = true;
  get('popup-image-preview').style.display = 'none';
}

function previewPopupImage() {
  const imagePath = get('popup-image').value;
  const preview = get('popup-image-preview');
  if (imagePath) {
    preview.src = imagePath;
    preview.style.display = 'block';
    preview.onerror = () => {
      toast('이미지를 불러올 수 없습니다.');
      preview.style.display = 'none';
    };
  }
}

async function uploadPopupImage() {
  const fileInput = get('popup-image-file');
  const file = fileInput.files[0];
  
  if (!file) {
    toast('파일을 선택해주세요');
    return;
  }
  
  // 파일 크기 확인 (5MB 제한)
  if (file.size > 5 * 1024 * 1024) {
    toast('파일 크기는 5MB 이하여야 합니다');
    return;
  }
  
  // 이미지 파일 확인
  if (!file.type.startsWith('image/')) {
    toast('이미지 파일만 업로드 가능합니다');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const token = getToken();
    const response = await fetch('/api/upload-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('이미지 업로드 성공:', result);
      
      // 경로 자동 입력
      get('popup-image').value = result.path;
      
      // 미리보기 자동 표시
      const preview = get('popup-image-preview');
      preview.src = result.path;
      preview.style.display = 'block';
      
      toast('이미지 업로드 완료');
    } else {
      const error = await response.json();
      toast('업로드 실패: ' + (error.message || response.statusText));
    }
  } catch(err) {
    console.error('Failed to upload image:', err);
    toast('업로드 중 오류 발생');
  }
}

async function savePopupNotice() {
  const title = get('popup-title').value.trim();
  const imagePath = get('popup-image').value.trim();
  const badge = get('popup-badge').value.trim();
  const content = get('popup-content').value.trim();
  const isActive = get('popup-active').checked;
  
  console.log('팝업 공지 저장 시작:', { title, imagePath, badge, content, isActive });
  
  if (!title) {
    toast('제목을 입력하세요');
    return;
  }
  if (!imagePath) {
    toast('이미지 경로를 입력하세요');
    return;
  }
  
  const popupId = get('popup-id').value;
  const url = popupId ? `/api/admin/popup-notice/${popupId}` : '/api/admin/popup-notice';
  const method = popupId ? 'PUT' : 'POST';
  
  const data = {
    title,
    image_path: imagePath,
    badge,
    content,
    is_active: isActive
  };
  
  console.log('API 요청:', method, url, data);
  
  try {
    const response = await apiCall(url, {
      method,
      body: JSON.stringify(data)
    });
    
    console.log('API 응답 상태:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('API 응답 데이터:', result);
      toast(popupId ? '팝업 공지 수정됨' : '팝업 공지 생성됨');
      loadAdminPopupNotices();
    } else {
      const errorText = await response.text();
      console.error('API 에러 응답:', response.status, errorText);
      toast('저장 실패: ' + (errorText || response.statusText));
    }
  } catch(err) {
    console.error('Failed to save popup notice:', err);
    toast('저장 중 오류 발생: ' + err.message);
  }
}

async function deletePopupNotice() {
  const popupId = get('popup-id').value;
  if (!popupId) {
    toast('삭제할 팝업을 선택하세요');
    return;
  }
  if (!confirm('정말 삭제하시겠습니까?')) return;
  
  try {
    const response = await apiCall(`/api/admin/popup-notice/${popupId}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      toast('팝업 공지 삭제됨');
      loadAdminPopupNotices();
    } else {
      toast('삭제 실패');
    }
  } catch(err) {
    console.error('Failed to delete popup notice:', err);
    toast('삭제 중 오류 발생');
  }
}

// ===== 팝업 공지 홈페이지 표시 =====
const POPUP_NOTICE_HIDE_KEY = 'popup-notice-hide-date';
const POPUP_SHOWN_IDS_KEY = 'popup-shown-ids'; // 오늘 본 팝업 ID 목록
let allPopups = [];
let currentPopupIndex = 0;

async function loadAndShowPopupNotice() {
  try {
    console.log('========== 팝업 공지 로드 시작 ==========');
    
    // 오늘 숨기기 설정 확인
    const hideDate = localStorage.getItem(POPUP_NOTICE_HIDE_KEY);
    const today = new Date().toISOString().split('T')[0];
    console.log('오늘 날짜:', today);
    
    if (hideDate === today) {
      console.log('❌ 오늘은 팝업 표시 안함');
      return;
    }
    
    console.log('📡 API 호출: /api/popup-notice-list');
    const response = await apiCall('/api/popup-notice-list', { method: 'GET' });
    console.log('API 응답 상태:', response.status);
    
    if (!response.ok) {
      console.log('❌ 팝업 없음 - 상태:', response.status);
      return;
    }
    
    const result = await response.json();
    console.log('✅ API 응답:', result);
    
    allPopups = (result.popup_notices || []).filter(p => p.is_active);
    console.log(`활성화된 팝업: ${allPopups.length}개`);
    
    if (allPopups.length === 0) {
      console.log('❌ 활성화된 팝업 없음');
      return;
    }
    
    const shownData = localStorage.getItem(POPUP_SHOWN_IDS_KEY);
    let shownIds = [];
    if (shownData) {
      const parsed = JSON.parse(shownData);
      if (parsed.date === today) {
        shownIds = parsed.ids || [];
      }
    }
    
    allPopups = allPopups.filter(p => !shownIds.includes(p.id));
    console.log(`표시할 팝업: ${allPopups.length}개`);
    
    if (allPopups.length > 0) {
      console.log(`✅ ${allPopups.length}개의 팝업 동시 표시`);
      currentPopupIndex = 0;
      showAllPopups();
    } else {
      console.log('❌ 모든 팝업을 이미 봤음');
    }
  } catch(err) {
    console.error('❌ 에러:', err);
  }
}

function showCurrentPopup() {
  if (currentPopupIndex >= allPopups.length) return;
  const popup = allPopups[currentPopupIndex];
  console.log(`팝업 표시 (${currentPopupIndex + 1}/${allPopups.length}):`, popup);
  showPopupNoticeModal(popup, currentPopupIndex);
  markPopupAsShown(popup.id);
}

function showAllPopups() {
  // 모든 활성 팝업을 동시에 표시
  // 주의: 사용자가 "오늘 더 이상 보지 않기"를 클릭할 때만 저장됨
  if (allPopups.length === 0) return;
  
  console.log(`✅ 팝업 ${allPopups.length}개 동시 표시`);
  allPopups.forEach((popup, index) => {
    createAndShowPopup(popup, index);
  });
}

function createAndShowPopup(popup, index) {
  // 기존 팝업 요소 클론
  const originalModal = get('popup-notice-window');
  const modal = originalModal.cloneNode(true);
  modal.id = `popup-notice-window-${index}`; // 고유 ID 설정
  modal.style.display = 'block';
  modal.style.left = (30 + index * 400) + 'px'; // 왼쪽부터 400px씩 띄어서 배치
  modal.style.right = 'auto';
  // 애니메이션 제거 - 한 번에 나타남
  
  // 자식 요소들 찾기 (ID가 겹칠 수 있으므로 직접 순회)
  const children = modal.querySelectorAll('*');
  let imageEl, titleEl, contentEl, closeBtnEl;
  
  children.forEach(child => {
    if (child.id === 'popup-modal-image') imageEl = child;
    if (child.id === 'popup-modal-title') titleEl = child;
    if (child.id === 'popup-modal-content') contentEl = child;
  });
  
  closeBtnEl = modal.querySelector('button');
  
  // 팝업 콘텐츠 업데이트
  if (imageEl) {
    imageEl.src = popup.image_path;
    // 이미지 로드 후 팝업 크기 조절
    imageEl.onload = function() {
      adjustPopupSize(modal, imageEl);
    };
  }
  if (titleEl) titleEl.textContent = popup.title || '';
  if (contentEl) contentEl.textContent = popup.content || '';
  
  // 배지는 사용하지 않음
  
  // 닫기 버튼 (모든 닫기 버튼에 이벤트 바인딩)
  const closeButtons = modal.querySelectorAll('.popup-close-btn');
  closeButtons.forEach(btn => {
    btn.dataset.popupId = `popup-notice-window-${index}`;
    btn.onclick = function() {
      closeSpecificPopup(this.dataset.popupId);
    };
  });
  
  // DOM에 추가
  document.body.appendChild(modal);
  console.log(`✅ 팝업 #${index + 1} 생성: ${popup.title}`);
  
  // 클론된 팝업에 드래그 기능 적용
  enablePopupDrag(modal);
}

function closeSpecificPopup(popupId) {
  const modal = document.getElementById(popupId);
  if (!modal) return;
  
  // "오늘 더 이상 보지 않기" 체크박스 확인
  const hideCheckbox = modal.querySelector('#popup-hide-today-check');
  if (hideCheckbox && hideCheckbox.checked) {
    // 오늘은 팝업을 더 이상 보지 않도록 설정
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(POPUP_NOTICE_HIDE_KEY, today);
    console.log('✅ 오늘은 더 이상 팝업을 표시하지 않습니다');
  }
  
  // 애니메이션 없이 즉시 제거
  modal.remove();
}

function adjustPopupSize(popupElement, imageElement) {
  // 이미지의 원본 크기 가져오기
  const imgWidth = imageElement.naturalWidth;
  const imgHeight = imageElement.naturalHeight;
  
  if (imgWidth && imgHeight) {
    // 최소 너비 300px, 최대 너비 500px으로 이미지 크기에 맞게 조절
    let width = Math.min(Math.max(300, imgWidth), 500);
    
    // 팝업 너비 설정
    popupElement.style.width = width + 'px';
    console.log(`📐 팝업 크기 조절: ${width}px (이미지: ${imgWidth}px × ${imgHeight}px)`);
    
    // 모든 팝업 위치 재정렬
    repositionPopups();
  }
}

function repositionPopups() {
  // 모든 팝업을 왼쪽부터 차례대로 배치 (겹치지 않도록)
  let leftPosition = 30;
  const popups = Array.from(document.querySelectorAll('[id^="popup-notice-window-"]'));
  
  popups.forEach((popup, index) => {
    popup.style.left = leftPosition + 'px';
    // 다음 팝업을 위해 현재 팝업의 너비 + 간격(20px)만큼 더함
    leftPosition += popup.offsetWidth + 20;
  });
  
  console.log(`📍 팝업들 재정렬 완료: 총 ${popups.length}개`);
}

function markPopupAsShown(popupId) {
  const today = new Date().toISOString().split('T')[0];
  const shownData = localStorage.getItem(POPUP_SHOWN_IDS_KEY);
  let shownIds = [];
  if (shownData) {
    const parsed = JSON.parse(shownData);
    if (parsed.date === today) {
      shownIds = parsed.ids || [];
    }
  }
  if (!shownIds.includes(popupId)) shownIds.push(popupId);
  localStorage.setItem(POPUP_SHOWN_IDS_KEY, JSON.stringify({ date: today, ids: shownIds }));
}

function showPopupNoticeModal(popup, index = 0) {
  const modal = get('popup-notice-window');
  get('popup-modal-image').src = popup.image_path;
  get('popup-modal-title').textContent = popup.title || '';
  get('popup-modal-content').textContent = popup.content || '';
  // 배지는 표시하지 않음
  
  // 여러 팝업이 있을 때 오른쪽 위치 조정 (각각 30px씩 띄어서 표시)
  const rightPosition = 30 + (index * 40);
  modal.style.right = rightPosition + 'px';
  modal.style.display = 'block';
  modal.style.animation = 'slideInFromLeft 0.4s ease-out';
  
  // 드래그 기능 초기화
  initPopupDrag();
}

function closePopupModal() {
  const modal = get('popup-notice-window');
  const hideCheckbox = get('popup-hide-today-check');
  
  // "오늘 더 이상 보지 않기" 체크되었으면 localStorage에 저장
  if (hideCheckbox && hideCheckbox.checked) {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(POPUP_NOTICE_HIDE_KEY, today);
    modal.style.display = 'none';
    return; // 더 이상 팝업 표시 안함
  }
  
  modal.style.display = 'none';
}

// 팝업 창 드래그 기능
function enablePopupDrag(popupElement) {
  // 클론된 팝업 요소에 드래그 기능 추가
  const header = popupElement.querySelector('[style*="cursor:move"]') || popupElement.querySelector('div[style*="border-bottom"]');
  
  if (!header) return;
  
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  
  header.style.cursor = 'move';
  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  
  function dragStart(e) {
    initialX = e.clientX - popupElement.offsetLeft;
    initialY = e.clientY - popupElement.offsetTop;
    isDragging = true;
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    // 화면 밖으로 나가지 않도록 제한
    const maxX = window.innerWidth - popupElement.offsetWidth;
    const maxY = window.innerHeight - popupElement.offsetHeight;
    
    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));
    
    popupElement.style.left = currentX + 'px';
    popupElement.style.top = currentY + 'px';
    popupElement.style.right = 'auto';
  }
  
  function dragEnd(e) {
    isDragging = false;
  }
}

function initPopupDrag() {
  const popup = get('popup-notice-window');
  const header = get('popup-notice-header');
  
  if (!popup || !header) return;
  
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  
  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  
  function dragStart(e) {
    initialX = e.clientX - popup.offsetLeft;
    initialY = e.clientY - popup.offsetTop;
    isDragging = true;
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    // 화면 밖으로 나가지 않도록 제한
    const maxX = window.innerWidth - popup.offsetWidth;
    const maxY = window.innerHeight - popup.offsetHeight;
    
    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));
    
    popup.style.left = currentX + 'px';
    popup.style.top = currentY + 'px';
    popup.style.right = 'auto'; // right 속성 제거
  }
  
  function dragEnd(e) {
    isDragging = false;
  }
}

// ==========================================
// 111.html 통합 견적 계산 로직 시작
// ==========================================

// 상수 정의
const BOX_PRICE_111 = 4000; 
const BOX_A4_111 = { name: "A4박스", w: 315, l: 220, h: 270, maxKg: 20 };
const BOX_A3_111 = { name: "A3박스", w: 450, l: 305, h: 210, maxKg: 20 };

const THICKNESS_DB_111 = {
    80: 0.09, 100: 0.105, 120: 0.13, 150: 0.16, 
    180: 0.19, 200: 0.21, 250: 0.26, 300: 0.31
};

const YEON_PRICE_DB_111 = {
    "모조지": { "80": { "4x6": 73060, "kook": 50750 }, "100": { "4x6": 90530, "kook": 62920 }, "120": { "4x6": 108620, "kook": 75460 }, "150": { "4x6": 135780, "kook": 94320 } },
    "미색모조지": { "80": { "4x6": 75250, "kook": 52270 }, "100": { "4x6": 93280, "kook": 64790 } },
    "플러스지백색": { "80": { "4x6": 75250, "kook": 57270 }, "100": { "4x6": 93240, "kook": 64790 } },
    "플러스지미색": { "80": { "4x6": 77510, "kook": 53840 }, "100": { "4x6": 96030, "kook": 66700 } },
    "하이플러스연미": { "90": { "4x6": 88550, "kook": 61500 } },
    "아트지": { "100": { "4x6": 90040, "kook": 62590 }, "120": { "4x6": 108030, "kook": 75040 }, "150": { "4x6": 137400, "kook": 95480 }, "180": { "4x6": 164890, "kook": 114540 }, "200": { "4x6": 183190, "kook": 127270 }, "250": { "4x6": 228980, "kook": 159070 } },
    "스노우지": { "100": { "4x6": 90040, "kook": 62590 }, "120": { "4x6": 108030, "kook": 75040 }, "150": { "4x6": 137400, "kook": 95480 }, "180": { "4x6": 164890, "kook": 114540 }, "200": { "4x6": 183190, "kook": 127270 }, "250": { "4x6": 228980, "kook": 159070 } },
    "아르떼": { "105": { "4x6": 171600, "kook": 119200 }, "130": { "4x6": 212400, "kook": 147600 }, "160": { "4x6": 261800, "kook": 181600 }, "190": { "4x6": 310400, "kook": 215600 }, "210": { "4x6": 343200, "kook": 238700 }, "230": { "4x6": 376200, "kook": 261000 } }
};

const OFFSET_PRICE_PER_COLOR_111 = 8000; 
const INDIGO_CLICK_111 = { color: 200, mono: 40 }; 
const DIGITAL_CLICK_111 = 20;

let currentMode_111 = 'book_indigo';
let quoteDetailInfo_111 = {}; // 상세 계산 정보 저장

function comma_111(num) { return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

function initPaper_111() {
    const c = get('ind-coverType');
    const i = get('ind-innerType');
    if (!c || !i) return;
    
    // 기존 옵션 초기화
    c.innerHTML = '';
    i.innerHTML = '';
    
    for(let k in YEON_PRICE_DB_111){
        let opt = document.createElement('option'); 
        opt.value = k; 
        opt.innerText = k;
        c.appendChild(opt.cloneNode(true));
        i.appendChild(opt.cloneNode(true));
    }
    updateGram_111('cover'); 
    updateGram_111('inner');
}

function updateGram_111(t) {
    const typeEl = get('ind-' + t + 'Type');
    const gramEl = get('ind-' + t + 'Gram');
    if (!typeEl || !gramEl) return;
    
    const type = typeEl.value;
    gramEl.innerHTML = "";
    
    if (YEON_PRICE_DB_111[type]) {
        for(let g in YEON_PRICE_DB_111[type]){
            let opt = document.createElement('option'); 
            opt.value = g; 
            opt.innerText = g + "g";
            gramEl.appendChild(opt);
        }
    }
}

function getPaperPrice_111(paperType, gram, size) {
    if (!YEON_PRICE_DB_111[paperType] || !YEON_PRICE_DB_111[paperType][gram]) return 0;
    const is4x6 = false; 
    const priceObj = YEON_PRICE_DB_111[paperType][gram];
    return is4x6 ? priceObj["4x6"] : priceObj["kook"];
}

function getThicknessByGram_111(gram) {
    if (THICKNESS_DB_111[gram]) return THICKNESS_DB_111[gram];
    return gram * 0.0011; 
}

function calculateShipping_111(qty, size, pages, cvGram, inGram, isFlyer) {
    let wMM=210, hMM=297; 
    if(size==='A5') { wMM=148; hMM=210; }
    else if(size==='B5') { wMM=182; hMM=257; }
    
    const area = (wMM/1000) * (hMM/1000);
    let singleWeight = 0; 
    let singleThick = 0; 

    if(isFlyer) {
        singleWeight = area * inGram;
        singleThick = getThicknessByGram_111(inGram);
    } else {
        const inSheets = Math.ceil(pages / 2);
        singleWeight += area * inGram * inSheets;
        singleThick += getThicknessByGram_111(inGram) * inSheets;

        const cvPages = parseInt(document.getElementById('ind-coverPages')?.value || 4);
        const cvSheets = Math.ceil(cvPages / 2);
        singleWeight += (area * 2) * cvGram * cvSheets; 
        singleThick += getThicknessByGram_111(cvGram) * cvSheets; 
    }

    let box = isFlyer ? BOX_A3_111 : BOX_A4_111;
    let booksPerLayer = 1;
    if(!isFlyer && size==='A5') booksPerLayer = 2; 
    if(isFlyer && size==='A4') booksPerLayer = 2;
    if(isFlyer && size==='A5') booksPerLayer = 4;

    const booksPerStack = Math.floor(box.h / singleThick);
    let maxBooksByVol = booksPerStack * booksPerLayer;
    if(maxBooksByVol < 1) maxBooksByVol = 1; 

    const maxBooksByWeight = Math.floor((box.maxKg * 1000) / singleWeight);
    const countPerBox = Math.min(maxBooksByVol, maxBooksByWeight);
    const totalBoxes = Math.ceil(qty / countPerBox);
    const totalShipCost = totalBoxes * BOX_PRICE_111;

    return { cost: totalShipCost, boxes: totalBoxes, boxName: box.name };
}

function calculateQuoteDetails_111(size, qty, innerPages, cvGram, inGram, cvType, inType, cvDetail, inDetail, bindType, coating, currentMode, margin) {
    // 상세 계산 정보 객체 반환
    const inPrice = getPaperPrice_111(inType, inGram, size);
    const cvPrice = getPaperPrice_111(cvType, cvGram, size);
    
    const cvColor = cvDetail.includes('color') ? 'color' : 'mono';
    const cvSide = cvDetail.includes('double') ? 'double' : 'single';
    const inSide = inDetail.includes('double') ? 'double' : 'single';
    const inColorVal = inDetail.includes('color') ? 'color' : 'mono';
    
    let details = {
        mode: currentMode,
        size: size,
        qty: qty,
        paperTypes: {
            cover: { type: cvType, gram: cvGram, side: cvSide, color: cvColor },
            inner: { type: inType, gram: inGram, side: inSide, color: inColorVal }
        },
        bindType: bindType,
        coating: coating,
        margin: margin
    };

    if (currentMode === 'book_offset') {
        const plateUnit = 11000;
        let cvC = 0;
        
        if(coating!=='none') {
            if(qty <= 500) cvC = 45000;
            else if(qty <= 1000) cvC = 80000;
            else if(qty <= 1500) cvC = 120000;
            else if(qty <= 2000) cvC = 155000;
            else cvC = 155000 + (Math.ceil((qty-2000)/500) * 35000); 
        }

        let itemsPerSheet = (size === 'A5') ? 4 : 2; 
        let netSheets2Jeol = Math.ceil(qty / itemsPerSheet); 
        let totalSheets2Jeol = netSheets2Jeol + 130; 
        
        let cvYeon = totalSheets2Jeol / 1000; 
        let cvP = Math.round(cvYeon * cvPrice);
        const cvPlateCount = (cvSide==='double') ? 8 : 4; 
        let cvPl = cvPlateCount * 8000; 
        const printDegrees = (cvSide==='double') ? 8 : 4; 
        const cvPrintYeon = Math.max(1, cvYeon);
        let cvPr = Math.round(cvPrintYeon * printDegrees * OFFSET_PRICE_PER_COLOR_111);

        let pagesPerForm = (size === 'A5') ? 32 : 16; 
        const daesu = Math.ceil((innerPages/pagesPerForm)*2)/2;
        
        const inSheetsTotal = (daesu * qty) + (daesu * 130);
        const yeon = inSheetsTotal / 500;
        
        const plateCountPerDaesu = (inColorVal==='color'?4:1) * (inSide==='double'?2:1);
        let inPl = Math.ceil(daesu * plateCountPerDaesu) * plateUnit;
        let inP = Math.round(yeon * inPrice);
        let inPr = Math.round(Math.max(1, yeon) * plateCountPerDaesu * OFFSET_PRICE_PER_COLOR_111);

        let bind = 0;
        let bindMsg = "";
        if (bindType === 'perfect') {
            const div = (size === 'A4') ? 4000 : 8000;
            const bindR = Math.ceil((innerPages / 2 * qty) / div);
            if (bindR <= 6) bind = 120000;
            else bind = 120000 + ((bindR - 6) * 20000);
            bindMsg = `제본연수: ${bindR}연`;
        } else {
            bind = 50000 + (qty * 300);
        }

        const ship = calculateShipping_111(qty, size, innerPages, cvGram, inGram, false);

        details.cover = { paper: cvP, print: cvPr, plate: cvPl, coat: cvC, total: cvP+cvPr+cvPl+cvC };
        details.inner = { paper: inP, print: inPr, plate: inPl, total: inP+inPr+inPl, daesu: daesu };
        details.bind = { cost: bind, msg: bindMsg };
        details.shipping = { cost: ship.cost, boxes: ship.boxes, boxName: ship.boxName };
        details.totalRaw = cvP+cvPr+cvPl+cvC + inP+inPr+inPl + bind + ship.cost;
    } else {
        // 인디고/디지털
        const cvSheet = cvPrice/2000; 
        let cvP = Math.round(qty*cvSheet);
        const cClick = (currentMode==='book_digital'||cvColor==='color')?INDIGO_CLICK_111.color : INDIGO_CLICK_111.mono;
        const finalClick = (cvSide === 'double') ? cClick : (cClick/2); 
        let cvPr = qty * finalClick;
        let cvC = 0;
        if(coating!=='none') cvC = qty*300;

        const inSheet = inPrice/2000;
        let factor = (size==='A5')?8:4; 
        if(inSide === 'single') factor = factor / 2; 
        const sheets = Math.ceil(innerPages/factor)*qty;
        let inP = Math.round(sheets*inSheet);
        let iClick = (currentMode==='book_digital')?DIGITAL_CLICK_111 : INDIGO_CLICK_111[inColorVal];
        if(inSide === 'single') iClick = iClick / 2; 
        let inPr = sheets * iClick;
        let bind = qty*(bindType==='staple'?200:400);
        let inMsg = `소요장수: ${sheets}장`;

        const ship = calculateShipping_111(qty, size, innerPages, cvGram, inGram, false);

        details.cover = { paper: cvP, print: cvPr, plate: 0, coat: cvC, total: cvP+cvPr+cvC };
        details.inner = { paper: inP, print: inPr, plate: 0, total: inP+inPr, sheets: sheets, msg: inMsg };
        details.bind = { cost: bind };
        details.shipping = { cost: ship.cost, boxes: ship.boxes, boxName: ship.boxName };
        details.totalRaw = cvP+cvPr+cvC + inP+inPr + bind + ship.cost;
    }

    return details;
}

// 견적 계산 및 상세정보 저장 함수
function calculateAndSaveQuoteDetails_111(specs) {
    const size = specs.size || 'A4';
    const qty = parseInt(specs.qty) || 0;
    const margin = parseInt(specs.margin) || 0;
    const innerPages = parseInt(specs.innerPages) || 16;
    const bindType = specs.bindType || 'staple';
    const currentMode = specs.mode || 'book_indigo';
    const coating = specs.coating || 'none';
    const cvType = specs.coverType || '모조지';
    const cvGram = parseInt(specs.coverGram) || 200;
    const cvDetail = specs.coverDetail || 'mono_double';
    const inType = specs.innerType || '모조지';
    const inGram = parseInt(specs.innerGram) || 80;
    const inDetail = specs.innerDetail || 'mono_double';

    // 상세 계산 정보 생성
    const details = calculateQuoteDetails_111(size, qty, innerPages, cvGram, inGram, cvType, inType, cvDetail, inDetail, bindType, coating, currentMode, margin);
    
    // 상세 정보 저장
    quoteDetailInfo_111 = details;
    
    // 최종 가격 계산
    const totalMargin = details.totalRaw * (1 + margin/100);
    const marginAmt = totalMargin - details.totalRaw;
    const vat = totalMargin * 0.1;
    const final = Math.floor((totalMargin+vat)/10)*10;
    const perUnit = Math.round(final/qty);

    details.finalPrice = final;
    details.perUnitPrice = perUnit;
    details.supplyPrice = Math.round(totalMargin);
    details.vat = Math.round(vat);
    details.marginPercent = margin;
    details.marginAmount = Math.round(marginAmt);

    return details;
}

function setBestThumbnails() {
  const fallbackImg = {
    indigo: 'images/1768914051899_20260121_103946.png',
    digital: 'images/KakaoTalk_20260121_094315265_20260121_120308.png',
    offset: 'images/KakaoTalk_20260121_102449905_20260122_120629.png',
    flyer_small: 'images/KakaoTalk_20260121_102449905_20260123_101237.png',
    flyer_large: 'images/KakaoTalk_20260121_102449905_20260123_101237.png'
  };

  const titleMap = {
    indigo: '소량 인디고',
    digital: '흑백 디지털',
    offset: '대량 옵셋',
    flyer_small: '소량 전단',
    flyer_large: '대량 전단'
  };

  document.querySelectorAll('.best-item[data-cat]').forEach(btn => {
    const cat = btn.dataset.cat;
    const imgEl = btn.querySelector('img');
    if (!cat || !imgEl) return;

    const title = titleMap[cat] || '베스트 상품';
    let src = '';

    if (typeof contentDB !== 'undefined' && contentDB[cat] && contentDB[cat].img) {
      const catImg = contentDB[cat].img;
      if (typeof catImg === 'string') {
        src = catImg;
      } else {
        src = catImg.staple || catImg.perfect || Object.values(catImg).find(Boolean) || '';
      }
    }

    if (!src) src = fallbackImg[cat] || imgEl.getAttribute('src') || '';

    if (src) imgEl.src = src;
    imgEl.alt = title;
    btn.setAttribute('aria-label', `${title} 견적 이동`);
  });
}