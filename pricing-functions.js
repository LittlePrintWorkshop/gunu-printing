// ===== 통합 가격 관리 (Pricing Management) =====
let pricingData = {};
let activePricingTab = 'paper';

function switchPricingTab(tabName) {
  console.log('[switchPricingTab] 탭 전환:', tabName);
  
  // 모든 탭 숨기기
  const tabIds = ['pricing-tab-paper', 'pricing-tab-printing', 'pricing-tab-margin', 'pricing-tab-shipping'];
  tabIds.forEach(id => { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'none'; 
  });
  
  // 선택된 탭 보이기
  const activeTabId = `pricing-tab-${tabName}`;
  const activeTab = document.getElementById(activeTabId);
  if (activeTab) {
    activeTab.style.display = 'block';
    console.log('[switchPricingTab] 탭 표시:', activeTabId);
  } else {
    console.error('[switchPricingTab] 탭을 찾을 수 없음:', activeTabId);
  }
  
  // 버튼 스타일 업데이트
  const buttons = document.querySelectorAll('.pricing-tab-btn');
  buttons.forEach((btn, idx) => {
    const btnTabName = ['paper', 'printing', 'margin', 'shipping'][idx];
    if (btnTabName === tabName) {
      btn.style.borderBottomColor = '#0066cc';
      btn.style.color = '#0066cc';
      btn.style.fontWeight = '600';
      btn.classList.add('active');
    } else {
      btn.style.borderBottomColor = 'transparent';
      btn.style.color = '#666';
      btn.style.fontWeight = '400';
      btn.classList.remove('active');
    }
  });
  
  activePricingTab = tabName;
}

async function loadPricingSettings() {
  try {
    console.log('[pricing-functions] loadPricingSettings 시작');
    const token = getToken();
    console.log('[pricing-functions] token:', token ? 'exists' : 'missing');
    const response = await fetch('/api/admin/pricing', { headers: { 'Authorization': `Bearer ${token}` } });
    console.log('[pricing-functions] API response status:', response.status);
    if (!response.ok) throw new Error('Load failed: ' + response.status);
    const result = await response.json();
    console.log('[pricing-functions] API response:', result);
    if (!result.success) throw new Error(result.message);
    pricingData = result.data || {};
    console.log('[pricing-functions] pricingData:', pricingData);
    renderPaperPrices(pricingData.paper_prices || []);
    renderPrintingCosts(pricingData.printing_costs || {});
    renderMarginSettings(pricingData.margin_settings || {});
    renderShippingCosts(pricingData.additional_costs || []);
    switchPricingTab('paper');
    toast('가격 데이터 로드 완료');
  } catch (e) { console.error('[pricing-functions] Error:', e); toast('로드 실패: ' + e.message); }
}

function renderPaperPrices(papers) {
  const c = get('paper-prices-list');
  if (!c) {
    console.error('[renderPaperPrices] paper-prices-list 요소를 찾을 수 없습니다!');
    return;
  }
  console.log('[renderPaperPrices] papers:', papers);
  console.log('[renderPaperPrices] 컨테이너 요소:', c);
  c.innerHTML = papers.length === 0 ? '<div style="padding:20px;text-align:center;color:#94a3b8;">데이터 없음</div>' : '';
  papers.forEach(p => {
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;';
    div.innerHTML = `<div style="font-weight:700;color:#0f172a;margin-bottom:12px;">${p.paper_type} ${p.gram}g</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><label style="font-size:12px;color:#64748b;">국전지</label>
          <input type="number" id="paper-kook-${p.id}" value="${p.kook_price||0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
        </div>
        <div><label style="font-size:12px;color:#64748b;">46전지</label>
          <input type="number" id="paper-sheet-${p.id}" value="${p.sheet_4x6_price||0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
        </div>
      </div>
      <button onclick="savePaperPrice(${p.id})" style="width:100%;padding:8px;background:#037a3f;color:#fff;border:none;border-radius:4px;margin-top:12px;font-weight:700;cursor:pointer;">저장</button>`;
    c.appendChild(div);
  });
  console.log('[renderPaperPrices] 렌더링 완료:', c.children.length + '개 항목');
}

