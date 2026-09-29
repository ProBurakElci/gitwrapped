#!/usr/bin/env node
/*
 * gitwrapped - what your git history says about how you work.
 *
 * Runs against the local repository, prints a card, and can write a shareable
 * SVG. Nothing is uploaded and no network call is made.
 *
 *   npx gitwrapped                 this repo, everyone, all time
 *   npx gitwrapped --me            only your commits
 *   npx gitwrapped --year 2026     one year
 *   npx gitwrapped --svg card.svg  also write the shareable card
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { collect, isRepo, currentUser, repoName } = require("../lib/collect");
const { analyze } = require("../lib/stats");
const terminal = require("../lib/render-terminal");
const svg = require("../lib/render-svg");

function parseArgs(argv) {
  const options = { repo: process.cwd() };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--me") options.me = true;
    else if (arg === "--author") options.author = next, i++;
    else if (arg === "--year") options.year = next, i++;
    else if (arg === "--since") options.since = next, i++;
    else if (arg === "--until") options.until = next, i++;
    else if (arg === "--svg") options.svg = next && !next.startsWith("--") ? (i++, next) : "gitwrapped.svg";
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-color") options.noColor = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (!arg.startsWith("-")) options.repo = path.resolve(arg);
  }

  return options;
}

function usage() {
  console.log(`
  gitwrapped - what your git history says about how you work

  Usage
    npx gitwrapped [path]            analyse a repository (default: here)

  Options
    --me                  only your own commits (uses git config user.email)
    --author <text>       only commits whose author matches this
    --year <YYYY>         limit to one calendar year
    --since <date>        anything git understands (2026-01-01, "3 months ago")
    --until <date>
    --svg [file]          also write a shareable 1200x630 card
    --json                print raw numbers instead of the card
    --no-color            plain output, good for pasting

  Everything runs locally against .git - nothing is uploaded.
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return 0;
  }

  if (!isRepo(options.repo)) {
    console.error("gitwrapped: " + options.repo + " is not a git repository");
    return 2;
  }

  const user = currentUser(options.repo);
  const filter = {};

  if (options.author) filter.author = options.author;
  else if (options.me) {
    if (!user.email) {
      console.error("gitwrapped: no git user.email configured, pass --author instead");
      return 2;
    }
    filter.author = user.email;
  }

  if (options.year) {
    filter.since = options.year + "-01-01";
    filter.until = options.year + "-12-31T23:59:59";
  }
  if (options.since) filter.since = options.since;
  if (options.until) filter.until = options.until;

  const commits = collect(options.repo, filter);
  const stats = analyze(commits);

  const scopeParts = [];
  if (filter.author) scopeParts.push(filter.author);
  if (options.year) scopeParts.push(options.year);
  else if (filter.since || filter.until) {
    scopeParts.push([filter.since || "start", filter.until || "now"].join(" to "));
  }

  const meta = { repo: repoName(options.repo), scope: scopeParts.join("  -  ") };

  if (options.json) {
    const plain = Object.assign({}, stats);
    delete plain.biggest;
    delete plain.smallest;
    console.log(JSON.stringify({ meta, stats: plain }, null, 2));
    return 0;
  }

  // FORCE_COLOR lets a recorder or a pipe keep the colours, the same way most
  // CLI tools treat it.
  const forced = process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0";
  console.log(terminal.render(stats, meta, {
    noColor: options.noColor || !!process.env.NO_COLOR ||
      (!forced && !process.stdout.isTTY),
  }));

  if (options.svg) {
    const file = path.resolve(options.repo, options.svg);
    fs.writeFileSync(file, svg.render(stats, meta), "utf8");
    console.log("  card written to " + path.relative(process.cwd(), file).replace(/\\/g, "/"));
    console.log("");
  }

  return 0;
}

process.exit(main());
