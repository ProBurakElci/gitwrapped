/*
 * The terminal card.
 *
 * This is the thing people screenshot, so it has to fit in one screen, line up
 * in a monospace font, and survive being pasted somewhere without colour.
 */
"use strict";

const { verdict, DAY_NAMES } = require("./stats");

const WIDTH = 64;

function colors(enabled) {
  const wrap = (code) => (text) => (enabled ? "\u001b[" + code + "m" + text + "\u001b[0m" : text);
  return {
    dim: wrap("90"),
    bold: wrap("1"),
    cyan: wrap("36"),
    green: wrap("32"),
    yellow: wrap("33"),
    magenta: wrap("35"),
    white: wrap("97"),
  };
}

/**
 * Width as the terminal sees it. Escape sequences take no columns, so counting
 * raw string length breaks every alignment as soon as colours are on.
 */
function visibleLength(text) {
  return String(text).replace(/\u001b\[[0-9;]*m/g, "").length;
}

function pad(text, width) {
  return String(text) + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function number(value) {
  return value.toLocaleString("en-US");
}

function hourLabel(hour) {
  return String(hour).padStart(2, "0") + ":00";
}

function shortDate(date) {
  if (!date) return "-";
  return date.toISOString().slice(0, 10);
}

function duration(minutes) {
  if (minutes < 60) return minutes + " min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? h + "h " + m + "m" : h + "h";
}

/** 24 columns, one per hour, scaled to the busiest hour. */
function hourChart(hours, c) {
  const blocks = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max.apply(null, hours) || 1;

  let bar = "";
  for (let h = 0; h < 24; h++) {
    const level = hours[h] === 0 ? 0 : Math.max(1, Math.round((hours[h] / max) * 8));
    const block = blocks[level] + blocks[level];
    bar += h >= 22 || h < 6 ? c.magenta(block) : c.cyan(block);
  }

  const scale = c.dim("00" + " ".repeat(16) + "06" + " ".repeat(16) + "12" + " ".repeat(16) + "18");
  return { bar, scale };
}

function shorten(text, max) {
  if (text.length <= max) return text;
  return "..." + text.slice(-(max - 3));
}

function render(stats, meta, options) {
  const opts = options || {};
  const c = colors(!opts.noColor);
  const out = [];

  const line = (left, right) => {
    const gap = Math.max(1, WIDTH - 4 - visibleLength(left) - visibleLength(right));
    out.push("  " + left + " ".repeat(gap) + right);
  };
  const rule = () => out.push("  " + c.dim("-".repeat(WIDTH - 4)));
  const blank = () => out.push("");

  blank();
  out.push("  " + c.bold(c.white("git wrapped")) + "  " + c.dim(meta.repo));
  if (meta.scope) out.push("  " + c.dim(meta.scope));
  rule();

  if (!stats.commits) {
    out.push("  " + c.dim("no commits matched"));
    blank();
    return out.join("\n");
  }

  line(c.dim("commits"), c.bold(number(stats.commits)));
  line(c.dim("active days"), c.bold(number(stats.activeDays)) + c.dim(" of " + number(stats.spanDays)));
  line(c.dim("lines added"), c.green("+" + number(stats.added)));
  line(c.dim("lines removed"), c.yellow("-" + number(stats.removed)));
  line(c.dim("average commit"), number(stats.averageCommit) + c.dim(" lines"));
  blank();

  const chart = hourChart(stats.hours, c);
  out.push("  " + c.dim("when you commit"));
  out.push("  " + chart.bar);
  out.push("  " + chart.scale);
  blank();

  line(c.dim("peak hour"), c.bold(hourLabel(stats.peakHour)) +
    c.dim("  " + Math.round(stats.peakHourShare * 100) + "% of commits"));
  line(c.dim("busiest day"), c.bold(stats.peakDayName));
  line(c.dim("after midnight"), Math.round(stats.nightShare * 100) + "%");
  line(c.dim("on weekends"), Math.round(stats.weekendShare * 100) + "%");
  blank();

  line(c.dim("longest streak"), c.bold(stats.streak.length + " days") +
    c.dim("  " + stats.streak.from + " to " + stats.streak.to));
  line(c.dim("longest session"), c.bold(duration(stats.session.minutes)) +
    c.dim("  " + stats.session.commits + " commits"));
  blank();

  out.push("  " + c.dim("files you keep coming back to"));
  for (const file of stats.topFiles) {
    line("  " + c.cyan(shorten(file.key, 40)), c.dim(file.value + "x"));
  }
  blank();

  if (stats.authorCount > 1) {
    out.push("  " + c.dim("who wrote it"));
    for (const author of stats.authors) {
      const share = Math.round((author.value / stats.commits) * 100);
      line("  " + author.key.slice(0, 32), c.dim(share + "%  " + author.value));
    }
    blank();
  }

  line(c.dim("single-owner files"), Math.round(stats.busFactor.share * 100) + "%" +
    c.dim("  " + stats.busFactor.singleOwner + " of " + stats.busFactor.files));
  line(c.dim("first commit"), c.dim(shortDate(stats.firstCommit)));
  line(c.dim("last commit"), c.dim(shortDate(stats.lastCommit)));

  rule();
  out.push("  " + c.magenta(verdict(stats)));
  blank();

  return out.join("\n");
}

module.exports = { render, hourChart, duration, DAY_NAMES };
