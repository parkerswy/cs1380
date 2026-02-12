// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 */

const distribution = globalThis.distribution;

/**
 * RPC service. Target of createRPC stubs.
 * Message format: [ptr, argsArray]
 */
function apply(ptr, args, cb) {
  if (typeof cb !== "function") return;
  if (typeof ptr !== "string" || !ptr) {
    return cb(new Error("rpc.apply: invalid ptr"), undefined);
  }
  if (!Array.isArray(args)) {
    return cb(new Error("rpc.apply: args must be array"), undefined);
  }

  const fn = distribution.util.wire.toLocal(ptr);
  if (typeof fn !== "function") {
    return cb(new Error("rpc.apply: unknown function pointer"), undefined);
  }

  try {
    return fn(...args, cb);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return cb(err, undefined);
  }
}

module.exports = { apply };
