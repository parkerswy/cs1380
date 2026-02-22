// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Status
 * @property {(configuration: string, callback: Callback) => void} get
 * @property {(configuration: Node, callback: Callback) => void} spawn
 * @property {(callback: Callback) => void} stop
 */

const local = require("../local/local.js");
const { toRemote } = require("../util/wire.js");

/**
 * @param {Config} config
 * @returns {Status}
 */
function status(config) {
  const context = {};
  context.gid = config.gid || 'all';
  context.node = config.node

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    if (typeof callback !== 'function') {
      return;
    }
    if (typeof configuration !== "string") {
      return callback(new Error('status.get: invalid property'));
    }
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
        return callback(e);
      }
      if (!Object.keys(group).length) {
        return callback(new Error("comm.send: missing group"), {})
      }
      /** @type {Record<string, Error>} */
      let failed = {};
      /** @type {Record<string, any>} */
      let succeeded = {};
      let pending = Object.keys(group).length
      if (pending == 0) {
        return callback(new Error("missing groups"))
      }
      for (const [sid, node] of Object.entries(group)) {
        const remote = {node: node, service: 'status', method: 'get'};
        distribution.local.comm.send([configuration], remote, (e, v) => {
          if (e) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            switch (configuration) {
              case "heapTotal":
                let total = 0;
                for (const [_, val] of Object.entries(succeeded)) {
                  total += val
                }
                return callback(failed, total)
              case "sid":
              case "nid":
                return callback(failed, Object.values(succeeded))
              default:
                return callback(failed, succeeded)
            }
          }
        });
      }
    })
  }

  /**
   * @param {Node} configuration
   * @param {Callback} callback
   */
  function spawn(configuration, callback) {
    distribution.local.status.spawn(configuration, (e, v) => {
      if (e) {
        return callback(e)
      }
      distribution.local.groups.add(context.gid, configuration, (e,v) => {
        if (e) {
          return callback(e)
        }
        return callback(e,v)
      })
    })
  }

  /**
   * @param {Callback} callback
   */
  function stop(callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
        return callback(e)
      }
      for (const [_, node] of Object.entries(group)) {
        if (node == context.node) {
          continue
        }
        const remote = {node: node, service: 'status', method: 'stop'};
        distribution.local.comm.send([], remote, (e, v) => {
          if (e) {
            return callback(e)
          }
          return callback(e, v)
        })
      }
    })
  }

  return {get, stop, spawn};
}

module.exports = status;