/**
 * 이중 시스템 (견적형 + 판매형) 관리 페이지 - JavaScript
 * script.js에 추가할 함수들
 */

// ========== 카테고리 관리 ==========

async function loadCategories() {
  try {
    const response = await fetch('/api/categories');
    
    // 응답 상태 확인
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      return;
    }
    
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    const categories = result.data;
    
    // 카테고리 필터링
    const quoteCategories = categories.filter(c => c.category_type === 'quote');
    const sellableCategories = categories.filter(c => c.category_type === 'sellable');
    
    // 견적형 카테고리 렌더링
    renderCategoryList('quote-categories-list', quoteCategories);
    
    // 판매형 카테고리 렌더링
    renderCategoryList('sellable-categories-list', sellableCategories);
    
    // 셀렉트 박스 업데이트
    updateCategorySelects(quoteCategories, sellableCategories);
    
  } catch (e) {
    console.error('❌ 카테고리 로드 실패:', e);
  }
}

function renderCategoryList(containerId, categories) {
  const container = get(containerId);
  if (!container) return;
  
  if (categories.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; padding:30px; text-align:center; color:#64748b;">카테고리가 없습니다.</div>';
    return;
  }
  
  // 부모 카테고리만 필터링
  const parentCategories = categories.filter(c => !c.parent_id);
  
  // 각 부모별로 자식 카테고리 매핑
  const categoryMap = {};
  categories.forEach(cat => {
    if (!categoryMap[cat.parent_id || 'root']) {
      categoryMap[cat.parent_id || 'root'] = [];
    }
    categoryMap[cat.parent_id || 'root'].push(cat);
  });
  
  // 부모 카테고리별로 카드 생성
  container.innerHTML = parentCategories.map(parent => {
    const children = categoryMap[parent.id] || [];
    
    return `
      <div style="border:2px solid #cbd5e1; border-radius:12px; background:#fff; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- 부모 카테고리 헤더 -->
        <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:16px; color:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
            <div style="flex:1;">
              <div style="font-size:24px; margin-bottom:6px;">${parent.icon || '📌'}</div>
              <div style="font-weight:900; font-size:16px; margin-bottom:4px;">📦 ${parent.name}</div>
              <div style="font-size:12px; opacity:0.9;">${parent.description || '부모 카테고리'}</div>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button onclick="editCategory(${parent.id})" class="btn" style="padding:6px 12px; font-size:10px; background:rgba(255,255,255,0.2); color:#fff; border:1px solid rgba(255,255,255,0.5); border-radius:4px; cursor:pointer; font-weight:600;">✎ 편집</button>
              <button onclick="deleteCategory(${parent.id})" class="btn" style="padding:6px 12px; font-size:10px; background:rgba(255,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.5); border-radius:4px; cursor:pointer; font-weight:600;">✕ 삭제</button>
            </div>
          </div>
          <div style="font-size:11px; margin-top:8px; opacity:0.9;">
            상태: ${parent.is_active ? '✓ 활성' : '✗ 비활성'} | ID: ${parent.id}
          </div>
        </div>
        
        <!-- 자식 카테고리 목록 -->
        <div style="padding:12px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          ${children.length === 0 
            ? '<div style="padding:12px; text-align:center; color:#94a3b8; font-size:12px;">자식 카테고리 없음</div>'
            : `
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${children.map(child => `
                  <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1;">
                      <span style="font-size:14px; color:#9ca3af;">↳</span>
                      <div>
                        <div style="font-weight:600; font-size:13px; color:#0f172a;">${child.name}</div>
                        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${child.description || '-'}</div>
                      </div>
                    </div>
                    <div style="display:flex; gap:4px; flex-shrink:0;">
                      <span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:4px 8px; border-radius:3px;">${child.is_active ? '✓' : '✗'}</span>
                      <button onclick="editCategory(${child.id})" class="btn" style="padding:4px 8px; font-size:10px; background:#3b82f6; color:#fff; border:none; border-radius:3px; cursor:pointer;">✎</button>
                      <button onclick="deleteCategory(${child.id})" class="btn" style="padding:4px 8px; font-size:10px; background:#ef4444; color:#fff; border:none; border-radius:3px; cursor:pointer;">✕</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `
          }
        </div>
      </div>
    `;
  }).join('');
}

function updateCategorySelects(quoteCategories, sellableCategories) {
  // 견적형 카테고리 셀렉트
  const quoteSelect = get('quote-category-filter');
  if (quoteSelect) {
    quoteSelect.innerHTML = '<option value="">-- 전체 --</option>' +
      quoteCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
  
  // 판매형 카테고리 셀렉트
  const sellableSelect = get('sellable-category-filter');
  if (sellableSelect) {
    sellableSelect.innerHTML = '<option value="">-- 전체 --</option>' +
      sellableCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

function openAddCategoryModal() {
  const type = prompt('카테고리 타입을 선택하세요:\n1. 견적형 (quote)\n2. 판매형 (sellable)');
  if (!type) return;
  
  const categoryType = type === '1' ? 'quote' : type === '2' ? 'sellable' : null;
  if (!categoryType) {
    alert('유효하지 않은 선택입니다.');
    return;
  }
  
  const name = prompt('카테고리명을 입력하세요:');
  if (!name) return;
  
  const icon = prompt('아이콘/이모지를 입력하세요 (예: 📌):');
  const description = prompt('설명을 입력하세요 (선택사항):');
  
  createCategory({
    name,
    category_type: categoryType,
    icon: icon || '',
    description: description || ''
  });
}

async function createCategory(data) {
  try {
    const token = localStorage.getItem('token');
    console.log('[createCategory] token from localStorage:', token);
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    console.log('[createCategory] headers:', headers);
    
    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });
    
    console.log('[createCategory] response status:', response.status);
    
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    alert('✅ 카테고리가 생성되었습니다.');
    await loadCategories();
    
  } catch (e) {
    alert(`❌ 카테고리 생성 실패: ${e.message}`);
  }
}

async function editCategory(catId) {
  try {
    const response = await fetch('/api/categories');
    const result = await response.json();
    const category = result.data.find(c => c.id === catId);
    
    if (!category) {
      alert('카테고리를 찾을 수 없습니다.');
      return;
    }
    
    const newName = prompt(`카테고리명 수정:\n(현재: ${category.name})`, category.name);
    if (!newName) return;
    
    const token = localStorage.getItem('token');
    const response2 = await fetch(`/api/categories/${catId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: newName })
    });
    
    const result2 = await response2.json();
    if (!result2.success) throw new Error(result2.message);
    
    alert('✅ 카테고리가 업데이트되었습니다.');
    await loadCategories();
    
  } catch (e) {
    alert(`❌ 수정 실패: ${e.message}`);
  }
}

