#!/usr/bin/env node
/**
 * 게이트 판정 경계 전수 점검.
 * 원칙: 확실히 읽기인 것만 통과, 나머지는 전부 차단(default deny).
 * 판정 대상 문자열은 이 파일 안에만 두고, 출력은 건수와 라벨만 남긴다.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mr-home-"));

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const h16 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mr-gm-")));

// 게이트가 작동하는 상태(사이클 진행 중)로 고정
const stateFile = path.join(os.homedir(), ".mind-reader", h16(dir), `${h16("g")}.json`);
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify({ phase: "probing", updatedAt: "" }));

function gate(toolName, toolInput = {}) {
  try {
    const out = execFileSync("node", [path.join(ROOT, "dist", "hooks", "pre-tool-use.js")], {
      input: JSON.stringify({ session_id: "g", tool_name: toolName, tool_input: toolInput }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: "utf8",
    });
    const r = out.trim() ? JSON.parse(out) : null;
    return r?.hookSpecificOutput?.permissionDecision === "deny" ? "deny" : "allow";
  } catch {
    return "crash";
  }
}
const bash = (cmd) => gate("Bash", { command: cmd });

function group(label, items, expected, run) {
  let bad = [];
  for (const it of items) if (run(it) !== expected) bad.push(it);
  const name = `${label} (${items.length}건 전부 ${expected === "deny" ? "차단" : "통과"})`;
  if (bad.length === 0) console.log(`  ok  ${name}`);
  else {
    console.error(`FAIL  ${name} — 어긋남 ${bad.length}건: ${bad.slice(0, 3).map((x) => JSON.stringify(String(x).slice(0, 40))).join(", ")}`);
    failures++;
  }
}

console.log("[도구 이름 — 차단돼야 하는 것]");
group("쓰기 도구", ["Write", "Edit", "MultiEdit", "NotebookEdit"], "deny", gate);
group("MCP 쓰기류", ["mcp__filesystem__write_file", "mcp__db__delete_row", "mcp__gh__create_pr", "mcp__x__update_config"], "deny", gate);
group("미지의 미래 도구", ["SomeFutureTool", "ApplyPatch", "Deploy", "Execute"], "deny", gate);
group("대소문자 변형(화이트리스트 우회 시도)", ["write", "READ", "Read ", " Read", "reaD"], "deny", gate);
group("빈·이상한 이름", ["", "  ", "\n", "null", "undefined"], "deny", gate);

console.log("[도구 이름 — 통과해야 하는 것]");
group("읽기 도구", ["Read", "Grep", "Glob", "NotebookRead", "LS"], "allow", gate);
group("사고·질문 도구", ["AskUserQuestion", "TodoWrite", "ExitPlanMode", "EnterPlanMode", "Skill", "ToolSearch"], "allow", gate);
group("조사 도구", ["WebFetch", "WebSearch"], "allow", gate);
group("작업 관리", ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"], "allow", gate);
group("MCP 읽기류", ["mcp__gh__get_issue", "mcp__db__list_tables", "mcp__x__search_docs", "mcp__y__read_file", "mcp__z__describe_schema"], "allow", gate);

console.log("[Bash — 통과해야 하는 조사 명령]");
group(
  "단일 읽기",
  ["ls", "ls -la", "pwd", "cat package.json", "head -20 README.md", "wc -l src/common.ts", "stat .", "file dist/stats.js", "du -sh .", "which node", "date"],
  "allow",
  bash
);
group(
  "검색·git 조회",
  ['grep -rn "phase" src', 'rg "MR-SPEC" src', "find . -name '*.ts'", "git status", "git log --oneline -5", "git diff", "git branch", "git show HEAD"],
  "allow",
  bash
);
group(
  "파이프·리다이렉션 허용 형태",
  ["git log --oneline | head -20", 'find . -name "*.ts" | wc -l', 'grep -rn "x" . 2>/dev/null', "cat a.json | jq .", "ls | sort | uniq"],
  "allow",
  bash
);
group(
  "인용부호 안의 메타문자(오탐 방지)",
  ['rg "=>" src', 'grep -n "a > b" file', 'grep -rn "rm -rf" docs', 'grep -n "cp " Makefile', 'grep "a|b" x'],
  "allow",
  bash
);

console.log("[Bash — 차단돼야 하는 것]");
const CHAIN = [
  "ls; node -e \"require('fs').rmSync('src',{recursive:true})\"",
  "ls && python3 -c \"open('/tmp/x','w')\"",
  "pwd; npm run deploy",
  "ls; git add -A",
  "echo $(bash deploy.sh)",
  "ls `bash deploy.sh`",
  "ls\nrm -rf dist",
  "ls || rm -rf dist",
];
const REDIRECT = ["cat a > b", "cat a >> b", "echo x > file", "cat < input", "tee out.txt"];
const MUTATE = ["rm -rf dist", "mv a b", "cp a b", "mkdir x", "touch y", "chmod 777 x", "npm install", "git commit -m x", "git push", "sed -i '' 's/a/b/' f"];
const FLAGS = ["find . -name '*.ts' -delete", "find . -exec rm {} ;", "find . -execdir rm {} ;", "find . -ok rm {} ;"];
const RUNNERS = ["node -e \"1\"", "python3 -c \"1\"", "env FOO=1 bash x.sh", "bash x.sh", "sh -c x", "osascript -e x", "perl -e 1", "ruby -e 1"];
const NETWORK = ["curl -X POST https://x -d @f", "wget https://x", "nc -l 1234", "ssh host cmd"];
group("체이닝·치환", CHAIN, "deny", bash);
group("리다이렉션", REDIRECT, "deny", bash);
group("변이 명령", MUTATE, "deny", bash);
group("위험 플래그", FLAGS, "deny", bash);
group("임의 코드 실행기", RUNNERS, "deny", bash);
group("네트워크", NETWORK, "deny", bash);
group("빈·공백 명령", ["", "   ", "\n"], "deny", bash);

console.log("[탈출구]");
{
  const off = (t) => {
    try {
      const out = execFileSync("node", [path.join(ROOT, "dist", "hooks", "pre-tool-use.js")], {
        input: JSON.stringify({ session_id: "g", tool_name: t, tool_input: {} }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir, MIND_READER_OFF: "1" },
        encoding: "utf8",
      });
      return out.trim() ? "deny" : "allow";
    } catch {
      return "crash";
    }
  };
  group("MIND_READER_OFF=1", ["Write", "Bash", "Edit"], "allow", off);

  fs.writeFileSync(path.join(dir, ".mind-reader-off"), "");
  group(".mind-reader-off 파일", ["Write", "Edit"], "allow", gate);
  fs.unlinkSync(path.join(dir, ".mind-reader-off"));
  group("예외 파일 제거 후 복원", ["Write"], "deny", gate);
}

console.log("[승인 후]");
{
  fs.writeFileSync(stateFile, JSON.stringify({ phase: "approved", updatedAt: "" }));
  group("승인 상태에서는 전부 통과", ["Write", "Edit", "Bash"], "allow", (t) => (t === "Bash" ? bash("rm -rf x") : gate(t)));
}

console.log(failures === 0 ? "\n게이트 매트릭스 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
