// ==================== 개인결제 링크 관리 ====================

async function loadPaymentLinks() {
  try {
    const token = getToken();
    const res = await fetch('/api/payment-links', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (!data.success) {
      console.error('링크 목록 로드 실패:', data.message);
      return;
    }

    const tbody = get('payment-link-list-body');
    if (!tbody) return;

    if (!data.links || data.links.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:30px; text-align:center; color:#64748b;">생성된 링크가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = data.links.map(link => {
      const linkUrl = `${window.location.origin}/?pay=${link.link_code}`;
      const statusBadge = link.is_used
        ? '<span style="background:#10b981; color:#fff; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700;">✓ 사용완료</span>'
        : '<span style="background:#f59e0b; color:#fff; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700;">⏳ 미사용</span>';

      return `
        <tr style="border-bottom:1px solid var(--line);">
          <td style="padding:10px; font-family:monospace; font-weight:700; color:#037a3f;">${link.link_code}</td>
          <td style="padding:10px;">${link.product_name}</td>
          <td style="padding:10px; text-align:right; font-weight:700; color:#0f172a;">${(link.price || 0).toLocaleString()}원</td>
          <td style="padding:10px;">${link.customer_name || '-'}</td>
          <td style="padding:10px;">${link.customer_phone || '-'}</td>
          <td style="padding:10px; text-align:center;">${statusBadge}</td>
          <td style="padding:10px; font-size:11px; color:#64748b;">${formatDate(link.created_at)}</td>
          <td style="padding:10px; text-align:center;">
            <button class="btn" style="background:#3b82f6; color:#fff; padding:4px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer; margin-right:4px;" onclick="copyPaymentLink('${linkUrl}')">복사</button>
            ${!link.is_used ? `<button class="btn" style="background:#ef4444; color:#fff; padding:4px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer;" onclick="deletePaymentLink(${link.id})">삭제</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('링크 목록 로드 오류:', error);
  }
}

// 전역 함수로 등록
window.loadPaymentLinks = loadPaymentLinks;

function showCreatePaymentLinkForm() {
  const form = get('payment-link-form');
  if (form) form.style.display = 'block';
  
  // 입력 폼 초기화
  if (get('pay-link-product')) get('pay-link-product').value = '';
  if (get('pay-link-price')) get('pay-link-price').value = '';
  if (get('pay-link-memo')) get('pay-link-memo').value = '';
  if (get('pay-link-product-type')) get('pay-link-product-type').value = 'book';
  if (get('pay-link-cover-paper')) get('pay-link-cover-paper').value = '';
  if (get('pay-link-inner-paper')) get('pay-link-inner-paper').value = '';
  if (get('pay-link-total-pages')) get('pay-link-total-pages').value = '';
  if (get('pay-link-binding')) get('pay-link-binding').value = '';
  if (get('pay-link-print-qty')) get('pay-link-print-qty').value = '';
  if (get('pay-link-single-paper')) get('pay-link-single-paper').value = '';
  if (get('pay-link-flyer-qty')) get('pay-link-flyer-qty').value = '';
  if (get('pay-link-flyer-finishing')) get('pay-link-flyer-finishing').value = '';
  if (get('pay-link-special-note')) get('pay-link-special-note').value = '';
  
  togglePayLinkSpecsFields();
}

// 전역 함수로 등록
window.showCreatePaymentLinkForm = showCreatePaymentLinkForm;

function togglePayLinkSpecsFields() {
  const type = get('pay-link-product-type')?.value || 'book';
  const bookSection = get('pay-link-book-specs');
  const flyerSection = get('pay-link-flyer-specs');
  
  if (bookSection) bookSection.style.display = type === 'book' ? 'block' : 'none';
  if (flyerSection) flyerSection.style.display = type === 'flyer' ? 'block' : 'none';
}

function hideCreatePaymentLinkForm() {
  const form = get('payment-link-form');
  if (form) form.style.display = 'none';
}

async function createPaymentLink() {
  const product_name = get('pay-link-product')?.value?.trim();
  const price = parseFloat(get('pay-link-price')?.value || 0);
  const memo = get('pay-link-memo')?.value?.trim();
  const productType = get('pay-link-product-type')?.value || 'book';
  const specialNote = get('pay-link-special-note')?.value?.trim();

  if (!product_name) {
    alert('상품명을 입력해주세요.');
    return;
  }

  if (!price || price < 1000) {
    alert('결제금액은 1,000원 이상이어야 합니다.');
    return;
  }

  let specs = null;

  if (productType === 'book') {
    const coverPaper = get('pay-link-cover-paper')?.value?.trim();
    const innerPaper = get('pay-link-inner-paper')?.value?.trim();
    const totalPages = get('pay-link-total-pages')?.value?.trim();
    const binding = get('pay-link-binding')?.value;
    const printQty = get('pay-link-print-qty')?.value?.trim();

    if (!coverPaper || !innerPaper || !totalPages || !binding || !printQty) {
      alert('책 사양을 모두 입력해주세요.');
      return;
    }

    specs = {
      type: 'book',
      coverPaper,
      innerPaper,
      totalPages,
      binding,
      printQuantity: printQty,
      specialNote
    };
  } else if (productType === 'flyer') {
    const singlePaper = get('pay-link-single-paper')?.value?.trim();
    const flyerQty = get('pay-link-flyer-qty')?.value?.trim();
    const finishing = get('pay-link-flyer-finishing')?.value?.trim();

    if (!singlePaper || !flyerQty || !finishing) {
      alert('전단지 사양을 모두 입력해주세요.');
      return;
    }

    specs = {
      type: 'flyer',
      singlePaper,
      printQuantity: flyerQty,
      finishing,
      specialNote
    };
  }

  const memoPayload = JSON.stringify({ specs, note: memo || '' });

  try {
    const token = getToken();
    const res = await fetch('/api/payment-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        product_name,
        price,
        customer_name: null,  // 고객명은 결제 시 자동으로 수집됨
        customer_phone: null, // 전화번호는 결제 시 자동으로 수집됨
        memo: memoPayload
      })
    });

    const data = await res.json();
    
    if (!data.success) {
      alert(data.message || '링크 생성에 실패했습니다.');
      return;
    }

    toast('개인결제 링크가 생성되었습니다.');
    hideCreatePaymentLinkForm();
    loadPaymentLinks();

    // 생성된 링크 자동 복사
    const linkUrl = `${window.location.origin}/?pay=${data.link.link_code}`;
    copyPaymentLink(linkUrl);

  } catch (error) {
    console.error('링크 생성 오류:', error);
    alert('링크 생성 중 오류가 발생했습니다.');
  }
}

function copyPaymentLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    toast('결제 링크가 복사되었습니다!');
  }).catch(err => {
    console.error('복사 실패:', err);
    alert('링크 복사에 실패했습니다: ' + url);
  });
}

async function deletePaymentLink(linkId) {
  if (!confirm('이 링크를 삭제하시겠습니까?')) return;

  try {
    const token = getToken();
    const res = await fetch(`/api/payment-links/${linkId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    
    if (!data.success) {
      alert(data.message || '링크 삭제에 실패했습니다.');
      return;
    }

    toast('링크가 삭제되었습니다.');
    loadPaymentLinks();

  } catch (error) {
    console.error('링크 삭제 오류:', error);
    alert('링크 삭제 중 오류가 발생했습니다.');
  }
}

// 개인결제 링크로 접속 시 처리
async function checkPaymentLinkAccess() {
  const params = new URLSearchParams(window.location.search);
  const payCode = params.get('pay');
  
  console.log('[checkPaymentLinkAccess] 🔄 시작');
  console.log('[checkPaymentLinkAccess] 현재 URL:', window.location.href);
  console.log('[checkPaymentLinkAccess] URL params:', params.toString());
  console.log('[checkPaymentLinkAccess] payCode:', payCode);
  
  if (!payCode) {
    console.log('[checkPaymentLinkAccess] ⚠️ payCode 없음 - 조기 종료');
    return;
  }

  try {
    console.log('[checkPaymentLinkAccess] 📡 API 호출:', `/api/payment-links/${payCode}`);
    const res = await fetch(`/api/payment-links/${payCode}`);
    console.log('[checkPaymentLinkAccess] 📡 API 응답 상태:', res.status, res.statusText);
    
    const data = await res.json();
    console.log('[checkPaymentLinkAccess] 📊 API 데이터:', data.success ? '✅ 성공' : '❌ 실패');

    if (!data.success) {
      console.error('[checkPaymentLinkAccess] ❌ API 실패:', data.message);
      alert(data.message || '유효하지 않은 결제 링크입니다.');
      window.location.href = '/';
      return;
    }

    const link = data.link;
    console.log('[checkPaymentLinkAccess] ✅ 링크 정보 수신:', link);
    
    // 결제 화면으로 이동 및 정보 자동 입력
    showPaymentLinkPage(link);

  } catch (error) {
    console.error('[checkPaymentLinkAccess] ❌ 오류:', error);
    alert('결제 링크 확인 중 오류가 발생했습니다.');
    window.location.href = '/';
  }
}

// 홈 단축메뉴에서 개인결제창 클릭 시
function goPersonalPayment() {
  alert('개인결제 링크는 관리자가 생성한 링크로만 접속 가능합니다.\n\n관리자 패널 → 💳 개인결제 링크 메뉴에서 링크를 생성하세요.');
}

function showPaymentLinkPage(link) {
  console.log('[showPaymentLinkPage] 🎯 호출됨, 링크정보:', link);
  
  // 핵심: 결제 링크 코드를 sessionStorage에 저장
  // (URL이 변경되더라도 goLogin()에서 값을 읽을 수 있도록)
  // 필드명: link.link_code (link.code 아님!)
  if (link && link.link_code) {
    sessionStorage.setItem('_pendingPaymentLink', link.link_code);
    console.log('[showPaymentLinkPage] 💾 결제 코드를 sessionStorage에 저장:', link.link_code);
  } else {
    console.log('[showPaymentLinkPage] ⚠️ link.link_code가 없습니다:', { has_link_code: !!link?.link_code, link_keys: link ? Object.keys(link) : 'no link' });
  }
  
  console.log('[showPaymentLinkPage] hideAll 함수 존재:', typeof hideAll !== 'undefined' ? '✅ 있음' : '❌ 없음');
  
  // hideAll 실행
  if (typeof hideAll === 'function') {
    console.log('[showPaymentLinkPage] hideAll 실행 중...');
    hideAll();
    console.log('[showPaymentLinkPage] hideAll 완료');
  } else {
    console.error('[showPaymentLinkPage] ❌ hideAll 함수를 찾을 수 없음!');
  }
  
  // 로그인 확인
  const token = getToken();
  console.log('[showPaymentLinkPage] 🔑 토큰:', token ? '✅ 있음' : '❌ 없음');
  console.log('[showPaymentLinkPage] getToken 함수:', typeof getToken !== 'undefined' ? '✅ 있음' : '❌ 없음');
  
  if (!token) {
    // 로그인 필요 메시지
    console.log('[showPaymentLinkPage] 로그인 필요 화면 렌더링');
    const html = `
      <div style="max-width:100%; margin:30px 0 0 0; padding:0;">
        <div class="card" style="max-width:800px; margin:0 auto; border:none; box-shadow:none; background:transparent;">
          <div style="padding:30px 20px; border-bottom:2px solid var(--line); background:transparent;">
            <h2 style="margin:0; font-size:28px; font-weight:900; color:#0f172a;">💳 개인결제</h2>
            <p style="margin:8px 0 0 0; font-size:14px; color:#64748b;">안전한 결제를 진행합니다</p>
          </div>
          <div style="padding:40px 20px;">
            <div style="background:linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); border:2px solid #fcd34d; border-radius:12px; padding:30px; margin-bottom:30px;">
              <h3 style="margin:0 0 16px 0; font-size:18px; font-weight:700; color:#92400e;">🔐 로그인이 필요합니다</h3>
              <p style="margin:0 0 20px 0; font-size:14px; color:#78350f; line-height:1.6;">회원 전용 결제 링크입니다.<br/>로그인 후 안전하게 결제를 진행해주세요.</p>
              <button class="btn btn-primary" onclick="goLogin()" style="width:100%; padding:14px; font-size:15px; font-weight:700;">로그인하기</button>
              <button class="btn btn-secondary" onclick="goHome()" style="width:100%; padding:14px; font-size:14px; margin-top:12px; background:#e2e8f0; color:#475569; border:1px solid #cbd5e1;">홈으로 돌아가기</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    let mainContent = document.querySelector('.main-content');
    console.log('[showPaymentLinkPage 로그인필요] mainContent 찾음:', mainContent ? '있음' : '없음');
    
    if (!mainContent) {
      console.log('[showPaymentLinkPage 로그인필요] mainContent 생성 중...');
      mainContent = document.createElement('div');
      mainContent.className = 'main-content';
      mainContent.style.maxWidth = '100%';
      mainContent.style.margin = '0';
      mainContent.style.padding = '0';
      document.body.appendChild(mainContent);
      console.log('[showPaymentLinkPage 로그인필요] mainContent 생성 및 추가 완료');
    }
    mainContent.innerHTML = html;
    mainContent.style.display = 'block';
    mainContent.style.visibility = 'visible';
    mainContent.style.zIndex = '1000';
    console.log('[showPaymentLinkPage 로그인필요] HTML 렌더링 및 표시 완료', {
      display: mainContent.style.display,
      visibility: mainContent.style.visibility,
      offsetHeight: mainContent.offsetHeight
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  
  // memo에서 사양 파싱
  console.log('[showPaymentLinkPage 로그인됨] 결제 정보 화면 준비 중...');
  let specs = null;
  let noteText = '';
  try {
    if (link.memo) {
      const parsed = JSON.parse(link.memo);
      specs = parsed.specs;
      noteText = parsed.note || '';
      console.log('[showPaymentLinkPage 로그인됨] memo 파싱 성공:', specs);
    }
  } catch (e) {
    // memo가 JSON이 아니면 그냥 텍스트로 취급
    console.error('[showPaymentLinkPage 로그인됨] memo 파싱 실패:', e);
    noteText = link.memo || '';
  }

  // 사양이 있으면 읽기 전용으로 표시
  let specsHtml = '';
  if (specs) {
    if (specs.type === 'book') {
      specsHtml = `
        <div style="background:#f9fafb; border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin-bottom:20px;">
          <h3 style="margin:0 0 12px 0; font-size:14px; font-weight:700; color:#0f172a;">📖 책 사양</h3>
          <ul style="margin:0; padding-left:16px; color:#334155; font-size:13px; line-height:1.8;">
            <li>표지 용지: ${specs.coverPaper || '-'}</li>
            <li>내지 용지: ${specs.innerPaper || '-'}</li>
            <li>총 페이지: ${specs.totalPages || '-'}p</li>
            <li>제본 방식: ${specs.binding || '-'}</li>
            <li>인쇄 부수: ${specs.printQuantity || '-'}부</li>
            ${specs.specialNote ? `<li>특이사항: ${specs.specialNote}</li>` : ''}
            ${noteText ? `<li>관리자 메모: ${noteText}</li>` : ''}
          </ul>
        </div>
      `;
    } else if (specs.type === 'flyer') {
      specsHtml = `
        <div style="background:#f9fafb; border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin-bottom:20px;">
          <h3 style="margin:0 0 12px 0; font-size:14px; font-weight:700; color:#0f172a;">📄 전단지 사양</h3>
          <ul style="margin:0; padding-left:16px; color:#334155; font-size:13px; line-height:1.8;">
            <li>용지: ${specs.singlePaper || '-'}</li>
            <li>인쇄 부수: ${specs.printQuantity || '-'}부</li>
            <li>후가공: ${specs.finishing || '-'}</li>
            ${specs.specialNote ? `<li>특이사항: ${specs.specialNote}</li>` : ''}
            ${noteText ? `<li>관리자 메모: ${noteText}</li>` : ''}
          </ul>
        </div>
      `;
    }
  }
  
  const html = `
    <div style="max-width:100%; margin:30px 0 0 0; padding:0;">
      <div class="card" style="max-width:900px; margin:0 auto; border:none; box-shadow:none; background:transparent;">
        <div style="padding:30px 20px; border-bottom:2px solid var(--line); background:transparent;">
          <h2 style="margin:0; font-size:28px; font-weight:900; color:#0f172a;">💳 개인결제</h2>
          <p style="margin:8px 0 0 0; font-size:14px; color:#64748b;">안전한 결제를 진행합니다</p>
        </div>
        <div style="padding:40px 20px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:30px; margin-bottom:30px;">
            <div style="background:linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%); border:2px solid #10b981; border-radius:12px; padding:25px;">
              <h3 style="margin:0 0 20px 0; font-size:16px; font-weight:700; color:#0f172a;">🛒 결제 정보</h3>
              <div style="display:grid; gap:16px;">
                <div>
                  <p style="margin:0 0 6px 0; font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">상품명</p>
                  <p style="margin:0; font-size:16px; font-weight:700; color:#0f172a;">${link.product_name}</p>
                </div>
                <div>
                  <p style="margin:0 0 6px 0; font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">결제금액</p>
                  <p style="margin:0; font-size:26px; font-weight:900; color:#10b981;">${(link.price || 0).toLocaleString()}원</p>
                </div>
                ${link.customer_name ? `
                <div>
                  <p style="margin:0 0 6px 0; font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">고객명</p>
                  <p style="margin:0; font-size:14px; font-weight:600; color:#0f172a;">${link.customer_name}</p>
                </div>
                ` : ''}
              </div>
            </div>

            ${specsHtml ? `
            <div>
              ${specsHtml}
            </div>
            ` : ''}
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <button class="btn btn-primary" onclick="processPaymentLink('${link.link_code}')" style="padding:16px; font-size:16px; font-weight:700; border-radius:8px;">결제하기</button>
            <button class="btn btn-secondary" onclick="goHome()" style="padding:16px; font-size:15px; background:#e2e8f0; color:#475569; border:1px solid #cbd5e1; border-radius:8px;">취소</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let mainContent = document.querySelector('.main-content');
  console.log('[showPaymentLinkPage 결제정보] mainContent 찾음:', mainContent ? '있음' : '없음');
  
  if (!mainContent) {
    console.log('[showPaymentLinkPage 결제정보] mainContent 생성 중...');
    mainContent = document.createElement('div');
    mainContent.className = 'main-content';
    mainContent.style.maxWidth = '100%';
    mainContent.style.margin = '0';
    mainContent.style.padding = '0';
    document.body.appendChild(mainContent);
    console.log('[showPaymentLinkPage 결제정보] mainContent 생성 및 추가 완료');
  }
  mainContent.innerHTML = html;
  mainContent.style.display = 'block';
  mainContent.style.visibility = 'visible';
  mainContent.style.zIndex = '1000';
  console.log('[showPaymentLinkPage 결제정보] HTML 렌더링 및 표시 완료', {
    display: mainContent.style.display,
    visibility: mainContent.style.visibility,
    offsetHeight: mainContent.offsetHeight
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  console.log('[showPaymentLinkPage 결제정보] PayApp 라이브러리 확인:', typeof PayApp !== 'undefined' ? '있음' : '없음');
}

async function processPaymentLink(linkCode) {
  console.log('[processPaymentLink] 시작:', { linkCode });
  const token = getToken();
  
  // 로그인 재확인
  if (!token) {
    console.error('[processPaymentLink] 토큰 없음 - 로그인 필요');
    alert('로그인이 필요합니다.');
    goLogin();
    return;
  }

  try {
    console.log('[processPaymentLink] 토큰 확인됨, 링크 정보 재조회 중...');
    const res = await fetch(`/api/payment-links/${linkCode}`);
    const data = await res.json();

    if (!data.success) {
      alert(data.message || '결제 링크가 만료되었거나 유효하지 않습니다.');
      goHome();
      return;
    }

    const link = data.link;

    // memo 사양 파싱 (주문 정보 기록용)
    let memoParsed = null;
    try {
      if (link.memo) memoParsed = JSON.parse(link.memo);
    } catch (e) {
      console.error('메모 파싱 실패 (무시):', e);
    }

    // 로그인한 사용자 정보 가져오기
    let userData = null;
    try {
      const userRes = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const userData_raw = await userRes.json();
      if (userData_raw.success) {
        userData = userData_raw.user;
      }
    } catch (e) {
      console.error('사용자 정보 조회 실패:', e);
    }

    // [Fix] 서버에 먼저 주문을 생성 (상태: pending/미결제)
    // 서버에서 orderId를 리턴받아 결제 팝업에서 var1으로 전달
    const preOrderPayload = {
      items: [{
        id: 'PAYMENT_LINK',
        category: '개인결제',
        title: link.product_name,
        qty: 1,
        price: link.price
      }],
      total_price: link.price,
      delivery_info: {
        recipient: userData?.name || '고객',
        phone: userData?.phone || '',
        address: '',
        requirements: ''
      },
      order_details: {
        payment_link_code: linkCode,
        payment_link_specs: memoParsed?.specs || null,
        payment_link_note: memoParsed?.note || '',
        payment_link_raw_memo: link.memo || ''
      },
      status: 'pending' // [Fix] 미결제 상태로 생성
    };

    let orderId;
    try {
      const createOrderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preOrderPayload)
      });

      if (!createOrderRes.ok) {
        throw new Error(`주문 생성 실패: ${createOrderRes.statusText}`);
      }

      const createOrderData = await createOrderRes.json();
      if (!createOrderData.success) {
        throw new Error('주문 생성 실패');
      }

      orderId = createOrderData.order_id;
      console.log('[processPaymentLink] ✅ 미결제 주문 생성 완료:', orderId);
      
      // sessionStorage에 orderId 저장 (monitorPaymentWindow에서 사용)
      sessionStorage.setItem('pendingPaymentLinkOrderId', orderId);
    } catch (e) {
      console.error('[processPaymentLink] 주문 생성 실패:', e);
      alert('주문 생성에 실패했습니다. 다시 시도해주세요.');
      return;
    }

    // [Fix] 임시 주문 데이터를 localStorage에 저장 (결제 완료 후 사용)
    const tempPaymentLinkOrder = {
      items: [{
        id: 'PAYMENT_LINK',
        category: '개인결제',
        title: link.product_name,
        qty: 1,
        price: link.price
      }],
      total_price: link.price,
      delivery_info: {
        recipient: userData?.name || '고객',
        phone: userData?.phone || '',
        address: '',
        requirements: ''
      },
      order_details: {
        payment_link_code: linkCode,
        payment_link_specs: memoParsed?.specs || null,
        payment_link_note: memoParsed?.note || '',
        payment_link_raw_memo: link.memo || ''
      },
      linkCode: linkCode
    };
    localStorage.setItem('tempPaymentLinkOrder', JSON.stringify(tempPaymentLinkOrder));
    console.log('[processPaymentLink] 임시 주문 데이터 저장 완료');

    // PayApp 결제 시작
    console.log('[processPaymentLink] PayApp 설정 및 결제 시작');
    
    // PayApp 사용 가능 여부 확인
    if (typeof PayApp === 'undefined') {
      console.error('[processPaymentLink] PayApp 라이브러리를 찾을 수 없음!');
      alert('결제 라이브러리 로딩 실패. 페이지를 새로고침하고 다시 시도해주세요.');
      return;
    }
    
    const PAYAPP_USERID = 'vinso112';
    const PAYAPP_LINKKEY = 'RQ0pApYSGpBaGQD4VDh2ZO1DPJnCCRVaOgT+oqg6zaM=';
    const PAYAPP_LINKVALUE = 'RQ0pApYSGpBaGQD4VDh2ZKAxb4U840FF2orYsZflIx8=';

    console.log('[processPaymentLink] PayApp.setDefault 호출 중...');
    PayApp.setDefault('userid', PAYAPP_USERID);
    PayApp.setDefault('linkkey', PAYAPP_LINKKEY);
    PayApp.setDefault('linkvalue', PAYAPP_LINKVALUE);
    PayApp.setDefault('shopname', '건우프린팅');
    console.log('[processPaymentLink] PayApp.setDefault 완료');

    // [Fix] 결제 완료 후 주문이 생성되므로 여기서는 orderId 포함
    const returnUrl = window.location.origin + '/';

    console.log('[processPaymentLink] PayApp.setParam 호출 중...');
    PayApp.setParam({
      'goodname': link.product_name,
      'price': link.price.toString(),
      'recvphone': userData?.phone || '',
      'memo': `개인결제 링크: ${linkCode}`,
      'smsuse': 'n',
      'redirectpay': '1',
      'returnurl': returnUrl,
      'feedbackurl': window.location.origin + '/api/payment-callback',
      'var1': orderId || '', // [Fix] 주문번호
      'var2': linkCode, // 결제링크 코드
      'skip_cstpage': 'y'
    });
    console.log('[processPaymentLink] PayApp.setParam 완료');

    // 결제중 상태 표시
    showPaymentProcessing();
    window.open('', 'PayAppWindow', 'width=600,height=1200,scrollbars=yes');
    console.log('[processPaymentLink] PayApp.setTarget 및 payrequest 호출 중...');
    PayApp.setTarget('PayAppWindow');
    PayApp.payrequest();
    console.log('[processPaymentLink] 결제 요청 완료');

  } catch (error) {
    console.error('[processPaymentLink] 오류 발생:', error);
    alert('결제 처리 중 오류가 발생했습니다.');
  }
}

// 개인결제 링크로 결제 완료 시 처리
async function handlePaymentLinkComplete(payCode, orderId) {
  console.log('[handlePaymentLinkComplete] 시작:', { payCode, orderId });
  
  try {
    // 결제 완료 → 임시저장된 ID 제거
    sessionStorage.removeItem('pendingPaymentLinkOrderId');
    console.log('[handlePaymentLinkComplete] 임시 주문ID 제거 완료');
    
    // 로그인 토큰 확인
    const token = getToken();
    if (!token) {
      console.warn('[handlePaymentLinkComplete] 토큰 없음 - 로그인 필요');
      alert('로그인이 필요합니다. 다시 로그인 후 결제 완료를 확인해주세요.');
      goLogin();
      return;
    }

    console.log('[handlePaymentLinkComplete] 주문ID:', orderId);

    // 링크 사용 처리
    try {
      await fetch(`/api/payment-links/${payCode}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId })
      });
      console.log('[handlePaymentLinkComplete] 링크 사용 처리 완료');
    } catch (e) {
      console.warn('[handlePaymentLinkComplete] 링크 사용 처리 중 오류 (계속 진행):', e);
    }

    // 주문 정보 조회하여 주문완료 팝업 표시
    try {
      const orderRes = await fetch(`/api/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const orderData = await orderRes.json();
      
      if (orderData.success && orderData.order) {
        const order = orderData.order;
        const totalPrice = order.total_price || 0;
        const orderCode = order.order_code || orderId;
        
        // 주문완료 팝업 표시 (확인 버튼 클릭 시 주문내역으로 이동)
        showOrderCompleteWithNavigation(orderId, orderCode, totalPrice);
      } else {
        console.warn('[handlePaymentLinkComplete] 주문 정보 조회 실패');
        goOrderHistory();
      }
    } catch (e) {
      console.error('[handlePaymentLinkComplete] 주문 정보 조회 오류:', e);
      goOrderHistory();
    }

  } catch (error) {
    console.error('[handlePaymentLinkComplete] 오류:', error);
    alert('결제는 완료되었으나 처리 중 오류가 발생했습니다.');
    goHome();
  }
}

// 주문완료 팝업 표시 (확인 버튼 클릭 시 주문내역으로 이동)
function showOrderCompleteWithNavigation(orderId, orderCode, totalPrice) {
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
        <button onclick="goOrderHistory()" style="width:100%; padding:14px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:700; font-size:16px; cursor:pointer; margin-bottom:10px; transition:background 0.3s;">주문 조회하기</button>
        <button onclick="goHome()" style="width:100%; padding:12px; background:#f1f5f9; color:#0f172a; border:none; border-radius:8px; font-weight:600; font-size:14px; cursor:pointer; transition:background 0.3s;">홈으로 돌아가기</button>
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
    mainContent.style.visibility = 'visible';
    mainContent.style.zIndex = '10000';
    document.querySelectorAll('[id^="view-"]').forEach(el => el.style.display = 'none');
  }
}

// ==================== 자동 실행 코드 ====================
console.log('[payment_link_functions.js] 파일 로드 완료');

// 페이지 로드 시 자동으로 결제 링크 확인
if (document.readyState === 'loading') {
  console.log('[payment_link_functions.js] DOM 로딩 중 - DOMContentLoaded 대기');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[payment_link_functions.js] DOMContentLoaded 발생');
    checkPaymentLinkAccess();
  });
} else {
  console.log('[payment_link_functions.js] DOM 이미 로드됨 - 즉시 실행');
  // DOM이 이미 로드된 경우 즉시 실행
  setTimeout(() => {
    console.log('[payment_link_functions.js] setTimeout 실행');
    checkPaymentLinkAccess();
  }, 100);
}
console.log('[payment_link_functions.js] 파일 로드 완료 - loadPaymentLinks, showCreatePaymentLinkForm 함수 사용 가능');
window._paymentLinkFunctionsLoaded = true;