async function deleteCategory(catId) {
  if (!confirm('정말 이 카테고리를 삭제하시겠습니까?\n(하위 상품이 있으면 먼저 삭제해야 합니다)')) return;
  
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/categories/${catId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    alert('✅ 카테고리가 삭제되었습니다.');
    await loadCategories();
    
  } catch (e) {
    alert(`❌ 삭제 실패: ${e.message}`);
  }
}


// ========== 상품 관리 ==========

async function loadCategoryProducts(type) {
  try {
    const categoryId = get(`${type}-category-filter`)?.value;
    
    let url = `/api/products?type=${type}_based`;
    if (categoryId) {
      url += `&category_id=${categoryId}`;
    }
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    const products = result.data || [];
    
    // 테이블 형식으로 렌더링
    renderProductsTable(type, products);
    
  } catch (e) {
    console.error(`❌ ${type} 상품 로드 실패:`, e);
  }
}

function renderProductCard(product, type) {
  const typeLabel = type === 'quote' ? '📌 견적형' : '🎁 판매형';
  const statusText = product.is_active ? '활성' : '비활성';
  
  let priceInfo = '';
  if (type === 'sellable') {
    priceInfo = `<div style="font-size:14px; font-weight:800; color:#10b981; margin:8px 0;">₩${product.fixed_price?.toLocaleString() || '미설정'}</div>
                 <div style="font-size:12px; color:#64748b;">재고: ${product.quantity}개</div>`;
  }
  
  return `
    <div style="border:1px solid #e2e8f0; border-radius:8px; padding:16px; background:#fff; display:flex; flex-direction:column; gap:12px;">
      <div>
        <div style="font-size:12px; color:#94a3b8; margin-bottom:4px;">${typeLabel}</div>
        <div style="font-weight:800; font-size:14px; color:#0f172a;">${product.name}</div>
        ${priceInfo}
      </div>
      <div style="font-size:12px; color:#64748b; line-height:1.5;">
        마진: ${product.margin}% | 상태: ${statusText}
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="editProduct(${product.id}, '${type}')" class="btn" style="flex:1; padding:8px 12px; font-size:11px; background:#3b82f6; color:#fff; border:none; border-radius:4px;">✎ 편집</button>
        <button onclick="deleteProduct(${product.id}, '${type}')" class="btn" style="flex:1; padding:8px 12px; font-size:11px; background:#ef4444; color:#fff; border:none; border-radius:4px;">✕ 삭제</button>
      </div>
    </div>
  `;
}

