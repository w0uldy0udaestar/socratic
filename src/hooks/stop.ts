import {
  readStdin,
  loadState,
  saveState,
  lastAssistantTurn,
  specHashOf,
  isDisabled,
  logEvent,
  countToolUsesSince,
  output,
} from "../common";

/**
 * Stop: 비파일 작업 게이트 (D11, M0-T3 실증).
 * probing 중 질문도 명세도 없이 턴을 끝내려 하면 차단한다.
 * 무한 루프 방지를 위해 재차단은 MAX_BLOCKS회로 제한 (J5).
 */
const MAX_BLOCKS = 3;

/** 실질 질문이 아닌 마무리 상투구 (J4) */
const CLOSING_PHRASE = /(더 필요한|필요하신|있으면 말씀|도와드릴|도와드릴까요|궁금한 점|알려주세요[.!]?$)/;

function main(): void {
  if (isDisabled()) return;
  const input = readStdin();
  const state = loadState(input);
  // spec_pending에서도 명세가 갱신될 수 있으므로(사용자가 수정 요청 → 모델이 재제시) 함께 처리한다.
  if (state.phase !== "probing" && state.phase !== "spec_pending") return;

  const turn = lastAssistantTurn(input);

  // 명세 제시 → 승인 대기 (명세 해시를 바인딩해 저장)
  const h = specHashOf(turn.text);
  if (h) {
    // 같은 해시면 재제시가 아니라 동일 명세 — 수정 횟수 계측에서 제외
    const versions = (state.specVersions ?? 0) + (h === state.specHash ? 0 : 1);
    saveState(input, "spec_pending", {
      specHash: h,
      specVersions: versions,
      cycleStartedAt: state.cycleStartedAt,
    });
    if (h !== state.specHash) {
      logEvent(input, "spec_presented", {
        version: versions,
        questions: countToolUsesSince(input, "AskUserQuestion", state.cycleStartedAt),
      });
    }
    return;
  }

  // 명세 대기 중인데 이번 턴에 명세가 없으면(수정 논의 등) 종료를 막지 않는다.
  if (state.phase === "spec_pending") return;

  // 사용자에게 실제로 묻는 중이면 종료 허용: AskUserQuestion 사용이 가장 깨끗한 신호 (J4)
  if (turn.tools.some((t) => t === "AskUserQuestion" || /ask.*question/i.test(t))) return;
  const tailText = turn.text.slice(-400);
  if (/[?？]/.test(tailText) && !CLOSING_PHRASE.test(tailText)) return;

  const blocks = state.stopBlocks ?? 0;
  if (input.stop_hook_active === true && blocks >= MAX_BLOCKS) return; // 안전 밸브
  saveState(input, "probing", {
    stopBlocks: blocks + 1,
    specHash: state.specHash,
    specVersions: state.specVersions,
    cycleStartedAt: state.cycleStartedAt,
  });
  logEvent(input, "stop_block", { n: blocks + 1 });

  output({
    decision: "block",
    reason:
      "mind-reader: 아직 의도 파악이 끝나지 않았다. AskUserQuestion으로 사용자에게 질문을 계속하거나, 의도가 파악됐다면 [MR-SPEC] 로 시작하는 의도 명세를 제시하고 '승인'을 요청한 뒤 종료하라.",
  });
}

try {
  main();
} catch {
  process.exit(0); // fail-open
}
