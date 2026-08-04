# mind-reader: CLI AI 에이전트 확장 메커니즘 비교 리서치

> 작성: Tool Evaluator 서브에이전트 (opus) | 조사일 2026-08-04
> 방법: 공식 문서(code.claude.com, learn.chatgpt.com/docs, geminicli.com, opencode.ai, ampcode.com, cursor.com) > GitHub 소스코드 직접 검증 > 커뮤니티 2차 자료. 실제 설치·실행 검증은 미수행(문서·소스 기반).

---

## 0. 결론 먼저

**"상시 자동 발동"을 구조적으로 지원하는 메커니즘은 훅(hooks) 단 하나입니다.** Claude Code(`UserPromptSubmit`), Codex CLI(`UserPromptSubmit`), Gemini CLI(`BeforeAgent`) 세 도구 모두 2026년 현재 "매 사용자 프롬프트마다 자동 발화 + 모델 입력에 텍스트 주입 + 프롬프트 차단"을 지원하며, **세 도구의 출력 JSON 스키마가 사실상 동일**(`hookSpecificOutput.additionalContext`, `decision`, `continue`, `reason`)합니다. opencode와 Amp는 훅 대신 TypeScript 플러그인으로 같은 일을 하고, **Cursor CLI만 이 요구사항을 만족하지 못합니다**.

핵심 발견 3가지:
1. **주입만으로는 강제가 안 됩니다.** 훅이 넣는 것은 "텍스트"이고 모델은 무시할 수 있습니다. 진짜 결정론적 강제는 `PreToolUse`/`BeforeTool` 훅으로 **명세 승인 전 Write/Edit/Bash를 차단**하는 것. 세 도구 모두 지원.
2. **질문 UI는 도구별로 갈립니다.** CC `AskUserQuestion`, Gemini `ask_user`는 네이티브 선택지 UI. **Codex의 `request_user_input`은 Plan 모드 전용**(소스 검증됨) → Codex는 번호 매긴 평문 폴백 필수.
3. **AGENTS.md는 만능이 아닙니다.** Claude Code는 공식적으로 AGENTS.md를 읽지 않음(공식 문서 명시). Agent Skills(SKILL.md)가 더 넓은 실질 호환 표면.

---

## 1. 상시 자동 발동 능력 비교표

| 에이전트 | 매 프롬프트 자동 발화 | 컨텍스트 주입 | 프롬프트 차단 | 도구 실행 차단(결정론적 게이트) | 네이티브 선택지 질문 UI |
|---|---|---|---|---|---|
| **Claude Code** | `UserPromptSubmit` 훅 (matcher 없음, 모든 프롬프트) | O `hookSpecificOutput.additionalContext` | O `decision:"block"` / exit 2 | O `PreToolUse` | O `AskUserQuestion` (v2.0.21+) |
| **Codex CLI** | `UserPromptSubmit` 훅 | O `additionalContext` (기본 ~2,500 토큰, `additionalContextLimit` 조정) | O `decision:"block"` / `continue:false` | O `PreToolUse` | 제한적 — `request_user_input`이 **Plan 모드 전용** |
| **Gemini CLI** | `BeforeAgent` 훅 (v0.26.0+) | O `hookSpecificOutput.additionalContext` | O `decision:"deny"` / `continue:false` | O `BeforeTool` | O `ask_user` |
| **opencode** | 플러그인 `chat.message` + `experimental.chat.system.transform` | O (mutable `output.parts`/`output.system`) | 확인 불가 | O `tool.execute.before` | 커스텀 도구 등록 가능 |
| **Amp** | 플러그인 `agent.start` | O (append만, `display:false` 가능) | X | O `tool.call` (`reject-and-continue`/`modify`) | 확인 불가 |
| **Cursor CLI** | `beforeSubmitPrompt` (IDE 기준, CLI 발화 미확인) | **X** (`sessionStart` 세션당 1회만) | O (IDE) | O `preToolUse` (CLI 2026-04 확인) | 확인 불가 |

