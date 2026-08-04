#!/bin/bash
# M0 spike: Stop — 의도 확인 전 답변 종료 차단 검증 (비파일 작업용 게이트 후보, D11)
INPUT=$(cat)
DIR="${CLAUDE_PROJECT_DIR:-.}"
mkdir -p "$DIR/.mind-reader"
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active')
echo "[$(date +%H:%M:%S)] Stop fired (stop_hook_active=$ACTIVE)" >> "$DIR/.mind-reader/hook.log"
# 루프 방지: 이미 Stop 훅이 개입한 턴이면 통과
if [ "$ACTIVE" = "true" ]; then exit 0; fi
if [ -f "$DIR/.mind-reader/intent-confirmed" ]; then exit 0; fi
echo '{"decision":"block","reason":"mind-reader: 의도 확인이 완료되지 않았습니다. 지금까지 파악한 사용자 의도를 한 문장으로 재구성하고, 그 문장 앞에 INTENT-CHECK: 를 붙여 출력한 뒤 종료하라."}'
