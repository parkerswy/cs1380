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
const { deepStrictEqual } = require("node:assert");

const baseDir = path.resolve("store");
function getDir() {
  const nodeConfig = globalThis.distribution && globalThis.distribution.node &&
    globalThis.distribution.node.config;
  if (nodeConfig && nodeConfig.port) {
    return path.join(baseDir, String(nodeConfig.port));
  }
  return baseDir;
}


function toAlNum(key) {
  return key.replace(/[^a-zA-Z0-9]/g, "");
}

const appendLocks = new Map();
function withLock(lockKey, fn) {
  const queue = appendLocks.get(lockKey) || Promise.resolve();
  const next = queue.then(() => new Promise(fn));
  appendLocks.set(lockKey, next.catch(() => {}));
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
  let folderPath = getDir()
  if (folder) {
    folderPath = path.join(getDir(), folder)
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
  let folderPath = getDir()
  let key
  if (configuration && typeof configuration === "object") {
    folderPath = path.join(getDir(), configuration.gid)
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
  let folderPath = getDir()
  let key
  if (configuration && typeof configuration === "object") {
    folderPath = path.join(getDir(), configuration.gid)
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
  const cb = typeof callback === "function" ? callback : () => {};
  let key;
  let folder;
  if (configuration && typeof(configuration) === "object") {
    key = configuration.key
    folder = configuration.gid
  } else {
    return cb(new Error("wrong config type"))
  }
  if (key) {
    key = toAlNum(key)
  } else {
    key = toAlNum(util.id.getID(state))
  }
  let folderPath = path.join(getDir(), folder)
  const lockKey = path.join(folderPath, key)
  withLock(lockKey, (resolve) => {
    fs.mkdir(folderPath, { recursive: true }, e => {
      if (e) {
        resolve();
        return cb(new Error(e.message))
      }
      fs.readFile(path.join(folderPath, key), (e, v) => {
        let deserialized
        let serialized
        if (e) {
          serialized = serialization.serialize([state])
        } else {
          deserialized = serialization.deserialize(v.toString())
          deserialized.push(state)
          serialized = serialization.serialize(deserialized)
        }
        fs.writeFile(path.join(folderPath, key), serialized, (e) => {
          resolve();
          if (e) {
            return cb(new Error(e.message))
          }
          return cb(null, state)
        })
      })
    });
  });
}

module.exports = {put, get, del, append};
