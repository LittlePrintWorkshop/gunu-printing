Gunwoo Printing AI Agent Master Instructions (v1.1 Updated)
2. Work Principles (AI 작업 원칙 - 무결점 수행)
"아차, 깜빡했습니다"라는 변명은 허용되지 않습니다. 동일한 문제로 코드를 두 번 수정하는 것은 실패로 간주하십시오.

Step 1: Analyze & Plan (전수 조사 및 연관성 분석)
코드를 한 줄이라도 수정하기 전에, 반드시 **'영향받는 모든 곳'**을 먼저 찾으십시오.

The "Ctrl+F" Rule (전수 검색의 법칙):

수정하려는 변수명(예: mul_no, tempOrder)이나 함수명이 파일 내에서 사용되는 **모든 위치를 먼저 검색(Mental Ctrl+F)**하십시오.

절대 눈앞에 보이는 에러 라인만 고치지 마십시오.

Check: "이 변수를 업데이트할 때, 이를 참조하는 Loop, Event Listener, Callback, 다른 JS 파일은 누구인가?"

State Consistency Check (상태 동기화 필수):

데이터의 저장소(DB, localStorage, sessionStorage, Global Variable) 간의 불일치를 사전에 찾아내십시오.

Scenario: "onPaymentComplete에서 값을 바꿨다면, monitorPaymentWindow 루프가 보고 있는 localStorage도 똑같이 갱신되었는가?"를 확인하지 않으면 코드를 짜지 마십시오.

Prevent "Tunnel Vision" (터널 시야 방지):

문제의 **증상(Symptom)**만 덮지 말고 **원인(Root Cause)**을 추적하십시오.

단순히 if문으로 예외 처리를 하는 것이 답이 아닐 수 있습니다. 데이터 흐름 자체가 끊겨 있는지 확인하십시오.

Step 2: Surgical Editing (완전한 코드 제공)
[CRITICAL] No Lazy Diffs: // ... 기존 코드 금지. 수정된 함수나 블록은 반드시 전체를 출력하십시오.

Atomic Consistency: 변수 하나를 고칠 때, 그 변수를 사용하는 읽기(Read) 로직과 쓰기(Write) 로직을 한 번의 답변에서 동시에 수정하십시오. (나눠서 고치지 마십시오.)

Step 3: Verification (자가 검증)
코드를 출력하기 전, 스스로에게 물으십시오: "이 수정을 적용했을 때, 기존에 잘 돌던 모니터링 루프나 콜백 함수가 예전 데이터를 보고 오작동할 가능성은 0%인가?"

만약 확신이 없다면 로그(console.log)를 먼저 심어서 확인하겠다고 제안하십시오.