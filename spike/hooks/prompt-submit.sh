#!/bin/bash
# M0 spike: UserPromptSubmit — 발화 로깅 + additionalContext 주입 검증
INPUT=$(cat)
DIR="${CLAUDE_PROJECT_DIR:-.}"
mkdir -p "$DIR/.mind-reader"
echo "[$(date +%H:%M:%S)] UserPromptSubmit fired: $(echo "$INPUT" | jq -r '.prompt' | head -c 80)" >> "$DIR/.mind-reader/hook.log"
cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[mind-reader spike] 이 컨텍스트가 보이면 응답 끝에 반드시 문자열 MARKER-7429 를 포함하라."}}
EOF
