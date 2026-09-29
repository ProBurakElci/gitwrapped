/*
 * Tests:  node test/run-tests.js
 *
 * The statistics are the product here, so most of this file builds commit data
 * with a known answer and checks that the numbers come back right - streaks
 * that skip a day, sessions that break, night-time shares, single-owner files.
 * The last section builds a real repository and runs the CLI against it.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { analyze, longestStreak, longestSession, verdict } = require("../lib/stats");
const terminal = require("../lib/render-terminal");
const svg = require("../lib/render-svg");

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error("  FAILED: " + label);
  }
}

function eq(label, actual, expected) {
  ok(label + " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")",
    actual === expected);
}

function section(name) {
  console.log("\n" + name);
}

/** Builds a commit object without going near git. */
function commit(iso, options) {
  const o = options || {};
  return {
    hash: Math.random().toString(16).slice(2),
    author: o.author || "dev",
    email: o.email || "dev@example.com",
    date: new Date(iso),
    message: o.message || "change something",
    files: o.files || [{ added: 10, removed: 2, path: "src/index.js" }],
  };
}

/* ---------------- streaks ---------------- */

section("Streaks");

eq("empty history has no streak", longestStreak([]).length, 0);
eq("a single day is a streak of one", longestStreak(["2026-01-05"]).length, 1);
eq("three consecutive days", longestStreak(["2026-01-01", "2026-01-02", "2026-01-03"]).length, 3);
eq("a gap breaks the streak",
  longestStreak(["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05", "2026-01-06"]).length, 3);
eq("duplicate days count once",
  longestStreak(["2026-01-01", "2026-01-01", "2026-01-02"]).length, 2);
eq("streak crosses a month boundary",
  longestStreak(["2026-01-30", "2026-01-31", "2026-02-01"]).length, 3);
eq("streak crosses a year boundary",
  longestStreak(["2025-12-31", "2026-01-01"]).length, 2);
eq("unsorted input is handled",
  longestStreak(["2026-01-03", "2026-01-01", "2026-01-02"]).length, 3);

/* ---------------- sessions ---------------- */

section("Sessions");

const d = (iso) => new Date(iso);

eq("no commits, no session", longestSession([], 90).minutes, 0);
eq("one commit is a zero-minute session", longestSession([d("2026-01-01T10:00:00Z")], 90).minutes, 0);
eq("two commits 30 minutes apart",
  longestSession([d("2026-01-01T10:00:00Z"), d("2026-01-01T10:30:00Z")], 90).minutes, 30);
eq("a gap larger than the threshold splits the session",
  longestSession([
    d("2026-01-01T10:00:00Z"),
    d("2026-01-01T10:30:00Z"),
    d("2026-01-01T14:00:00Z"),
    d("2026-01-01T14:10:00Z"),
  ], 90).minutes, 30);
eq("the longest of several sessions wins",
  longestSession([
    d("2026-01-01T09:00:00Z"),
    d("2026-01-01T09:20:00Z"),
    d("2026-01-01T13:00:00Z"),
    d("2026-01-01T14:30:00Z"),
    d("2026-01-01T15:00:00Z"),
  ], 90).minutes, 120);

/* ---------------- aggregate stats ---------------- */

section("Aggregate stats");

const history = [
  commit("2026-03-02T09:15:00", { files: [{ added: 100, removed: 20, path: "src/app.js" }] }),
  commit("2026-03-02T09:40:00", { files: [{ added: 5, removed: 1, path: "src/app.js" }] }),
  commit("2026-03-03T09:05:00", { files: [{ added: 30, removed: 0, path: "README.md" }] }),
  commit("2026-03-04T23:50:00", { files: [{ added: 12, removed: 40, path: "src/app.js" }] }),
  commit("2026-03-07T02:10:00", {
    author: "other",
    email: "other@example.com",
    files: [{ added: 7, removed: 3, path: "src/other.js" }],
  }),
];

const stats = analyze(history);

eq("commit count", stats.commits, 5);
eq("lines added", stats.added, 154);
eq("lines removed", stats.removed, 64);
eq("net lines", stats.net, 90);
eq("active days", stats.activeDays, 4);
eq("average commit size", stats.averageCommit, Math.round((154 + 64) / 5));
eq("peak hour is 09:00", stats.peakHour, 9);
eq("author count", stats.authorCount, 2);
eq("most edited file", stats.topFiles[0].key, "src/app.js");
eq("most edited file count", stats.topFiles[0].value, 3);

ok("night share counts 23:50 and 02:10", Math.abs(stats.nightShare - 2 / 5) < 1e-9);
ok("weekend share counts Saturday 2026-03-07", Math.abs(stats.weekendShare - 1 / 5) < 1e-9);
eq("single-owner files", stats.busFactor.singleOwner, 3);
eq("files seen", stats.busFactor.files, 3);

