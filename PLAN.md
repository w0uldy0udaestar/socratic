# mind-reader 마스터플랜

> 확정일: 2026-08-04 | 이 문서가 프로젝트의 기준 문서다. 계획 이탈 시 이 문서와 대조하고, 새 아이디어는 IDEAS.md로.

## 1. 큰 그림

**한 줄 정의**: CLI AI 에이전트가 사용자의 모호한 요청을 받았을 때, 혼자 추측하지 않고 선택지 기반 질문을 거듭해 진짜 의도를 파악한 뒤, 정제된 의도 명세를 승인받고 실행하게 만드는 도구.

**동작 흐름**:
1. 사용자가 에이전트에게 요청을 던짐
2. 훅이 매 프롬프트를 가로채 프로토콜을 주입 (항상 자동 — 모델 재량 아님)
3. 에이전트가 발산 측정으로 모호함을 판정, 모호하면 선택지 질문 루프 (예산 3~5, 상한 7)
4. 정제된 의도 명세를 제시 → 사용자 승인 (승인 전에는 훅이 쓰기 도구를 차단)
5. 재작성된 명세로 단일턴 실행

**목표**: 본인이 먼저 사용 → 만족스러우면 오픈소스 공개 출시.

**성공 기준**:
- 모호한 요청에서 에이전트가 추측 대신 질문으로 파고든다 (결정론적으로, 매번)
- 질문이 귀찮지 않다 — 명확한 요청은 질문 0개로 통과
- 최종 명세가 실제 의도와 일치한다 (계측: **명세 수정률** — 0에 가까우면 확인 단계 실패)
- (v0.2+) 여러 에이전트에서 동일하게 작동한다

## 2. 확정 결정사항과 근거

| # | 결정 | 근거 |
|---|---|---|
| D1 | 발동: **항상 자동** (명시 호출 없음) | 킥오프 인터뷰. 리서치가 확인한 공백 — 기존 도구는 수동 호출(spec-kit) 또는 모델 재량(superpowers) |
| D2 | 산출물: **명세 승인 후 실행** | 킥오프 인터뷰. 다중턴 성능 39% 하락(arXiv:2505.06120) 회수를 위해 명세를 재작성해 단일턴 실행 |
| D3 | 질문: **선택지 중심 + 3경로** (선택지 2~4 + 직접입력 + "알아서") | 킥오프 인터뷰 + UX 리서치 (선택지 단독은 "닫혀 있음" 불만 실측, arXiv:2506.11610) |
| D4 | 메커니즘: **훅 기반** (스킬/MCP는 보조) | 상시 자동을 결정론적으로 지원하는 유일한 수단 (리서치 2건 교차 확인) |
| D5 | 범위: **v0.1 Claude Code 전용** → v0.2 Gemini CLI → v0.3 Codex CLI → v0.4 opencode/Amp | 사용자 선택. 가장 빨리 본인 검증 가능. 다중 에이전트는 로드맵으로 유지 |
| D6 | 강제: **2단** — 주입(soft) + 승인 전 쓰기 차단(hard, `PreToolUse`) | 사용자 선택(권장안). "추측하고 실행"을 기술적으로 불가능하게 — 경쟁 도구와의 결정적 차별점 |
| D7 | 판정: **훅 경량 필터 + 모델 발산 측정** | 사용자 선택(권장안). 훅은 지연 없이 명백한 케이스만 거르고, 판정 품질은 ClarifyGPT식 발산 측정(연구 근거 최고)에 위임 |
| D8 | 언어·배포: **Node.js/TypeScript**, npm/npx + git clone | 사용자 선택(권장안). opencode/Amp 확장(TS) 재사용, OpenSpec/BMAD가 검증한 배포 패턴 |

## 3. v0.1 아키텍처 (Claude Code)

