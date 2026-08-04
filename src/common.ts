import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

export const PHASES = ["idle", "probing", "spec_pending", "approved"] as const;
export type Phase = (typeof PHASES)[number];

export interface SessionState {
  phase: Phase;
  /** spec_pending 전환 시 명세 본문 해시 — 승인을 특정 명세에 바인딩 (C3) */
  specHash?: string;
  /** Stop 게이트 재차단 횟수 (J5) */
  stopBlocks?: number;
  updatedAt: string;
}

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  stop_hook_active?: boolean;
  [key: string]: unknown;
}

/** 사용자가 언제든 게이트를 벗어날 수 있는 탈출구 (리뷰 제안: kill switch) */
export function isDisabled(): boolean {
  const v = process.env.MIND_READER_OFF;
  return v === "1" || v === "true";
}

export function readStdin(): HookInput {
  let raw = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      raw = fs.readFileSync(0, "utf8");
      break;
    } catch (e: any) {
      if (e?.code !== "EAGAIN") break; // 파이프 미준비만 재시도 (J8)
    }
  }
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return {};
  }
}

export function projectDir(input: HookInput): string {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/**
 * 상태는 프로젝트 밖(~/.mind-reader/)에 둔다 — 게이트 대상인 Bash가 상태를 덮어써
 * 스스로 승인 상태를 만드는 권한 상승을 막는다 (C1).
 */
function stateRoot(input: HookInput): string {
  return path.join(os.homedir(), ".mind-reader", hash(projectDir(input)));
}

function stateFile(input: HookInput): string {
  return path.join(stateRoot(input), `${hash(input.session_id || "default")}.json`);
}

export function loadState(input: HookInput): SessionState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(input), "utf8"));
    if (s && PHASES.includes(s.phase)) return s as SessionState; // phase 화이트리스트 (J7)
  } catch {
    /* 첫 실행·파손 → idle */
  }
  return { phase: "idle", updatedAt: new Date().toISOString() };
}

export function saveState(
  input: HookInput,
  phase: Phase,
  extra: Partial<SessionState> = {}
): void {
  const file = stateFile(input);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const state: SessionState = { ...extra, phase, updatedAt: new Date().toISOString() };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file); // 원자적 교체 (J7)
}

/** 마지막 어시스턴트 턴의 텍스트와 사용 도구를 함께 반환한다. */
export function lastAssistantTurn(
  input: HookInput,
  maxEntries = 40
): { text: string; tools: string[] } {
  const p = input.transcript_path;
  if (!p) return { text: "", tools: [] };
  try {
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    const start = Math.max(0, lines.length - maxEntries); // 탐색 상한 (C3)
    for (let i = lines.length - 1; i >= start; i--) {
      let entry: any;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (entry?.type !== "assistant") continue;
      const content = entry?.message?.content;
      if (!Array.isArray(content)) continue;
      const text = content
        .filter((c: any) => c?.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text)
        .join("\n");
      const tools = content
        .filter((c: any) => c?.type === "tool_use" && typeof c.name === "string")
        .map((c: any) => c.name as string);
      if (text.trim() || tools.length) return { text, tools };
    }
  } catch {
    /* 트랜스크립트 접근 실패는 치명적이지 않음 */
  }
  return { text: "", tools: [] };
}

export function specHashOf(text: string): string | null {
  const i = text.indexOf("[MR-SPEC]");
  return i === -1 ? null : hash(text.slice(i).replace(/\s+/g, " ").trim());
}

/** 승인 시점에 명세를 메타데이터와 함께 아카이브로 보존한다 (D13). */
export function archiveSpec(input: HookInput, specText: string): string | null {
  try {
    const dir = path.join(stateRoot(input), "specs");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
    const file = path.join(dir, `spec-${stamp}.md`);
    const meta = [
      "---",
      `approvedAt: ${new Date().toISOString()}`,
      `project: ${projectDir(input)}`,
      `session: ${input.session_id ?? "unknown"}`,
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(file, meta + specText);
    return file;
  } catch {
    return null;
  }
}

export function output(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj));
}
