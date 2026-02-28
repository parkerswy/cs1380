require("../../distribution.js")({ ip: "127.0.0.1", port: 9010 });
require("../helpers/sync-guard");

const crypto = require("node:crypto");
const distribution = globalThis.distribution;

function nowNs() {
  return process.hrtime.bigint();
}
function nsToS(ns) {
  return Number(ns) / 1e9;
}

function randKey(len = 16) {
  return crypto.randomBytes(len).toString("base64url").slice(0, len);
}
function randObj(i) {
  return { i, payload: crypto.randomBytes(256).toString("hex") };
}

function mean(arr) {
  let s = 0;
  for (const x of arr) s += x;
  return arr.length ? s / arr.length : NaN;
}

function cbToPromise(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (e, v) => {
      if (e instanceof Error) return reject(e);
      resolve(v);
    });
  });
}

async function stopNodeBestEffort(node) {
  return new Promise((resolve) => {
    try {
      distribution.local.comm.send([], { node, service: "status", method: "stop" }, () => resolve());
    } catch {
      resolve();
    }
  });
}

describe("T5 characterization", () => {
  const spawned = [];

  beforeAll((done) => {
    distribution.node.start((e) => done(e || undefined));
  });

  afterAll(async () => {
    for (const n of spawned) await stopNodeBestEffort(n);
    if (distribution.node.server) {
      await new Promise((resolve) => distribution.node.server.close(resolve));
    }
  });

  test(
    "insertion + query throughput/latency (seconds)",
    async () => {
      const gid = process.env.GID || "all";
      const N = Number(process.env.N || 1000);

      const nodes = process.env.NODES_JSON
        ? JSON.parse(process.env.NODES_JSON)
        : [
            { ip: "127.0.0.1", port: 12001 },
            { ip: "127.0.0.1", port: 12002 },
            { ip: "127.0.0.1", port: 12003 },
          ];

      if (!process.env.NODES_JSON) {
        for (const node of nodes) {
          try {
            await cbToPromise(distribution.all.status.spawn, node);
            spawned.push(node);
          } catch {}
        }
      }

      const group = {};
      for (const node of nodes) group[distribution.util.id.getSID(node)] = node;
      await cbToPromise(distribution.local.groups.put, { gid }, group);

      const store = distribution[gid].store;
      const pairs = [];
      for (let i = 0; i < N; i++) pairs.push([`k_${i}_${randKey(12)}`, randObj(i)]);

      const putLatS = [];
      const tPut0 = nowNs();
      for (const [k, v] of pairs) {
        const t0 = nowNs();
        await cbToPromise(store.put, v, { key: k, gid });
        putLatS.push(nsToS(nowNs() - t0));
      }
      const putTotalS = nsToS(nowNs() - tPut0);
      const putThroughput = N / putTotalS;

      const getLatS = [];
      const tGet0 = nowNs();
      for (const [k, expected] of pairs) {
        const t0 = nowNs();
        const got = await cbToPromise(store.get, { key: k, gid });
        getLatS.push(nsToS(nowNs() - t0));
        expect(got).toBeTruthy();
        expect(got.i).toBe(expected.i);
      }
      const getTotalS = nsToS(nowNs() - tGet0);
      const getThroughput = N / getTotalS;

      console.log(`insert throughput: ${putThroughput}`);
      console.log(`insert latency: ${mean(putLatS)}`);
      console.log(`query throughput: ${getThroughput}`);
      console.log(`query latency: ${mean(getLatS)}`);

      expect(putThroughput).toBeGreaterThan(0);
      expect(getThroughput).toBeGreaterThan(0);
    },
    300000,
  );
});