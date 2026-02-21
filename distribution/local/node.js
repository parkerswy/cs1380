// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Callback} Callback
 */
const http = require('node:http');
const url = require('node:url');
const log = require('../util/log.js');
const yargs = require('yargs/yargs');
const distribution = globalThis.distribution

/**
 * @returns {Node}
 */
function setNodeConfig() {
  const args = yargs(process.argv)
      .help(false)
      .version(false)
      .parse();

  let maybeIp; let maybePort; let maybeOnStart;
  if (typeof args.ip === 'string') {
    maybeIp = args.ip;
  }
  if (typeof args.port === 'string' || typeof args.port === 'number') {
    maybePort = parseInt(String(args.port), 10);
  }

  if (args.help === true || args.h === true) {
    console.log('Node usage:');
    console.log('  --ip <ip address>      The ip address to bind the node to');
    console.log('  --port <port>          The port to bind the node to');
    console.log('  --config <config>      The serialized config string');
    process.exit(0);
  }

  if (typeof args.config === 'string') {
    let config = undefined;
    try {
      config = globalThis.distribution.util.deserialize(args.config);
    } catch (error) {
      try {
        config = JSON.parse(args.config);
      } catch {
        console.error('Cannot deserialize config string: ' + args.config);
        process.exit(1);
      }
    }

    if (typeof config?.ip === 'string') {
      maybeIp = config?.ip;
    }
    if (typeof config?.port === 'number') {
      maybePort = config?.port;
    }
    if (typeof config?.onStart === 'function') {
      maybeOnStart = config?.onStart;
    }
  }

  // Default values for config
  maybeIp = maybeIp ?? '127.0.0.1';
  maybePort = maybePort ?? 1234;

  return {
    ip: maybeIp,
    port: maybePort,
    onStart: maybeOnStart,
  };
}
/*
    The start function will be called to start your node.
    It will take a callback as an argument.
    After your node has booted, you should call the callback.
*/


/**
 * @param {(err?: Error | null) => void} callback
 * @returns {void}
 */
function start(callback) {
  const existing = globalThis.distribution?.node?.server;
  if (existing && existing.listening) {
    callback(null);
    return;
  }
  if (existing && !existing.listening) {
    try { existing.close(); } catch {}
  }

  distribution.node.counts ??= 0;
  const server = http.createServer((req, res) => {
    distribution.node.counts += 1;
    /* Your server will be listening for PUT requests. */
    if (req.method !== "PUT") {
      const body = distribution.util.serialize([new Error("request not supported"), null]);
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    /*
      The path of the http request will determine the service to be used.
      The url will have the form: http://node_ip:node_port/service/method
    */
    const u = new URL(req.url, `http://${distribution.node.config.ip}:${distribution.node.config.port}`)
    const pathname = u.pathname
    const parts = pathname.split('/').filter(Boolean); 
    const gid = parts[0];
    const service = parts[1];
    const method = parts[2];

    /*
      A common pattern in handling HTTP requests in Node.js is to have a
      subroutine that collects all the data chunks belonging to the same
      request. These chunks are aggregated into a body variable.

      When the req.on('end') event is emitted, it signifies that all data from
      the request has been received. Typically, this data is in the form of a
      string. To work with this data in a structured format, it is often parsed
      into a JSON object using JSON.parse(body), provided the data is in JSON
      format.

      Our nodes expect data in JSON format.
    */

    /** @type {any[]} */
    const body = [];

    req.on('data', (chunk) => {
      body.push(chunk)
    });

    req.on('end', () => {
      const raw = Buffer.concat(body).toString("utf8");
        let payload;
        try {
          payload = raw.length ? distribution.util.deserialize(raw) : [];
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          let body = distribution.util.serialize([new Error("Invalid payload"), null]);
          res.end(body);
          return;
        }
      
      if (!Array.isArray(payload)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(distribution.util.serialize([new Error("Invalid payload"), null]));
        return;
      }

      if (!service || !method || !gid) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(distribution.util.serialize([new Error("Bad request"), null]));
        return;
      }
      /*
        Here, you can handle the service requests.
        Use the local routes service to get the service you need to call.
        You need to call the service with the method and arguments provided in the request.
        Then, you need to serialize the result and send it back to the caller.
      */

      distribution.local.routes.get({service: service, gid: gid}, (error, sv) => {
        if (error || !sv) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(distribution.util.serialize([new Error("invalid service"), null]));
          return;
        }
        const fn = sv?.[method];
        if (!fn) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(distribution.util.serialize([new Error("invalid service"), null]));
          return;
        }
        fn(...payload, (err, val) => {
          if (err instanceof Error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            let body = distribution.util.serialize([err, null]);
            res.end(body);
            return
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(distribution.util.serialize([err ?? null, val]));
          return
        })
      })

    });
  });

  /*
    Your server will be listening on the port and ip specified in the config
    You'll be calling the `callback` callback when your server has successfully
    started.

    At some point, we'll be adding the ability to stop a node
    remotely through the service interface.
  */

  // Important: allow tests to access server
  globalThis.distribution.node.server = server;
  const config = globalThis.distribution.node.config;

  server.once('listening', () => {
    callback(null);
  });

  server.once('error', (error) => {
    callback(error);
  });

  server.listen(config.port, config.ip);
}

module.exports = {start, config: setNodeConfig()};
