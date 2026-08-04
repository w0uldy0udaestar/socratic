#!/bin/bash
# mind-reader 제거: settings.json에서 우리 훅 항목만 제거 (백업 생성)
set -euo pipefail
cd "$(dirname "$0")"
node install/merge-settings.js remove "${1:-}"
echo "제거 완료. 프로젝트별 .mind-reader/ 상태·명세 아카이브는 보존됩니다 (원하면 직접 삭제)."
