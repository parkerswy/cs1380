// @ts-check
const distribution = globalThis.distribution

/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

/**
 * NOTE: This Target is slightly different from local.all.Target
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {string} [gid]
 *
 * @typedef {Object} Comm
 * @property {(message: any[], configuration: Target, callback: Callback) => void} send
 */

/**
 * @param {Config} config
 * @returns {Comm}
 */
function comm(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {any[]} message
   * @param {Target} configuration
   * @param {Callback} callback
   */
  function send(message, configuration, callback) {
    /** @type {Record<string, Error>} */
    const failed = {};
    /** @type {Record<string, any>} */
    const succeeded = {};
    let cb = callback ? callback : () => {}
    if (!configuration || typeof configuration !== "object") {
      return cb(new Error("comm.send: invalid configuration"));
    }
    let gid = context.gid
    distribution.local.groups.get(gid, (e, group) => {
      if (e) {
        return cb(e, null);
      }
      let pending = Object.keys(group).length;
      if (!pending) {
        return cb(new Error("comm.send: missing group"))
      }
      for (const [sid, node] of Object.entries(group)) {
        /** @type {{node: any, service: string, method: string, gid?: string}} */
        const remote = {node, service: configuration.service, method: configuration.method};
        if (typeof configuration.gid === "string" && configuration.gid) {
          remote.gid = configuration.gid;
        }
        const nodeCallback = (sid) => (e, v) => {
          if (e instanceof Error) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            return cb(failed, succeeded)
          }
        }
        distribution.local.comm.send(message, remote, nodeCallback(sid));
      }
    })
  }

  return {send};
}

module.exports = comm;