function renderPrintingCosts(costs) {
  const c = get('printing-costs-list');
  if (!c) {
    console.error('[renderPrintingCosts] printing-costs-list 요소를 찾을 수 없습니다!');
    return;
  }
  console.log('[renderPrintingCosts] costs:', costs);
  console.log('[renderPrintingCosts] 컨테이너:', c);
  
  // costs는 dict: { 'indigo': {...}, 'digital': {...}, ... }
  const entries = Object.entries(costs || {});
  console.log('[renderPrintingCosts] entries:', entries);
  c.innerHTML = '';  // 명시적으로 비우기
  
  if (entries.length === 0) {
    c.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">데이터 없음</div>';
    return;
  }
  
  const names = { indigo: '인디고', digital: '디지털', offset: '옵셋', flyer_small: '전단(소)', flyer_large: '전단(대)' };
  
  entries.forEach(([cat, co]) => {
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;';
    
    // 전단은 표지/내지 구분 없이 단순 표시
    if (cat === 'flyer_small' || cat === 'flyer_large') {
      div.innerHTML = `
        <div style="font-weight:700;color:#0f172a;margin-bottom:12px;">${names[cat] || cat}</div>
        <div style="margin-bottom:8px;">
          <label style="font-size:12px;color:#64748b;">인쇄비</label>
          <input type="number" id="print-cover-${cat}" value="${co.cover_print_cost || 0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
        </div>
        <button onclick="savePrintingCostByCategory('${cat}')" style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:4px;font-weight:700;cursor:pointer;">저장</button>
      `;
    } else {
      // 책자는 표지/내지 구분
      div.innerHTML = `
        <div style="font-weight:700;color:#0f172a;margin-bottom:12px;">${names[cat] || cat}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
          <div>
            <label style="font-size:12px;color:#64748b;">표지 인쇄비</label>
            <input type="number" id="print-cover-${cat}" value="${co.cover_print_cost || 0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
          </div>
          <div>
            <label style="font-size:12px;color:#64748b;">내지 인쇄비</label>
            <input type="number" id="print-inner-${cat}" value="${co.inner_print_cost || 0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
          </div>
        </div>
        <button onclick="savePrintingCostByCategory('${cat}')" style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:4px;font-weight:700;cursor:pointer;margin-top:8px;">저장</button>
      `;
    }
    c.appendChild(div);
  });
  console.log('[renderPrintingCosts] 렌더링 완료:', c.children.length + '개 항목');
}

function renderMarginSettings(margins) {
  const c = get('margin-list');
  if (!c) {
    console.error('[renderMarginSettings] margin-list 요소를 찾을 수 없습니다!');
    return;
  }
  console.log('[renderMarginSettings] margins:', margins);
  console.log('[renderMarginSettings] 컨테이너:', c);
  
  // margins는 dict: { 'indigo': { 'general': 100, 'business': 50 }, ... }
  const entries = Object.entries(margins || {});
  console.log('[renderMarginSettings] entries:', entries);
  c.innerHTML = '';  // 명시적으로 비우기
  
  if (entries.length === 0) {
    c.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">데이터 없음</div>';
    return;
  }
  
  const names = { indigo: '인디고', digital: '디지털', offset: '옵셋', flyer_small: '전단(소)', flyer_large: '전단(대)' };
  
  entries.forEach(([cat, rates]) => {
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;';
    div.innerHTML = `
      <div style="font-weight:700;color:#0f172a;margin-bottom:12px;">${names[cat] || cat}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;color:#64748b;">일반 마진율 (%)</label>
          <input type="number" id="margin-general-${cat}" value="${rates.general || 0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
        </div>
        <div>
          <label style="font-size:12px;color:#64748b;">사업자 마진율 (%)</label>
          <input type="number" id="margin-business-${cat}" value="${rates.business || 0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
        </div>
      </div>
      <button onclick="saveMarginSetting('${cat}')" style="width:100%;padding:8px;background:#037a3f;color:#fff;border:none;border-radius:4px;margin-top:12px;font-weight:700;cursor:pointer;">저장</button>
    `;
    c.appendChild(div);
  });
  console.log('[renderMarginSettings] 렌더링 완료:', c.children.length + '개 항목');
}

