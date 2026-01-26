import re

with open('script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 중괄호 추적
depth = 0
issues = []
for i, line in enumerate(lines, 1):
    # 간단한 방식: 문자열 상태 추적
    in_string = False
    quote_char = None
    j = 0
    while j < len(line):
        char = line[j]
        
        if not in_string:
            if char in ('"', "'"):
                in_string = True
                quote_char = char
            elif char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth < 0:
                    issues.append(f"Line {i}: 닫는 중괄호가 너무 많음")
                    depth = 0
        else:
            if char == quote_char and (j == 0 or line[j-1] != '\\'):
                in_string = False
        j += 1

if issues:
    print("❌ 문법 오류 발견:")
    for issue in issues[:10]:
        print(f"  {issue}")
elif depth != 0:
    print(f"❌ 파일 끝: 중괄호 불일치 (차이={depth})")
else:
    print("✅ 중괄호 균형 OK")
