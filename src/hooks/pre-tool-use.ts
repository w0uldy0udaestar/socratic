import { readStdin, loadState, isDisabled, output } from "../common";
import { isReadOnlyCommand } from "../bash-guard";

/**
 * PreToolUse: 승인 전 쓰기·실행 차단 (D6 hard 게이트).
 * matcher는 "*" — 읽기 도구를 명시적으로 통과시키는 default deny 구조 (J3).
 * 승인 후에는 무의견(exit 0)으로 기존 권한 흐름을 보존 (M0 발견 #1).
 * 내부 오류 시 fail-closed.
 */

/** 승인 없이도 항상 허용 — 조사·사고·질문 도구 */
const ALWAYS_ALLOWED = new Set([
  "Read", "Grep", "Glob", "NotebookRead", "LS",
  "WebFetch", "WebSearch", "TodoWrite", "Task", "Agent",
  "AskUserQuestion", "ExitPlanMode", "EnterPlanMode",
  "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "ToolSearch", "Skill",
]);

/** 이름만으로 읽기 도구로 볼 수 있는 패턴 (MCP 등) */
const READ_LIKE = /(^|_)(read|get|list|search|fetch|query|view|describe|show|status)(_|$)/i;

function deny(reason: string): void {
  output({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

const GATE_MSG =
  "mind-reader gate: 의도 명세가 아직 승인되지 않았습니다. 읽기·조사 도구는 사용할 수 있습니다. 사용자에게 의도 파악 질문을 진행하고 [MR-SPEC] 명세를 제시해 '승인'을 받으세요.";

function main(): void {
  if (isDisabled()) return; // kill switch
  const input = readStdin();
  const tool = String(input.tool_name ?? "");

  if (loadState(input).phase === "approved") return; // 무의견 통과

  if (ALWAYS_ALLOWED.has(tool)) return;

  if (tool === "Bash") {
    const cmd = String((input.tool_input as any)?.command ?? "");
    if (isReadOnlyCommand(cmd)) return;
    deny(
      `${GATE_MSG} (Bash는 파이프 없는 단일 읽기 명령만 허용됩니다: ls, cat, grep, rg, find, git status/log/diff 등)`
    );
    return;
  }

  // MCP 등 이름 기반 읽기 도구 통과
  if (tool.startsWith("mcp__") && READ_LIKE.test(tool)) return;

  deny(GATE_MSG);
}

try {
  main();
} catch {
  deny("mind-reader gate 내부 오류로 안전을 위해 차단합니다. (해제: 환경변수 MIND_READER_OFF=1 또는 ./uninstall.sh)");
}