function renderShippingCosts(costs) {
  const c = get('shipping-list');
  if (!c) {
    console.error('[renderShippingCosts] shipping-list 요소를 찾을 수 없습니다!');
    return;
  }
  console.log('[renderShippingCosts] costs:', costs);
  
  // costs는 array: shipping_flyer_small, shipping_flyer_large, shipping_digital, shipping_indigo, shipping_offset
  const shippingCosts = costs.filter(co => co.cost_name && co.cost_name.startsWith('shipping_'));
  c.innerHTML = shippingCosts.length === 0 ? '<div style="padding:20px;text-align:center;color:#94a3b8;">배송비 데이터 없음</div>' : '';
  
  const names = {
    'shipping_flyer_small': '소형전단',
    'shipping_flyer_large': '대형전단',
    'shipping_digital': '디지털',
    'shipping_indigo': '인디고',
    'shipping_offset': '옵셋'
  };
  
  shippingCosts.forEach(co => {
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;';
    div.innerHTML = `
      <div style="font-weight:700;color:#0f172a;margin-bottom:12px;">📦 ${names[co.cost_name] || co.cost_name}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;color:#64748b;">배송료</label>
          <input type="number" id="shipping-cost-${co.id}" value="${co.cost||0}" min="0" oninput="if (this.value < 0) this.value = 0;" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
        </div>
        <div>
          <label style="font-size:12px;color:#64748b;">단위</label>
          <select id="shipping-unit-${co.id}" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
            <option value="fixed" ${co.unit === 'fixed' ? 'selected' : ''}>고정</option>
            <option value="per_piece" ${co.unit === 'per_piece' ? 'selected' : ''}>부당</option>
          </select>
        </div>
      </div>
      <button onclick="saveAdditionalCost(${co.id})" style="width:100%;padding:8px;background:#0891b2;color:#fff;border:none;border-radius:4px;font-weight:700;cursor:pointer;margin-top:8px;">저장</button>
    `;
    c.appendChild(div);
  });
  console.log('[renderShippingCosts] 렌더링 완료:', c.children.length + '개 항목');
}


async function savePaperPrice(id) {
  const k = parseInt(get(`paper-kook-${id}`)?.value || 0);
  const s = parseInt(get(`paper-sheet-${id}`)?.value || 0);
  try {
    const r = await fetch(`/api/admin/pricing/paper/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ kook_price: k, sheet_4x6_price: s }) });
    const d = await r.json();
    if (d.success) toast('저장됨'); else alert(d.message);
  } catch (e) { alert('오류: ' + e.message); }
}

async function savePrintingCost(id) {
  const c = parseInt(get(`print-cover-${id}`)?.value || 0);
  const i = parseInt(get(`print-inner-${id}`)?.value || 0);
  try {
    const r = await fetch(`/api/admin/pricing/printing/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ cover_print_cost: c, inner_print_cost: i }) });
    const d = await r.json();
    if (d.success) toast('저장됨'); else alert(d.message);
  } catch (e) { alert('오류: ' + e.message); }
}

async function savePrintingCostByCategory(category) {
  const c = parseInt(get(`print-cover-${category}`)?.value || 0);
  const i = parseInt(get(`print-inner-${category}`)?.value || 0);
  try {
    const r = await fetch(`/api/admin/pricing/printing/${category}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ cover_print_cost: c, inner_print_cost: i }) });
    const d = await r.json();
    if (d.success) toast('저장됨'); else alert(d.message);
  } catch (e) { alert('오류: ' + e.message); }
}

async function saveMarginSetting(cat) {
  const g = parseInt(get(`margin-general-${cat}`)?.value || 0);
  const b = parseInt(get(`margin-business-${cat}`)?.value || 0);
  try {
    const r = await fetch('/api/admin/pricing/margin', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ category: cat, general_margin: g, business_margin: b }) });
    const d = await r.json();
    if (d.success) toast('저장됨'); else alert(d.message);
  } catch (e) { alert('오류: ' + e.message); }
}


async function saveAdditionalCost(id) {
  const c = parseInt(get(`additional-cost-${id}`)?.value || 0);
  try {
    const r = await fetch(`/api/admin/pricing/additional/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify({ cost: c }) });
    const d = await r.json();
    if (d.success) toast('저장됨'); else alert(d.message);
  } catch (e) { alert('오류: ' + e.message); }
}
