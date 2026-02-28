// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */


/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 *
 * @typedef {Object} Mem
 * @property {(configuration: SimpleConfig, callback: Callback) => void} get
 * @property {(state: any, configuration: SimpleConfig, callback: Callback) => void} put
 * @property {(state: any, configuration: SimpleConfig, callback: Callback) => void} append
 * @property {(configuration: SimpleConfig, callback: Callback) => void} del
 * @property {(configuration: Object.<string, Node>, callback: Callback) => void} reconf
 */
const { id } = require("../util/util.js");

/**
 * @param {Config} config
 * @returns {Mem}
 */
function mem(config) {
  const context = {};
  context.gid = config.gid || 'all';
  context.hash = config.hash || globalThis.distribution.util.id.naiveHash;

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    let gid = context.gid;
    let key = configuration;
    if (configuration !== null && typeof configuration === "object") {
      gid = configuration.gid;
      key = configuration.key;
    }
    distribution.local.groups.get(gid, (e, group) => {
      if (e) {
        return cb(e)
      }
      if (key == null) {
        /** @type {Record<string, Error>} */
        const failed = {};
        const keys = [];
        let pending = Object.keys(group).length;
        if (!pending) {
          return cb(new Error("comm.send: missing group"));
        }
        for (const [sid, nodeInfo] of Object.entries(group)) {
          const remote = {node: nodeInfo, service: "mem", method: "get"};
          const groupConfig = {key: null, gid};
          distribution.local.comm.send([groupConfig], remote, (err, value) => {
            if (err instanceof Error) {
              failed[sid] = err;
            } else if (Array.isArray(value)) {
              keys.push(...value);
            }
            if (--pending === 0) {
              return cb(failed, keys);
            }
          });
        }
        return;
      }
      if (!key) {
        return cb(new Error("incorrect type for config"))
      }
      const kid = id.getID(key)
      const node = context.hash(kid, Object.keys(group))
      if (!(node in group)) {
        return cb(new Error("no such node in group"))
      }
      const remote = {node: group[node], service: "mem", method: "get"}
      const groupConfig = {key, gid}
      distribution.local.comm.send([groupConfig], remote, (e, v) => {
        if (e) {
          return cb(e)
        }
        return cb(null, v)
      })
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    let gid = context.gid;
    if (configuration === null) {
      configuration = id.getID(state)
    } else if (typeof configuration === "object") {
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
      if (!(node in group)) {
        return cb(new Error("no such node in group"))
      }
      const remote = {node: group[node], service: "mem", method: "put"}
      distribution.local.comm.send([state, configuration], remote, (e, v) => {
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
    return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (typeof configuration === "object") {
      configuration = configuration.key
    } 
    if (!configuration) {
      return cb(new Error("incorrect type for config"))
    } 
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
        return cb(e)
      }
      const kid = id.getID(configuration)
      const node = context.hash(kid, Object.keys(group))
      if (!(node in group)) {
        return cb(new Error("no such node in group"))
      }
      const remote = {node: group[node], service: "mem", method: "del"}
      distribution.local.comm.send([configuration], remote, (e, v) => {
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
    return callback(new Error('mem.reconf not implemented'));
  }
  /* For the distributed mem service, the configuration will
          always be a string */
  return {
    get,
    put,
    append,
    del,
    reconf,
  };
}

module.exports = mem;
