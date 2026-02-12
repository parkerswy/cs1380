// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Hasher} Hasher
 */
const log = require('../util/log.js');
const crypto = require("node:crypto");
const distribution = globalThis.distribution;

/** @type {WeakMap<Function, string>} */
const toLocalMap = new Map();
const toRemoteMap = new WeakMap();

function genPtr() {
  return crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
}

function selfNode() {
  return { ip: distribution.node.config.ip, port: distribution.node.config.port };
}

/**
 * @param {Function} fn
 * @returns {string} ptr
 */
function toRemote(fn) {
  let ptr = toRemoteMap.get(fn);
  if (!ptr) {
    ptr = genPtr();
    toRemoteMap.set(fn, ptr);
    toLocalMap.set(ptr, fn);
  }
  return ptr;
}

/**
 * @param {string} ptr
 * @returns {Function | undefined}
 */
function toLocal(ptr) {
  return toLocalMap.get(ptr);
}

/**
 * @param {Function} func
 * @returns {Function} func
 */
function createRPC(func) {
  const node = selfNode();
  const ptr = toRemote(func);

  function stub(...args) {
    const cb = args.pop();
    if (typeof cb !== "function") throw new Error("rpc stub: missing callback");

    const remote = { node, service: "rpc", method: "apply" };
    const message = [ptr, args];
    globalThis.distribution.local.comm.send(message, remote, cb);
  }

  const nodeLit = JSON.stringify(node);
  const ptrLit = JSON.stringify(ptr);

  stub.toString = () => `
function stub(...args) {
  const cb = args.pop();
  if (typeof cb !== "function") throw new Error("rpc stub: missing callback");
  const remote = { node: ${nodeLit}, service: "rpc", method: "apply" };
  const message = [${ptrLit}, args];
  globalThis.distribution.local.comm.send(message, remote, cb);
}
`.trim();

  return stub;
}

/**
 * The toAsync function transforms a synchronous function that returns a value into an asynchronous one,
 * which accepts a callback as its final argument and passes the value to the callback.
 * @param {Function} func
 */
function toAsync(func) {

  // It's the caller's responsibility to provide a callback
  const asyncFunc = (/** @type {any[]} */ ...args) => {
    const callback = args.pop();
    try {
      const result = func(...args);
      return callback(null, result);
    } catch (error) {
      return callback(error);
    }
  };

  /* Overwrite toString to return the original function's code.
   Otherwise, all functions passed through toAsync would have the same id. */
  asyncFunc.toString = () => func.toString();
  return asyncFunc;
}


module.exports = {
  createRPC,
  toAsync,
  toRemote,
  toLocal
};