function switchProductManagementTab(type) {
  // 탭 버튼 활성화
  const quoteBtn = get('tab-quote-products');
  const sellableBtn = get('tab-sellable-products');
  
  if (type === 'quote') {
    quoteBtn.style.borderColor = '#6366f1';
    quoteBtn.style.color = '#6366f1';
    sellableBtn.style.borderColor = '#cbd5e1';
    sellableBtn.style.color = '#64748b';
  } else {
    quoteBtn.style.borderColor = '#cbd5e1';
    quoteBtn.style.color = '#64748b';
    sellableBtn.style.borderColor = '#6366f1';
    sellableBtn.style.color = '#6366f1';
  }
  
  // 섹션 표시
  get('quote-products-section').style.display = type === 'quote' ? 'block' : 'none';
  get('sellable-products-section').style.display = type === 'sellable' ? 'block' : 'none';
  
  // 카테고리 로드 및 상품 로드 (비동기)
  loadCategories().then(() => {
    loadCategoryProducts(type);
  }).catch(e => {
    console.error('카테고리 로드 실패:', e);
    loadCategoryProducts(type);
  });
}

function openAddProductModal() {
  // 모달 초기화
  document.getElementById('product-form').reset();
  document.getElementById('option-groups-container').innerHTML = '';
  document.getElementById('option-variants-list').innerHTML = '';
  
  // 카테고리 로드 및 셀렉트 채우기
  loadCategoriesForProductModal();
  
  // 모달 표시
  document.getElementById('add-product-modal').style.display = 'flex';
}

function closeAddProductModal() {
  document.getElementById('add-product-modal').style.display = 'none';
}

function updateProductFormDisplay() {
  const type = document.getElementById('product-type').value;
  const sellableSection = document.getElementById('sellable-price-section');
  const optionsSection = document.getElementById('options-section');
  const variantsSection = document.getElementById('option-variants-section');
  
  if (type === 'sellable') {
    sellableSection.style.display = 'block';
    optionsSection.style.display = 'block';
    variantsSection.style.display = 'block';
  } else {
    sellableSection.style.display = 'none';
    optionsSection.style.display = 'none';
    variantsSection.style.display = 'none';
  }
}

// 카테고리 로드 및 모달 셀렉트 채우기
async function loadCategoriesForProductModal() {
  try {
    const response = await fetch('/api/categories');
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    const categories = result.data || [];
    const select = document.getElementById('product-category');
    
    // 부모 카테고리만 표시 (판매형)
    const parentCats = categories.filter(c => !c.parent_id && c.category_type === 'sellable');
    
    select.innerHTML = '<option value="">-- 카테고리 선택 --</option>' +
      parentCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      
  } catch (e) {
    console.error('카테고리 로드 실패:', e);
  }
}

// ===== 옵션 관리 함수 =====

let optionGroupCounter = 0;

