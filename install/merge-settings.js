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

const isOurs = (entry) =>
  entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, MARKER);

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
  console.log(`설치 완료: ${settingsPath} (등록 ${added}건, 기존 항목 ${removed}건 갱신)`);
} else if (removed === 0) {
  console.log(
    `경고: ${settingsPath} 에서 mind-reader 훅을 찾지 못했습니다. 다른 설정 파일에 설치했다면 경로를 인자로 지정하세요. (즉시 비활성화: MIND_READER_OFF=1)`
  );
} else {
  console.log(`제거 완료: ${settingsPath} (${removed}건 제거)`);
}
