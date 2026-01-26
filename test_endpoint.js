const http = require('http');

// Step 1: 로그인
const loginData = JSON.stringify({id: 'admin', pw: 'admin1234'});

const loginOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/users/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(' 로그인 응답:', data);
    if (!data) {
      console.log(' 로그인 응답이 비었습니다');
      return;
    }
    
    try {
      const loginResp = JSON.parse(data);
      const token = loginResp.token;
      
      if (!token) {
        console.log(' 토큰을 얻을 수 없습니다:', loginResp);
        return;
      }
      
      console.log(' 토큰:', token.substring(0, 40) + '...');
      
      // Step 2: /api/user/profile 테스트
      const profileOptions = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/user/profile',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      };
      
      const profileReq = http.request(profileOptions, (res) => {
        let profileData = '';
        res.on('data', (chunk) => { profileData += chunk; });
        res.on('end', () => {
          console.log('\n /api/user/profile 응답:', profileData);
          try {
            const profileResp = JSON.parse(profileData);
            console.log('\n 파싱된 응답:');
            console.log(JSON.stringify(profileResp, null, 2));
          } catch (e) {
            console.log(' JSON 파싱 실패:', e.message);
          }
        });
      });
      
      profileReq.on('error', (e) => {
        console.error(' 프로필 요청 오류:', e);
      });
      
      profileReq.end();
      
    } catch (e) {
      console.log(' 로그인 응답 파싱 오류:', e.message);
    }
  });
});

loginReq.on('error', (e) => {
  console.error(' 로그인 요청 오류:', e);
});

loginReq.write(loginData);
loginReq.end();
