// @ts-check

/**
 * @typedef {import("../types.js").Callback} Callback
 */

const http = require("node:http");
const https = require("node:https");
const {
  countTerms,
  extractLinks: extractLinksFromHtml,
  extractText: extractTextFromHtml,
  keyForRobots,
  keyForTerm,
  keyForUrl,
  normalizeUrl: normalizeSharedUrl,
  processText: processSharedText,
} = require("../search/shared.js");

const distribution = globalThis.distribution;

const FRONTIER_KEY = "sfrontier";
const STATS_KEY = "sstats";
const USER_AGENT = "CS1380-M6-SearchBot/1.0";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const postingLocks = new Map();

function getGid(configuration) {
  if (configuration && typeof configuration === "object" &&
      typeof configuration.gid === "string" && configuration.gid) {
    return configuration.gid;
  }
  return "all";
}

function finish(callback, work) {
  const cb = typeof callback === "function" ? callback : () => {};
  work().then((value) => cb(null, value), (error) => {
    cb(error instanceof Error ? error : new Error(String(error)));
  });
}

function callWithCallback(fn, args) {
  return new Promise((resolve, reject) => {
    fn(...args, (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

function storeGet(gid, key) {
  return callWithCallback(distribution.local.store.get, [{gid, key}]);
}

function storePut(gid, key, value) {
  return callWithCallback(distribution.local.store.put, [value, {gid, key}]);
}

function storeDel(gid, key) {
  return callWithCallback(distribution.local.store.del, [{gid, key}]);
}

async function getOrDefault(gid, key, fallback) {
  try {
    return await storeGet(gid, key);
  } catch {
    return fallback;
  }
}

async function readFrontier(gid) {
  const frontier = await getOrDefault(gid, FRONTIER_KEY, []);
  return Array.isArray(frontier) ? frontier : [];
}

async function writeFrontier(gid, frontier) {
  await storePut(gid, FRONTIER_KEY, frontier);
}

async function readStats(gid) {
  const stats = await getOrDefault(gid, STATS_KEY, {});
  return {
    enqueued: Number(stats.enqueued || 0),
    duplicate: Number(stats.duplicate || 0),
    invalid: Number(stats.invalid || 0),
    robotsSkipped: Number(stats.robotsSkipped || 0),
    fetched: Number(stats.fetched || 0),
    indexed: Number(stats.indexed || 0),
    failed: Number(stats.failed || 0),
    bytes: Number(stats.bytes || 0),
  };
}

async function bumpStats(gid, patch) {
  const stats = await readStats(gid);
  for (const [key, value] of Object.entries(patch)) {
    stats[key] = Number(stats[key] || 0) + Number(value || 0);
  }
  await storePut(gid, STATS_KEY, stats);
  return stats;
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.request({
      method: "GET",
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      protocol: parsed.protocol,
      timeout: 10000,
      headers: {
        "Accept": "text/html,text/plain;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location && redirects < 5) {
        response.resume();
        const next = normalizeSharedUrl(location, url);
        if (!next) {
          reject(new Error("invalid redirect"));
          return;
        }
        fetchUrl(next, redirects + 1).then(resolve, reject);
        return;
      }

      if (status >= 400) {
        response.resume();
        reject(new Error(`fetch failed with status ${status}`));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("response too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks).toString("utf8"),
          bytes: size,
          contentType: String(response.headers["content-type"] || ""),
          finalUrl: url,
          status,
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("fetch timeout"));
    });
    request.on("error", reject);
    request.end();
  });
}

function parseRobots(text) {
  const rules = [];
  let active = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) {
      continue;
    }
    const splitAt = line.indexOf(":");
    if (splitAt < 0) {
      continue;
    }
    const field = line.slice(0, splitAt).trim().toLowerCase();
    const value = line.slice(splitAt + 1).trim();
    if (field === "user-agent") {
      const agent = value.toLowerCase();
      active = agent === "*" || agent === USER_AGENT.toLowerCase();
      continue;
    }
    if (!active) {
      continue;
    }
    if (field === "allow" || field === "disallow") {
      if (value === "" && field === "disallow") {
        continue;
      }
      rules.push({type: field, path: value});
    }
  }
  return rules;
}

async function getRobotsRules(gid, url) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  const key = keyForRobots(origin);
  const cached = await getOrDefault(gid, key, null);
  if (cached && Array.isArray(cached.rules) &&
      Date.now() - Number(cached.fetchedAt || 0) < 24 * 60 * 60 * 1000) {
    return cached.rules;
  }

  let rules = [];
  try {
    const robots = await fetchUrl(`${origin}/robots.txt`);
    rules = parseRobots(robots.body);
  } catch {
    rules = [];
  }
  await storePut(gid, key, {origin, rules, fetchedAt: Date.now()});
  return rules;
}

function isAllowedByRules(url, rules) {
  const parsed = new URL(url);
  const target = `${parsed.pathname}${parsed.search}`;
  let best = null;
  for (const rule of rules) {
    if (!rule.path || target.startsWith(rule.path)) {
      if (!best || rule.path.length > best.path.length) {
        best = rule;
      }
    }
  }
  return !best || best.type === "allow";
}

async function enqueueLocal(url, gid, baseUrl) {
  const normalized = normalizeSharedUrl(url, baseUrl);
  if (!normalized) {
    await bumpStats(gid, {invalid: 1});
    return {enqueued: false, reason: "invalid"};
  }

  const key = keyForUrl(normalized);
  const existing = await getOrDefault(gid, key, null);
  if (existing) {
    await bumpStats(gid, {duplicate: 1});
    return {enqueued: false, reason: "duplicate", url: normalized};
  }

  const frontier = await readFrontier(gid);
  frontier.push(normalized);
  await storePut(gid, key, {url: normalized, status: "queued", queuedAt: Date.now()});
  await writeFrontier(gid, frontier);
  await bumpStats(gid, {enqueued: 1});
  return {enqueued: true, url: normalized};
}

async function addPostingLocal(term, url, count, gid) {
  const normalizedTerm = String(term || "").trim();
  const normalizedUrl = normalizeSharedUrl(url);
  const amount = Number(count || 0);
  if (!normalizedTerm || !normalizedUrl || amount <= 0) {
    return {added: false};
  }

  const key = keyForTerm(normalizedTerm);
  const lockKey = `${gid}:${key}`;
  const previous = postingLocks.get(lockKey) || Promise.resolve();
  const next = previous.then(async () => {
    const entry = await getOrDefault(gid, key, {term: normalizedTerm, postings: {}});
    if (entry.term !== normalizedTerm) {
      return {added: false, reason: "hash-collision"};
    }
    entry.postings = entry.postings || {};
    entry.postings[normalizedUrl] = Number(entry.postings[normalizedUrl] || 0) + amount;
    await storePut(gid, key, entry);
    return {added: true, term: normalizedTerm, url: normalizedUrl, count: entry.postings[normalizedUrl]};
  });
  postingLocks.set(lockKey, next.catch(() => {}));
  return next;
}

async function routePosting(term, url, count, gid) {
  if (distribution[gid] && distribution[gid].search &&
      typeof distribution[gid].search.addPosting === "function") {
    return callWithCallback(distribution[gid].search.addPosting, [term, url, count]);
  }
  return addPostingLocal(term, url, count, gid);
}

async function routeEnqueue(url, gid, baseUrl) {
  if (distribution[gid] && distribution[gid].search &&
      typeof distribution[gid].search.enqueue === "function") {
    return callWithCallback(distribution[gid].search.enqueue, [url, baseUrl]);
  }
  return enqueueLocal(url, gid, baseUrl);
}

async function indexTextLocal(url, text, gid) {
  const normalized = normalizeSharedUrl(url);
  if (!normalized) {
    throw new Error("indexPage: invalid url");
  }
  const tokens = processSharedText(text);
  const counts = countTerms(tokens);
  for (const [term, count] of counts.entries()) {
    await routePosting(term, normalized, count, gid);
  }
  return {url: normalized, terms: counts.size, tokens: tokens.length};
}

async function shiftFrontier(gid) {
  const frontier = await readFrontier(gid);
  const url = frontier.shift();
  await writeFrontier(gid, frontier);
  return url || null;
}

async function crawlOneLocal(gid) {
  const url = await shiftFrontier(gid);
  if (!url) {
    return {processed: 0, empty: true};
  }

  const urlKey = keyForUrl(url);
  const record = await getOrDefault(gid, urlKey, {url});
  if (record.status === "indexed" || record.status === "skipped") {
    return {processed: 0, url, skipped: true, reason: record.status};
  }

  try {
    const rules = await getRobotsRules(gid, url);
    if (!isAllowedByRules(url, rules)) {
      await storePut(gid, urlKey, {
        ...record,
        status: "skipped",
        reason: "robots",
        skippedAt: Date.now(),
      });
      await bumpStats(gid, {robotsSkipped: 1});
      return {processed: 1, indexed: 0, skipped: 1, url};
    }

    const page = await fetchUrl(url);
    const isHtml = page.contentType.includes("html") || /<html[\s>]/i.test(page.body);
    const text = isHtml ? extractTextFromHtml(page.body) : page.body;
    const links = isHtml ? extractLinksFromHtml(page.body, url) : [];

    for (const link of links) {
      await routeEnqueue(link, gid, url);
    }

    const indexed = await indexTextLocal(url, text, gid);
    await storePut(gid, urlKey, {
      ...record,
      url,
      status: "indexed",
      indexedAt: Date.now(),
      contentType: page.contentType,
      bytes: page.bytes,
      terms: indexed.terms,
      tokens: indexed.tokens,
    });
    await bumpStats(gid, {fetched: 1, indexed: 1, bytes: page.bytes});
    return {processed: 1, indexed: 1, links: links.length, url};
  } catch (error) {
    await storePut(gid, urlKey, {
      ...record,
      url,
      status: "failed",
      failedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
    await bumpStats(gid, {failed: 1});
    throw error;
  }
}

function normalizeUrl(rawUrl, baseUrl, callback) {
  let cb = callback;
  let base = baseUrl;
  if (typeof baseUrl === "function") {
    cb = baseUrl;
    base = undefined;
  }
  if (typeof cb !== "function") {
    return;
  }
  cb(null, normalizeSharedUrl(rawUrl, base));
}

function processText(text, callback) {
  if (typeof callback !== "function") {
    return;
  }
  callback(null, processSharedText(text));
}

function extractLinks(html, baseUrl, callback) {
  if (typeof callback !== "function") {
    return;
  }
  callback(null, extractLinksFromHtml(html, baseUrl));
}

function extractText(html, callback) {
  if (typeof callback !== "function") {
    return;
  }
  callback(null, extractTextFromHtml(html));
}

function enqueue(url, configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, () => enqueueLocal(url, getGid(config), config && config.baseUrl));
}

function addPosting(term, url, count, configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, () => addPostingLocal(term, url, count, getGid(config)));
}

function getPostings(term, configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, async () => {
    const normalizedTerm = String(term || "").trim();
    if (!normalizedTerm) {
      return [];
    }
    const entry = await getOrDefault(getGid(config), keyForTerm(normalizedTerm), null);
    if (!entry || entry.term !== normalizedTerm || !entry.postings) {
      return [];
    }
    return Object.entries(entry.postings).map(([url, score]) => ({url, score}));
  });
}

