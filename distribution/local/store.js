// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 *
 * @typedef {Object} StoreConfig
 * @property {?string} key
 * @property {?string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */

/* Notes/Tips:

- Use absolute paths to make sure they are agnostic to where your code is running from!
  Use the `path` module for that.
*/
const fs = require("node:fs");
const path = require("node:path");
const util = require("../util/util.js");
const serialization = require("../util/serialization.js");
const { config } = require("yargs");

const dir = path.resolve("store"); 

function toAlNum(key) {
  return key.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  const cb = typeof callback === "function" ? callback : () => {};
  const serialized = serialization.serialize(state)
  let folder = null;
  let key;
  if (configuration && typeof(configuration) === "object") {
    key = configuration.key
    folder = configuration.gid
  } else if (typeof(configuration) === "string") {
    key = configuration
  }
  if (key) {
    key = toAlNum(key)
  } else {
    key = toAlNum(util.id.getID(state))
  }
  let folderPath = dir
  if (folder) {
    folderPath = path.join(dir, folder)
    fs.mkdir(folderPath, { recursive: true }, e => {
      if (e) {
        return cb(new Error(e.message))
      }
      fs.writeFile(path.join(folderPath, key), serialized, (e) => {
        if (e) {
          return cb(new Error(e.message))
        }
        return cb(null, state)
      })
    });
  } else {
    fs.writeFile(path.join(folderPath, key), serialized, (e) => {
      if (e) {
        return cb(new Error(e.message))
      }
      return cb(null, state)
    })
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  const cb = typeof callback === "function" ? callback : () => {};
  let folderPath = dir
  let key 
  if (configuration && typeof configuration === "object") {
    folderPath = path.join(dir, configuration.gid)
    key = configuration.key
  } else if (typeof configuration === "string") {
    key = configuration
  }
  if (!key) {
    return fs.readdir(folderPath, (e, files) => {
      if (e) {
        return cb(new Error(e.message));
      }
      return cb(null, files);
    });
  } 
  key = toAlNum(key);
  let fullPath = path.join(folderPath, key)
  fs.readFile(fullPath, "utf8", (e, v) => {
    if (e) {
      return cb(new Error(e.message))
    } 
    return cb(null, serialization.deserialize(v))
  })
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  const cb = typeof callback === "function" ? callback : () => {};
  let folderPath = dir
  let key 
  if (configuration && typeof configuration === "object") {
    folderPath = path.join(dir, configuration.gid)
    key = configuration.key
  } else if (typeof configuration === "string") {
    key = configuration
  }
  if (!key) {
    return cb(new Error("incorrect type for config"))
  } 
  key = toAlNum(key);
  let fullPath = path.join(folderPath, key)
  fs.readFile(fullPath, "utf8", (e, v) => {
    if (e) {
      return cb(new Error(e.message))
    } 
    fs.unlink(fullPath, (e) => {
      if (e) {
        return cb(new Error(e.message))
      }
      return cb(null, serialization.deserialize(v))
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

module.exports = {put, get, del, append};
