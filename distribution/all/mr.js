// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").NID} NID
 */

const { id } = require("../util/util.js");
const { createRPC } = require("../util/wire.js");
const store = require("./store.js");

/**
 * Map functions used for mapreduce
 * @callback Mapper
 * @param {string} key
 * @param {any} value
 * @returns {object[]}
 */

/**
 * Reduce functions used for mapreduce
 * @callback Reducer
 * @param {string} key
 * @param {any[]} value
 * @returns {object}
 */

/**
 * @typedef {Object} MRConfig
 * @property {Mapper} map
 * @property {Reducer} reduce
 * @property {string[]} keys
 *
 * @typedef {Object} Mr
 * @property {(configuration: MRConfig, callback: Callback) => void} exec
 */


/*
  Note: The only method explicitly exposed in the `mr` service is `exec`.
  Other methods, such as `map`, `shuffle`, and `reduce`, should be dynamically
  installed on the remote nodes and not necessarily exposed to the user.
*/

/**
 * @param {Config} config
 * @returns {Mr}
 */
function mr(config) {
  const context = {
    gid: config.gid || 'all',
  };

  /**
   * @param {MRConfig} configuration
   * @param {Callback} callback
   * @returns {void}
   */
  function exec(configuration, callback) {
    const mrID = id.getID(`${configuration}${Date.now()}`);
    const mrGid = `mr${mrID}`;

    /*
      MapReduce steps:
      1) Setup: register a service `mr-<id>` on all nodes in the group. The service implements the map, shuffle, and reduce methods.
      2) Map: make each node run map on its local data and store them locally, under a different gid, to be used in the shuffle step.
      3) Shuffle: group values by key using store.append.
      4) Reduce: make each node run reduce on its local grouped values.
      5) Cleanup: remove the `mr-<id>` service and return the final output.

      Note: Comments inside the stencil describe a possible implementation---you should feel free to make low- and mid-level adjustments as needed.
    */
    const mrService = {
      gid: context.gid,
      mapper: configuration.map,
      reducer: configuration.reduce,
      map: function(
          /** @type {string} */ mrGid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Map should read the node's local keys under the mrGid gid and write to store under gid `${mrID}_map`.
        // Expected output: array of objects with a single key per object.
        distribution.local.store.get({ key: null, gid: this.gid }, (e, keys) => {
          if (e) return callback(null, []);
          
          let results = [];
          let pending = keys.length;
          if (!pending) return callback(null, []);

          for (const fileKey of keys) {
            distribution.local.store.get({ key: fileKey, gid: this.gid }, (e, value) => {
              if (e) { if (--pending === 0) callback(null, results); return; }
              let mapped = this.mapper(fileKey, value);
              if (!Array.isArray(mapped)) {
                mapped = [mapped]
              }
              let numMapped = mapped.length 
              for (const map of mapped) {
                let k = Object.keys(map)[0]
                let v = map[k]
                distribution.local.store.append(v, {key : k, gid: `${mrID}_map`}, (e, v) => {
                  if (--numMapped === 0 && --pending === 0) {
                    callback(null, results); 
                  }
                })
              }
            });
          };
        });
      },
      shuffle: function(
          /** @type {string} */ gid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Fetch the mapped values from the local store
        // Shuffle groups values by key (via store.append).
        distribution.local.store.get({key : null, gid: `${mrID}_map`}, (e, keys) => {
          if (e || !keys || !keys.length) {
            return callback(null, [])
          }
          distribution.local.groups.get(this.gid, (e, nodes) => {
            let nids = {}
            for (const node of Object.values(nodes)) {
              nids[distribution.util.id.getNID(node)] = node
            }
            let pending = keys.length;
            for (const key of keys) {
              let kid = distribution.util.id.getID(key)
              let nid = distribution.util.id.consistentHash(kid, Object.keys(nids))
              distribution.local.store.get({key: key, gid: `${mrID}_map`}, (e, fileContent) => {
                let config = {service: "store", method: "append", node: nids[nid]}
                distribution.local.comm.send([fileContent, {key: key, gid: `${mrID}_reduce`}], config, (e, v) => {
                  if (--pending === 0) {
                    callback(null, [])
                  }
                })
              })
            }
          })
        })
      },
      reduce: function(
          /** @type {string} */ gid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Fetch grouped values from local store, apply reducer, and return final output.
        distribution.local.store.get({key: null, gid: `${mrID}_reduce`}, (e, keys) => {
          if (e || !keys || !keys.length) {
            return callback(null, [])
          }
          let res = []
          let pending = keys.length
          if (pending === 0) {
            return callback(null, res)
          }
          for (const key of keys) {
            distribution.local.store.get({key: key, gid: `${mrID}_reduce`}, (e, v) => {
              if (e) {
                return callback(e)
              }
              res.push(this.reducer(key, v.flat()))
              if (--pending === 0) {
                callback(null, res)
              }
            })
          }
        })
      },
    };


    // Register the mr service on all nodes in the group and execute in sequence: map, shuffle, reduce.
    distribution.local.routes.put(mrService, `mr-${mrID}`, (e, v) => {
      distribution.local.groups.get(context.gid, (e, nodes) => {
        const nodeList = Object.values(nodes);
        let pending = nodeList.length
        let res = []
        for (const node of nodeList) {
          let remote = {node: node, service: "routes", method: "put"}
          distribution.local.comm.send([mrService, `mr-${mrID}`], remote, (e, v) => {
            if (e) {
              return callback(e)
            }
            res.push(v)
            if (--pending === 0) {
              let pending2 = nodeList.length
              for (const node of nodeList) {
                let remote = {node: node, service: `mr-${mrID}`, method: "map"}
                distribution.local.comm.send([mrGid, mrID], remote, (e, v) => {
                  if (e) {
                    return callback(e)
                  }
                  if (--pending2 === 0) {
                    let pending3 = nodeList.length
                    for (const node of nodeList) {
                      let remote = {node: node, service: `mr-${mrID}`, method: "shuffle"}
                      distribution.local.comm.send([mrGid, mrID], remote, (e, v) => {
                        if (e) {
                          return callback(e)
                        }
                        if (--pending3 === 0) {
                          let pending4 = nodeList.length
                          let res2 = []
                          for (const node of nodeList) {
                            let remote = {node: node, service: `mr-${mrID}`, method: "reduce"}
                            distribution.local.comm.send([mrGid, mrID], remote, (e, v) => {
                              if (e) {
                                return callback(e)
                              }
                              res2 = res2.concat(v)
                              if (--pending4 === 0) {
                                return callback(null, res2)
                              } 
                            })
                          }
                        }
                      })
                    }
                  }
                })
              }
            }
          })
        }
      })
    })
      
  }

  return {exec};
}

module.exports = mr;
