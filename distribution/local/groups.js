// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

const { id } = require("../util/util.js")
const distribution = globalThis.distribution;
const all = require("../all/all.js")

let allGroups = {}
allGroups["all"] = {}
allGroups["all"][id.getSID(distribution.node.config)] = distribution.node.config;

/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  const cb = (typeof callback === "function") ? callback : () => {};
  if (name in allGroups) {
    return cb(null, allGroups[name])
  } 
  return cb(new Error("no such group name"))
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  const cb = (typeof callback === "function") ? callback : () => {};
  let gid
  if (typeof config == "string") {
    gid = config
  } else {
    gid = config.gid
  }
  allGroups[gid] = group;
  distribution[gid] = all.setup({gid})
  return cb(null, group);
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  const cb = (typeof callback === "function") ? callback : () => {};
  if (name in allGroups) {
    let group = allGroups[name]
    delete allGroups[name]
    delete distribution[name];
    return cb(null, group)
  }
  return cb(new Error("no group with specified name"))
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  const cb = (typeof callback === "function") ? callback : () => {};
  if (name in allGroups) {
    let sid = id.getSID(node)
    allGroups[name][sid] = node
    cb(null, allGroups[name])
    return allGroups[name]
  }
  cb(new Error("missing group"))
  return undefined
};

/**
 * @param {string} name
 * @param {string} node
 * @param {Callback} callback
 */
function rem(name, node, callback) {
  const cb = (typeof callback === "function") ? callback : () => {};
  if ((name in allGroups) && (node in allGroups[name])) {
    delete allGroups[name][node];
    cb(null, allGroups[name])
    return allGroups[name]
  }
  cb(new Error("missing group or node"))
  return undefined
};

module.exports = {get, put, del, add, rem};
