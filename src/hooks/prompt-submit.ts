import {
  readStdin,
  loadState,
  saveState,
  archiveSpec,
  lastAssistantTurn,
  specHashOf,
  isDisabled,
  logEvent,
  countToolUsesSince,
  output,
} from "../common";
import { isPassthrough, isApproval, startsNewCycle } from "../filter";
import { PROTOCOL, APPROVED_NOTICE } from "../protocol";

/**
 * UserPromptSubmit: 모든 프롬프트에서 발화 (D1 항상 자동).
 * 실패 시 fail-open (주입은 soft 계층 — 게이트가 hard 안전망).
 */
function inject(text: string): void {
  output({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text },
  });
}

function main(): void {
  const input = readStdin();
  if (isDisabled(input)) return; // kill switch / 프로젝트 예외
  const prompt = String(input.prompt ?? "");
  const state = loadState(input);

  // 승인 처리 (C3): 승인은 "직전 턴에 실제로 제시된 명세"에만 적용된다.
  // 직전 메시지가 명세가 아니면(예: 사용자가 수정을 요청한 뒤의 후속 질문) 승인으로 치지 않는다.
  // 해시는 아카이브 추적용으로만 기록한다 — 엄격 일치를 요구하면 트랜스크립트 플러시
  // 타이밍 차이로 승인이 영영 성립하지 않는 라이브락이 생긴다(E2E에서 실측).
  if (
    (state.phase === "spec_pending" || state.phase === "probing") &&
    isApproval(prompt)
  ) {
    const turn = lastAssistantTurn(input);
    const currentHash = specHashOf(turn.text);
    if (currentHash) {
      saveState(input, "approved", { specHash: currentHash });
      archiveSpec(input, turn.text);
      logEvent(input, "approved", {
        questions: countToolUsesSince(input, "AskUserQuestion", state.cycleStartedAt),
        specVersions: state.specVersions ?? 1,
        cycleStartedAt: state.cycleStartedAt,
      });
      inject(APPROVED_NOTICE);
      return;
    }
    // 명세 없이 들어온 승인어는 일반 답변으로 취급 — 아래 흐름으로
  }

  // 승인 후 새 발화 → 새 사이클 (승인 상태가 다음 작업으로 새지 않게, J1)
  if (state.phase === "approved") {
    if (!startsNewCycle(prompt)) return;
    startCycle(input, prompt);
    return;
  }

  if (isPassthrough(prompt)) return;

  // 진행 중(probing/spec_pending)의 발화는 문답의 일부 → 재주입하지 않음
  if (state.phase === "probing" || state.phase === "spec_pending") return;

  startCycle(input, prompt);
}

function startCycle(input: ReturnType<typeof readStdin>, prompt: string): void {
  // 미완료 사이클(승인 없이 끝난 것)은 stats에서 cycle_start와 approved의 차이로 산출한다.
  // probing 중의 발화는 문답의 일부로 처리되므로 이 지점에서는 포기를 판정할 수 없다.
  const startedAt = new Date().toISOString();
  saveState(input, "probing", { cycleStartedAt: startedAt, specVersions: 0 });
  logEvent(input, "cycle_start", { promptLen: prompt.trim().length });
  inject(PROTOCOL);
}

try {
  main();
} catch {
  process.exit(0); // fail-open
}
