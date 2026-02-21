// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 *
 * @typedef {Object} Routes
 * @property {(service: object, name: string, callback: Callback) => void} put
 * @property {(configuration: string, callback: Callback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Routes}
 */
function routes(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {object} service
   * @param {string} name
   * @param {Callback} callback
   */
  function put(service, name, callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e instanceof Error) {
        return callback(e);
      }
      let pending = Object.keys(group).length
      if (pending == 0) {
        return callback(new Error("missing groups"))
      }
      /** @type {Record<string, Error>} */
      let failed = {};
      /** @type {Record<string, any>} */
      let succeeded = {};
      for (const [sid, node] of Object.entries(group)) {
        const remote = {node: node, service: "routes", method: "put"}
        distribution.local.comm.send([service, name], remote, (e, v) => {
          if (e instanceof Error) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            if (Object.keys(failed).length === 0) {
              return callback(null, succeeded)
            }
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function rem(configuration, callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e instanceof Error) {
        return callback(e);
      }
      let pending = Object.keys(group).length
      if (pending == 0) {
        return callback(new Error("missing groups"))
      }
      /** @type {Record<string, Error>} */
      let failed = {};
      /** @type {Record<string, any>} */
      let succeeded = {};
      for (const [sid, node] of Object.entries(group)) {
        const remote = {node: node, service: "routes", method: "rem"}
        distribution.local.comm.send([configuration], remote, (e, v) => {
          if (e instanceof Error) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            if (Object.keys(failed).length === 0) {
              return callback(null, succeeded)
            }
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  return {put, rem};
}

module.exports = routes;
