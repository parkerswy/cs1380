// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const { removeAllListeners } = require("node:cluster");
const http = require('node:http');
const distribution = globalThis.distribution;
const net = require("node:net");

/**
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {Node} node
 * @property {string} [gid]
 */

/**
 * @param {Array<any>} message
 * @param {Target} remote
 * @param {(error: Error, value?: any) => void} callback
 * @returns {void}
 */
function send(message, remote, callback) {
  const cb = typeof callback === "function" ? callback : () => {};

  if (!Array.isArray(message)) {
    return cb(new Error("comm.send: invalid message (expected array)"));
  }
  if (!remote || typeof remote !== "object") {
    return cb(new Error("comm.send: invalid remote"));
  }
  if (!remote.node || typeof remote.node !== "object") {
    return cb(new Error("comm.send: missing node"));
  }
  if (typeof remote.service !== "string" || !remote.service) {
    return cb(new Error("comm.send: missing service"));
  }
  if (typeof remote.method !== "string" || !remote.method) {
    return cb(new Error("comm.send: missing method"));
  }

  const ip = remote.node.ip;
  const port = remote.node.port;
  if (typeof ip !== "string" || net.isIP(ip) === 0) {
    return cb(new Error("comm.send: invalid ip"));
  }

  const portNum = typeof port === "number" ? port : Number(port);
  if (!Number.isFinite(portNum)) {
    return cb(new Error("comm.send: invalid port"));
  }

  const gid = typeof remote.gid === "string" && remote.gid ? remote.gid : "local";
  const path = `/${gid}/${remote.service}/${remote.method}`;
  let payload;
  try {
    payload = distribution.util.serialize(message);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return cb(new Error(`comm.send: cannot serialize payload: ${err.message}`));
  }

  const req = http.request(
    {
      method: "PUT",
      host: ip,
      port: portNum,
      path,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (res) => {
      /** @type {Buffer[]} */
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");

        let decoded;
        try {
          decoded = raw.length ? distribution.util.deserialize(raw) : [null, undefined];
        } catch (e) {
          try {
            decoded = raw.length ? JSON.parse(raw) : [null, undefined];
          } catch {
            return cb(new Error(`comm.send: bad response (status ${res.statusCode ?? "?"})`));
          }
        }

        const e0 = Array.isArray(decoded) ? decoded[0] : new Error("comm.send: response not [e,v]");
        const v0 = Array.isArray(decoded) ? decoded[1] : undefined;

        if (e0) {
          const err = e0 instanceof Error ? e0 : new Error(String(e0));
          return cb(err, v0);
        }
        return cb(null, v0);
      });
    }
  );

  req.on("error", (e) => {
    const err = e instanceof Error ? e : new Error(String(e));
    cb(new Error(`node.js req error: ${err.message}`));
  });

  req.end(payload);
}

module.exports = {send};
