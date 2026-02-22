// test/test-student/m3.performance.test.js
const distribution = require("../../distribution.js")();

function nowNs() { return process.hrtime.bigint(); }
function nsToS(ns) { return Number(ns) / 1e9; }

function stopNodeBestEffort(node) {
  return new Promise((resolve) => {
    try {
      distribution.local.comm.send([], { node, service: "status", method: "stop" }, () => resolve());
    } catch {
      resolve();
    }
  });
}

function stopSelfBestEffort() {
  return new Promise((resolve) => {
    try {
      if (distribution.local?.status?.stop) {
        distribution.local.status.stop(() => resolve());
      } else {
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

function spawnOnce(nodeConfig) {
  const t0 = nowNs();
  return new Promise((resolve, reject) => {
    distribution.local.status.spawn(nodeConfig, (e) => {
      const t1 = nowNs();
      if (e) return reject(e);
      resolve(nsToS(t1 - t0));
    });
  });
}

test("spawn time (mean seconds)", async () => {
  const trials = 3;
  const basePort = 12000 + Math.floor(Math.random() * 20000);

  const spawned = [];
  let sum = 0;

  for (let i = 0; i < trials; i++) {
    const node = { ip: "127.0.0.1", port: basePort + i };
    const s = await spawnOnce(node);
    sum += s;
    spawned.push(node);
  }

  for (const node of spawned) {
    await stopNodeBestEffort(node);
  }
  await stopSelfBestEffort();

  console.log(sum / trials);
}, 300000);