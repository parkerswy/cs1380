// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Groups
 * @property {(config: Config | string, group: Object.<string, Node>, callback: Callback) => void} put
 * @property {(name: string, callback: Callback) => void} del
 * @property {(name: string, callback: Callback) => void} get
 * @property {(name: string, node: Node, callback: Callback) => void} add
 * @property {(name: string, node: string, callback: Callback) => void} rem
 */

const { fail } = require("yargs");
const distribution = globalThis.distribution;

/**
 * @param {Config} config
 * @returns {Groups}
 */
function groups(config) {
  const context = {gid: config.gid || 'all'};

  /**
   * @param {Config | string} config
   * @param {Object.<string, Node>} group
   * @param {Callback} callback
   */
  function put(config, group, callback) {
    distribution.local.groups.get(context.gid, (e, g) => {
      if (e) {
        return callback(e);
      }
      let pending = Object.keys(g).length
      if (pending == 0) {
        return callback(new Error("missing groups"))
      }
      /** @type {Record<string, Error>} */
      let failed = {};
      /** @type {Record<string, any>} */
      let succeeded = {};
      for (const [sid, node] of Object.entries(g)) {
        const remote = {node: node, service: "groups", method: "put"}
        distribution.local.comm.send([config, group], remote, (e, v) => {
          if (e) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function del(name, callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
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
        const remote = {node: node, service: "groups", method: "del"}
        distribution.local.comm.send([name], remote, (e, v) => {
          if (e) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function get(name, callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
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
        const remote = {node: node, service: "groups", method: "get"}
        distribution.local.comm.send([name], remote, (e, v) => {
          if (e) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  /**
   * @param {string} name
   * @param {Node} node
   * @param {Callback} callback
   */
  function add(name, node, callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
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
      for (const [sid, nd] of Object.entries(group)) {
        const remote = {node: nd, service: "groups", method: "add"}
        distribution.local.comm.send([name, node], remote, (e, v) => {
          if (e) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  /**
   * @param {string} name
   * @param {string} node
   * @param {Callback} callback
   */
  function rem(name, node, callback) {
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
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
      for (const [sid, nd] of Object.entries(group)) {
        const remote = {node: nd, service: "groups", method: "rem"}
        distribution.local.comm.send([name, node], remote, (e, v) => {
          if (e) {
            failed[sid] = e
          } else {
            succeeded[sid] = v
          }
          if (--pending == 0) {
            return callback(failed, succeeded)
          }
        })
      }
    })
  }

  return {
    put, del, get, add, rem,
  };
}

module.exports = groups;