function addOptionGroup() {
  optionGroupCounter++;
  const groupId = optionGroupCounter;
  
  const html = `
    <div id="option-group-${groupId}" style="border:1px solid #cbd5e1; border-radius:6px; padding:12px; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <input type="text" placeholder="옵션명 (예: 크기, 색상)" class="option-group-name" value="" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;">
        <button type="button" onclick="removeOptionGroup(${groupId})" style="margin-left:8px; padding:6px 10px; background:#ef4444; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">✕ 제거</button>
      </div>
      
      <div style="margin-bottom:8px;">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" placeholder="옵션값 (예: S, M, L)" class="option-value" value="" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;">
          <button type="button" onclick="addOptionValue(${groupId})" style="padding:6px 10px; background:#667eea; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">+ 값 추가</button>
        </div>
        <div id="option-values-${groupId}" style="display:flex; flex-wrap:wrap; gap:6px;">
          <!-- 옵션 값들이 여기 표시됨 -->
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('option-groups-container').innerHTML += html;
  updateOptionVariants();
}

function removeOptionGroup(groupId) {
  document.getElementById(`option-group-${groupId}`).remove();
  updateOptionVariants();
}

function addOptionValue(groupId) {
  const group = document.getElementById(`option-group-${groupId}`);
  const input = group.querySelector('.option-value');
  const value = input.value.trim();
  
  if (!value) {
    alert('옵션값을 입력해주세요.');
    return;
  }
  
  const valueContainer = document.getElementById(`option-values-${groupId}`);
  const valueBadge = document.createElement('div');
  valueBadge.style.cssText = 'display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; padding:6px 10px; border-radius:4px; font-size:11px;';
  valueBadge.innerHTML = `
    <span>${value}</span>
    <button type="button" onclick="this.parentElement.remove(); updateOptionVariants()" style="background:none; border:none; cursor:pointer; color:#ef4444; font-weight:bold;">✕</button>
  `;
  
  valueContainer.appendChild(valueBadge);
  input.value = '';
  updateOptionVariants();
}

function updateOptionVariants() {
  const optionGroups = [];
  const groupElements = document.querySelectorAll('[id^="option-group-"]');
  
  groupElements.forEach(groupEl => {
    const groupName = groupEl.querySelector('.option-group-name').value || '옵션';
    const values = Array.from(groupEl.querySelectorAll('#' + groupEl.id + ' [id^="option-values-"] > div')).map(el => el.textContent.trim().replace('✕', '').trim());
    
    if (values.length > 0) {
      optionGroups.push({ name: groupName, values });
    }
  });
  
  // 옵션 조합 생성 (카르테시안 곱)
  if (optionGroups.length === 0) {
    document.getElementById('option-variants-list').innerHTML = '<div style="color:#94a3b8; font-size:12px; text-align:center; padding:20px;">옵션을 추가하면 조합이 자동으로 생성됩니다.</div>';
    return;
  }
  
  const combinations = cartesianProduct(optionGroups.map(g => g.values));
  
  let html = combinations.map((combo, idx) => {
    const comboName = combo.join(' / ');
    return `
      <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px; align-items:center; padding:12px; background:#fff; border:1px solid #fcd34d; border-radius:6px;">
        <div>
          <div style="font-weight:600; font-size:12px; color:#0f172a;">${comboName}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
            ${optionGroups.map((g, i) => `<span>${g.name}: ${combo[i]}</span>`).join(' • ')}
          </div>
        </div>
        <div>
          <input type="number" placeholder="가격" class="variant-price-${idx}" value="0" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; box-sizing:border-box;">
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('option-variants-list').innerHTML = html;
}

function cartesianProduct(arrays) {
  if (arrays.length === 0) return [[]];
  const [head, ...tail] = arrays;
  const tailProduct = cartesianProduct(tail);
  return head.flatMap(h => tailProduct.map(t => [h, ...t]));
}

