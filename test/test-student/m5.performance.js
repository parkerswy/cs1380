require('../../distribution.js')({ip: '127.0.0.1', port: 9110});
require('../helpers/sync-guard.js');

const distribution = globalThis.distribution;

function nowNs() {
  return process.hrtime.bigint();
}
function nsToS(ns) {
  return Number(ns) / 1e9;
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
      distribution.local.comm.send(
          [], {node, service: 'status', method: 'stop'}, () => resolve(),
      );
    } catch {
      resolve();
    }
  });
}

const mapper = (key, value) => {
  const words = value.split(/(\s+)/).filter((e) => e !== ' ');
  const out = [];
  for (const word of words) {
    out.push({[word]: 1});
  }
  return out;
};

const reducer = (key, values) => {
  const out = {};
  out[key] = values.reduce((a, b) => a + b, 0);
  return out;
};

/* ---- dataset generation ---- */

const sampleLines = [
  'It was the best of times, it was the worst of times,',
  'it was the age of wisdom, it was the age of foolishness,',
  'it was the epoch of belief, it was the epoch of incredulity,',
  'it was the season of Light, it was the season of Darkness,',
  'it was the spring of hope, it was the winter of despair,',
  'We hold these truths to be self-evident, that all men are created equal,',
  'Call me Ishmael. Some years ago never mind how long precisely,',
  'It is a truth universally acknowledged, that a single man in possession,',
  'In the beginning God created the heavens and the earth,',
  'To be, or not to be, that is the question,',
];

function generateDataset(n) {
  const dataset = [];
  for (let i = 0; i < n; i++) {
    dataset.push({[`doc-${i}`]: sampleLines[i % sampleLines.length]});
  }
  return dataset;
}

describe('M5 dlib MR characterization', () => {
  const spawned = [];
  const nodes = [
    {ip: '127.0.0.1', port: 12101},
    {ip: '127.0.0.1', port: 12102},
    {ip: '127.0.0.1', port: 12103},
  ];

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
      'dlib word-count latency/throughput (seconds)',
      async () => {
        const N = Number(process.env.N || 20);

        /* spawn nodes */
        for (const node of nodes) {
          try {
            await cbToPromise(distribution.all.status.spawn, node);
            spawned.push(node);
          } catch {}
        }

        const gid = 'chardlib';
        const group = {};
        for (const node of nodes) {
          group[distribution.util.id.getSID(node)] = node;
        }
        await cbToPromise(
            distribution.local.groups.put, {gid}, group,
        );
        await cbToPromise(
            distribution[gid].groups.put, {gid}, group,
        );

        const dataset = generateDataset(N);

        /* ---- full end-to-end: ingestion + MR ---- */
        const t0 = nowNs();

        // ingestion
        for (const entry of dataset) {
          const key = Object.keys(entry)[0];
          const value = entry[key];
          await cbToPromise(distribution[gid].store.put, value, key);
        }

        // MR execution
        const keys = await cbToPromise(distribution[gid].store.get, null);
        expect(keys.length).toBe(N);

        const mrResult = await cbToPromise(
            distribution[gid].mr.exec,
            {keys, map: mapper, reduce: reducer},
        );

        const totalS = nsToS(nowNs() - t0);
        const throughput = N / totalS;

        /* ---- correctness sanity check ---- */
        for (const entry of mrResult) {
          const k = Object.keys(entry);
          expect(k.length).toBe(1);
          expect(typeof entry[k[0]]).toBe('number');
          expect(entry[k[0]]).toBeGreaterThan(0);
        }

        /* ---- report ---- */
        console.log(`\n--- dlib MR characterization (N=${N}, 3 nodes) ---`);
        console.log(`throughput: ${throughput}`);
        console.log(`latency: ${totalS / N}`);

        expect(throughput).toBeGreaterThan(0);
      },
      300000,
  );
});
