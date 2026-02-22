const distribution = require("../../distribution.js")({ip: "127.0.0.1", port: 9010});
require("../helpers/sync-guard");

function nowNs() {
  return process.hrtime.bigint();
}

function nsToS(ns) {
  return Number(ns) / 1e9;
}

function stopNodeBestEffort(node) {
  return new Promise((resolve) => {
    try {
      distribution.local.comm.send([], {node, service: "status", method: "stop"}, () => resolve());
    } catch {
      resolve();
    }
  });
}

function spawnOnce(nodeConfig) {
  const t0 = nowNs();
  return new Promise((resolve, reject) => {
    distribution.all.status.spawn(nodeConfig, (e) => {
      const t1 = nowNs();
      if (e) return reject(e);
      resolve(nsToS(t1 - t0));
    });
  });
}

const spawnedNodes = [];

beforeAll((done) => {
  distribution.node.start((e) => done(e || undefined));
});

afterAll(async () => {
  for (const node of spawnedNodes) {
    await stopNodeBestEffort(node);
  }
  if (distribution.node.server) {
    await new Promise((resolve) => distribution.node.server.close(resolve));
  }
});

test("spawn time (mean seconds)", async () => {
  const trials = 3;
  const basePort = 12000 + Math.floor(Math.random() * 20000);
  let sum = 0;

  for (let i = 0; i < trials; i++) {
    const node = {ip: "127.0.0.1", port: basePort + i};
    const elapsedSeconds = await spawnOnce(node);
    spawnedNodes.push(node);
    sum += elapsedSeconds;
  }

  const meanSeconds = sum / trials;
  console.log(`m3 spawn mean seconds: ${meanSeconds}`);
  expect(meanSeconds).toBeGreaterThan(0);
}, 120000);
