/*
 * Reading the repository.
 *
 * One `git log` call does all of it. The format below packs each commit into a
 * single header line with a separator that cannot appear in a commit message
 * we care about, followed by --numstat lines for the files it touched.
 *
 * Nothing is sent anywhere. Everything here runs against the local .git folder.
 */
"use strict";

const { execFileSync } = require("child_process");

const SEP = "\u0001";
const HEADER = "\u0002";

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
}

function isRepo(cwd) {
  try {
    git(["rev-parse", "--git-dir"], cwd);
    return true;
  } catch (err) {
    return false;
  }
}

function currentUser(cwd) {
  try {
    return {
      name: git(["config", "user.name"], cwd).trim(),
      email: git(["config", "user.email"], cwd).trim(),
    };
  } catch (err) {
    return { name: "", email: "" };
  }
}

function repoName(cwd) {
  try {
    const url = git(["config", "--get", "remote.origin.url"], cwd).trim();
    const match = url.match(/([^/:]+\/[^/]+?)(\.git)?$/);
    if (match) return match[1];
  } catch (err) {
    /* no remote configured, fall through */
  }
  try {
    const top = git(["rev-parse", "--show-toplevel"], cwd).trim();
    return top.split(/[\\/]/).pop();
  } catch (err) {
    return "repository";
  }
}

/**
 * Returns one object per commit:
 *   { hash, author, email, date (Date), message, files: [{ added, removed, path }] }
 *
 * Merge commits are skipped: their numstat double-counts work that is already
 * attributed to the commits being merged.
 */
function collect(cwd, options) {
  const opts = options || {};
  const args = [
    "log",
    "--no-merges",
    "--numstat",
    "--date=iso-strict",
    "--pretty=format:" + HEADER + "%H" + SEP + "%an" + SEP + "%ae" + SEP + "%ad" + SEP + "%s",
  ];

  if (opts.since) args.push("--since=" + opts.since);
  if (opts.until) args.push("--until=" + opts.until);
  if (opts.author) args.push("--author=" + opts.author);
  if (opts.all) args.push("--all");

  let raw;
  try {
    raw = git(args, cwd);
  } catch (err) {
    if (/does not have any commits yet|unknown revision/i.test(err.message || "")) return [];
    throw err;
  }

  const commits = [];
  const blocks = raw.split(HEADER);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const newline = block.indexOf("\n");
    const headerLine = newline === -1 ? block : block.slice(0, newline);
    const rest = newline === -1 ? "" : block.slice(newline + 1);

    const parts = headerLine.split(SEP);
    if (parts.length < 5) continue;

    const date = new Date(parts[3]);
    if (isNaN(date.getTime())) continue;

    const files = [];
    for (const line of rest.split("\n")) {
      if (!line.trim()) continue;
      const cols = line.split("\t");
      if (cols.length < 3) continue;
      // "-" means binary: count the file, not the lines
      const added = cols[0] === "-" ? 0 : parseInt(cols[0], 10) || 0;
      const removed = cols[1] === "-" ? 0 : parseInt(cols[1], 10) || 0;
      files.push({ added, removed, path: cols[2], binary: cols[0] === "-" });
    }

    commits.push({
      hash: parts[0],
      author: parts[1],
      email: parts[2].toLowerCase(),
      date,
      message: parts.slice(4).join(SEP),
      files,
    });
  }

  return commits;
}

module.exports = { collect, isRepo, currentUser, repoName, git };
