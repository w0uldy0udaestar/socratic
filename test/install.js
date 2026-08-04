#!/usr/bin/env node
/** 설치·제거 왕복과 프로젝트 예외·idle 통과 검증. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// 실사용 지표(~/.mind-reader)를 오염시키지 않도록 HOME을 격리한다
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mr-home-"));

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(os.homedir(), ".mind-reader", "install.json");
let failures = 0;

function check(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    failures++;
  }
}

const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "mr-inst-"));
const h16 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

function runHook(hook, input, projectDir, env = {}) {
  try {
    const out = execFileSync("node", [path.join(ROOT, "dist", "hooks", hook)], {
      input: JSON.stringify(input),
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...env },
      encoding: "utf8",
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (e) {
    return { __crash: String(e.status ?? e.message) };
  }
}

function setState(dir, sid, state) {
  const f = path.join(os.homedir(), ".mind-reader", h16(dir), `${h16(sid)}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ updatedAt: "", ...state }));
}

console.log("[idle 데드락 수정]");
{
  const dir = freshDir();
  // 사이클이 시작되지 않은 상태(상태 파일 없음 = idle)에서는 차단하지 않아야 한다
  check("idle에서 Write 통과", runHook("pre-tool-use.js", { session_id: "i1", tool_name: "Write", tool_input: {} }, dir) === null);
  check("idle에서 Bash 통과", runHook("pre-tool-use.js", { session_id: "i1", tool_name: "Bash", tool_input: { command: "npm test" } }, dir) === null);

  // 사이클이 진행 중이면 여전히 차단
  setState(dir, "i1", { phase: "probing" });
  check("probing에서는 차단 유지", runHook("pre-tool-use.js", { session_id: "i1", tool_name: "Write", tool_input: {} }, dir)?.hookSpecificOutput?.permissionDecision === "deny");
  setState(dir, "i1", { phase: "spec_pending" });
  check("spec_pending에서도 차단 유지", runHook("pre-tool-use.js", { session_id: "i1", tool_name: "Write", tool_input: {} }, dir)?.hookSpecificOutput?.permissionDecision === "deny");
  setState(dir, "i1", { phase: "approved" });
  check("approved 통과", runHook("pre-tool-use.js", { session_id: "i1", tool_name: "Write", tool_input: {} }, dir) === null);
}

console.log("[프로젝트 단위 예외 .mind-reader-off]");
{
  const dir = freshDir();
  setState(dir, "p1", { phase: "probing" });
  check("예외 없으면 차단", runHook("pre-tool-use.js", { session_id: "p1", tool_name: "Write", tool_input: {} }, dir)?.hookSpecificOutput?.permissionDecision === "deny");

  fs.writeFileSync(path.join(dir, ".mind-reader-off"), "");
  check("예외 파일 있으면 게이트 통과", runHook("pre-tool-use.js", { session_id: "p1", tool_name: "Write", tool_input: {} }, dir) === null);
  check("예외 파일 있으면 주입 없음", runHook("prompt-submit.js", { session_id: "p1", prompt: "블로그를 좀 근사하게 정리해줘" }, dir) === null);
  check("예외 파일 있으면 Stop 차단 없음", runHook("stop.js", { session_id: "p1", transcript_path: "/nonexistent", stop_hook_active: false }, dir) === null);

  // 하위 디렉토리에서도 상위의 예외 파일을 인식해야 한다
  const sub = path.join(dir, "a", "b");
  fs.mkdirSync(sub, { recursive: true });
  setState(sub, "p2", { phase: "probing" });
  check("하위 경로에서도 예외 인식", runHook("pre-tool-use.js", { session_id: "p2", tool_name: "Write", tool_input: {} }, sub) === null);
}

console.log("[승인 데드락 — 명세가 직전 메시지가 아닐 때]");
{
  const dir = freshDir();
  const mkTranscript = (turns) => {
    const p = path.join(dir, `tr-${turns.length}-${Math.random().toString(36).slice(2)}.jsonl`);
    fs.writeFileSync(
      p,
      turns
        .map((c) => JSON.stringify({ type: "assistant", timestamp: "2026-08-04T07:00:00.000Z", message: { content: c } }))
        .join("\n") + "\n"
    );
    return p;
  };
  const approve = (sid, tp) => {
    setState(dir, sid, { phase: "spec_pending", cycleStartedAt: "2026-08-04T06:00:00.000Z" });
    runHook("prompt-submit.js", { session_id: sid, prompt: "승인", transcript_path: tp }, dir);
    return JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".mind-reader", h16(dir), `${h16(sid)}.json`), "utf8")
    ).phase;
  };
  const SPEC = [{ type: "text", text: "[MR-SPEC]\n변경: HANDOFF.md" }];

  check("명세 직후 승인", approve("d1", mkTranscript([SPEC])) === "approved");
  check(
    "명세 뒤 설명이 이어져도 승인",
    approve("d2", mkTranscript([SPEC, [{ type: "text", text: "쓰기가 차단되었습니다. 승인이 필요합니다." }]])) === "approved"
  );
  check(
    "명세 뒤 도구 호출이 와도 승인",
    approve("d3", mkTranscript([SPEC, [{ type: "tool_use", name: "AskUserQuestion", input: {} }]])) === "approved"
  );
  check(
    "명세 마커가 아예 없어도 사용자 승인은 존중",
    approve("d4", mkTranscript([[{ type: "text", text: "이렇게 진행하겠습니다." }]])) === "approved"
  );

  // 이전 사이클의 명세는 아카이브 대상이 아니어야 한다
  const specDir = path.join(os.homedir(), ".mind-reader", h16(dir), "specs");
  const before = fs.existsSync(specDir) ? fs.readdirSync(specDir).length : 0;
  const old = path.join(dir, "old.jsonl");
  fs.writeFileSync(
    old,
    JSON.stringify({ type: "assistant", timestamp: "2026-08-04T05:00:00.000Z", message: { content: SPEC } }) + "\n"
  );
  setState(dir, "d5", { phase: "spec_pending", cycleStartedAt: "2026-08-04T06:00:00.000Z" });
  runHook("prompt-submit.js", { session_id: "d5", prompt: "승인", transcript_path: old }, dir);
  const after = fs.existsSync(specDir) ? fs.readdirSync(specDir).length : 0;
  check("사이클 이전 명세는 아카이브하지 않음", after === before);
}

console.log("[설치·제거 왕복 — 마커가 제거된 상황]");
{
  const dir = freshDir();
  const sp = path.join(dir, "settings.json");
  fs.writeFileSync(sp, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "node ~/my/notify.js" }] }] } }, null, 2));
  const run = (mode) => execFileSync("node", [path.join(ROOT, "install", "merge-settings.js"), mode, sp], { encoding: "utf8" });

  run("add");
  check("설치 매니페스트 생성", fs.existsSync(MANIFEST) && JSON.parse(fs.readFileSync(MANIFEST, "utf8")).commands.length === 3);

  // Claude Code의 정규화를 재현: 알 수 없는 필드(_mindReader)를 제거
  let s = JSON.parse(fs.readFileSync(sp, "utf8"));
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev].map((e) => {
      const { _mindReader, ...rest } = e;
      return rest;
    });
  }
  fs.writeFileSync(sp, JSON.stringify(s, null, 2));
  check("마커가 제거된 상태 재현", !fs.readFileSync(sp, "utf8").includes("_mindReader"));

  const out = run("remove");
  s = JSON.parse(fs.readFileSync(sp, "utf8"));
  const ourLeft = JSON.stringify(s).split(path.join(ROOT, "dist", "hooks")).length - 1;
  check("마커 없어도 제거 성공", ourLeft === 0 && /3건 제거/.test(out));
  check("사용자 훅 보존", s.hooks.Stop.length === 1 && s.hooks.Stop[0].hooks[0].command.includes("notify.js"));
  check("제거 시 매니페스트 정리", !fs.existsSync(MANIFEST));

  const out2 = run("remove");
  check("제거할 게 없으면 경고", /경고/.test(out2));
}

console.log(failures === 0 ? "\n설치·예외 테스트 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