async function submitAddProduct() {
  const type = document.getElementById('product-type').value;
  const categoryId = parseInt(document.getElementById('product-category').value);
  const name = document.getElementById('product-name').value.trim();
  const margin = parseInt(document.getElementById('product-margin').value) || 0;
  
  if (!type || !categoryId || !name) {
    alert('상품 타입, 카테고리, 상품명은 필수입니다.');
    return;
  }
  
  const data = {
    category_id: categoryId,
    name,
    product_type: type,
    margin,
    is_active: true
  };
  
  if (type === 'sellable') {
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const quantity = parseInt(document.getElementById('product-quantity').value) || 0;
    
    data.fixed_price = price;
    data.quantity = quantity;
    
    // 옵션 조합 데이터 수집
    const optionGroups = [];
    document.querySelectorAll('[id^="option-group-"]').forEach(groupEl => {
      const groupName = groupEl.querySelector('.option-group-name').value.trim();
      const values = Array.from(groupEl.querySelectorAll('[id^="option-values-"] > div')).map(el => el.textContent.trim().replace('✕', '').trim());
      
      if (groupName && values.length > 0) {
        optionGroups.push({ name: groupName, values });
      }
    });
    
    if (optionGroups.length > 0) {
      const variants = cartesianProduct(optionGroups.map(g => g.values));
      data.variants = variants.map((combo, idx) => {
        const priceInput = document.querySelector(`.variant-price-${idx}`);
        return {
          options: optionGroups.map((g, i) => ({ name: g.name, value: combo[i] })).reduce((acc, opt) => ({ ...acc, [opt.name]: opt.value }), {}),
          price: parseFloat(priceInput?.value || 0),
          stock: 0
        };
      });
    }
  }
  
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    alert('✅ 상품이 생성되었습니다.');
    closeAddProductModal();
    
    // 현재 탭에 따라 리로드
    const currentTab = document.getElementById('tab-quote-products').style.borderColor === 'rgb(99, 102, 241)' ? 'quote' : 'sellable';
    await loadCategoryProducts(currentTab);
    
  } catch (e) {
    alert(`❌ 상품 생성 실패: ${e.message}`);
  }
}

async function editProduct(productId, type) {
  try {
    const response = await fetch(`/api/products?type=${type}_based`);
    const result = await response.json();
    const product = result.data.find(p => p.id === productId);
    
    if (!product) {
      alert('상품을 찾을 수 없습니다.');
      return;
    }
    
    const newName = prompt(`상품명 수정:\n(현재: ${product.name})`, product.name);
    if (!newName) return;
    
    const token = localStorage.getItem('token');
    const response2 = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: newName })
    });
    
    const result2 = await response2.json();
    if (!result2.success) throw new Error(result2.message);
    
    alert('✅ 상품이 업데이트되었습니다.');
    await loadCategoryProducts(type);
    
  } catch (e) {
    alert(`❌ 수정 실패: ${e.message}`);
  }
}

async function deleteProduct(productId, type) {
  if (!confirm('정말 이 상품을 삭제하시겠습니까?')) return;
  
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/products/${productId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    alert('✅ 상품이 삭제되었습니다.');
    await loadCategoryProducts(type);
    
  } catch (e) {
    alert(`❌ 삭제 실패: ${e.message}`);
  }
}

// ========== 초기화 ==========

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
  // 관리자 탭 클릭 시 카테고리/상품 로드
  window.originalShowAdminTab = window.showAdminTab;
  window.showAdminTab = function(tabId) {
    window.originalShowAdminTab(tabId);
    
    if (tabId === 'adm-categories') {
      loadCategories();
    } else if (tabId === 'adm-products') {
      switchProductManagementTab('quote');
    }
  };
});

// ===== 개선된 상품 관리 함수들 =====

// 모든 상품 선택/해제
function toggleSelectAll(checkbox) {
  const tableId = checkbox.id.includes('sellable') ? 'sellable-products-list' : 'quote-products-list';
  const table = document.getElementById(tableId);
  const checkboxes = table.querySelectorAll('input[type="checkbox"][data-product-id]');
  
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateBulkActionUI();
}

// 개별 상품 선택 상태 변경
function onProductCheckboxChange() {
  updateBulkActionUI();
}

// 일괄 작업 UI 업데이트
function updateBulkActionUI() {
  const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"][data-product-id]:checked');
  const bulkActionsDiv = document.getElementById('adm-product-bulk-actions');
  const selectedCountSpan = document.getElementById('adm-selected-count');
  
  if (selectedCheckboxes.length > 0) {
    bulkActionsDiv.style.display = 'flex';
    selectedCountSpan.textContent = selectedCheckboxes.length;
  } else {
    bulkActionsDiv.style.display = 'none';
  }
}