function indexPage(page, configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, async () => {
    if (!page || typeof page !== "object") {
      throw new Error("indexPage: invalid page");
    }
    return indexTextLocal(page.url, page.text || "", getGid(config));
  });
}

function crawlOne(configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, () => crawlOneLocal(getGid(config)));
}

function drain(configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, async () => {
    const gid = getGid(config);
    const limit = Math.max(1, Number(config && config.limit || 1));
    const summary = {processed: 0, indexed: 0, skipped: 0, failed: 0, empty: false};
    for (let i = 0; i < limit; i += 1) {
      try {
        const result = await crawlOneLocal(gid);
        if (result.empty) {
          summary.empty = true;
          break;
        }
        summary.processed += Number(result.processed || 0);
        summary.indexed += Number(result.indexed || 0);
        summary.skipped += Number(result.skipped || 0);
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  });
}

function stats(configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, async () => {
    const gid = getGid(config);
    const frontier = await readFrontier(gid);
    const storedKeys = await getOrDefault(gid, null, []);
    const statsValue = await readStats(gid);
    return {
      ...statsValue,
      frontier: frontier.length,
      urlKeys: storedKeys.filter((key) => String(key).startsWith("u")).length,
      termKeys: storedKeys.filter((key) => String(key).startsWith("t")).length,
      robotsKeys: storedKeys.filter((key) => String(key).startsWith("r")).length,
    };
  });
}

function reset(configuration, callback) {
  let config = configuration;
  let cb = callback;
  if (typeof configuration === "function") {
    cb = configuration;
    config = {};
  }
  finish(cb, async () => {
    const gid = getGid(config);
    const keys = await getOrDefault(gid, null, []);
    let deleted = 0;
    for (const key of keys) {
      const text = String(key);
      if (/^[ustr]/.test(text)) {
        try {
          await storeDel(gid, text);
          deleted += 1;
        } catch {
          // Best-effort reset for test and demo runs.
        }
      }
    }
    return {deleted};
  });
}

module.exports = {
  addPosting,
  crawlOne,
  drain,
  enqueue,
  extractLinks,
  extractText,
  getPostings,
  indexPage,
  normalize: normalizeUrl,
  normalizeUrl,
  processText,
  reset,
  stats,
};
