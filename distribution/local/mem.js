// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 *
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string | null} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */

const { id } = require("../util/util.js");

const memory = new Map()

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  const cb = typeof callback === "function" ? callback : () => {};
  if (configuration) {
    if (typeof(configuration) === "object") {
      configuration = configuration.key
    }
    memory.set(configuration, state)
  } else {
    memory.set(id.getID(state), state)
  }
  return cb(null, state)
};

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
};

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  const cb = typeof callback === "function" ? callback : () => {};
  if (configuration && (typeof(configuration) === "object")) {
    configuration = configuration.key
  }
  if (configuration == null) {
    return cb(null, Array.from(memory.keys()));
  }
  if (memory.has(configuration)) {
    return cb(null, memory.get(configuration))
  }
  return cb(new Error("no such key value"))
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  const cb = typeof callback === "function" ? callback : () => {};
  if (configuration && typeof(configuration) === "object") {
    configuration = configuration.key
  }
  if (!memory.has(configuration)) {
    return cb(new Error("key does not exist"))
  }
  let ret = memory.get(configuration)
  memory.delete(configuration)
  return cb(null, ret)
};

module.exports = {put, get, del, append};
