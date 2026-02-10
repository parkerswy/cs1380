/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */
const distribution = globalThis.distribution

/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function get(configuration, callback) {
  if (typeof callback !== 'function') {
    return;
  }
  let service;
  if (typeof configuration === 'string') {
    service = configuration;
  } else if (configuration && typeof configuration === 'object' && typeof configuration.service === 'string') {
    service = configuration.service;
  }
  if (!service) {
    return callback(new Error('routes.get: invalid configuration'), undefined);
  }
  switch (service) {
    case "status":
    case "comms":
    case "route":
      return callback(null, distribution.local[configuration]);
    default:
      return callback(new Error('routes.get: invalid service'), undefined);
  }
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  if (typeof callback !== "function") return;
  if (!service || typeof service !== "object") {
    return callback(new Error("routes.put: invalid service"), undefined);
  }
  distribution.local[configuration] = service;
  callback(null, configuration);
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  if (typeof callback !== "function") return;
  if (typeof configuration !== "string") {
    return callback(new Error("Name is not a string."), undefined);
  }
  if (!(configuration in distribution.local)) {
    return callback(new Error("Invalid name. No service with the specified name exists."), undefined);
  }
  let obj = distribution.local[configuration]
  delete distribution.local[configuration];
  return callback(null, obj);
}

module.exports = {get, put, rem};
