// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */
const distribution = globalThis.distribution;
const id = distribution.util.id;
const config = distribution.node.config;
const net = require("node:net");
const { spawn: spawnProc } = require("node:child_process");
const path = require("node:path");

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  if (typeof callback !== 'function') {
    return;
  }
  if (typeof configuration !== "string") {
    return callback(new Error('status.get: invalid property'), undefined);
  }
  if (distribution.node.counts == null) {
    distribution.node.counts = 0;
  }
  switch (configuration) {
    case "nid":
      return callback(null, id.getNID(config));
    case "sid":
      return callback(null, id.getSID(config));
    case "ip":
      return callback(null, config.ip);
    case "port":
      return callback(null, config.port);
    case "counts":
      return callback(null, distribution.node.counts);
    case "heapTotal":
      return callback(null, process.memoryUsage().heapTotal);
    case "heapUsed":
      return callback(null, process.memoryUsage().heapUsed);
    default:
      return callback(new Error('status.get: invalid property'), undefined);
  }
};

function waitForPort(node, timeoutMs, cb) {
  const deadline = Date.now() + timeoutMs;

  const probe = () => {
    const sock = net.connect({ host: node.ip, port: node.port });
    sock.once("connect", () => {
      sock.end();
      cb(null);
    });
    sock.once("error", () => {
      sock.destroy();
      if (Date.now() >= deadline) cb(new Error("status.spawn: timeout waiting for node"));
      else setTimeout(probe, 25);
    });
  };

  probe();
}

/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  if (typeof callback !== "function") return;

  const node = configuration;
  if (!node || typeof node !== "object") return callback(new Error("status.spawn: invalid configuration"));
  if (typeof node.ip !== "string") return callback(new Error("status.spawn: invalid ip"));
  if (typeof node.port !== "number") return callback(new Error("status.spawn: invalid port"));

  const distPath = path.join(process.cwd(), "distribution.js");

  const boot = `
require(${JSON.stringify(distPath)})();
const d = globalThis.distribution;
d.node.config = { ip: ${JSON.stringify(node.ip)}, port: ${Number(node.port)} };
d.node.start((e)=>{ if(e){ console.error(e); process.exit(1); } });
`;

  const child = spawnProc(process.execPath, ["-e", boot], {
    stdio: "ignore",
    detached: true,
    env: process.env,
  });
  child.unref();

  waitForPort(node, 2000, (err) => {
    if (err) return callback(err);
    callback(null, true);
  });
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  if (typeof callback !== "function") return;
  const srv = globalThis.distribution?.node?.server;
  callback(null, true);
  setImmediate(() => {
    try {
      if (srv && typeof srv.close === "function") {
        srv.close(() => process.exit(0));
        // Fallback in case close callback never fires
        setTimeout(() => process.exit(0), 25);
      } else {
        process.exit(0);
      }
    } catch {
      process.exit(0);
    }
  });
}

module.exports = {get, spawn, stop};