const streakStats = analyze([
  commit("2026-05-01T10:00:00"),
  commit("2026-05-02T10:00:00"),
  commit("2026-05-03T10:00:00"),
  commit("2026-05-08T10:00:00"),
]);
eq("streak inside analyze", streakStats.streak.length, 3);
eq("span covers the whole period", streakStats.spanDays, 8);

eq("empty history is handled", analyze([]).commits, 0);
ok("empty history has no crash in verdict", typeof verdict(analyze([])) === "string");

/* ---------------- rendering ---------------- */

section("Rendering");

const meta = { repo: "example/repo", scope: "" };
const card = terminal.render(stats, meta, { noColor: true });

ok("terminal card mentions the repo", card.includes("example/repo"));
ok("terminal card shows the commit count", card.includes("5"));
ok("terminal card has an hour chart row", card.split("\n").some((l) => /[▁-█]/.test(l)));
ok("terminal card has no escape codes with noColor", !card.includes("\u001b["));
ok("every line fits in 80 columns", card.split("\n").every((l) => l.length <= 80));

const colored = terminal.render(stats, meta, { noColor: false });
ok("colors are emitted when asked", colored.includes("\u001b["));

// Escape sequences take up no columns. If the width maths counts them, every
// value drifts left the moment colours are on - which only shows up in a real
// terminal, so it gets a test.
const strip = (text) => text.replace(/\u001b\[[0-9;]*m/g, "");
const plainLines = card.split("\n");
const coloredLines = colored.split("\n").map(strip);
ok(
  "coloured output aligns exactly like plain output",
  plainLines.length === coloredLines.length &&
    plainLines.every((l, i) => l === coloredLines[i])
);

const card2 = svg.render(stats, meta);
ok("svg has the right dimensions", card2.includes('width="1200"') && card2.includes('height="630"'));
ok("svg is well formed at the edges", card2.startsWith("<svg") && card2.endsWith("</svg>"));
ok("svg has 24 hour bars", (card2.match(/<rect [^>]*rx="3"/g) || []).length === 24);
ok("svg escapes text", !svg.render(stats, { repo: 'a"<b>', scope: "" }).includes("<b>"));
ok("empty stats still render an svg", svg.render(analyze([]), meta).includes("no commits matched"));

/* ---------------- end to end ---------------- */

section("End to end against a real repository");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitwrapped-test-"));
const cli = path.resolve(__dirname, "..", "bin", "gitwrapped.js");

function git(args, env) {
  return execFileSync("git", args, {
    cwd: tmp,
    encoding: "utf8",
    env: Object.assign({}, process.env, env || {}),
  });
}

function run(args) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [cli].concat(args), {
        cwd: tmp,
        encoding: "utf8",
        env: Object.assign({}, process.env, { NO_COLOR: "1" }),
      }),
    };
  } catch (err) {
    return { code: err.status, out: (err.stdout || "") + (err.stderr || "") };
  }
}

try {
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "dev@example.com"]);
  git(["config", "user.name", "dev"]);
  git(["config", "commit.gpgsign", "false"]);

  const dates = [
    "2026-02-02T09:00:00+00:00",
    "2026-02-02T09:30:00+00:00",
    "2026-02-03T23:30:00+00:00",
  ];

  dates.forEach((date, i) => {
    fs.writeFileSync(path.join(tmp, "file" + i + ".txt"), "line\n".repeat(i + 2));
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "commit " + i], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    });
  });

  const result = run([]);
  eq("cli exits 0", result.code, 0);
  ok("cli reports three commits", /commits\s+3/.test(result.out));
  ok("cli prints the verdict line", result.out.trim().split("\n").length > 10);

  const json = run(["--json"]);
  const parsed = JSON.parse(json.out);
  eq("json has the commit count", parsed.stats.commits, 3);
  eq("json has active days", parsed.stats.activeDays, 2);

  const withSvg = run(["--svg", "card.svg"]);
  eq("svg run exits 0", withSvg.code, 0);
  ok("svg file was written", fs.existsSync(path.join(tmp, "card.svg")));
  ok("svg file is not empty", fs.statSync(path.join(tmp, "card.svg")).size > 800);

  const mine = run(["--me"]);
  ok("--me still finds the commits", /commits\s+3/.test(mine.out));

  const nobody = run(["--author", "someone-else@example.com"]);
  ok("an author with no commits is handled", nobody.out.includes("no commits matched"));

  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), "gitwrapped-plain-"));
  try {
    const outside = execFileSync(process.execPath, [cli], { cwd: notRepo, encoding: "utf8" });
    ok("running outside a repo should fail", false && outside);
  } catch (err) {
    eq("running outside a repo exits 2", err.status, 2);
  }
  fs.rmSync(notRepo, { recursive: true, force: true });
} catch (err) {
  failed++;
  console.error("  FAILED: end to end threw: " + err.message);
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (err) {
    /* best effort */
  }
}

console.log("\n" + passed + " passed, " + failed + " failed.");
process.exit(failed ? 1 : 0);
