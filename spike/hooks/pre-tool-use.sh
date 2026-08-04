#!/bin/bash
# M0 spike: PreToolUse — 승인 플래그 없으면 쓰기 도구 차단 (상태 파일 = 프로세스 간 공유 검증)
INPUT=$(cat)
DIR="${CLAUDE_PROJECT_DIR:-.}"
mkdir -p "$DIR/.mind-reader"
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
if [ -f "$DIR/.mind-reader/approved" ]; then
  echo "[$(date +%H:%M:%S)] PreToolUse ALLOW: $TOOL" >> "$DIR/.mind-reader/hook.log"
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"mind-reader: 명세 승인됨"}}'
else
  echo "[$(date +%H:%M:%S)] PreToolUse DENY: $TOOL" >> "$DIR/.mind-reader/hook.log"
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"mind-reader gate: 의도 명세가 승인되지 않았습니다. 사용자에게 의도를 확인받기 전에는 쓰기/실행 도구를 사용할 수 없습니다."}}'
fi
