#!/usr/bin/env node
/**
 * M2 dogfooding 지표 집계.
 * 사용법: node dist/stats.js [프로젝트경로]   (생략 시 전체 프로젝트 합산)
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

interface Ev {
  t: string;
  type: string;
  session?: string;
  tool?: string;
  questions?: number;
  specVersions?: number;
  version?: number;
  promptLen?: number;
  n?: number;
  from?: string;
}

const root = path.join(os.homedir(), ".mind-reader");
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

function dirsToScan(): string[] {
  const target = process.argv[2];
  if (target) return [path.join(root, hash(path.resolve(target)))];
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .map((d) => path.join(root, d))
    .filter((d) => fs.statSync(d).isDirectory());
}

function readEvents(dirs: string[]): Ev[] {
  const out: Ev[] = [];
  for (const d of dirs) {
    const f = path.join(d, "events.jsonl");
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").trim().split("\n")) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* 손상된 줄 무시 */
      }
    }
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`;
}
function avg(xs: number[]): string {
  return xs.length === 0 ? "—" : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
}

function main(): void {
  const dirs = dirsToScan();
  const ev = readEvents(dirs);
  if (ev.length === 0) {
    console.log("아직 기록된 이벤트가 없습니다. (mind-reader가 설치·사용된 뒤에 지표가 쌓입니다)");
    return;
  }

  const cycles = ev.filter((e) => e.type === "cycle_start").length;
  const approvals = ev.filter((e) => e.type === "approved");
  // 승인 없이 끝난 사이클 = 시작 수 - 승인 수 (진행 중인 사이클도 여기 포함될 수 있음)
  const unfinished = Math.max(0, cycles - approvals.length);
  const denies = ev.filter((e) => e.type === "gate_deny");
  const stopBlocks = ev.filter((e) => e.type === "stop_block").length;
  const specs = ev.filter((e) => e.type === "spec_presented");

  const qCounts = approvals.map((e) => e.questions ?? 0);
  const withQuestions = qCounts.filter((n) => n > 0).length;
  const revised = approvals.filter((e) => (e.specVersions ?? 1) > 1).length;

  const denyByTool = new Map<string, number>();
  for (const d of denies) denyByTool.set(d.tool ?? "?", (denyByTool.get(d.tool ?? "?") ?? 0) + 1);

  const span =
    ev.length > 1 ? `${ev[0].t.slice(0, 16)} ~ ${ev[ev.length - 1].t.slice(0, 16)}` : ev[0].t.slice(0, 16);

  console.log(`mind-reader 지표  (프로젝트 ${dirs.length}곳, ${span})\n`);
  console.log(`  사이클 시작          ${cycles}`);
  console.log(`  ├ 승인 완료          ${approvals.length}  (${pct(approvals.length, cycles)})`);
  console.log(`  └ 미완료             ${unfinished}  (${pct(unfinished, cycles)})  ← 승인까지 못 간 것(진행 중 포함)`);
  console.log("");
  console.log(`  질문 발생률          ${pct(withQuestions, approvals.length)}  (승인된 ${approvals.length}건 중 ${withQuestions}건에서 질문 발생)`);
  console.log(`  평균 질문 수         ${avg(qCounts)}  (질문 있었던 건만: ${avg(qCounts.filter((n) => n > 0))})`);
  console.log(`  명세 수정률          ${pct(revised, approvals.length)}  (${revised}/${approvals.length})  ← 0%에 가까우면 확인 단계가 형식적이라는 신호`);
  console.log(`  명세 제시 총계       ${specs.length}`);
  console.log("");
  console.log(`  게이트 차단          ${denies.length}회`);
  for (const [tool, n] of [...denyByTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`    ${tool.padEnd(18)} ${n}`);
  }
  console.log(`  종료 차단(Stop)      ${stopBlocks}회`);
}

main();
