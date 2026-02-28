// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").ID} ID
 * @typedef {import("../types.js").NID} NID
 * @typedef {import("../types.js").SID} SID
 * @typedef {import("../types.js").Hasher} Hasher
 */

const assert = require('assert');
const crypto = require('crypto');
const { id } = require("./util.js");

/**
 * @param {any} obj
 * @returns {ID}
 */
function getID(obj) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(obj));
  return hash.digest('hex');
}

/**
 * The NID is the SHA256 hash of the JSON representation of the node
 * @param {Node} node
 * @returns {NID}
 */
function getNID(node) {
  node = {ip: node.ip, port: node.port};
  return getID(node);
}

/**
 * The SID is the first 5 characters of the NID
 * @param {Node} node
 * @returns {SID}
 */
function getSID(node) {
  return getNID(node).substring(0, 5);
}

/**
 * @param {any} message
 * @returns {string}
 */
function getMID(message) {
  const msg = {};
  msg.date = new Date().getTime();
  msg.mss = message;
  return getID(msg);
}

/**
 * @param {string} id
 * @returns {bigint}
 */
function idToNum(id) {
  assert(typeof id === 'string', 'idToNum: id is not in KID form!');
  const trimmed = id.startsWith('0x') ? id.slice(2) : id;
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return BigInt(`0x${trimmed}`);
  }
  return BigInt(id);
}

/** @type { Hasher } */
const naiveHash = (kid, nids) => {
  const sortedNids = [...nids].sort();
  const index = Number(idToNum(kid) % BigInt(sortedNids.length));
  return sortedNids[index];
};

function bisectRight(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][0] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** @type { Hasher } */
const consistentHash = (kid, nids) => {
  const kidNum = idToNum(kid)
  let nidsToNums = []
  for (const nid of nids) {
    nidsToNums.push([idToNum(nid), nid])
  }
  let sortedNidsToNums = nidsToNums.sort()
  let index = bisectRight(sortedNidsToNums, kidNum) % sortedNidsToNums.length;
  return sortedNidsToNums[index][1]
};

/** @type { Hasher } */
const rendezvousHash = (kid, nids) => {
  let combined = []
  for (const nid of nids) {
    combined.push([idToNum(getID(kid + nid)), nid])
  }
  let sortedCombined = combined.sort() 
  return sortedCombined[sortedCombined.length - 1][1]
};

module.exports = {
  getID,
  getNID,
  getSID,
  getMID,
  naiveHash,
  consistentHash,
  rendezvousHash,
};