// 필터와 검색 적용
function filterAndLoadProducts() {
  const currentTab = document.getElementById('tab-quote-products').style.borderColor === 'rgb(99, 102, 241)' ? 'quote' : 'sellable';
  
  const categoryFilter = document.getElementById('adm-product-category-filter').value;
  const statusFilter = document.getElementById('adm-product-status-filter').value;
  const searchTerm = document.getElementById('adm-product-search').value.toLowerCase();
  
  // 나중에 API에서 필터된 데이터를 가져오고 렌더링
  loadProductsWithFilters(currentTab, categoryFilter, statusFilter, searchTerm);
}

// 필터가 적용된 상품 로드
async function loadProductsWithFilters(type, categoryFilter, statusFilter, searchTerm) {
  try {
    let url = `/api/products?type=${type}`;
    if (categoryFilter) url += `&category=${categoryFilter}`;
    if (statusFilter !== '') url += `&is_active=${statusFilter}`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) throw new Error(result.message);
    
    let products = result.data || [];
    
    // 클라이언트 측 검색 필터
    if (searchTerm) {
      products = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        (p.sku && p.sku.toLowerCase().includes(searchTerm))
      );
    }
    
    renderProductsTable(type, products);
  } catch (e) {
    console.error('❌ 상품 로드 실패:', e);
  }
}

