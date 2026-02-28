// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Hasher} Hasher
 * @typedef {import("../types.js").Node} Node
 */

const { id } = require("../util/util.js");

/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */


/**
 * @param {Config} config
 */
function store(config) {
  const context = {
    gid: config.gid || 'all',
    hash: config.hash || globalThis.distribution.util.id.naiveHash,
    subset: config.subset,
  };

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    let gid = context.gid
    let key = configuration
    if (configuration && typeof configuration === "object") {
      gid = configuration.gid
      key = configuration.key
    }
    distribution.local.groups.get(gid, (e, group) => {
      if (e) {
        return cb(e)
      }
      if (key == null) {
        /** @type {Record<string, Error>} */
        const failed = {}
        const keys = []
        let pending = Object.keys(group).length
        if (!pending) {
          return cb(new Error("missing group"))
        }
        for (const [sid, nodeInfo] of Object.entries(group)) {
          const remote = {node: nodeInfo, service: "store", method: "get"}
          const groupConfig = {key: null, gid: gid}
          distribution.local.comm.send([groupConfig], remote, (err, value) => {
            if (err instanceof Error) {
              failed[sid] = err
            } else if (Array.isArray(value)) {
              keys.push(...value)
            }
            if (--pending === 0) {
              return cb(failed, keys)
            }
          })
        }
        return
      }
      if (!key) {
        return cb(new Error("incorrect type for config"))
      }
      const kid = id.getID(key)
      const node = context.hash(kid, Object.keys(group))
      const remote = {node: group[node], service: "store", method: "get"}
      const groupConfig = {key: key, gid: gid}
      distribution.local.comm.send([groupConfig], remote, (e, v) => {
        if (e) {
          return cb(e)
        }
        return cb(null, v)
      })
    })
  }


  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    let gid = context.gid
    let key = configuration
    if (configuration && typeof configuration === "object") {
      gid = configuration.gid
      key = configuration.key
    } else if (!configuration) {
      key = id.getID(state)
    }
    if (!key) {
      return cb(new Error("incorrect type for config"))
    } 
    distribution.local.groups.get(gid, (e, group) => {
      if (e) {
        return cb(e)
      }
      const kid = id.getID(key)
      const node = context.hash(kid, Object.keys(group))
      const remote = {node: group[node], service: "store", method: "put"}
      const groupConfig = {key: key, gid: gid}
      distribution.local.comm.send([state, groupConfig], remote, (e, v) => {
        if (e) {
          return cb(e)
        }
        return cb(null, v)
      })
    })
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    let gid = context.gid
    if (configuration && typeof configuration === "object") {
      gid = configuration.gid
      configuration = configuration.key
    } 
    if (!configuration) {
      return cb(new Error("incorrect type for config"))
    } 
    distribution.local.groups.get(gid, (e, group) => {
      if (e) {
        return cb(e)
      }
      const kid = id.getID(configuration)
      const node = context.hash(kid, Object.keys(group))
      const groupConfig = {key: configuration, gid: gid}
      const remote = {node: group[node], service: "store", method: "del"}
      distribution.local.comm.send([groupConfig], remote, (e, v) => {
        if (e) {
          return cb(e)
        }
        return cb(null, v)
      })
    })
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error('store.reconf not implemented'));
  }

  /* For the distributed store service, the configuration will
          always be a string */
  return {get, put, append, del, reconf};
}

module.exports = store;