## 2. 확장 메커니즘 전체 목록

| 메커니즘 | Claude Code | Codex CLI | Gemini CLI | opencode | Amp | Cursor CLI |
|---|---|---|---|---|---|---|
| 전역 지침 | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.gemini/GEMINI.md` | `~/.config/opencode/AGENTS.md` | `~/.config/amp/AGENTS.md` | `~/.cursor/rules/` |
| AGENTS.md 네이티브 | **X** (공식 명시) | O | O | O | O | O |
| Agent Skills | O (`~/.claude/skills/`) | O (`~/.agents/skills/`) | O (확장 `skills/`) | O | O | O |
| 훅 | O (10+ 이벤트, command/http/mcp_tool/prompt/agent 타입) | O (11 이벤트) | O (11 이벤트, v0.26.0+) | 플러그인 훅 | 플러그인 이벤트 5종 | O (CLI 패리티 부분적) |
| 플러그인 | O (마켓플레이스) | O (마켓플레이스) | O (`gemini-extension.json`) | O (JS/TS) | O (TS on Bun) | X |
| MCP | O | O | O | O | O | O |

## 3. 도구별 핵심 세부사항

### Claude Code
- `UserPromptSubmit`: matcher 미지원 = 모든 프롬프트 발화. 출력 `{decision:"block", reason, additionalContext, systemMessage, continue}`. **기본 타임아웃 30초** (다른 훅은 600초).
- 훅 타입 5종: `command`, `http`, `mcp_tool`, `prompt`(소형 모델 판정 — 모호성 판정에 활용 가능), `agent`.
- 공식 문서 결정 문구: *"Claude treats them as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook instead."*
- 스킬 자동 발동은 모델 재량(확률적) → "상시 자동" 미충족. 스킬 디렉토리 심볼릭 링크 공식 지원.
- 플러그인: skills+agents+hooks+MCP 번들 가능. `--scope project`는 `.claude/settings.json`의 `enabledPlugins`에 기록.
- 출처: [Hooks reference](https://code.claude.com/docs/en/hooks), [Memory](https://code.claude.com/docs/en/memory), [Skills](https://code.claude.com/docs/en/skills), [Plugins reference](https://code.claude.com/docs/en/plugins-reference) (모두 2026-08-04 확인)

### Codex CLI
- 이벤트 11종 (`UserPromptSubmit` 포함). 주입 기본 한도 ~2,500 토큰.
- 설정: `<repo>/.codex/hooks.json` → `~/.codex/hooks.json` → 플러그인 번들. 프로젝트 로컬 훅은 trusted 필요.
- **`request_user_input`은 Plan 모드에서만 도구 등록** — `codex-rs/protocol/src/config_types.rs:428-430`, `codex-rs/tools/src/request_user_input_tool.rs:125-128` (rust-v0.121.0, [gstack issue #1066](https://github.com/garrytan/gstack/issues/1066)이 소스 인용). Default 모드에서 스킬이 질문 도구를 부르면 **에러 없이 모델이 답을 지어냄(silent degradation)**.
- [openai/codex issue #9926](https://github.com/openai/codex/issues/9926) (질문 UI 요청) 2026-01-26 생성, open.
- 출처: [Hooks | Codex](https://learn.chatgpt.com/docs/hooks) (2026-08-04 확인)

### Gemini CLI
- `BeforeAgent` = "유저 프롬프트 제출 후, 플래닝 전". `additionalContext` append / `decision:"deny"` / `continue:false`. v0.26.0+ 기본 활성화.
- 확장(Extensions): `gemini extensions install <GitHub URL>` — **"git URL 하나로 훅까지 통째 설치"가 되는 유일하게 깔끔한 경로.** `gemini-extension.json`에 컨텍스트 파일, MCP, commands, hooks, skills 번들.
- `ask_user`: 질문 1~4개, `choice`(옵션 2~4, multiSelect)/`text`/`yesno`. **CC AskUserQuestion과 스키마 거의 1:1.**
- 출처: [Gemini CLI hooks](https://geminicli.com/docs/hooks/), [extensions reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md), [ask-user.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/ask-user.md), [Google Developers Blog 2026-01-28](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/)

### opencode (소스 직접 검증: `packages/plugin/src/index.ts`)
- `chat.message`(mutable output.parts), `experimental.chat.system.transform`(mutable output.system), `tool.execute.before/after`, `tool`(커스텀 도구 등록 — 자체 ask_user 심기 가능).
- `experimental.` 접두사는 breaking change 대상. 설정은 merge 방식이라 안전.

### Amp
- 이벤트 5종: `session.start`, `agent.start`(append만, 차단 불가), `agent.end`(continue로 자기교정 루프 가능), `tool.call`(게이트 표현력 우수), `tool.result`. TS on Bun.
- **단일 출처 경고**: 공식 매뉴얼 외 교차검증 실패.

### Cursor CLI — 요구사항 미충족
- `beforeSubmitPrompt` 출력이 `{continue, user_message}`뿐 → 차단만 가능, 주입 불가. CLI 훅 패리티 부분적([Cursor 포럼 #148316](https://forum.cursor.com/t/cursor-cli-doesnt-send-all-events-defined-in-hooks/148316), 직원 확인 2026-01-08). L0(지침)+L2(게이트)만 부분 커버 가능.

---

## 4. AGENTS.md 표준 현황 (2026)

- Linux Foundation 산하 Agentic AI Foundation 스튜어드십, 60,000+ 프로젝트 사용, 공식 사이트 게재 도구 24종.
- **Claude Code는 목록에 없고 공식 문서가 미지원 명시.** 해법: `CLAUDE.md`에 `@AGENTS.md` import 또는 심볼릭 링크 (Windows는 import 강제).

## 5. Agent Skills 호환 현황

- Anthropic이 2025-12-18 오픈 표준으로 공개 (agentskills.io). CC, Cursor, opencode, Codex, Gemini 등 채택.
- **경로 파편화**: `~/.agents/skills/`가 중립 표준으로 수렴 중이나 **Claude Code만 여기를 읽지 않음** → 정본을 `~/.agents/skills/`에 두고 `~/.claude/skills/`에 심볼릭 링크가 정석 (citypaul/.dotfiles 방식).
- **한계: 스킬 자동 발동은 어디서도 결정론적이지 않음** — mind-reader가 스킬만으로 구현될 수 없는 이유.

## 6. MCP 적합성 평가

- **발동 메커니즘으로는 부적합**: MCP 서버는 도구 제공만 가능, 호출 여부는 모델 재량. "모든 요청에서 반드시 먼저 호출"을 강제할 수 없음.
- **MCP Elicitation** (2025-06-18 스펙): 서버가 구조화 입력 요청 가능하나 UI는 클라이언트 재량 (선택지 칩이 나올지 평문이 나올지 보장 없음).
- **유용한 지점**: ① Codex Default 모드 질문 UI 폴백 ② 세션 간 상태 저장소 ③ CC `mcp_tool` 훅 타입과 결합해 판정 로직 집중화.
- **판정: MCP는 발동 메커니즘이 아니라 실행 인프라. 발동은 반드시 훅.**

## 7. git clone + 설치 스크립트 배포 패턴 사례

- **[wshobson/agents](https://github.com/wshobson/agents)** — 단일 소스(`plugins/`) → 5+ 하네스별 **네이티브 산출물 생성** (번역이 아니라 generate). 가장 참고할 만함.
- **GNU Stow / 심볼릭 링크 dotfiles**: [mfmezger/ai_agent_dotfiles](https://github.com/mfmezger/ai_agent_dotfiles), [citypaul/.dotfiles](https://github.com/citypaul/.dotfiles)
- **대화형 설치 + 백업/머지**: [stellarlinkco/myclaude](https://github.com/stellarlinkco/myclaude), oh-my-opencode 계열

**설치 스크립트 필수 처리 항목(추정)**: ① 에이전트 자동 감지 ② 기존 훅 설정 병합(append, 덮어쓰기 금지, `.bak` 백업) ③ CLAUDE.md↔AGENTS.md 브리지 ④ 스킬 정본+심볼릭 링크 ⑤ `--dry-run` + `uninstall.sh`

---

## 8. 구현 후보 아키텍처

### 후보 A — 훅 우선 단일 코어 + 얇은 어댑터
core(모호도 판정+질문 루프 상태머신+렌더링, 언어 1개) + adapters(CC/Codex/Gemini 훅 스크립트, opencode/Amp TS 플러그인) + shared(AGENTS.md+SKILL.md) + install.sh

**동작 2단 구조 (핵심 설계)**
- **1단 주입(soft)**: 매 프롬프트 훅 발화 → 모호하면 `additionalContext`로 프로토콜 주입. 명확한 요청은 통과.
- **2단 게이트(hard)**: `PreToolUse`/`BeforeTool`이 세션 상태 확인 → **명세 승인 플래그 없으면 Write/Edit/Bash 차단**. "혼자 추측하고 실행"을 막는 유일한 결정론적 장치.

장점: 진짜 상시 자동, 3사 스키마 거의 동일(사실상 어댑터 1.2종). 단점: 훅 실패 시 지연/무력화, Cursor 미지원, 매 프롬프트 주입 토큰 비용.

### 후보 B — 지침 계층 단독 (Skills + AGENTS.md)
설치 30줄, 8개+ 에이전트 호환. **그러나 상시 자동 아님, 강제력 0 → 요구사항 미충족. 폴백 계층으로만 가치.**

### 후보 C — 하이브리드 5계층 (실전 권장)

| 계층 | 내용 | 지원 | 성격 |
|---|---|---|---|
| L0 지침 | AGENTS.md + CLAUDE.md 브리지 | 전 도구 | 폴백 (soft) |
| L1 발동 | UserPromptSubmit/BeforeAgent/chat.message/agent.start 매 턴 주입 | CC, Codex, Gemini, opencode, Amp | 상시 자동 (soft) |
| L2 게이트 | PreToolUse/BeforeTool/tool.execute.before/tool.call 승인 전 쓰기 차단 | + Cursor CLI도 가능 | **결정론적 (hard)** |
| L3 질문 UI | 네이티브 우선(AskUserQuestion/ask_user/커스텀 tool) → 번호 평문 폴백(Codex Default, Amp) | 도구별 분기 | UX |
| L4 상태·판정 | MCP 서버 (상태 저장, elicitation 폴백) | 선택 | 인프라 |

**단계적 구현 제안**: v0.1 = Claude Code + Gemini CLI (훅+네이티브 질문 UI 완비) → v0.2 Codex (질문 폴백) → v0.3 opencode/Amp → Cursor는 L0+L2만.

---

## 9. 리스크와 실측 필요 항목

1. **Codex Default 모드 질문 UI** — Plan 전용 주장은 rust-v0.121.0 소스 근거. 현재 버전 재확인 필요. Codex 지원 설계를 좌우.
2. **Cursor CLI `beforeSubmitPrompt` 발화 여부** — 실측 필요.
3. **훅 타임아웃** — CC UserPromptSubmit 30초 블로킹. 판정에 LLM 쓰면 체감 지연 큼.
4. **opencode experimental API** — breaking change 대상.
5. **fail-open/fail-closed** — 각 도구의 훅 실패 시맨틱 명시 처리 필요 (게이트 무력화 방지).

**단일 출처 주장**: Codex 마켓플레이스 출시일(비공식 블로그), Cursor CLI 훅 타임라인(포럼), Amp 플러그인 API(공식 매뉴얼만), Gemini 훅 v0.26.0(Google 블로그 단일이나 신뢰도 높음).

**확인 불가**: Codex 훅 도입 버전, Gemini ask_user 도입 버전, Cursor CLI skills 지원, opencode 프롬프트 차단 가능 여부, MCP elicitation 2026 최신 개정.
