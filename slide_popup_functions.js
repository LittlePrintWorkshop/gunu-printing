// ===== 슬라이드 이미지 경로 관리 =====

function previewSlideImage(index) {
  const pathInput = get(`adm-home-slide-${index}-path`);
  const previewImg = get(`adm-home-slide-${index}-preview`);
  
  if (!pathInput || !previewImg) return;
  
  const imagePath = pathInput.value.trim();
  if (imagePath) {
    previewImg.src = imagePath;
    previewImg.onerror = () => {
      toast('이미지를 불러올 수 없습니다. 경로를 확인해주세요.');
      previewImg.src = '';
    };
  } else {
    toast('경로를 입력해주세요.');
  }
}

function saveSlideImages() {
  const slides = [];
  let isValid = true;
  
  for (let i = 0; i < 3; i++) {
    const pathInput = get(`adm-home-slide-${i}-path`);
    if (!pathInput) {
      isValid = false;
      break;
    }
    const path = pathInput.value.trim();
    if (!path) {
      isValid = false;
      break;
    }
    slides.push(path);
  }
  
  if (!isValid) {
    toast('모든 슬라이드 이미지 경로를 입력해주세요.');
    return;
  }
  
  // localStorage에 저장
  const homepageDB = JSON.parse(localStorage.getItem('print_homepage_v1') || '{}');
  homepageDB.slides = slides;
  localStorage.setItem('print_homepage_v1', JSON.stringify(homepageDB));
  
  // 실시간 적용
  applySlideImages();
  
  toast('슬라이드 이미지가 저장되었습니다.');
}

function applySlideImages() {
  const homepageDB = JSON.parse(localStorage.getItem('print_homepage_v1') || '{}');
  const slides = homepageDB.slides || [];
  
  // 페이지의 슬라이드 이미지 업데이트
  const slideElements = document.querySelectorAll('#home-slider .home-slide img');
  slideElements.forEach((img, i) => {
    if (slides[i]) {
      img.src = slides[i];
    }
  });
}

// ===== 팝업 공지사항 =====

let showNoticePopup = true;

function showNoticePopupModal() {
  if (!showNoticePopup) return;
  
  // 최신 공지사항 가져오기
  if (noticeCache.length === 0) return;
  
  const latestNotice = noticeCache[0];
  
  const modal = document.createElement('div');
  modal.id = 'notice-popup-modal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    padding: 20px;
  `;
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 0; padding: 30px; max-width: 500px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: slideInUp 0.3s ease-out;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0px;">
        <div>
          <h2 style="margin: 0; font-weight: 900; font-size: 20px; color: #0f172a; display: none;">${latestNotice.title}</h2>
        </div>
        <button onclick="closeNoticePopup()" style="background: none; border: none; font-size: 12px; cursor: pointer; color: #94a3b8; line-height: 1; padding: 2px 4px;">✕</button>
      </div>
      
      <div style="color: #94a3b8; font-size: 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line);">
        ${formatDate(latestNotice.created_at)}
      </div>
      
      <div style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px; max-height: 200px; overflow-y: auto;">
        ${(latestNotice.content || '').substring(0, 300)}${latestNotice.content && latestNotice.content.length > 300 ? '...' : ''}
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button onclick="closeNoticePopup()" style="padding: 10px 14px; background: #e2e8f0; color: #475569; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; min-width: 80px;">닫기</button>
      </div>
      
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: #64748b; margin: 0;">
          <input type="checkbox" id="notice-popup-checkbox" style="cursor: pointer;">
          <span>오늘 더 이상 보지 않기</span>
        </label>
        <div>
          <button onclick="closeNoticePopup()" style="padding: 4px 8px; font-size: 11px; background: #e2e8f0; color: #475569; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; min-width: 56px;">닫기</button>
        </div>
      </div>
    </div>
    
    <style>
      @keyframes slideInUp {
        from {
          transform: translateY(30px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    </style>
  `;
  
  document.body.appendChild(modal);
  
  // "오늘 더 이상 보지 않기" 체크박스
  const checkbox = document.getElementById('notice-popup-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        const today = new Date().toDateString();
        localStorage.setItem('notice_popup_hide_date', today);
      }
    });
  }
  
  // 모달 외부 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeNoticePopup();
    }
  });
}

function closeNoticePopup() {
  const modal = document.getElementById('notice-popup-modal');
  if (modal) {
    modal.remove();
  }
}

function initNoticePopup() {
  // 페이지 로드 시 공지사항 팝업 표시 여부 결정
  const today = new Date().toDateString();
  const lastHideDate = localStorage.getItem('notice_popup_hide_date');
  
  // 마지막으로 숨긴 날이 오늘이 아니면 표시
  if (lastHideDate !== today && noticeCache.length > 0) {
    setTimeout(() => {
      showNoticePopupModal();
    }, 1500); // 1.5초 후 팝업 표시
  }
}

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', function() {
  // 팝업 공지만 표시 (일반 공지사항 팝업은 제거)
  if (typeof loadAndShowPopupNotice === 'function') {
    loadAndShowPopupNotice(); // 즉시 로드 (딜레이 제거)
  }
});
