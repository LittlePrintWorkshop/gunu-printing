import requests
import json

# Step 1: 로그인
print("🔐 Step 1: 로그인 중...")
login_url = "http://127.0.0.1:5000/api/users/login"
login_data = {"id": "admin", "pw": "admin1234"}

try:
    login_response = requests.post(login_url, json=login_data, timeout=5)
    print(f"응답 상태: {login_response.status_code}")
    print(f"응답 내용: {login_response.text}")
    
    if login_response.status_code == 200:
        login_json = login_response.json()
        token = login_json.get('token')
        
        if token:
            print(f"✅ 토큰 획득: {token[:40]}...")
            print()
            
            # Step 2: /api/user/profile 테스트
            print("👤 Step 2: /api/user/profile 테스트 중...")
            profile_url = "http://127.0.0.1:5000/api/user/profile"
            headers = {"Authorization": f"Bearer {token}"}
            
            profile_response = requests.get(profile_url, headers=headers, timeout=5)
            print(f"응답 상태: {profile_response.status_code}")
            print(f"응답 내용:")
            profile_json = profile_response.json()
            print(json.dumps(profile_json, indent=2, ensure_ascii=False))
            
            if profile_response.status_code == 200:
                print("\n✅ /api/user/profile 엔드포인트 연결 성공!")
                print(f"userData: {profile_json.get('user')}")
        else:
            print("❌ 토큰 획득 실패")
    else:
        print(f"❌ 로그인 실패: {login_response.status_code}")
except Exception as e:
    print(f"❌ 오류: {e}")
