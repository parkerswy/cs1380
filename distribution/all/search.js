// @ts-check

/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

const {id} = require("../util/util.js");
const {
  normalizeUrl,
  processText,
} = require("../search/shared.js");

const distribution = globalThis.distribution;

function once(callback) {
  let called = false;
  return (error, value) => {
    if (called) {
      return;
    }
    called = true;
    callback(error, value);
  };
}

function finish(callback, work) {
  const cb = once(typeof callback === "function" ? callback : () => {});
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

function send(node, method, message) {
  return callWithCallback(distribution.local.comm.send, [
    message,
    {node, service: "search", method},
  ]);
}

/**
 * @param {Config} config
 */
function search(config) {
  const context = {
    gid: config.gid || "all",
    hash: config.hash || id.naiveHash,
  };

  async function getGroup() {
    const group = await callWithCallback(distribution.local.groups.get, [context.gid]);
    if (!group || !Object.keys(group).length) {
      throw new Error("search: missing group");
    }
    return group;
  }

  /**
   * @param {string} value
   * @param {Record<string, Node>} group
   */
  function ownerFor(value, group) {
    const sid = context.hash(id.getID(value), Object.keys(group));
    return group[sid];
  }

  async function sendToOwner(value, method, args) {
    const group = await getGroup();
    const node = ownerFor(value, group);
    return send(node, method, args.concat([{gid: context.gid}]));
  }

  function normalize(rawUrl, baseUrl, callback) {
    let cb = callback;
    let base = baseUrl;
    if (typeof baseUrl === "function") {
      cb = baseUrl;
      base = undefined;
    }
    if (typeof cb !== "function") {
      return;
    }
    cb(null, normalizeUrl(rawUrl, base));
  }

  function process(query, callback) {
    if (typeof callback !== "function") {
      return;
    }
    callback(null, processText(query));
  }

  function enqueue(rawUrl, baseUrl, callback) {
    let cb = callback;
    let base = baseUrl;
    if (typeof baseUrl === "function") {
      cb = baseUrl;
      base = undefined;
    }
    finish(cb, async () => {
      const normalized = normalizeUrl(rawUrl, base);
      if (!normalized) {
        return {enqueued: false, reason: "invalid"};
      }
      return sendToOwner(normalized, "enqueue", [normalized]);
    });
  }

  function seed(urls, callback) {
    finish(callback, async () => {
      const list = Array.isArray(urls) ? urls : [urls];
      const results = [];
      for (const url of list) {
        results.push(await callWithCallback(enqueue, [url]));
      }
      return results;
    });
  }

  function addPosting(term, url, count, callback) {
    finish(callback, () => sendToOwner(String(term || ""), "addPosting", [term, url, count]));
  }

  function getPostings(term, callback) {
    finish(callback, () => sendToOwner(String(term || ""), "getPostings", [term]));
  }

  async function statsByNode() {
    const group = await getGroup();
    const entries = Object.entries(group);
    const perNode = {};
    for (const [sid, node] of entries) {
      try {
        perNode[sid] = await send(node, "stats", [{gid: context.gid}]);
      } catch (error) {
        perNode[sid] = {error: error instanceof Error ? error.message : String(error)};
      }
    }
    return perNode;
  }

  function stats(callback) {
    finish(callback, async () => {
      const nodes = await statsByNode();
      const totals = {
        enqueued: 0,
        duplicate: 0,
        invalid: 0,
        robotsSkipped: 0,
        fetched: 0,
        indexed: 0,
        failed: 0,
        bytes: 0,
        frontier: 0,
        urlKeys: 0,
        termKeys: 0,
        robotsKeys: 0,
      };
      for (const value of Object.values(nodes)) {
        if (!value || value.error) {
          continue;
        }
        for (const key of Object.keys(totals)) {
          totals[key] += Number(value[key] || 0);
        }
      }
      return {gid: context.gid, totals, nodes};
    });
  }

  function query(text, limit, callback) {
    let cb = callback;
    let top = limit;
    if (typeof limit === "function") {
      cb = limit;
      top = 10;
    }
    finish(cb, async () => {
      const terms = [...new Set(processText(text))];
      const scores = new Map();
      for (const term of terms) {
        const postings = await callWithCallback(getPostings, [term]);
        for (const posting of postings) {
          scores.set(posting.url, (scores.get(posting.url) || 0) + Number(posting.score || 0));
        }
      }
      return [...scores.entries()]
          .map(([url, score]) => ({url, score}))
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }
            return left.url.localeCompare(right.url);
          })
          .slice(0, Math.max(1, Number(top || 10)));
    });
  }

  function crawl(configuration, callback) {
    const configValue = configuration && typeof configuration === "object" ? configuration : {};
    finish(callback, async () => {
      const targetPages = Math.max(1, Number(configValue.targetPages || 100000));
      const roundSize = Math.max(1, Number(configValue.roundSize || 2));
      const maxRounds = Math.max(1, Number(configValue.maxRounds || 1000000));
      let finalStats = await callWithCallback(stats, []);
      let rounds = 0;

      while (finalStats.totals.indexed < targetPages && rounds < maxRounds) {
        rounds += 1;
        const group = await getGroup();
        let progressed = 0;
        for (const node of Object.values(group)) {
          const result = await send(node, "drain", [{gid: context.gid, limit: roundSize}]);
          progressed += Number(result.processed || 0) + Number(result.failed || 0);
        }

        finalStats = await callWithCallback(stats, []);
        if (progressed === 0 && finalStats.totals.frontier === 0) {
          return {
            done: false,
            reason: "frontier exhausted",
            rounds,
            stats: finalStats,
          };
        }
      }

      return {
        done: finalStats.totals.indexed >= targetPages,
        reason: finalStats.totals.indexed >= targetPages ? "target reached" : "max rounds reached",
        rounds,
        stats: finalStats,
      };
    });
  }

  function reset(callback) {
    finish(callback, async () => {
      const group = await getGroup();
      const results = {};
      for (const [sid, node] of Object.entries(group)) {
        try {
          results[sid] = await send(node, "reset", [{gid: context.gid}]);
        } catch (error) {
          results[sid] = {error: error instanceof Error ? error.message : String(error)};
        }
      }
      return results;
    });
  }

  return {
    addPosting,
    crawl,
    enqueue,
    getPostings,
    normalize,
    process,
    query,
    reset,
    seed,
    stats,
  };
}

module.exports = search;
