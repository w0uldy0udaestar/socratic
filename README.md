# mind-reader

CLI AI 에이전트가 당신의 모호한 요청을 추측으로 처리하지 않게 만드는 도구.

매 프롬프트를 훅(hook)으로 가로채, 에이전트가 아키네이터처럼 선택지 기반 질문으로 진짜 의도를 좁힌 뒤 — 정제된 의도 명세를 승인받기 전에는 파일 수정·명령 실행을 **기술적으로 차단**합니다. 모델이 기억해주길 바라지 않습니다. 프로세스가 강제합니다.

## 상태

**v0.1 코어 구현 완료** (Claude Code). 유닛 68건 + 헤드리스 E2E 통과 — [구현 노트](docs/m1-implementation-notes.md). 다음은 실사용 검증(M2).
마스터플랜은 [PLAN.md](PLAN.md), 설계 근거는 [리서치 종합](docs/research-synthesis.md) 참조.

## 동작

1. 프롬프트를 훅으로 가로채 의도 파악 프로토콜을 주입한다 (모든 요청, 자동)
2. 계획이 갈리지 않는 명확한 요청은 질문 없이 통과, 갈리면 선택지 질문으로 파고든다
3. 승인 전에는 쓰기·실행 도구가 차단된다 (읽기·조사는 허용)
4. `[MR-SPEC]` 의도 명세를 제시하고 "승인"을 받으면 게이트가 열리고, 명세는 `~/.mind-reader/`에 아카이브된다

## 끄는 법

| 범위 | 방법 |
|---|---|
| 특정 프로젝트만 | 프로젝트 루트에 빈 파일 `.mind-reader-off` 생성 (하위 폴더에서도 인식) |
| 전역 즉시 | 환경변수 `MIND_READER_OFF=1` |
| 완전 제거 | `./uninstall.sh` |

게이트는 **의도 파악 사이클이 진행 중일 때만** 작동합니다. 사이클이 시작되지 않은 상태(idle)나 승인 후에는 아무것도 막지 않습니다.

## 지표 보기

```bash
npm run stats          # 전체 프로젝트 합산
npm run stats -- <경로> # 특정 프로젝트
```

질문 발생률, 평균 질문 수, **명세 수정률**(0%에 가까우면 확인 단계가 형식적이라는 신호), 미완료율, 게이트 차단 분포를 출력합니다.

## 로드맵

- v0.1 — Claude Code (`UserPromptSubmit` 주입 + `PreToolUse` 승인 게이트 + `AskUserQuestion`)
- v0.2 — Gemini CLI
- v0.3 — OpenAI Codex CLI
- v0.4 — opencode / Amp

## 설치

```bash
git clone https://github.com/w0uldy0udaestar/mind-reader.git
cd mind-reader && ./install.sh     # 빌드 + ~/.claude/settings.json에 훅 병합(백업 후 append)
```

제거는 `./uninstall.sh`. 설치 스크립트는 기존 설정을 덮어쓰지 않고, 우리 훅만 마커로 식별해 추가·제거합니다.
