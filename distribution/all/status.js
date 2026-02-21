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
    const cb = (typeof callback === "function") ? callback : () => {};
    if (!configuration || typeof configuration !== "object") {
      return cb(new Error("status.spawn: invalid configuration"));
    }
    if (typeof configuration.ip !== "string") {
      return cb(new Error("status.spawn: invalid ip"));
    }
    if (typeof configuration.port !== "number") {
      return cb(new Error("status.spawn: invalid port"));
    }
    distribution.local.groups.get(context.gid, (e, beforeGroup) => {
      if (e) return cb(e);
      const entries = Object.entries(beforeGroup || {});
      if (entries.length === 0) return cb(new Error("missing groups"));
      const coordinator = entries[0][1];
      const remoteSpawn = { node: coordinator, service: "status", method: "spawn" };
      distribution.local.comm.send([configuration], remoteSpawn, (eSpawn) => {
        if (eSpawn instanceof Error) return cb(eSpawn);
        distribution.local.groups.add(context.gid, configuration, (eAddLocal) => {
          if (eAddLocal instanceof Error) return cb(eAddLocal);
          /** @type {Record<string, Error>} */
          const failed = {};
          /** @type {Record<string, any>} */
          const succeeded = {};
          let pending = entries.length;
          for (const [sid, node] of entries) {
            const remoteAdd = { node, service: "groups", method: "add" };
            distribution.local.comm.send([context.gid, configuration], remoteAdd, (eAdd, vAdd) => {
              if (eAdd instanceof Error) failed[sid] = eAdd;
              else succeeded[sid] = vAdd;
              if (--pending !== 0) return;
              distribution.local.groups.get(context.gid, (eFinal, finalGroup) => {
                if (eFinal) return cb(eFinal);
                const remotePut = { node: configuration, service: "groups", method: "put" };
                distribution.local.comm.send([{ gid: context.gid }, finalGroup], remotePut, (ePut) => {
                  if (ePut instanceof Error) return cb(ePut);
                  if (Object.keys(failed).length === 0) return cb(null, configuration);
                  return cb(failed, configuration);
                });
              });
            });
          }
        });
      });
    });
  }

  /**
   * @param {Callback} callback
   */
  function stop(callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    distribution.local.groups.get(context.gid, (e, group) => {
      if (e) return cb(e);
      /** @type {Record<string, Error>} */
      const failed = {};
      /** @type {Record<string, any>} */
      const succeeded = {};
      const entries = Object.entries(group || {}).filter(([_, n]) => {
        return !(n && context.node && n.ip === context.node.ip && n.port === context.node.port);
      });
      if (entries.length === 0) return cb(null, succeeded);
      let pending = entries.length;
      for (const [sid, node] of entries) {
        const remote = { node, service: "status", method: "stop" };
        distribution.local.comm.send([], remote, (err, v) => {
          if (err instanceof Error) failed[sid] = err;
          else succeeded[sid] = v;
          if (--pending === 0) {
            if (Object.keys(failed).length === 0) return cb(null, succeeded);
            return cb(failed, succeeded);
          }
        });
      }
    });
}

  return {get, stop, spawn};
}

module.exports = status;
