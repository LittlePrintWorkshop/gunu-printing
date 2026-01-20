// 임시 패치 파일 - script.js에 추가할 코드

// closePopupModal 함수 끝 부분에 추가:
  modal.style.display = 'none';
  
  // 다음 팝업 표시
  currentPopupIndex++;
  if (currentPopupIndex < allPopups.length) {
    setTimeout(() => {
      showCurrentPopup();
    }, 500); // 0.5초 후 다음 팝업 표시
  }
