# mind-reader 경쟁·선행사례 리서치 보고서

> 작성: Trend Researcher 서브에이전트 (opus) | 조사일 2026-08-04
> 조사 범위: GitHub(API·검색), HN Algolia API, 공식 문서(Anthropic/Google/OpenAI), arXiv, 기술 매체

---

## 0. 결론 요약 (TL;DR)

**"에이전트가 추측하지 말고 질문하게 하자"는 아이디어는 이미 매우 붐비는 영역입니다.** 2025~2026년 사이 (a) 3대 CLI 에이전트 전부가 네이티브 질문 기능을 탑재했고, (b) spec-driven development(SDD) 프레임워크들이 초대형 스타 수를 기록했으며, (c) 최소 15개 이상의 스킬·플러그인·MCP 서버가 같은 문제를 공략 중입니다.

**기획서에 적힌 4요소 조합("항상 자동 + 선택지 기반 + 반복 질문 + 다중 에이전트 호환")은 비어 있지 않습니다.** 가장 근접한 선행사례는 `obra/superpowers`의 brainstorming 스킬(자동 트리거 + 한 번에 한 질문 + 객관식 선호 + 11개 에이전트 지원 + 승인 게이트)이고, 결정론적 훅 기반 자동 개입은 `severity1/claude-code-prompt-improver`(1.8k stars)가 이미 구현했습니다.

**남아 있는 진짜 빈 자리는 세 가지 교집합입니다:** ① 모델 재량이 아닌 **훅 기반 결정론적 강제** + ② **정보이득 기반 적응형 질문 시퀀스(아키네이터 본질)** + ③ **CC/Codex/Gemini 3사 훅 동시 지원**. ①은 CC 전용으로 존재, ②는 어디에도 없음(확인 범위 내), ③은 2026년 3월에야 기술적으로 가능해짐. 이 셋의 교집합은 현재 공백입니다.

