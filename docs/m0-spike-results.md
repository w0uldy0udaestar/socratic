# M0 실측 스파이크 결과

> 실행일: 2026-08-04 | 환경: macOS (Darwin 25.6.0), Claude Code 2.1.221, 테스트 모델 haiku, bash+jq 훅
> 방법: 스크래치패드에 샌드박스 프로젝트 생성(`.claude/settings.json`에 프로젝트 스코프 훅 등록) → `claude -p` 헤드리스 호출로 검증. 훅 스크립트는 `spike/hooks/`에 보존.

## 결론

**설계의 3계층(주입·hard 게이트·Stop 게이트)이 모두 실측으로 검증됐다.** 리서치(문서 기반)의 핵심 주장들이 실기기에서 사실로 확인됐고, 미해결이었던 "비파일 작업의 결정론적 게이트"(D11)도 Stop 훅으로 가능함이 실증됐다. M1(코어 구현) 진행에 기술적 차단 요소 없음.

## 테스트 결과

| # | 검증 대상 | 결과 | 증거 |
|---|---|---|---|
| T1 | `UserPromptSubmit` 발화 + `additionalContext` 주입이 모델에 전달 | **통과** | 주입 지시대로 응답에 `MARKER-7429` 출력. hook.log에 발화 기록 |
| T2a | `PreToolUse` 게이트: 승인 플래그 없으면 Write 차단 | **통과** | `permissionDecision:"deny"` → 파일 미생성, 모델이 차단 사유("mind-reader gate 정책")를 인지하고 보고 |
| T2b | 승인 플래그 생성 후 허용 + **프로세스 간 상태 공유** | **통과** | 외부(부모 셸)에서 만든 `.mind-reader/approved`를 훅이 읽어 ALLOW 전환, test.txt 생성됨 |
| T3 | `Stop` 훅으로 의도 확인 전 종료 차단 (비파일 작업 게이트) | **통과** | 1차 Stop(`stop_hook_active=false`) block → 모델이 지시 수행(`INTENT-CHECK:` 출력) → 2차 Stop(`active=true`) 통과. 무한 루프 없음 |

로그 시퀀스 (T3):
```
[14:42:02] UserPromptSubmit fired: 가을에 대한 하이쿠를 하나 써줘.
[14:42:07] Stop fired (stop_hook_active=false)   ← block 반환
[14:42:13] Stop fired (stop_hook_active=true)    ← 루프 가드로 통과
최종 출력: "INTENT-CHECK: 사용자가 가을을 주제로 하는 하이쿠 시를 작성해달라고 요청했습니다."
```

## 설계에 반영할 발견

1. **`permissionDecision:"allow"`는 권한 시스템 전체를 우회한다.** T2b에서 `--allowedTools` 없이도 Write가 실행됨. 프로덕션에서 승인 후 블랭킷 allow를 반환하면 mind-reader가 사용자의 권한 설정을 무력화하는 부작용 발생 → **승인 후에는 allow가 아니라 무의견(exit 0)으로 통과시켜 기존 권한 흐름을 보존해야 한다.**
2. **deny의 reason이 모델에게 전달된다** — 차단이 조용한 실패가 아니라 "다음에 뭘 해야 하는지"를 가르치는 채널로 쓸 수 있다. 프로덕션 reason에는 "의도 확인 절차를 진행하라"는 구체적 지시를 담을 것.
3. **Stop 훅 block의 reason도 지시로 작동한다** — 모델이 reason의 지시(`INTENT-CHECK:` 재구성)를 그대로 수행했다. 비파일 작업 게이트의 실행 메커니즘으로 충분.
4. `stop_hook_active` 루프 가드는 문서대로 동작. 단 이 가드만으로는 "1회 개입 후 무조건 통과"라서, 프로덕션에서는 상태 파일 기반으로 "의도 확인이 실제 완료됐는지"를 판정해야 함.
5. 훅(bash+jq)의 체감 지연 없음 — 30초 타임아웃 대비 충분한 여유.

## 남은 실측 항목 (M1에서)

- 30초 타임아웃 경계 및 훅 스크립트 오류 시 fail-open/fail-closed 실동작
- 인터랙티브 모드(비헤드리스)에서 deny 메시지·Stop 개입의 사용자 체감 UX
- `AskUserQuestion` 도구가 게이트·Stop 개입과 결합될 때의 흐름
- `SubagentStart`/서브에이전트 내부에서의 훅 상속 여부

## 재현 방법

```bash
mkdir -p sandbox/.claude sandbox/hooks
cp spike/hooks/*.sh sandbox/hooks/ && chmod +x sandbox/hooks/*.sh
cp spike/sandbox-settings.json sandbox/.claude/settings.json
cd sandbox
claude -p "훅 테스트. '완료'라고 답해." --model haiku          # T1
claude -p "test.txt에 hello 써줘" --model haiku                 # T2a (차단)
touch .mind-reader/approved
claude -p "test.txt에 hello 써줘" --model haiku                 # T2b (허용)
rm .mind-reader/approved .mind-reader/intent-confirmed 2>/dev/null
claude -p "가을 하이쿠 하나" --model haiku                      # T3 (Stop 차단)
cat .mind-reader/hook.log
```