```
mind-reader/
├── src/                      # TypeScript 코어
│   ├── hooks/
│   │   ├── prompt-submit.ts  # UserPromptSubmit: 경량 필터 → 프로토콜 주입
│   │   └── pre-tool-use.ts   # PreToolUse: 승인 전 Write/Edit/Bash 차단 게이트
│   ├── protocol/
│   │   └── render.ts         # 주입할 프로토콜 텍스트 생성 (발산 측정·질문 루프·명세 확인 지시)
│   └── state/
│       └── session.ts        # 세션 상태 파일 (.mind-reader/): 승인 플래그, 명세 저장
├── protocol/                 # 프로토콜 마크다운 (프롬프트 본문, 연구 근거 기반)
├── install/                  # 설치: settings.json 훅 병합(append+백업), uninstall, --dry-run
├── docs/                     # 리서치 보고서 등
├── PLAN.md / IDEAS.md / README.md / HANDOFF.md
└── package.json              # npx mind-reader init
```

**핵심 컴포넌트**:
1. **UserPromptSubmit 훅** — 밀리초 단위 경량 필터(짧은 인사·후속 답변·명령형 단순 요청 등은 통과) 후 `additionalContext`로 프로토콜 주입. 30초 타임아웃 안에서 LLM 호출 없이 동작.
2. **PreToolUse 게이트** — 세션 상태에 명세 승인 플래그가 없으면 Write/Edit/Bash(파괴적 명령) 차단, reason으로 "먼저 의도를 확인하라" 반환. 읽기 도구(Read/Grep/Glob)는 항상 허용(탐색 우선 게이트 지원).
3. **프로토콜 텍스트** (연구 기반, docs/research/question-design-ux.md §7):
   - 탐색 우선 → 발산 측정(계획 3~5개 샘플링, 관측 가능한 차이축 추출) → 가정 강등(관습 기본값·저비용 축) → 질문 루프(한 번에 하나, AskUserQuestion, 이유 한 줄, 진행 표시) → 종료 조건(수렴·예산·피로 신호·위험 작업 예외) → 명세 확인(한 눈 분량, ✓답변/~가정/?미정 표시, out-of-scope 명시, 가정만 개별 확인) → 재작성 명세로 실행
   - "질문 0개가 정상 결과"를 명시 (과잉 질문 편향 대응)
4. **상태 파일** — `.mind-reader/session-<id>.json` (승인 플래그), `.mind-reader/spec-<id>.md` (명세 보존, 사후 대조용)

## 4. 마일스톤

- **M0 실측 스파이크** (최우선): 리서치는 전부 문서 기반 — Claude Code에서 `UserPromptSubmit` 주입·`PreToolUse` 차단·30초 타임아웃·상태 파일 공유를 최소 스크립트로 실측 검증
- **M1 코어 구현**: 훅 2종 + 프로토콜 v1 + 상태 관리 + install/uninstall
- **M2 자체 사용 검증** (dogfooding): 본인 일상 작업에 1~2주 투입. 계측: 질문 발생률, 평균 질문 수, 명세 수정률, 수동 우회(skip) 빈도
- **M3 프로토콜 튜닝**: M2 데이터로 게이트·예산·명세 형식 조정
- **v0.2+**: Gemini CLI(`BeforeAgent`/`BeforeTool`/`ask_user`) → Codex CLI(질문 UI 평문 폴백, `request_user_input` Plan 전용 재실측 선행) → opencode/Amp(TS 플러그인) → 공개 출시(마켓플레이스 등재)

## 5. 리스크 대장 (요약 — 상세는 docs/research-synthesis.md)

| 리스크 | 대응 |
|---|---|
| 질문 피로 → 도구 제거 | 4단 게이트, 질문 0개 정상, 피로 신호 즉시 중단, skip-all 탈출구 |
| 훅 지연 (30초 타임아웃, 매 프롬프트 블로킹) | 훅은 LLM 호출 없는 경량 필터만, 판정은 주입된 프로토콜로 메인 모델이 |
| 훅 오류 시 fail-open → 게이트 무력화 | 실패 시맨틱 명시 처리 + 설치 후 self-test |
| 명세 확인 통과 도장화 | 명세 수정률 계측, 가정만 개별 확인 UI |
| 설치가 기존 설정 파괴 | 병합(append) 설치, .bak 백업, uninstall, --dry-run |
| 네이티브 기능에 흡수 | 다중 에이전트 확장 + 연구 기반 프로토콜 품질로 차별화 |

## 6. 참고 문서

- 리서치 종합: `docs/research-synthesis.md`
- 원본 리서치: `docs/research/similar-tools.md`, `docs/research/agent-extension-mechanisms.md`, `docs/research/question-design-ux.md`
