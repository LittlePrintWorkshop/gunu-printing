// 이 함수를 script.js의 renderOrderHistory() 함수(약 3138번째 줄)와 교체하세요

async function renderOrderHistory() {
  const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (!user) return;
  
  const listEl = get('order-history-list');
  const emptyEl = get('order-empty');
  
  // 서버에서 주문 목록 가져오기
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

    // 날짜순으로 정렬 (최신순)
    userOrders.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
    
    listEl.innerHTML = userOrders.map((order, i) => {
      const orderDate = order.created_at ? new Date(order.created_at).toLocaleString('ko-KR') : '-';
      
      // items 파싱
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
      const itemQty = firstItem.qty || items.length;
      
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
        'cancelled': '#ef4444'
      };
      const statusColor = statusColors[order.status] || '#64748b';
      
      const statusText = {
        'pending': '접수완료',
        'preparing': '제작중',
        'shipping': '배송중',
        'completed': '배송완료',
        'cancelled': '취소'
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
                ${items.map(item => `
                  <div style="font-size:13px; color:#475569; margin-bottom:4px;">• ${item.name || '상품'} (${item.qty || 0}) - ${(item.price || 0).toLocaleString()}원</div>
                `).join('')}
              </div>
            ` : ''}
            
            <div style="display:flex; gap:10px; margin-top:12px;">
              <button onclick="viewOrderDetail('${order.order_id || i}')" style="flex:1; padding:10px; background:var(--primary); color:#fff; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">상세보기</button>
              ${order.status === 'pending' ? `<button onclick="cancelUserOrder('${order.order_id}')" style="flex:1; padding:10px; background:#ef4444; color:#fff; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">주문취소</button>` : `<button onclick="toast('문의 기능 준비중')" style="flex:1; padding:10px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">문의하기</button>`}
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

// 주문 취소 함수 추가
async function cancelUserOrder(orderId) {
  if (!confirm('주문을 취소하시겠습니까?')) return;
  
  try {
    const token = getToken();
    const response = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'cancelled' })
    });
    
    const result = await response.json();
    if (result.success) {
      toast('주문이 취소되었습니다.');
      renderOrderHistory();
    } else {
      alert(result.message || '주문 취소에 실패했습니다.');
    }
  } catch (error) {
    console.error('주문 취소 에러:', error);
    alert('주문 취소 중 오류가 발생했습니다.');
  }
}
