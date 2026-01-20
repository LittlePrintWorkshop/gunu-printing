function get(id) {
  return document.getElementById(id);
}

// ===== JWT TOKEN MANAGEMENT =====
const TOKEN_KEY = 'auth_token';

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// API 호출 헬퍼 함수
async function apiCall(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // 401 Unauthorized - 토큰 만료 또는 무효
  if (response.status === 401) {
    removeToken();
    localStorage.removeItem(CURRENT_USER_KEY);
    updateNav();
    toast('로그인이 필요합니다.');
    goLogin();
    throw new Error('Unauthorized');
  }
  
  return response;
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

function openNotice(id, navigate = false) {
  const notice = noticeCache.find(n => n.id === id);
  if (!notice) return;
  
  // navigate가 true면 전체 페이지 표시
  if (navigate) {
    hideAll();
    get('view-notice').style.display = 'block';
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
  hideAll();
  get('view-notice').style.display = 'block';
  get('notice-list-mode').style.display = 'block';
  get('notice-detail-mode').style.display = 'none';
  await loadNotices(true);
  renderNoticeList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== COMMON FUNCTIONS =====
function hideAll() {
  ['view-home', 'view-login', 'view-signup', 'view-cart', 'view-cs', 'view-admin', 'view-find', 'view-quotation', 'view-order', 'view-notice'].forEach(id => {
    const el = get(id);
    if (el) el.style.display = 'none';
  });
}

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

function goHome() {
  hideAll();
  get('view-home').style.display = 'block';
  // 모든 카테고리 링크에서 active 클래스 제거
  document.querySelectorAll('.cat-link').forEach(link => {
    link.classList.remove('active');
  });
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function goLogin() {
  hideAll();
  get('view-login').style.display = 'block';
  get('login-id').value = '';
  get('login-pw').value = '';
}

function goSignup() {
  hideAll();
  get('view-signup').style.display = 'block';
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
  hideAll();
  get('view-cart').style.display = 'block';
  renderCartView();
}

function goFindAccount() {
  hideAll();
  get('view-find').style.display = 'block';
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
  hideAll();
  get('view-admin').style.display = 'block';
  get('admin-pw').focus();
}

async function adminLogin() {
  const existing = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null');
  // 이미 관리자 계정으로 로그인되어 있다면 바로 진입
  if (existing && existing.role === 'admin' && getToken()) {
    get('admin-pw').parentElement.parentElement.parentElement.style.display = 'none';
    get('admin-panel').style.display = 'block';
    renderOrderList();
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
    renderOrderList();
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
  slides: ['', '', ''],
  quoteImg: '',
  logo: ''
};

let homepageDB = JSON.parse(localStorage.getItem(HOMEPAGE_DB_KEY) || 'null') || DEFAULT_HOMEPAGE;

function loadAdminHomepage() {
  homepageDB = JSON.parse(localStorage.getItem(HOMEPAGE_DB_KEY) || 'null') || DEFAULT_HOMEPAGE;
  // 슬라이드 프리뷰
  for (let i = 0; i < 3; i++) {
    const p = get('adm-home-slide-' + i + '-preview');
    if (p) p.src = homepageDB.slides && homepageDB.slides[i] ? homepageDB.slides[i] : DEFAULT_HOMEPAGE.slides[i];
  }
  const q = get('adm-home-quote-preview');
  if (q) q.src = homepageDB.quoteImg || DEFAULT_HOMEPAGE.quoteImg;
  const l = get('adm-home-logo-preview');
  if (l) l.src = homepageDB.logo || '';
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
    }
    // 업로드 즉시 저장하여 새로고침 후에도 유지
    localStorage.setItem(HOMEPAGE_DB_KEY, JSON.stringify(homepageDB));
    applyHomepageContent(true);
    toast('이미지 업로드 및 저장 완료');
  } catch (err) {
    console.error(err);
    console.error(err);
    // 업로드 실패 시 data URL로라도 저장해 새로고침에 남도록 처리
    try {
      const dataUrl = await readFileAsDataURL(file);
      if (key === 'slides') {
        homepageDB.slides = homepageDB.slides || [];
        homepageDB.slides[index] = dataUrl;
        const prev = get('adm-home-slide-' + index + '-preview');
        if (prev) prev.src = dataUrl;
      } else if (key === 'quote') {
        homepageDB.quoteImg = dataUrl;
        const prev = get('adm-home-quote-preview');
        if (prev) prev.src = dataUrl;
      } else if (key === 'logo') {
        homepageDB.logo = dataUrl;
        const prev = get('adm-home-logo-preview');
        if (prev) prev.src = dataUrl;
      }
      localStorage.setItem(HOMEPAGE_DB_KEY, JSON.stringify(homepageDB));
      applyHomepageContent(true);
      toast('업로드 서버 오류로 로컬 데이터URL로 저장했습니다.');
    } catch (fallbackErr) {
      console.error('fallback failed', fallbackErr);
      toast(err.message || '업로드 실패');
    }
  }
}

function saveHomepageContent() {
  localStorage.setItem(HOMEPAGE_DB_KEY, JSON.stringify(homepageDB));
  applyHomepageContent();
  alert('홈페이지 컨텐츠가 저장되었습니다.');
}

function applyHomepageContent(preserveAdminOpen) {
  homepageDB = JSON.parse(localStorage.getItem(HOMEPAGE_DB_KEY) || 'null') || homepageDB || DEFAULT_HOMEPAGE;
  // 슬라이더 이미지 적용
  const slidesEls = document.querySelectorAll('#home-slider .home-slide img');
  slidesEls.forEach((img, i) => {
    if (homepageDB.slides && homepageDB.slides[i]) img.src = homepageDB.slides[i];
  });
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
  // 로고 적용 (header img inside .brand)
  const headerLogo = document.querySelector('.brand img');
  if (headerLogo && homepageDB.logo) headerLogo.src = homepageDB.logo;
  if (!preserveAdminOpen) loadAdminHomepage();
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
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      alert(`${file.name}은(는) 너무 큽니다. 최대 50MB까지 첨부 가능합니다.`);
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
  
  localStorage.setItem(CONTENT_DB_KEY, JSON.stringify(contentDB));
  
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
  
  alert(`저장되었습니다.
[카테고리: ${cat}]
[바인딩: ${binding}]
[마진율: ${marginVal}%]`);
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
      
      if (imgSrc) imgEl.src = imgSrc;
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
  ['adm-orders', 'adm-content', 'adm-users', 'adm-homepage', 'adm-popup', 'adm-notice'].forEach(id => {
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
  if (tabId === 'adm-orders') renderOrderList();
  if (tabId === 'adm-homepage') loadAdminHomepage();
  if (tabId === 'adm-notice') { loadAdminNotices(); }
  if (tabId === 'adm-popup') { loadAdminPopupNotices(); }
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
    alert('삭제 중 오류가 발생했습니다. 관리자 계정으로 로그인했는지 확인하세요.');
  }
}

function renderOrderList() {
  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  // 취소된 주문 제외
  const activeOrders = orders.filter(order => order.status !== '취소');
  const body = get('order-list-body');
  body.innerHTML = '';

  if (activeOrders.length === 0) {
    body.innerHTML = '<tr><td colspan="5" style="padding:30px; text-align:center; color:#64748b;">아직 주문이 없습니다.</td></tr>';
  } else {
    activeOrders.forEach((order, i) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e6edf3';
      const orderId = order.orderId || `ORDER-${i}`;
      const statusColor = order.status === '접수완료' ? '#10b981' : order.status === '제작중' ? '#3b82f6' : order.status === '배송중' ? '#f59e0b' : order.status === '배송완료' ? '#6366f1' : '#64748b';
      tr.innerHTML = `
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

function viewAdminOrderDetail(orderId) {
  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  const order = orders.find(o => o.orderId === orderId || o.orderId === `ORDER-${orders.indexOf(o)}`);
  
  if (!order) {
    // orderId로 찾지 못하면 인덱스로 시도
    const index = parseInt(orderId.replace('ORDER-', ''));
    if (!isNaN(index) && orders[index]) {
      order = orders[index];
    } else {
      alert('주문 정보를 찾을 수 없습니다.');
      return;
    }
  }

  const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleString('ko-KR') : (order.date || '-');
  const statusColors = {
    '접수완료': '#10b981',
    '제작중': '#3b82f6',
    '배송중': '#f59e0b',
    '배송완료': '#6366f1',
    '취소': '#ef4444'
  };
  const statusColor = statusColors[order.status] || '#64748b';

  const filesHtml = order.files && order.files.length > 0 
    ? order.files.map((f, idx) => {
        const hasData = f.data && f.data.startsWith('data:');
        const downloadBtn = hasData 
          ? `<button onclick="downloadOrderFile('${order.orderId}', ${idx})" style="margin-left:8px; padding:4px 8px; background:#3b82f6; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">다운로드</button>`
          : `<span style="margin-left:8px; padding:4px 8px; background:#e2e8f0; color:#64748b; border-radius:4px; font-size:11px;">데이터 없음</span>`;
        return `<div style="font-size:13px; color:#0f172a; margin-top:4px; display:flex; align-items:center;">📎 ${f.name || '파일'} ${f.size ? `(${(f.size / 1024).toFixed(1)}KB)` : ''}${downloadBtn}</div>`;
      }).join('')
    : '<div style="font-size:13px; color:#64748b;">첨부파일 없음</div>';

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
          ${opts.coating ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 코팅: ${opts.coating}</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 코팅: 선택 안 됨</div>'}
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
  } else {
    // 옵션이 없을 때 안내 메시지
    optionsHtml = `
      <div style="margin-bottom:16px; padding:16px; background:#fef2f2; border-radius:8px; border:1px solid #fecaca;">
        <div style="font-size:13px; color:#dc2626; font-weight:600;">⚠️ 이 주문은 옵션 정보가 저장되지 않았습니다. (이전 버전 주문)</div>
      </div>
    `;
  }

  const detailHtml = `
        <div style="max-width:700px; margin:0 auto;">
          <h3 style="margin:0 0 20px 0; font-weight:1100; color:#0f172a;">주문 상세 정보</h3>
          
          <div style="background:#fff; border:1px solid var(--line); border-radius:16px; padding:24px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #e2e8f0;">
              <div>
                <div style="font-weight:900; font-size:18px; color:#0f172a; margin-bottom:8px;">${order.name || '상품'}</div>
                <div style="font-size:13px; color:#64748b;">주문번호: ${order.orderId || 'N/A'}</div>
              </div>
              <span style="padding:6px 16px; background:${statusColor}15; color:${statusColor}; border-radius:8px; font-size:13px; font-weight:700;">${order.status || '접수완료'}</span>
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">주문일시</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${orderDate}</div>
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">주문자 정보</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${order.userName || '비회원'}</div>
              ${order.userPhone ? `<div style="font-size:13px; color:#64748b; margin-top:4px;">연락처: ${order.userPhone}</div>` : ''}
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">수량</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${order.qty || 0}${order.qty && !order.qty.toString().includes('개') ? '개' : ''}</div>
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
                          // order.files에서 해당 파일 찾기 (다운로드를 위해)
                          const fileIndex = order.files ? order.files.findIndex((of, oi) => {
                            // 파일명과 크기로 매칭 시도
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
                  
                  return `
                    <div style="margin-bottom:${idx < order.items.length - 1 ? '16px' : '0'}; padding-bottom:${idx < order.items.length - 1 ? '16px' : '0'}; border-bottom:${idx < order.items.length - 1 ? '1px solid #e2e8f0' : 'none'};">
                      <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:8px;">${item.name || '상품'}</div>
                      <div style="font-size:12px; color:#64748b; margin-bottom:6px;">수량: ${item.qty || 0} | 금액: ${(item.price || 0).toLocaleString()}원</div>
                      ${itemOptions.coverType || itemOptions.innerType ? `
                        <div style="font-size:12px; color:#64748b; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0;">
                          ${itemOptions.coverType ? `<div style="margin-bottom:4px;">표지: ${itemOptions.coverType} ${itemOptions.coverGram || ''}</div>` : ''}
                          ${itemOptions.innerType ? `<div>내지: ${itemOptions.innerType} ${itemOptions.innerGram || ''}</div>` : ''}
                          ${itemOptions.coverPrint ? `<div style="margin-top:4px;">표지 인쇄: ${itemOptions.coverPrint}</div>` : ''}
                          ${itemOptions.innerPrint ? `<div>내지 인쇄: ${itemOptions.innerPrint}</div>` : ''}
                          ${itemOptions.binding ? `<div style="margin-top:4px;">제본: ${itemOptions.binding === 'staple' ? '중철' : '무선'}</div>` : ''}
                          ${itemOptions.bindingDirection ? `<div>제본방향: ${itemOptions.bindingDirection}</div>` : ''}
                          ${itemOptions.coating ? `<div style="margin-top:4px;">코팅: ${itemOptions.coating}</div>` : ''}
                        </div>
                      ` : ''}
                      ${itemFilesHtml}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : optionsHtml}
            
            ${order.specs && !order.items ? `
              <div style="margin-bottom:16px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:6px;">주문 사양</div>
                <div style="font-size:14px; color:#0f172a; font-weight:600;">${order.specs}</div>
              </div>
            ` : ''}
            
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
          
          <button id="close-order-modal-btn" class="btn btn-primary" style="width:100%;">닫기</button>
        </div>
      `;

  // 모달로 표시
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:2000; padding:20px; overflow-y:auto;';
  modal.innerHTML = `
        <div style="background:#fff; border-radius:16px; padding:24px; max-width:800px; width:100%; max-height:90vh; overflow-y:auto;">
          ${detailHtml}
        </div>
      `;
  
  // 닫기 버튼 이벤트
  modal.addEventListener('click', function(e) {
    if (e.target === modal || e.target.id === 'close-order-modal-btn') {
      document.body.removeChild(modal);
    }
  });
  
  document.body.appendChild(modal);
}

function renderUserList() {
  const users = JSON.parse(localStorage.getItem(USER_DB_KEY) || '[]');
  const body = get('user-list-body');
  body.innerHTML = '';

  if (users.length === 0) {
    body.innerHTML = '<tr><td colspan="10" style="padding:30px; text-align:center; color:#64748b;">등록된 회원이 없습니다.</td></tr>';
  } else {
    users.forEach((user, i) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e6edf3';
      const typeText = user.type === 'business' ? '사업자' : '일반';
      const statusText = user.status === 'pending' ? '승인대기' : (user.status === 'active' ? '활성' : '-');
      const statusColor = user.status === 'pending' ? '#f59e0b' : (user.status === 'active' ? '#10b981' : '#64748b');
      tr.innerHTML = `
            <td style="padding:10px;">${user.id || '-'}</td>
            <td style="padding:10px;">${user.name || '-'}</td>
            <td style="padding:10px;">${user.phone || '-'}</td>
            <td style="padding:10px; max-width:200px; word-break:break-all;">${user.address || '-'}</td>
            <td style="padding:10px;">${typeText}</td>
            <td style="padding:10px;">${user.bizName || '-'}</td>
            <td style="padding:10px;">${user.bizNum || '-'}</td>
            <td style="padding:10px;"><span style="color:${statusColor}; font-weight:700;">${statusText}</span></td>
            <td style="padding:10px;">${user.joinDate || '-'}</td>
            <td style="padding:10px; text-align:center;">
              <button onclick="deleteUser('${user.id}')" style="padding:6px 12px; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='#dc2626'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='#ef4444'; this.style.transform='scale(1)'">삭제</button>
            </td>
          `;
      body.appendChild(tr);
    });
  }
}

function deleteUser(userId) {
  if (!confirm(`정말로 회원 "${userId}"을(를) 탈퇴 처리하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }
  
  const users = JSON.parse(localStorage.getItem(USER_DB_KEY) || '[]');
  const filteredUsers = users.filter(u => u.id !== userId);
  localStorage.setItem(USER_DB_KEY, JSON.stringify(filteredUsers));
  
  // 현재 로그인한 사용자가 삭제된 경우 로그아웃 처리
  const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null');
  if (currentUser && currentUser.id === userId) {
    localStorage.removeItem(CURRENT_USER_KEY);
    updateNav();
    updateHomeLoginCard();
    toast('회원 탈퇴가 완료되었습니다.');
    goHome();
  } else {
    renderUserList();
    toast('회원이 삭제되었습니다.');
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
function addQuoteToCart() {
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
      options.qty = qtyEl.value + '부';
    }
    
    // 마진율
    const marginEl = get('ind-margin');
    if (marginEl && marginEl.value && marginEl.value !== '') {
      options.margin = marginEl.value;
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
  // 먼저 계산 실행
  if (typeof calculateIndigo === 'function') {
    calculateIndigo();
  }

  // 파일 확인
  if (quoteAttachedFiles.length === 0) {
    alert('파일을 첨부해주세요.');
    return;
  }

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
    price: totalPrice,
    shipping: 0,
    specs: `카테고리: ${cat}, 수량: ${qty}`,
    options: options,
    files: filesWithData,
    fileInfo: fileInfo,
    date: new Date().toLocaleString()
  });

  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  alert('장바구니에 추가되었습니다!');
}

// 견적요약서에서 바로 주문
async function orderDirectlyFromQuote() {
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
  if (quoteAttachedFiles.length === 0) {
    alert('파일을 첨부해주세요.');
    return;
  }

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

  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  orders.push({
    name: `${cat} (${qty})`,
    qty: qty,
    price: totalPrice,
    shipping: 0,
    specs: `카테고리: ${cat}, 수량: ${qty}`,
    options: options,
    files: filesWithData,
    fileInfo: fileInfo,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    date: new Date().toLocaleString(),
    orderDate: new Date().toISOString(),
    status: '접수완료',
    orderId: 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  });

  localStorage.setItem(ORDER_KEY, JSON.stringify(orders));

  // 파일 목록 초기화
  quoteAttachedFiles = [];
  if (typeof updateQuoteFileList === 'function') {
    updateQuoteFileList();
  }

  alert('주문이 접수되었습니다!');
  goHome();
}

function showCS() {
  hideAll();
  const csModal = get('view-cs');
  if (csModal) csModal.style.display = 'flex';
  get('cs-message').value = '';
}

function hideCS() {
  hideAll();
  goHome();
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
let currentSignupType = 'general';

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
  if (event) event.preventDefault();
  const userId = document.getElementById('userId')?.value || document.getElementById('login-id')?.value;
  const userPassword = document.getElementById('userPassword')?.value || document.getElementById('login-pw')?.value;

  if (!userId || !userPassword) {
    alert('아이디와 비밀번호를 입력해주세요.');
    return false;
  }
  
  try {
    const response = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, pw: userPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // JWT 토큰 저장
      saveToken(data.token);
      // 사용자 정보 저장
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
      updateNav();
      updateHomeLoginCard();
      toast('로그인되었습니다.');
      goHome();
    } else {
      alert(data.message || '로그인에 실패했습니다.');
    }
  } catch (error) {
    console.error('로그인 오류:', error);
    alert('로그인 중 오류가 발생했습니다.');
    return false;
  }
}

function logout() {
  if (confirm('로그아웃 하시겠습니까?')) {
      removeToken();
    localStorage.removeItem(CURRENT_USER_KEY);
    updateNav();
    updateHomeLoginCard();
    goHome();
  }
}

function updateNav() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  const nav = get('nav-links');
  if (!nav) return;

  if (user) {
    nav.innerHTML = `
          <a>${user.name}님</a>
          <a onclick="logout()" style="color:#ef4444;">로그아웃</a>
          <a onclick="goFindAccount()">ID·PW찾기</a>
          <a onclick="goOrderHistory()">주문내역</a>
          <a onclick="goCart()" class="nav-cart">장바구니 <span class="cart-badge" id="cart-badge">0</span></a>
        `;
  } else {
    nav.innerHTML = `
          <a onclick="goLogin()">로그인</a>
          <a onclick="goSignup()">회원가입</a>
          <a onclick="goFindAccount()">ID·PW찾기</a>
          <a onclick="goOrderHistory()">주문내역</a>
          <a onclick="goCart()" class="nav-cart">장바구니 <span class="cart-badge" id="cart-badge">0</span></a>
        `;
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
    list.innerHTML = `<div style="text-align:center; padding:60px 20px; background:#f8fafc; border-radius:16px; border:2px dashed var(--line); color:#64748b;">🛒 장바구니가 비어있습니다</div>`;
  } else {
    cart.forEach((item, i) => {
      const itemTotal = (item.price || 0);
      totalP += itemTotal;
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
            <div style="display:flex; justify-content:space-between; background:#fff; border:1px solid var(--line); border-radius:16px; padding:18px; align-items:flex-start;">
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
  get('ct-total').textContent = (totalP + totalS).toLocaleString() + '원';
}

function removeCart(i) {
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  cart.splice(i, 1);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartView();
  updateCartBadge();
}

function submitOrder() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) return alert('로그인이 필요합니다.');

  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  if (cart.length === 0) return alert('장바구니가 비었습니다.');

  // 장바구니의 각 항목에 파일이 있는지 확인
  const itemsWithoutFiles = cart.filter(item => !item.files || item.files.length === 0);
  if (itemsWithoutFiles.length > 0) {
    alert('파일이 첨부되지 않은 항목이 있습니다. 모든 항목에 파일을 첨부해주세요.');
    return;
  }

  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  
  // 총 금액 계산
  const totalPrice = cart.reduce((sum, item) => sum + (item.price || 0), 0);
  const totalShipping = cart.reduce((sum, item) => sum + (item.shipping || 0), 0);
  const totalQty = cart.reduce((sum, item) => {
    // qty가 문자열일 수 있으므로 숫자만 추출
    const qtyStr = String(item.qty || '0').replace(/[^0-9]/g, '');
    const qty = parseInt(qtyStr) || 0;
    return sum + qty;
  }, 0);
  
  // 하나의 주문으로 묶어서 저장
  const orderId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const orderDate = new Date().toISOString();
  const orderDateStr = new Date().toLocaleString();
  
  // 주문명 생성 (여러 상품인 경우)
  const orderName = cart.length === 1 
    ? cart[0].name 
    : `${cart[0].name} 외 ${cart.length - 1}개`;
  
  orders.push({
    orderId: orderId,
    name: orderName,
    qty: totalQty + (totalQty > 0 ? '개' : ''),
    price: totalPrice,
    shipping: totalShipping,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    date: orderDateStr,
    orderDate: orderDate,
    status: '접수완료',
    items: cart.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      shipping: item.shipping || 0,
      specs: item.specs,
      options: item.options,
      files: item.files || [],
      fileInfo: item.fileInfo
    })),
    // 전체 파일 정보
    files: cart.flatMap(item => item.files || []),
    fileInfo: cart.map(item => item.fileInfo).filter(f => f).join('\n')
  });
  
  localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  localStorage.removeItem(CART_KEY);

  updateCartBadge();
  alert('주문이 접수되었습니다!');
  goHome();
}

function goOrderHistory() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) {
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  hideAll();
  get('view-order').style.display = 'block';
  renderOrderHistory();
}

function renderOrderHistory() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) return;

  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  // 현재 로그인한 사용자의 주문만 필터링
  const userOrders = orders.filter(order => order.userId === user.id);

  const listEl = get('order-history-list');
  const emptyEl = get('order-empty');

  if (userOrders.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  // 날짜순으로 정렬 (최신순)
  userOrders.sort((a, b) => {
    const dateA = new Date(a.orderDate || a.date || 0);
    const dateB = new Date(b.orderDate || b.date || 0);
    return dateB - dateA;
  });

  listEl.innerHTML = userOrders.map((order, i) => {
    const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleString('ko-KR') : (order.date || '-');
    const statusColors = {
      '접수완료': '#10b981',
      '제작중': '#3b82f6',
      '배송중': '#f59e0b',
      '배송완료': '#6366f1',
      '취소': '#ef4444'
    };
    const statusColor = statusColors[order.status] || '#64748b';

    return `
          <div style="background:#fff; border:1px solid var(--line); border-radius:16px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
              <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                  <div style="font-weight:900; font-size:16px; color:#0f172a;">${order.name || '상품'}</div>
                  <span style="padding:4px 12px; background:${statusColor}15; color:${statusColor}; border-radius:6px; font-size:12px; font-weight:700;">${order.status || '접수완료'}</span>
                </div>
                <div style="font-size:13px; color:#64748b; margin-bottom:4px;">주문번호: ${order.orderId || 'N/A'}</div>
                <div style="font-size:13px; color:#64748b;">주문일시: ${orderDate}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:20px; font-weight:1100; color:#0f172a; margin-bottom:8px;">${(order.price || 0).toLocaleString()}원</div>
                <div style="font-size:12px; color:#64748b;">수량: ${order.qty || 0}${order.qty ? (order.name && order.name.includes('권') ? '권' : '개') : ''}</div>
              </div>
            </div>
            
            ${order.items && order.items.length > 0 ? `
              <div style="padding:12px; background:#f8fafc; border-radius:8px; margin-bottom:12px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:8px; font-weight:700;">주문 상품 (${order.items.length}개)</div>
                ${order.items.map(item => `
                  <div style="font-size:13px; color:#475569; margin-bottom:4px;">• ${item.name || '상품'} (${item.qty || 0}) - ${(item.price || 0).toLocaleString()}원</div>
                `).join('')}
              </div>
            ` : order.specs ? `
              <div style="padding:12px; background:#f8fafc; border-radius:8px; margin-bottom:12px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:4px;">주문 사양</div>
                <div style="font-size:13px; color:#475569; font-weight:600;">${order.specs}</div>
              </div>
            ` : ''}
            
            ${order.fileInfo ? `
              <div style="padding:12px; background:#f1f5f9; border-radius:8px; margin-bottom:12px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:4px;">첨부파일</div>
                <div style="font-size:13px; color:#475569;">${order.fileInfo}</div>
              </div>
            ` : ''}
            
            <div style="display:flex; gap:10px; margin-top:12px;">
              <button onclick="viewOrderDetail('${order.orderId || i}')" style="flex:1; padding:10px; background:var(--primary); color:#fff; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">상세보기</button>
              <button onclick="toast('문의 기능 준비중')" style="flex:1; padding:10px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">문의하기</button>
            </div>
          </div>
        `;
  }).join('');
}

function viewOrderDetail(orderId) {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) return;

  const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  // orderId로 정확히 찾고, 현재 사용자의 주문인지 확인
  let order = orders.find(o => o.orderId === orderId && o.userId === user.id);
  
  if (!order) {
    // orderId로 찾지 못하면 인덱스로 시도 (하위 호환)
    const index = parseInt(orderId.replace('ORDER-', ''));
    if (!isNaN(index)) {
      const userOrders = orders.filter(o => o.userId === user.id);
      if (userOrders[index]) {
        const foundOrder = userOrders[index];
        // orderId가 일치하는지 다시 확인
        if (foundOrder.orderId === orderId || !orderId.includes('ORDER-')) {
          order = foundOrder;
        }
      }
    }
    
    if (!order) {
      alert('주문 정보를 찾을 수 없습니다.');
      return;
    }
  }

  const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleString('ko-KR') : (order.date || '-');
  const statusColors = {
    '접수완료': '#10b981',
    '제작중': '#3b82f6',
    '배송중': '#f59e0b',
    '배송완료': '#6366f1',
    '취소': '#ef4444'
  };
  const statusColor = statusColors[order.status] || '#64748b';

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
          ${opts.coating ? `<div style="font-size:13px; color:#0f172a; margin-bottom:6px; padding-left:12px;">- 코팅: ${opts.coating}</div>` : '<div style="font-size:13px; color:#94a3b8; margin-bottom:6px; padding-left:12px;">- 코팅: 선택 안 됨</div>'}
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
              <span style="padding:6px 16px; background:${statusColor}15; color:${statusColor}; border-radius:8px; font-size:13px; font-weight:700;">${order.status || '접수완료'}</span>
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">주문일시</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${orderDate}</div>
            </div>
            
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">수량</div>
              <div style="font-size:14px; color:#0f172a; font-weight:600;">${order.qty || 0}${order.qty && !order.qty.toString().includes('개') ? '개' : ''}</div>
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
                          // order.files에서 해당 파일 찾기 (다운로드를 위해)
                          const fileIndex = order.files ? order.files.findIndex((of, oi) => {
                            // 파일명과 크기로 매칭 시도
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
                  
                  return `
                    <div style="margin-bottom:${idx < order.items.length - 1 ? '16px' : '0'}; padding-bottom:${idx < order.items.length - 1 ? '16px' : '0'}; border-bottom:${idx < order.items.length - 1 ? '1px solid #e2e8f0' : 'none'};">
                      <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:8px;">${item.name || '상품'}</div>
                      <div style="font-size:12px; color:#64748b; margin-bottom:6px;">수량: ${item.qty || 0} | 금액: ${(item.price || 0).toLocaleString()}원</div>
                      ${itemOptions.coverType || itemOptions.innerType ? `
                        <div style="font-size:12px; color:#64748b; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0;">
                          ${itemOptions.coverType ? `<div style="margin-bottom:4px;">표지: ${itemOptions.coverType} ${itemOptions.coverGram || ''}</div>` : ''}
                          ${itemOptions.innerType ? `<div>내지: ${itemOptions.innerType} ${itemOptions.innerGram || ''}</div>` : ''}
                          ${itemOptions.coverPrint ? `<div style="margin-top:4px;">표지 인쇄: ${itemOptions.coverPrint}</div>` : ''}
                          ${itemOptions.innerPrint ? `<div>내지 인쇄: ${itemOptions.innerPrint}</div>` : ''}
                          ${itemOptions.binding ? `<div style="margin-top:4px;">제본: ${itemOptions.binding === 'staple' ? '중철' : '무선'}</div>` : ''}
                          ${itemOptions.bindingDirection ? `<div>제본방향: ${itemOptions.bindingDirection}</div>` : ''}
                          ${itemOptions.coating ? `<div style="margin-top:4px;">코팅: ${itemOptions.coating}</div>` : ''}
                        </div>
                      ` : ''}
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
  // 닫기 버튼 이벤트
  modal.addEventListener('click', function(e) {
    if (e.target === modal || e.target.id === 'close-order-detail-modal-btn') {
      document.body.removeChild(modal);
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
  
  // 사이즈 초기화 (규격 사이즈인 경우)
  const bookSizeStandard = get('ind-bookSize-standard');
  if (bookSizeStandard) {
    bookSizeStandard.selectedIndex = 0;
    if (typeof updateSizeFromStandard === 'function') {
      updateSizeFromStandard();
    }
  }
  
  // 재단 사이즈 초기화 (커스텀 사이즈인 경우)
  const sizeWidth = get('ind-size-width');
  const sizeHeight = get('ind-size-height');
  if (sizeWidth) sizeWidth.value = '';
  if (sizeHeight) sizeHeight.value = '';
  
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

function setCategory(cat, bindType) {
  hideAll();
  get('view-quotation').style.display = 'block';
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  // 견적 입력값 초기화
  resetQuoteInputs();

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

  }, 100);

  window.currentCategory = cat;
  // 결정된 바인딩 우선순위: 전달된 bindType > 저장된 카테고리별 내용 > 이전값 > 기본 'staple'
  if (bindType) {
    window.currentBindType = bindType;
  } else {
    const data = contentDB[cat] || {};
    // prefer the binding which has non-empty content (img or info)
    const stapleHas = (data.img && typeof data.img === 'object' && (data.img.staple || '').toString().trim()) || (data.info && typeof data.info === 'object' && (data.info.staple || '').toString().trim());
    const perfectHas = (data.img && typeof data.img === 'object' && (data.img.perfect || '').toString().trim()) || (data.info && typeof data.info === 'object' && (data.info.perfect || '').toString().trim());
    if (stapleHas && !perfectHas) window.currentBindType = 'staple';
    else if (!stapleHas && perfectHas) window.currentBindType = 'perfect';
    else window.currentBindType = window.currentBindType || 'staple';
  }

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

  // 기본으로 상세 탭을 활성화
  if (typeof switchProductTab === 'function') switchProductTab('detail');

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
renderNav();
applyHomepageContent(true); // 메인 슬라이더/로고/견적 이미지를 로컬 저장값으로 초기 적용
updatePager();
updateCartBadge();
updateHomeLoginCard();
startAutoSlide();
loadNotices();

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
    coverPagesSelect.addEventListener('change', function() {
      const pages = this.value;
      const coverPrintSelect = document.getElementById('ind-coverPrint-select');

      if (coverPrintSelect) {
        if (pages === '2') {
          // 2p 선택 시 단면 선택
          coverPrintSelect.value = '1-color';
          coverPrintSelect.dispatchEvent(new Event('change'));
        } else if (pages === '4') {
          // 4p 선택 시 양면 선택
          coverPrintSelect.value = '2-color';
          coverPrintSelect.dispatchEvent(new Event('change'));
        }
      }
    });
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
  // 모든 탭 버튼 초기화
  document.getElementById('tab-detail-btn').style.background = '#f1f5f9';
  document.getElementById('tab-detail-btn').style.color = '#64748b';
  document.getElementById('tab-detail-btn').style.fontWeight = '600';

  document.getElementById('tab-guide-btn').style.background = '#f1f5f9';
  document.getElementById('tab-guide-btn').style.color = '#64748b';
  document.getElementById('tab-guide-btn').style.fontWeight = '600';

  document.getElementById('tab-shipping-btn').style.background = '#f1f5f9';
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
  "스노우지": {
    "100": 62000,
    "120": 75000,
    "150": 95000,
    "180": 114000,
    "200": 127000
  },
  "아트지": {
    "100": 62000,
    "120": 75000,
    "150": 95000,
    "180": 114000,
    "200": 127000
  },
  "모조지": {
    "80": 51000,
    "100": 63000,
    "120": 75000,
    "150": 94000
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

      // 흑백 옵션만 남기고 컬러 옵션 제거
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
      const newValue = (currentValue.includes('-mono')) ? currentValue : printType + '-mono';
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
        const options = [{
            value: '2-color',
            text: '양면 컬러'
          },
          {
            value: '2-mono',
            text: '양면 흑백'
          },
          {
            value: '1-color',
            text: '단면 컬러'
          },
          {
            value: '1-mono',
            text: '단면 흑백'
          }
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
    // 페이지 옵션 추가
    for (let p = 4; p <= 500; p += 4) {
      let opt = document.createElement('option');
      opt.value = p;
      opt.innerText = p + '페이지';
      innerPagesSelect.appendChild(opt);
    }
  }
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

  const totalRaw = pPaper + pPrint + pPlate;
  const totalMargin = totalRaw * (1 + margin / 100);
  const vat = totalMargin * 0.1;
  const final = Math.floor((totalMargin + vat) / 10) * 10;
  const perUnit = Math.round(final / qty);

  // 결과 표시
  get('sum-cat').textContent = currentQuoteMode === 'flyer_small' ? '소량 전단' : '대량 전단';
  get('sum-qty').textContent = qty + '장';
  get('sum-supply').textContent = comma(Math.round(totalMargin)) + '원';
  get('sum-vat').textContent = comma(Math.round(vat)) + '원';
  get('sum-ship').textContent = '-';
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

  const totalRaw = cvP + cvPr + cvPl + cvC + inP + inPr + inPl + bind;
  const totalMargin = totalRaw * (1 + margin / 100);
  const vat = totalMargin * 0.1;
  const final = Math.floor((totalMargin + vat) / 10) * 10;
  const perUnit = Math.round(final / qty);

  // 결과 표시
  const modeNames = {
    'book_indigo': '소량',
    'book_digital': '흑백',
    'book_offset': '대량'
  };
  const bindNames = {
    'staple': '중철',
    'perfect': '무선'
  };
  const selectedBindType = window.currentBindType || getRadio('ind-bind') || 'perfect';
  const bindText = bindNames[selectedBindType] || '무선';
  const modeText = modeNames[currentQuoteMode] || '책자';
  get('sum-cat').textContent = modeText + ' ' + bindText;
  get('sum-qty').textContent = qty + '권';
  get('sum-supply').textContent = comma(Math.round(totalMargin)) + '원';
  get('sum-vat').textContent = comma(Math.round(vat)) + '원';
  get('sum-ship').textContent = '-';
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
    // 탭이 없으므로 null 전달
    if (typeof setQuoteMode === 'function') {
      setQuoteMode('book_indigo', null);
    }
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
  let imageEl, titleEl, contentEl, badgeEl, closeBtnEl;
  
  children.forEach(child => {
    if (child.id === 'popup-modal-image') imageEl = child;
    if (child.id === 'popup-modal-title') titleEl = child;
    if (child.id === 'popup-modal-content') contentEl = child;
    if (child.id === 'popup-modal-badge') badgeEl = child;
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
  
  if (badgeEl) {
    if (popup.badge) {
      badgeEl.textContent = popup.badge;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }
  }
  
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
  
  const badge = get('popup-modal-badge');
  if (popup.badge) {
    badge.textContent = popup.badge;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
  
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