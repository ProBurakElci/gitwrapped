/*
 * The shareable card.
 *
 * 1200x630 is the size every social preview expects, and an SVG keeps the file
 * tiny and readable in a browser, a README or a pull request. No fonts are
 * embedded: the card asks for a monospace family and degrades gracefully.
 */
"use strict";

const { verdict } = require("./stats");

const W = 1200;
const H = 630;

const C = {
  bg1: "#0d1526",
  bg2: "#070c17",
  panel: "#131d33",
  line: "#243450",
  text: "#e6edf7",
  dim: "#8ea2c0",
  cyan: "#38bdf8",
  violet: "#a78bfa",
  green: "#34d399",
  yellow: "#fbbf24",
  night: "#c084fc",
};

function escape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function number(value) {
  return value.toLocaleString("en-US");
}

function shorten(text, max) {
  return text.length <= max ? text : "..." + text.slice(-(max - 3));
}

function duration(minutes) {
  if (minutes < 60) return minutes + "m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? h + "h " + m + "m" : h + "h";
}

function stat(x, y, label, value, color) {
  return (
    '<text x="' + x + '" y="' + y + '" fill="' + C.dim + '" font-size="19">' + escape(label) + "</text>" +
    '<text x="' + x + '" y="' + (y + 44) + '" fill="' + (color || C.text) +
    '" font-size="42" font-weight="700">' + escape(value) + "</text>"
  );
}

function hourBars(hours, x, y, width, height) {
  const max = Math.max.apply(null, hours) || 1;
  const slot = width / 24;
  const barWidth = slot - 4;
  let out = "";

  for (let h = 0; h < 24; h++) {
    const barHeight = Math.max(3, (hours[h] / max) * height);
    const night = h >= 22 || h < 6;
    out +=
      '<rect x="' + (x + h * slot).toFixed(1) + '" y="' + (y + height - barHeight).toFixed(1) +
      '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) +
      '" rx="3" fill="' + (night ? C.night : C.cyan) + '"/>';
  }

  for (const h of [0, 6, 12, 18]) {
    out +=
      '<text x="' + (x + h * slot).toFixed(1) + '" y="' + (y + height + 24) +
      '" fill="' + C.dim + '" font-size="15">' + String(h).padStart(2, "0") + "</text>";
  }

  return out;
}

function render(stats, meta) {
  const parts = [];

  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + " " + H + '" font-family="ui-monospace, SFMono-Regular, Consolas, monospace">'
  );

  parts.push(
    "<defs>" +
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="' + C.bg1 + '"/><stop offset="100%" stop-color="' + C.bg2 + '"/>' +
    "</linearGradient></defs>"
  );

  parts.push('<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>');
  parts.push('<circle cx="1050" cy="70" r="220" fill="#1d4ed8" opacity="0.16"/>');
  parts.push('<circle cx="120" cy="600" r="180" fill="#a78bfa" opacity="0.12"/>');

  // header
  parts.push('<text x="60" y="80" fill="' + C.text + '" font-size="36" font-weight="700">git wrapped</text>');
  parts.push('<text x="60" y="114" fill="' + C.dim + '" font-size="20">' + escape(meta.repo) + "</text>");
  if (meta.scope) {
    parts.push('<text x="' + (W - 60) + '" y="80" fill="' + C.dim +
      '" font-size="18" text-anchor="end">' + escape(meta.scope) + "</text>");
  }
  parts.push('<rect x="60" y="136" width="' + (W - 120) + '" height="1" fill="' + C.line + '"/>');

  if (!stats.commits) {
    parts.push('<text x="60" y="200" fill="' + C.dim + '" font-size="24">no commits matched</text>');
    parts.push("</svg>");
    return parts.join("");
  }

  // headline numbers
  parts.push(stat(60, 196, "commits", number(stats.commits), C.text));
  parts.push(stat(320, 196, "active days", number(stats.activeDays), C.text));
  parts.push(stat(580, 196, "lines added", "+" + number(stats.added), C.green));
  parts.push(stat(880, 196, "lines removed", "-" + number(stats.removed), C.yellow));

  // hour histogram
  parts.push('<text x="60" y="310" fill="' + C.dim + '" font-size="19">when you commit</text>');
  parts.push(hourBars(stats.hours, 60, 322, W - 560, 92));

  // right column
  const rx = W - 430;
  const rows = [
    ["peak hour", String(stats.peakHour).padStart(2, "0") + ":00", C.cyan],
    ["busiest day", stats.peakDayName, C.text],
    ["after midnight", Math.round(stats.nightShare * 100) + "%", C.night],
    ["longest streak", stats.streak.length + " days", C.green],
    ["longest session", duration(stats.session.minutes), C.text],
  ];

  rows.forEach((row, i) => {
    const y = 330 + i * 46;
    parts.push('<text x="' + rx + '" y="' + y + '" fill="' + C.dim + '" font-size="19">' + escape(row[0]) + "</text>");
    parts.push('<text x="' + (W - 60) + '" y="' + y + '" fill="' + row[2] +
      '" font-size="22" font-weight="700" text-anchor="end">' + escape(row[1]) + "</text>");
  });

  // top files - left column, above the verdict strip
  parts.push('<text x="60" y="470" fill="' + C.dim + '" font-size="19">files you keep coming back to</text>');
  stats.topFiles.slice(0, 3).forEach((file, i) => {
    const y = 500 + i * 26;
    parts.push('<text x="60" y="' + y + '" fill="' + C.cyan + '" font-size="19">' +
      escape(shorten(file.key, 44)) + "</text>");
    parts.push('<text x="620" y="' + y + '" fill="' + C.dim + '" font-size="19" text-anchor="end">' +
      file.value + "x</text>");
  });

  // verdict - full width strip so nothing can collide with it
  const stripY = 566;
  parts.push('<rect x="60" y="' + stripY + '" width="' + (W - 120) + '" height="46" rx="12" fill="' +
    C.panel + '" stroke="' + C.line + '"/>');
  parts.push('<text x="84" y="' + (stripY + 30) + '" fill="' + C.violet + '" font-size="21">' +
    escape(verdict(stats)) + "</text>");
  parts.push('<text x="' + (W - 84) + '" y="' + (stripY + 30) + '" fill="' + C.dim +
    '" font-size="16" text-anchor="end">npx gitwrapped  -  runs offline</text>');

  parts.push("</svg>");
  return parts.join("");
}

module.exports = { render, W, H };
