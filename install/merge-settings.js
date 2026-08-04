#!/usr/bin/env node
/**
 * ~/.claude/settings.json에 mind-reader 훅을 병합(add) 또는 제거(remove)한다.
 * - 우리 항목 식별은 설치 경로가 아니라 명시적 마커 필드로 한다 (C4).
 * - 기존 설정은 덮어쓰지 않고 배열에 append. 실행 전 .bak 백업(최근 5개 유지).
 * 사용법: node merge-settings.js <add|remove> [settings.json 경로]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const MARKER = "_mindReader";
const VERSION = "0.1.0";
/**
 * 식별 전략 (실사용에서 확인된 제약):
 * Claude Code가 settings.json을 정규화하면서 알 수 없는 필드(_mindReader)를 제거하므로
 * 마커만으로는 제거 시 우리 항목을 찾지 못한다. 그래서 설치 시 명령 문자열을 매니페스트에
 * 남기고, 매니페스트 대조 → 실행 경로 대조 → 마커 순으로 식별한다.
 */
const MANIFEST = path.join(os.homedir(), ".mind-reader", "install.json");
const HOOK_DIR = path.join(repoRootOf(), "dist", "hooks");

function repoRootOf() {
  return path.resolve(__dirname, "..");
}

function readManifest() {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    return Array.isArray(m.commands) ? m.commands : [];
  } catch {
    return [];
  }
}

function writeManifest(commands) {
  try {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(
      MANIFEST,
      JSON.stringify({ version: VERSION, installedAt: new Date().toISOString(), commands }, null, 2)
    );
  } catch {
    /* 매니페스트 기록 실패해도 경로 대조 폴백이 있다 */
  }
}

const mode = process.argv[2];
if (mode !== "add" && mode !== "remove") {
  console.error("사용법: node merge-settings.js <add|remove> [settings.json]");
  process.exit(1);
}
const settingsPath =
  process.argv[3] || path.join(os.homedir(), ".claude", "settings.json");
const repoRoot = path.resolve(__dirname, "..");

const hookDefs = {
  UserPromptSubmit: {
    [MARKER]: VERSION,
    hooks: [{ type: "command", command: `node "${repoRoot}/dist/hooks/prompt-submit.js"` }],
  },
  PreToolUse: {
    [MARKER]: VERSION,
    matcher: "*", // default deny 구조 (J3)
    hooks: [{ type: "command", command: `node "${repoRoot}/dist/hooks/pre-tool-use.js"` }],
  },
  Stop: {
    [MARKER]: VERSION,
    hooks: [{ type: "command", command: `node "${repoRoot}/dist/hooks/stop.js"` }],
  },
};

const manifestCommands = new Set(readManifest());

/** 우리가 설치한 항목인가 — 매니페스트 → 실행 경로 → 마커 순으로 확인 */
function isOurs(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(entry, MARKER)) return true;
  const cmds = (entry.hooks || []).map((h) => (typeof h.command === "string" ? h.command : ""));
  if (cmds.some((c) => manifestCommands.has(c))) return true;
  return cmds.some((c) => c.includes(HOOK_DIR));
}

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (e) {
    console.error(`오류: ${settingsPath} 를 파싱할 수 없습니다 — 중단합니다.`);
    process.exit(1);
  }
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    console.error(`오류: ${settingsPath} 가 JSON 객체가 아닙니다 — 중단합니다.`);
    process.exit(1);
  }
  const bak = `${settingsPath}.mind-reader.bak-${Date.now()}`;
  fs.copyFileSync(settingsPath, bak);
  // 오래된 백업 정리 (최근 5개 유지)
  const dir = path.dirname(settingsPath);
  const base = path.basename(settingsPath) + ".mind-reader.bak-";
  fs.readdirSync(dir)
    .filter((f) => f.startsWith(base))
    .sort()
    .slice(0, -5)
    .forEach((f) => fs.unlinkSync(path.join(dir, f)));
  console.log(`백업: ${bak}`);
} else {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
}

settings.hooks = settings.hooks || {};
let removed = 0;
let added = 0;

for (const [event, def] of Object.entries(hookDefs)) {
  const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  const kept = list.filter((e) => {
    if (isOurs(e)) {
      removed++;
      return false;
    }
    return true;
  });
  if (mode === "add") {
    kept.push(def);
    added++;
  }
  if (kept.length) settings.hooks[event] = kept;
  else delete settings.hooks[event];
}
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

if (mode === "add") {
  writeManifest(Object.values(hookDefs).flatMap((d) => d.hooks.map((h) => h.command)));
} else {
  try {
    fs.unlinkSync(MANIFEST);
  } catch {
    /* 없으면 무시 */
  }
}

if (mode === "add") {
  console.log(`설치 완료: ${settingsPath} (등록 ${added}건, 기존 항목 ${removed}건 갱신)`);
} else if (removed === 0) {
  console.log(
    `경고: ${settingsPath} 에서 mind-reader 훅을 찾지 못했습니다. 다른 설정 파일에 설치했다면 경로를 인자로 지정하세요. (즉시 비활성화: MIND_READER_OFF=1)`
  );
} else {
  console.log(`제거 완료: ${settingsPath} (${removed}건 제거)`);
}
