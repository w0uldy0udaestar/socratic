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
# 저장소 자체에는 .mind-reader-off 가 있을 수 있으므로 임시 디렉토리에서 검증한다
SELFTEST_DIR=$(mktemp -d)
if echo '{"session_id":"selftest","prompt":"복잡한 무언가를 만들어줘 아주 근사하게"}' \
  | CLAUDE_PROJECT_DIR="$SELFTEST_DIR" node dist/hooks/prompt-submit.js \
  | grep -q "mind-reader 프로토콜"; then
  echo "  훅 동작 확인 완료."
  rm -rf "$SELFTEST_DIR"
else
  echo "  오류: 훅이 프로토콜을 주입하지 못했습니다. 설치가 정상 동작하지 않습니다." >&2
  echo "  (Node.js 버전과 dist/ 빌드 산출물을 확인하세요. 즉시 비활성화: MIND_READER_OFF=1)" >&2
  rm -rf "$SELFTEST_DIR"
  exit 1
fi

echo ""
echo "설치 완료. 새 Claude Code 세션부터 적용됩니다. 제거: ./uninstall.sh"
