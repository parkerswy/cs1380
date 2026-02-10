// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */
const distribution = globalThis.distribution;
const id = distribution.util.id;
const config = distribution.node.config;

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


/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  callback(new Error('status.spawn not implemented'));
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  callback(new Error('status.stop not implemented'));
}

module.exports = {get, spawn, stop};