// 상품 테이블 렌더링
function renderProductsTable(type, products) {
  const tableBodyId = type === 'quote' ? 'quote-products-list' : 'sellable-products-list';
  const tbody = document.getElementById(tableBodyId);
  
  if (products.length === 0) {
    const colspan = type === 'quote' ? 6 : 7;
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="padding:30px; text-align:center; color:#94a3b8;">상품이 없습니다.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = products.map(product => {
    const statusBadge = product.is_active 
      ? '<span style="display:inline-block; padding:4px 8px; background:#d1fae5; color:#065f46; border-radius:4px; font-weight:600; font-size:11px;">활성</span>'
      : '<span style="display:inline-block; padding:4px 8px; background:#fee2e2; color:#991b1b; border-radius:4px; font-weight:600; font-size:11px;">비활성</span>';
    
    const priceCol = type === 'sellable' 
      ? `<td style="padding:12px; text-align:right; color:#0f172a; font-weight:600;">${product.fixed_price ? product.fixed_price.toLocaleString() : '-'}</td>`
      : '';
    
    return `
      <tr style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        <td style="padding:12px; text-align:center;">
          <input type="checkbox" data-product-id="${product.id}" onchange="onProductCheckboxChange()" style="cursor:pointer;">
        </td>
        <td style="padding:12px; text-align:left; color:#0f172a; font-weight:600;">${product.name}</td>
        <td style="padding:12px; text-align:left; color:#64748b; font-size:11px;">카테고리</td>
        <td style="padding:12px; text-align:center; color:#64748b; font-size:11px; font-family:monospace;">-</td>
        ${priceCol}
        <td style="padding:12px; text-align:center;">${statusBadge}</td>
        <td style="padding:12px; text-align:center; display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
          <button onclick="editProduct(${product.id})" class="btn" style="padding:4px 10px; background:#3b82f6; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">수정</button>
          <button onclick="toggleProductStatus(${product.id}, ${!product.is_active})" class="btn" style="padding:4px 10px; background:${product.is_active ? '#ef4444' : '#22c55e'}; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">${product.is_active ? '비활성' : '활성'}</button>
          <button onclick="deleteProduct(${product.id})" class="btn" style="padding:4px 10px; background:#6b7280; color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">삭제</button>
        </td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('adm-select-all').checked = false;
  updateBulkActionUI();
}

// 일괄 삭제
async function bulkDeleteProducts() {
  const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"][data-product-id]:checked');
  if (selectedCheckboxes.length === 0) {
    alert('삭제할 상품을 선택해주세요.');
    return;
  }
  
  if (!confirm(`${selectedCheckboxes.length}개의 상품을 삭제하시겠습니까?`)) return;
  
  for (const checkbox of selectedCheckboxes) {
    await deleteProduct(checkbox.dataset.productId);
  }
  
  filterAndLoadProducts();
}

// 일괄 상태 변경
async function bulkToggleStatus(isActive) {
  const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"][data-product-id]:checked');
  if (selectedCheckboxes.length === 0) {
    alert('변경할 상품을 선택해주세요.');
    return;
  }
  
  for (const checkbox of selectedCheckboxes) {
    await toggleProductStatus(checkbox.dataset.productId, isActive);
  }
  
  filterAndLoadProducts();
}

// 개별 상품 수정
async function editProduct(productId) {
  // 나중에 모달에서 수정 기능 추가
  console.log('상품 수정:', productId);
  alert('상품 수정 기능 준비 중입니다.');
}

// 개별 상품 상태 변경
async function toggleProductStatus(productId, isActive) {
  try {
    const response = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({is_active: isActive})
    });
    
    if (!response.ok) throw new Error('상태 변경 실패');
    console.log(`✓ 상품 ${productId} 상태 변경: ${isActive}`);
  } catch (e) {
    console.error('❌ 상태 변경 실패:', e);
    alert('상태 변경에 실패했습니다.');
  }
}

// 개별 상품 삭제
async function deleteProduct(productId) {
  try {
    const response = await fetch(`/api/products/${productId}`, {method: 'DELETE'});
    if (!response.ok) throw new Error('삭제 실패');
    console.log(`✓ 상품 ${productId} 삭제됨`);
  } catch (e) {
    console.error('❌ 삭제 실패:', e);
  }
}

// ===== 엑셀 관련 함수 =====

function downloadProductTemplate() {
  const token = localStorage.getItem('token');
  
  fetch('/api/products/template/excel', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(response => {
    if (!response.ok) throw new Error('다운로드 실패');
    return response.blob();
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✅ 템플릿 다운로드 완료!');
  })
  .catch(err => {
    alert(`❌ 다운로드 실패: ${err.message}`);
  });
}

function downloadProductsExcel() {
  const token = localStorage.getItem('token');
  
  fetch('/api/products/export/excel', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(response => {
    if (!response.ok) throw new Error('다운로드 실패');
    return response.blob();
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_export.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✅ 엑셀 다운로드 완료!');
  })
  .catch(err => {
    alert(`❌ 다운로드 실패: ${err.message}`);
  });
}

function triggerExcelUpload() {
  document.getElementById('excel-upload-input').click();
}

async function uploadProductsExcel() {
  const fileInput = document.getElementById('excel-upload-input');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('파일을 선택해주세요.');
    return;
  }
  
  // 파일 형식 확인
  const validTypes = ['.xlsx', '.xls', '.csv'];
  const fileName = file.name.toLowerCase();
  const isValidType = validTypes.some(type => fileName.endsWith(type));
  
  if (!isValidType) {
    alert('.xlsx, .xls, .csv 파일만 업로드 가능합니다.');
    return;
  }
  
  // 업로드 확인
  if (!confirm(`${file.name}을(를) 업로드하시겠습니까?\n이 작업은 기존 데이터를 덮어쓸 수 있습니다.`)) {
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('token');
    const response = await fetch('/api/products/import/excel', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (!result.success) {
      alert(`❌ 업로드 실패: ${result.message}`);
      return;
    }
    
    // 결과 표시
    let message = `✅ 업로드 완료!\n\n저장된 상품: ${result.success_count}개`;
    
    if (result.errors && result.errors.length > 0) {
      message += `\n\n⚠️ 오류 (${result.errors.length}개):`;
      result.errors.slice(0, 5).forEach(err => {
        message += `\n- ${err}`;
      });
      if (result.errors.length > 5) {
        message += `\n... 외 ${result.errors.length - 5}개`;
      }
    }
    
    alert(message);
    
    // 현재 탭 새로고침
    const currentTab = document.getElementById('tab-quote-products').style.borderColor === 'rgb(99, 102, 241)' ? 'quote' : 'sellable';
    await loadCategoryProducts(currentTab);
    
    // 입력 필드 초기화
    fileInput.value = '';
    
  } catch (error) {
    alert(`❌ 업로드 중 오류 발생: ${error.message}`);
    fileInput.value = '';
  }
}
