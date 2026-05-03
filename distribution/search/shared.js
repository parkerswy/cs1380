// @ts-check

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with",
]);

let stopwords;

function loadStopwords() {
  if (stopwords) {
    return stopwords;
  }

  stopwords = new Set(DEFAULT_STOPWORDS);
  const stopwordPath = path.resolve(process.cwd(), "non-distribution", "d", "stopwords.txt");
  try {
    const text = fs.readFileSync(stopwordPath, "utf8");
    for (const word of text.split(/\s+/)) {
      const trimmed = word.trim().toLowerCase();
      if (trimmed) {
        stopwords.add(trimmed);
      }
    }
  } catch {
    // The distributed search code can run without the M0 folder present.
  }
  return stopwords;
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function keyForUrl(url) {
  return `u${sha(url)}`;
}

function keyForTerm(term) {
  return `t${sha(term)}`;
}

function keyForRobots(origin) {
  return `r${sha(origin)}`;
}

function normalizeUrl(rawUrl, baseUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return null;
  }

  let parsed;
  try {
    parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  if ((parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")) {
    parsed.port = "";
  }

  const sorted = [...parsed.searchParams.entries()].sort((left, right) => {
    if (left[0] !== right[0]) {
      return left[0].localeCompare(right[0]);
    }
    return left[1].localeCompare(right[1]);
  });
  parsed.search = "";
  for (const [key, value] of sorted) {
    parsed.searchParams.append(key, value);
  }

  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.href;
}

function decodeEntities(text) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1] && entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code)) {
        return String.fromCodePoint(code);
      }
      return match;
    }
    return named[entity.toLowerCase()] || match;
  });
}

function extractText(html) {
  if (typeof html !== "string") {
    return "";
  }
  return decodeEntities(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  if (typeof html !== "string" || typeof baseUrl !== "string") {
    return links;
  }

  const attr = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match;
  while ((match = attr.exec(html)) !== null) {
    const href = match[1] || match[2] || match[3];
    const normalized = normalizeUrl(decodeEntities(href), baseUrl);
    if (normalized) {
      links.push(normalized);
    }
  }
  return [...new Set(links)];
}

function stem(word) {
  if (word.length <= 3) {
    return word;
  }

  let out = word;
  if (out.endsWith("sses")) {
    out = out.slice(0, -2);
  } else if (out.endsWith("ies") && out.length > 4) {
    out = `${out.slice(0, -3)}i`;
  } else if (out.endsWith("ss")) {
    out = out;
  } else if (out.endsWith("s") && out.length > 3) {
    out = out.slice(0, -1);
  }

  if (out.endsWith("ing") && out.length > 5) {
    out = out.slice(0, -3);
  } else if (out.endsWith("ed") && out.length > 4) {
    out = out.slice(0, -2);
  }

  if (out.endsWith("ational")) {
    out = `${out.slice(0, -7)}ate`;
  } else if (out.endsWith("tional")) {
    out = `${out.slice(0, -6)}tion`;
  } else if (out.endsWith("izer")) {
    out = `${out.slice(0, -4)}ize`;
  } else if (out.endsWith("fulness")) {
    out = `${out.slice(0, -7)}ful`;
  } else if (out.endsWith("ousness")) {
    out = `${out.slice(0, -7)}ous`;
  } else if (out.endsWith("iveness")) {
    out = `${out.slice(0, -7)}ive`;
  } else if (out.endsWith("ment") && out.length > 6) {
    out = out.slice(0, -4);
  } else if (out.endsWith("ness") && out.length > 6) {
    out = out.slice(0, -4);
  }

  return out;
}

function processText(text) {
  const words = loadStopwords();
  const ascii = String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, " ");

  return ascii
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word && !words.has(word))
      .map(stem)
      .filter((word) => word && !words.has(word));
}

function countTerms(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

module.exports = {
  countTerms,
  extractLinks,
  extractText,
  keyForRobots,
  keyForTerm,
  keyForUrl,
  normalizeUrl,
  processText,
  sha,
  stem,
};
