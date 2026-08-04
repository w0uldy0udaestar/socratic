#!/usr/bin/env node
/** M2 계측 로깅·집계 검증. 훅을 실제 stdin/stdout로 구동한다. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;

const h16 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const stateDir = (dir) => path.join(os.homedir(), ".mind-reader", h16(dir));
const eventsFile = (dir) => path.join(stateDir(dir), "events.jsonl");

function runHook(hook, input, projectDir) {
  try {
    const out = execFileSync("node", [path.join(ROOT, "dist", "hooks", hook)], {
      input: JSON.stringify(input),
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: "utf8",
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (e) {
    return { __crash: String(e.status ?? e.message) };
  }
}

function check(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    failures++;
  }
}

const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "mr-tel-"));

function events(dir) {
  const f = eventsFile(dir);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function setState(dir, sid, state) {
  const f = path.join(stateDir(dir), `${h16(sid)}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ updatedAt: "", ...state }));
}

/** 어시스턴트 턴을 담은 트랜스크립트 생성 (질문 n회 + 선택적 명세) */
function transcript(dir, { questions = 0, spec = null, text = "진행합니다." } = {}) {
  const p = path.join(dir, `t-${Math.abs(questions)}-${spec ? spec.length : 0}.jsonl`);
  const lines = [];
  for (let i = 0; i < questions; i++) {
    lines.push(
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { content: [{ type: "tool_use", name: "AskUserQuestion", input: {} }] },
      })
    );
  }
  lines.push(
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-01-01T00:00:01.000Z",
      message: { content: [{ type: "text", text: spec ? `[MR-SPEC]\n${spec}` : text }] },
    })
  );
  fs.writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

console.log("[사이클 이벤트]");
{
  const dir = freshDir();
  runHook("prompt-submit.js", { session_id: "c1", prompt: "블로그를 좀 근사하게 정리해줘" }, dir);
  const ev = events(dir);
  check("cycle_start 기록", ev.some((e) => e.type === "cycle_start" && e.promptLen > 0));

  const f = path.join(stateDir(dir), `${h16("c1")}.json`);
  const st = JSON.parse(fs.readFileSync(f, "utf8"));
  check("cycleStartedAt 저장", typeof st.cycleStartedAt === "string" && st.specVersions === 0);
}

console.log("[명세 제시 계측]");
{
  const dir = freshDir();
  setState(dir, "s1", { phase: "probing", cycleStartedAt: "2026-01-01T00:00:00.000Z", specVersions: 0 });
  const tp1 = transcript(dir, { questions: 2, spec: "✓ 웹앱 / ~ 로컬 저장" });
  runHook("stop.js", { session_id: "s1", transcript_path: tp1, stop_hook_active: false }, dir);
  let ev = events(dir).filter((e) => e.type === "spec_presented");
  check("spec_presented v1 + 질문 수 집계", ev.length === 1 && ev[0].version === 1 && ev[0].questions === 2);

  // 같은 명세를 다시 제시해도 버전이 오르지 않아야 한다
  runHook("stop.js", { session_id: "s1", transcript_path: tp1, stop_hook_active: false }, dir);
  ev = events(dir).filter((e) => e.type === "spec_presented");
  check("동일 명세 재제시는 수정으로 안 침", ev.length === 1);

  // 명세가 바뀌면 v2
  const tp2 = transcript(dir, { questions: 3, spec: "✓ 웹앱 / ~ 서버 저장(수정)" });
  runHook("stop.js", { session_id: "s1", transcript_path: tp2, stop_hook_active: false }, dir);
  ev = events(dir).filter((e) => e.type === "spec_presented");
  check("명세 변경 시 v2 기록", ev.length === 2 && ev[1].version === 2);
}

console.log("[승인 계측]");
{
  const dir = freshDir();
  const tp = transcript(dir, { questions: 4, spec: "✓ 확정" });
  setState(dir, "a1", { phase: "spec_pending", cycleStartedAt: "2026-01-01T00:00:00.000Z", specVersions: 2 });
  runHook("prompt-submit.js", { session_id: "a1", prompt: "승인", transcript_path: tp }, dir);
  const ap = events(dir).find((e) => e.type === "approved");
  check("approved 이벤트", !!ap);
  check("질문 수 기록", ap?.questions === 4);
  check("명세 버전 기록 (수정률 산출용)", ap?.specVersions === 2);
}

console.log("[차단 계측]");
{
  const dir = freshDir();
  setState(dir, "b1", { phase: "probing" });
  runHook("pre-tool-use.js", { session_id: "b1", tool_name: "Write", tool_input: {} }, dir);
  check("gate_deny 기록", events(dir).some((e) => e.type === "gate_deny" && e.tool === "Write"));

  setState(dir, "b1", { phase: "probing" });
  runHook("stop.js", { session_id: "b1", transcript_path: transcript(dir, { text: "끝." }), stop_hook_active: false }, dir);
  check("stop_block 기록", events(dir).some((e) => e.type === "stop_block" && e.n === 1));
}

console.log("[승인 상태에서는 계측이 게이트를 방해하지 않음]");
{
  const dir = freshDir();
  setState(dir, "p1", { phase: "approved" });
  check("승인 후 통과 유지", runHook("pre-tool-use.js", { session_id: "p1", tool_name: "Write", tool_input: {} }, dir) === null);
  check("승인 상태 차단 로그 없음", !events(dir).some((e) => e.type === "gate_deny"));
}

console.log("[stats 집계]");
{
  const dir = freshDir();
  // 사이클 2건 시작, 그중 1건만 승인 → 미완료 1건으로 집계돼야 한다
  runHook("prompt-submit.js", { session_id: "x1", prompt: "블로그를 좀 근사하게 정리해줘" }, dir);
  runHook("prompt-submit.js", { session_id: "x2", prompt: "이번엔 문서를 새로 작성해줘" }, dir);
  setState(dir, "x1", { phase: "spec_pending", cycleStartedAt: "2026-01-01T00:00:00.000Z", specVersions: 2 });
  runHook("prompt-submit.js", { session_id: "x1", prompt: "승인", transcript_path: transcript(dir, { questions: 3, spec: "✓ A" }) }, dir);

  const out = execFileSync("node", [path.join(ROOT, "dist", "stats.js"), dir], { encoding: "utf8" });
  check("사이클 2건 집계", /사이클 시작\s+2/.test(out));
  check("승인 1건 집계", /승인 완료\s+1/.test(out));
  check("미완료 1건 집계", /미완료\s+1/.test(out));
  check("평균 질문 수 3.0", /평균 질문 수\s+3\.0/.test(out));
  check("명세 수정률 100%", /명세 수정률\s+100%/.test(out));

  const empty = execFileSync("node", [path.join(ROOT, "dist", "stats.js"), freshDir()], { encoding: "utf8" });
  check("빈 프로젝트 안내", /아직 기록된 이벤트가 없습니다/.test(empty));
}

console.log(failures === 0 ? "\n계측 테스트 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