**주의 신호:** Anthropic은 유사 기능 요청(Issue #11450)을 "not planned"로 닫았고, 네이티브 도구들은 의도적으로 "정말 막혔을 때만 질문"하도록 설계돼 있습니다. 과잉 질문 피로에 대한 반발도 존재합니다.

---

## 1. 발견된 유사 도구·선행사례

### A군. 에이전트 네이티브 기능 (가장 강력한 경쟁자 — 무료·기본 탑재)

| 도구 | 방식 | 배포 | 근거·날짜 |
|---|---|---|---|
| **Claude Code `AskUserQuestion`** | 구조화된 객관식 질문 UI(키보드 네비게이션, 옵션별 설명, "(Recommended)" 표기, `multiSelect`, 항상 "Other" 자유입력 제공). Plan Mode에서 특히 활발 | CC 본체 내장 | [Anthropic 공식 Agent SDK 문서](https://code.claude.com/docs/en/agent-sdk/user-input), [시스템 프롬프트 원문 아카이브](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-askuserquestion.md) |
| **Gemini CLI `ask_user` + Plan Mode** | 읽기 전용 조사 모드에서 에이전트가 조사를 멈추고 "선택지를 제시"하며 질문. `ask_user`는 v0.29.0(2026-02-18) 도입, Plan Mode는 2026-03-11 정식 발표 | Gemini CLI 내장 | [Google Developers Blog, 2026-03-11](https://developers.googleblog.com/plan-mode-now-available-in-gemini-cli/), [gemini-cli Discussion #19473](https://github.com/google-gemini/gemini-cli/discussions/19473) |
| **Codex CLI Plan Mode** | Pair/Plan/Execute 3모드 중 Plan에서 읽기 전용 조사 + 명확화 질문 후 계획 승인 | Codex CLI 내장 | [Codex Knowledge Base, 2026-03-27](https://codex.danielvaughan.com/2026/03/27/planning-mode-in-practice/) |

**핵심 시사점(사실):** `AskUserQuestion` 도구 설명서에는 **"사용자가 결정해야 할 사안에 진짜로 막혔을 때만 사용하라"**고 명시돼 있습니다. 즉 네이티브 기능은 **의도적으로 보수적**입니다. mind-reader의 "항상 자동" 포지션이 성립하는 근거이자, 동시에 벤더가 그렇게 설계하지 않은 이유를 설명합니다.

### B군. Spec-Driven Development 프레임워크 (질문을 워크플로 단계로 흡수)

| 도구 | 스타 | 최근 push | 질문 방식 | 배포 |
|---|---|---|---|---|
| **[github/spec-kit](https://github.com/github/spec-kit)** | **125,208** (fork 11,191) | 2026-08-03 | `/speckit.clarify`: 9개 모호성 분류 체계 스캔 → **최대 5개** 질문, 순차 1문항씩, **마크다운 표 형식 객관식**(추천안 최상단), 답변을 spec의 `Clarifications` 섹션에 즉시 기록 | `uvx` CLI, 30개 에이전트 통합 |
| **[Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)** | **63,674** (fork 4,405) | 2026-08-04 | `/opsx:explore`가 "no-stakes thinking partner"로 옵션을 저울질한 뒤 제안 작성 | npm CLI, 30+ 도구 지원 |
| **[bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)** | **51,444** (fork 5,903) | 2026-08-04 | **Advanced Elicitation**: 각 문서 섹션 생성 후 **번호 매긴 1~5 옵션 리스트** 제시(+ 리스트 재섞기 / 전체 방법 나열 / 진행). 번호 입력으로 선택 | npm 설치, 다중 에이전트 |
| **AWS Kiro** | (상용) | 2026-05 국제 출시 | 프롬프트 → EARS 표기법 requirements.md → design.md → tasks.md 3단계 승인 | 상용 IDE |

**교차 검증:** spec-kit 스타 수는 API 조회값(125,208)과 매체 보도(2026-05 "90k+" [MarkTechPost](https://www.marktechpost.com/2026/05/08/meet-github-spec-kit-an-open-source-toolkit-for-spec-driven-development-with-ai-coding-agents/), 2026-06 "111k" [Ry Walker Research](https://rywalker.com/research/github-spec-kit))의 성장 궤적이 일치.

**주의(사실):** OpenSpec은 63.7k 스타지만 **npm 월 다운로드는 9,949건**(2026-07-04~08-02, npm API). **스타 수와 실사용량의 괴리가 큽니다.**

**Kiro의 알려진 한계(2차 자료):** requirements.md/design.md가 선행 생성되므로 구현 중 발견된 제약이 반영되지 않아 "spec drift"와 워터폴 역학이 보고됨 ([HarrisonAIX 리뷰](https://harrisonaix.com/kiro-review/), [GeekWire, 2026](https://www.geekwire.com/2026/aws-targets-ai-slop-with-new-spec-check-in-kiro-coding-tool-amid-scrutiny-of-agent-reliability/)).

### C군. 질문 특화 스킬·플러그인 (mind-reader와 가장 직접 경쟁)

| 도구 | 스타 | 최근 push | 무엇을 하는가 | 배포 | 다중 에이전트 |
|---|---|---|---|---|---|
| **[obra/superpowers](https://github.com/obra/superpowers)** — `brainstorming` 스킬 | **265,828** (fork 23,773) ※ 2차 자료는 150k, 교차검증 미완 | 2026-08-03 | **가장 근접한 선행사례.** "모든 창작 작업 전"에 자동 활성화, **한 번에 한 질문**, **"가능하면 객관식 선호"**, 2~3개 접근안 트레이드오프 제시, `docs/superpowers/specs/*-design.md` 산출, **"사용자 승인 전 구현 금지" 하드 게이트** | CC 공식 마켓플레이스 + 자체 마켓플레이스 | **예 — 11종** (Cursor, Codex App/CLI, Gemini CLI, Copilot CLI, Kimi, Antigravity, Factory Droid, OpenCode, Pi) |
| **[severity1/claude-code-prompt-improver](https://github.com/severity1/claude-code-prompt-improver)** | **1,840** (fork 148) | 2026-06-03 | **결정론적 훅 방식.** `UserPromptSubmit`/`PreToolUse`/`SubagentStart` 훅으로 매 프롬프트 명료도 평가(~189 토큰). 모호하면 코드베이스 grep·git log 조사 → **AskUserQuestion으로 1~6개 근거 기반 객관식 질문**. 원칙: "정말 불명확할 때만, 절대 블로킹하지 않음" | 자체 플러그인 마켓플레이스, MIT, CC 2.0.22+ | **아니오 (Claude Code 전용)** |
| **[m4vic/socratic](https://github.com/m4vic/socratic)** | 79 | 확인 불가 | 15개 도메인 697개 질문 + 60개 decision card. 에이전트의 **자문자답**용 | 스킬 (Claude+Codex) | 예 |
| **[riiiku/clarify-skill](https://github.com/riiiku/clarify-skill)** | 72 | 2026-04-06 | 흐릿한 생각→정밀한 지시로 변환 | CC 스킬 | 확인 불가 |
| **[Jekudy/grillme-skill](https://github.com/Jekudy/grillme-skill)** | 28 | 확인 불가 | 3파(surface→deep→insight) 구조화 인터뷰 | 마켓플레이스 | 아니오 |
| 기타 | — | — | socrates-skill(교육용), socratic-skills(사용자 퀴즈), Rich-Elicitation-Skill(7), clarify-crit(8), plan-mode-visualizer(2), quizzing(2), fathom-mode(13) | — | 대부분 CC 전용 |

### D군. Human-in-the-Loop MCP 서버

| 도구 | 스타 | 최근 push | 특징 |
|---|---|---|---|
| [noopstudios/interactive-feedback-mcp](https://github.com/noopstudios/interactive-feedback-mcp) | **1,715** | **2025-05-26 (14개월 정체)** | AI를 일시정지시키고 질문·피드백 받는 MCP |
| [ifmelate/clarify-mcp](https://github.com/ifmelate/clarify-mcp) | 0 | 2025-11-25 | `ask_clarification` 단일 툴, **MCP elicitation 사용** |
| 기타 HITL MCP | 한 자릿수~확인 불가 | — | GUI 다이얼로그 등 |

**시사점:** MCP HITL 서버는 **"질문할 수 있는 통로"만 제공**하고 **"언제·무엇을 물을지 강제하지 않음"** → 흥행 상한이 낮음. **배관(MCP)만으로는 부족하고 정책(훅+플레이북)이 필요하다**는 시장 증거(해석).

### E군. 학술 선행연구

| 논문 | 발견 |
|---|---|
| [ClarifyGPT (arXiv 2310.10996)](https://arxiv.org/abs/2310.10996) | LLM이 모호한 요구사항을 식별하고 표적 질문을 하게 하는 프레임워크 |
| ClarifyCoder (2025) | 파인튜닝으로 communication rate 24%→63%, good question rate 21%→52% |
| ClarifyCodeBench (arXiv 2607.00711) | 모호한 요구사항 명확화 능력 벤치마크 |
| Fewer Clarifications, Better Code (arXiv 2607.26611) | 세션 간 개인화된 모호성 적응 — **질문을 줄이는 것**도 연구 주제 |

---

## 2. 커뮤니티 수요 근거

### 확인된 명시적 요구 (1차 자료)

| 출처 | 날짜 | 내용 | 결말 |
|---|---|---|---|
| [anthropics/claude-code Issue #11450](https://github.com/anthropics/claude-code/issues/11450) | 2025-11-11 | "Prompt Review Agent" 요청 — 프롬프트 가로채기 → 의도 파싱 → 갭 탐지 → 명확화 질문 → 정제된 프롬프트 실행 | **Closed as not planned** |
| copilot-coding-agent/user-feedback Issue #84 | 2025-08-30 | 작업 시작 전 명확화 질문 토글 요청 | Closed (저장소 아카이브) |

→ 수요는 실재하나 벤더가 우선순위를 두지 않음 = **서드파티 도구의 존재 이유**(해석).

### HN 담론 밀도

"ask clarifying questions" 코멘트가 2026-06-01 이후 2개월간 20건 이상의 무관한 스레드에서 자발적으로 언급. **"직접 시켜야 한다"는 우회 패턴**이 반복. 수요의 본질은 "기능이 없다"가 아니라 **"매번 수동으로 시켜야 하고, 시켜도 안 하거나, 때로는 과하다"는 신뢰성·일관성 불만**(해석).

### 반대 신호 (반드시 고려)

1. 네이티브 도구의 명시적 억제 설계 ("진짜 막혔을 때만")
2. prompt-improver도 "never block" 원칙 명시
3. HN에 과잉 질문 피로 불만 존재, 학계도 "Fewer Clarifications" 방향 연구 중
4. Anthropic이 유사 요청을 not planned로 종결

→ **"항상 자동"은 가장 큰 차별점이자 가장 큰 리스크. 즉시 우회 가능한 탈출구 필수**(추정).

---

## 3. 수요 신호 정리

| 계층 | 대표 지표 |
|---|---|
| 방법론 프레임워크 | spec-kit 125k, superpowers 266k, OpenSpec 64k, BMAD 51k ★ 압도적 |
| 질문 특화 플러그인 | prompt-improver 1.8k ★ 카테고리 최고 |
| HITL MCP 서버 | 최고 1.7k, 대부분 0~10 |
| 순수 "clarify" 스킬 | 대부분 세 자릿수 미만 |
| 실사용 검증 | OpenSpec npm 월 9,949 다운로드 (스타 64k 대비 매우 낮음) |

**판단:** "질문/명확화"를 단독 기능으로 팔면 세 자릿수 미만에서 정체. **방법론·워크플로 프레임워크로 패키징하면** 만~십만 단위(추정, 위 분포 근거).

---

## 4. 빈 자리 분석 — 4축 매트릭스

| 도구 | ① 항상 자동 | ② 구조화 선택지 UI | ③ 반복적 좁혀가기 | ④ 다중 에이전트 |
|---|---|---|---|---|
| CC AskUserQuestion | ✗ (모델 재량) | ○ | △ | ✗ |
| Gemini `ask_user` | ✗ (Plan mode 한정) | ○ | △ | ✗ |
| spec-kit `/clarify` | ✗ (수동 호출) | ○ | ○ (최대 5문항) | ○ (30 에이전트) |
| BMAD elicitation | ✗ | ○ | ○ | ○ |
| superpowers brainstorming | ○ (스킬 자동 트리거 = 확률적) | △ | ○ | ○ (11종) |
| prompt-improver | **○ (훅 = 결정론적)** | ○ | △ (1라운드) | ✗ (CC 전용) |
| HITL MCP 계열 | ✗ | △ | ✗ | ○ |

### 남은 공백

1. **결정론적 강제 × 다중 에이전트** — 스킬 자동 호출은 모델 재량에 좌우되어 실패가 문서화된 문제([Issue #43287](https://github.com/anthropics/claude-code/issues/43287)). 훅 기반은 CC 전용(prompt-improver)뿐.
2. **정보이득 기반 적응형 질문(아키네이터 본질)** — 기존 도구는 전부 고정 개수 1회전 또는 선형 순차. **답변에 따라 분기 + 불확실성 임계 도달 시 자동 종료** 구조는 미발견.
3. **타이밍 창** — 3사 CLI 훅 파리티가 2026년 3월 완성 (CC `UserPromptSubmit` 기존 / Gemini `BeforeAgent` v0.26.0+ / Codex `UserPromptSubmit` PR #14626, 2026-03-18 머지). **"3사 전부에서 결정론적으로 프롬프트를 가로채는 도구"는 아직 아무도 안 만듦(조사 범위 내).**

### 공백이 아닌 것

- "선택지 기반 질문" 자체 — 이미 흔함
- "질문 후 승인 게이트" — superpowers·spec-kit·Kiro에 존재
- "명세 산출물 생성" — SDD 프레임워크 영역

---

## 5. 배포 형태 — 이 계열에서 통한 것

- **패턴 A. 자체 git 마켓플레이스 + 공식 마켓플레이스 동시 등재** (prompt-improver, superpowers) — CC는 2줄 설치
- **패턴 B. 언어 네이티브 CLI 인스톨러 + N개 에이전트 어댑터** (spec-kit uvx, OpenSpec/BMAD npm)
- **패턴 C. MCP 서버** — 호환성 최고, 흥행 최저

**권고 조합(추정):** 패턴 B 골격(`npx mind-reader init`이 각 에이전트 훅 설정 자동 작성) + 패턴 A로 CC 사용자 유입 + MCP는 폴백.

---

## 6. 차별화 기회

### 살아 있는 차별화 축
1. **결정론적 훅 강제** — "모델이 기억해주길 바라지 않는다. 프로세스가 강제한다"
2. **아키네이터식 적응형 질문 트리** — 유일한 미점유 기술 신규성
3. **3사 CLI 훅 동시 지원** — 2026-03 이후 신규 가능, 미점유
4. **경량 "의도 명세"(≠ 대형 spec 문서)** — SDD 이전 단계/일상 요청 점유

### 리스크
| 리스크 | 근거 |
|---|---|
| "항상"이 마찰로 인식됨 | prompt-improver "never block" 원칙, HN 과잉질문 불만, arXiv 2607.26611 |
| 네이티브 기능에 흡수 | 3사 모두 12~14개월 내 유사 기능 자체 탑재 이력 |
| 단독 기능 도구의 낮은 상한 | clarify 계열 스킬 전부 세 자릿수 미만 |
| 스타 ≠ 사용 | OpenSpec 64k 스타 vs 월 10k 다운로드 |

---

## 7. 한계와 확인 불가 항목

- GitHub 스타 수 대부분 단일 출처 (spec-kit만 3개 출처 교차 검증). superpowers 265,828은 재확인 권장
- Reddit 직접 조사 미수행 (검색 엔진 미반환) — 커뮤니티 근거는 HN + GitHub Issue 기반
- Issue #11450, #84의 반응 수 미확인
- AskUserQuestion 도입 버전(v2.0.21) 공식 changelog 확인 실패
- "아키네이터식 도구 부재"는 미발견이지 부재 증명 아님
- Gemini CLI Plan Mode 기본 활성 여부 재확인 필요
- 상용 제품(Kiro, Traycer 등)은 표면 조사만
