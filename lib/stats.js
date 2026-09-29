/*
 * Turning commits into the numbers people actually want to see.
 *
 * Every figure here is meant to say something about how someone works, not
 * just how big the repo is: when they code, how long they keep at it, which
 * file they cannot stop editing, and how much of the project only one person
 * has ever touched.
 */
"use strict";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayKey(date) {
  return (
    date.getFullYear() +
    "-" + String(date.getMonth() + 1).padStart(2, "0") +
    "-" + String(date.getDate()).padStart(2, "0")
  );
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

/** Longest run of consecutive calendar days that have at least one commit. */
function longestStreak(dayKeys) {
  if (!dayKeys.length) return { length: 0, from: null, to: null };

  const days = Array.from(new Set(dayKeys)).sort();
  let best = { length: 1, from: days[0], to: days[0] };
  let runStart = days[0];
  let runLength = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + "T00:00:00");
    const curr = new Date(days[i] + "T00:00:00");
    const gap = Math.round((curr - prev) / 86400000);

    if (gap === 1) {
      runLength++;
    } else {
      runStart = days[i];
      runLength = 1;
    }

    if (runLength > best.length) best = { length: runLength, from: runStart, to: days[i] };
  }

  return best;
}

/**
 * A "session" is a chain of commits with less than `gapMinutes` between them.
 * The longest one is a decent proxy for the longest sitting.
 */
function longestSession(sortedDates, gapMinutes) {
  if (sortedDates.length < 2) return { minutes: 0, commits: sortedDates.length, start: sortedDates[0] || null };

  const gap = gapMinutes * 60000;
  let best = { minutes: 0, commits: 1, start: sortedDates[0] };
  let start = sortedDates[0];
  let count = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    if (sortedDates[i] - sortedDates[i - 1] <= gap) {
      count++;
    } else {
      const minutes = Math.round((sortedDates[i - 1] - start) / 60000);
      if (minutes > best.minutes) best = { minutes, commits: count, start };
      start = sortedDates[i];
      count = 1;
    }
  }

  const minutes = Math.round((sortedDates[sortedDates.length - 1] - start) / 60000);
  if (minutes > best.minutes) best = { minutes, commits: count, start };

  return best;
}

/** How much of the codebase has exactly one person ever touched. */
function busFactor(fileAuthors) {
  let single = 0;
  let total = 0;
  for (const authors of fileAuthors.values()) {
    total++;
    if (authors.size === 1) single++;
  }
  return { files: total, singleOwner: single, share: total ? single / total : 0 };
}

function analyze(commits, options) {
  const opts = options || {};

  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const months = new Map();
  const days = [];
  const authors = new Map();
  const fileTouches = new Map();
  const fileChurn = new Map();
  const fileAuthors = new Map();
  const extensions = new Map();
  const messageWords = new Map();

  let added = 0;
  let removed = 0;
  let biggest = null;
  let smallest = null;

  const dates = commits.map((c) => c.date).sort((a, b) => a - b);

  for (const commit of commits) {
    hours[commit.date.getHours()]++;
    weekdays[commit.date.getDay()]++;
    days.push(dayKey(commit.date));

    const monthKey =
      commit.date.getFullYear() + "-" + String(commit.date.getMonth() + 1).padStart(2, "0");
    months.set(monthKey, (months.get(monthKey) || 0) + 1);

    authors.set(commit.author, (authors.get(commit.author) || 0) + 1);

    let commitAdded = 0;
    let commitRemoved = 0;

    for (const file of commit.files) {
      commitAdded += file.added;
      commitRemoved += file.removed;

      fileTouches.set(file.path, (fileTouches.get(file.path) || 0) + 1);
      fileChurn.set(file.path, (fileChurn.get(file.path) || 0) + file.added + file.removed);

      if (!fileAuthors.has(file.path)) fileAuthors.set(file.path, new Set());
      fileAuthors.get(file.path).add(commit.email);

      const dot = file.path.lastIndexOf(".");
      const slash = Math.max(file.path.lastIndexOf("/"), file.path.lastIndexOf("\\"));
      if (dot > slash + 1) {
        const ext = file.path.slice(dot).toLowerCase();
        if (ext.length <= 8) {
          extensions.set(ext, (extensions.get(ext) || 0) + file.added + file.removed);
        }
      }
    }

    added += commitAdded;
    removed += commitRemoved;

    const size = commitAdded + commitRemoved;
    if (!biggest || size > biggest.size) biggest = { size, commit };
    if (size > 0 && (!smallest || size < smallest.size)) smallest = { size, commit };

    for (const word of commit.message.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) {
      if (["the", "and", "for", "with", "into", "from", "that", "this", "when", "use"].includes(word)) continue;
      messageWords.set(word, (messageWords.get(word) || 0) + 1);
    }
  }

  const uniqueDays = new Set(days);
  const peakHour = hours.indexOf(Math.max.apply(null, hours));
  const peakDay = weekdays.indexOf(Math.max.apply(null, weekdays));

  const nightCommits = hours.slice(0, 6).reduce((a, b) => a + b, 0) +
    hours.slice(22).reduce((a, b) => a + b, 0);
  const weekendCommits = weekdays[0] + weekdays[6];

  return {
    commits: commits.length,
    firstCommit: dates[0] || null,
    lastCommit: dates[dates.length - 1] || null,
    activeDays: uniqueDays.size,
    spanDays: dates.length
      ? Math.max(1, Math.round((dates[dates.length - 1] - dates[0]) / 86400000) + 1)
      : 0,
    added,
    removed,
    net: added - removed,
    averageCommit: commits.length ? Math.round((added + removed) / commits.length) : 0,
    hours,
    weekdays,
    peakHour,
    peakHourShare: commits.length ? hours[peakHour] / commits.length : 0,
    peakDay,
    peakDayName: DAY_NAMES[peakDay],
    nightShare: commits.length ? nightCommits / commits.length : 0,
    weekendShare: commits.length ? weekendCommits / commits.length : 0,
    streak: longestStreak(days),
    session: longestSession(dates, opts.sessionGap || 90),
    months: Array.from(months.entries()).sort(),
    authors: topEntries(authors, 5),
    authorCount: authors.size,
    topFiles: topEntries(fileTouches, 5),
    topChurn: topEntries(fileChurn, 5),
    topExtensions: topEntries(extensions, 5),
    topWords: topEntries(messageWords, 5),
    biggest,
    smallest,
    busFactor: busFactor(fileAuthors),
  };
}

/** One sentence that sums the person up. Half the fun is here. */
function verdict(stats) {
  if (!stats.commits) return "nothing committed yet";

  if (stats.nightShare >= 0.4) return "you do your best work while everyone else is asleep";
  if (stats.peakHour >= 22 || stats.peakHour <= 4) return "certified night shift";
  if (stats.weekendShare >= 0.4) return "weekends are not weekends";
  if (stats.streak.length >= 14) return "you do not miss a day";
  if (stats.averageCommit <= 25 && stats.commits >= 20) return "small commits, steady hands";
  if (stats.averageCommit >= 400) return "you commit in avalanches";
  if (stats.peakHour >= 5 && stats.peakHour <= 9) return "early riser, keyboard first";
  if (stats.busFactor.share >= 0.8 && stats.authorCount === 1) return "this whole thing is you";
  return "consistent and quietly productive";
}

module.exports = { analyze, verdict, longestStreak, longestSession, DAY_NAMES, dayKey };
