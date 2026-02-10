// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require('node:http');
const distribution = globalThis.distribution;

/**
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {Node} node
 * @property {string} [gid]
 */

/**
 * @param {Array<any>} message
 * @param {Target} remote
 * @param {(error: Error, value?: any) => void} callback
 * @returns {void}
 */
function send(message, remote, callback) {
  distribution.local.routes.get(remote.service, (error, service) => {
    if (error) {
      const err = error instanceof Error ? error : new Error(JSON.stringify(error));
      callback(err, undefined);
    }
    else {
      const fn = service?.[remote.method]
      if (!fn) {
        callback(new Error("undefined method"), undefined);
      }
      fn(...message, (err, val) => callback(err, val))
    }
  })
}

module.exports = {send};
