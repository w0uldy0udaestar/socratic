#!/bin/bash
# mind-reader 설치: 빌드 → ~/.claude/settings.json에 훅 병합(백업 후 append)
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "오류: Node.js 18+ 가 필요합니다." >&2
  exit 1
fi

echo "[1/3] 의존성 설치·빌드..."
npm install --no-audit --no-fund --silent
npm run build --silent

echo "[2/3] Claude Code 훅 등록 (기존 설정은 백업 후 병합)..."
node install/merge-settings.js add "${1:-}"

echo "[3/3] 셀프 테스트..."
echo '{"session_id":"selftest","prompt":"복잡한 무언가를 만들어줘 아주 근사하게"}' \
  | node dist/hooks/prompt-submit.js | grep -q "mind-reader 프로토콜" \
  && echo "  훅 동작 확인 완료."

echo ""
echo "설치 완료. 새 Claude Code 세션부터 적용됩니다. 제거: ./uninstall.sh"
