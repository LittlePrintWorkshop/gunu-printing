// renderAdminOrderTable 함수를 script.js의 약 1648번째 줄 함수와 교체하세요

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
    
    // 상태별 색상 및 텍스트
    const statusMap = {
      'pending': { color: '#f59e0b', text: '접수' },
      'preparing': { color: '#3b82f6', text: '준비중' },
      'shipping': { color: '#8b5cf6', text: '배송출발' },
      'completed': { color: '#10b981', text: '완료' },
      'cancelled': { color: '#ef4444', text: '취소' }
    };
    
    const statusInfo = statusMap[order.status] || { color: '#64748b', text: order.status || '대기' };
    const createdDate = order.created_at ? new Date(order.created_at).toLocaleString('ko-KR') : '-';
    const userName = order.user_id || '비회원';
    
    // 주문 항목 수 및 첫 상품명
    let itemSummary = '상품';
    if (order.items && typeof order.items === 'string') {
      try {
        const items = JSON.parse(order.items);
        if (Array.isArray(items) && items.length > 0) {
          itemSummary = items.length === 1 
            ? items[0].name || '상품'
            : `${items[0].name || '상품'} 외 ${items.length - 1}개`;
        }
      } catch (e) {
        itemSummary = '상품';
      }
    }
    
    tr.innerHTML = `
      <td style="padding:10px; font-weight:700; color:#037a3f; font-family:monospace;">${orderId}</td>
      <td style="padding:10px; font-size:12px;">${createdDate}</td>
      <td style="padding:10px;">${userName}</td>
      <td style="padding:10px;">${itemSummary}</td>
      <td style="padding:10px;">${(order.total_price || 0).toLocaleString()}원</td>
      <td style="padding:10px; text-align:center;">
        <div style="display:flex; gap:6px; justify-content:center; align-items:center; flex-wrap:wrap;">
          <span style="padding:4px 10px; background:${statusInfo.color}15; color:${statusInfo.color}; border-radius:4px; font-size:11px; font-weight:700;">${statusInfo.text}</span>
          <button onclick="viewAdminOrderDetail('${orderId}')" style="padding:4px 8px; background:#037a3f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700;">상세</button>
          ${order.status === 'pending' ? `
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

// 관리자 주문 상태 변경 함수 추가
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
      loadAdminOrderList(); // 목록 새로고침
    } else {
      alert(result.message || '상태 변경에 실패했습니다.');
    }
  } catch (error) {
    console.error('상태 변경 에러:', error);
    alert('상태 변경 중 오류가 발생했습니다.');
  }
}
