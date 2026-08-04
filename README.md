# mind-reader

CLI AI 에이전트가 당신의 모호한 요청을 추측으로 처리하지 않게 만드는 도구.

매 프롬프트를 훅(hook)으로 가로채, 에이전트가 아키네이터처럼 선택지 기반 질문으로 진짜 의도를 좁힌 뒤 — 정제된 의도 명세를 승인받기 전에는 파일 수정·명령 실행을 **기술적으로 차단**합니다. 모델이 기억해주길 바라지 않습니다. 프로세스가 강제합니다.

## 상태

설계 단계 (v0.1 목표: Claude Code 지원). 마스터플랜은 [PLAN.md](PLAN.md), 설계 근거 리서치는 [docs/research-synthesis.md](docs/research-synthesis.md) 참조.

## 로드맵

- v0.1 — Claude Code (`UserPromptSubmit` 주입 + `PreToolUse` 승인 게이트 + `AskUserQuestion`)
- v0.2 — Gemini CLI
- v0.3 — OpenAI Codex CLI
- v0.4 — opencode / Amp

## 설치 (예정)

```bash
npx mind-reader init   # 또는: git clone 후 ./install.sh
```
