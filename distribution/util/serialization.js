// @ts-check

function encode(object) {
  if (object instanceof Date) {
    return { type: "date", value: object.toISOString() };
  } else if (object === null) {
    return { type : "null", value : object};
  } else if (object === undefined) {
    return { type: "undefined" };
  } else if (typeof(object) === "string") {
    return { type: "string", value: object};
  } else if (typeof(object) === "number") {
    if (Number.isNaN(object)) {
      return { type: "number", value: "NaN" };
    }
    if (object === Infinity) {
      return { type: "number", value: "Infinity" };
    }
    if (object === -Infinity) {
      return { type: "number", value: "-Infinity" };
    }
    return { type: "number", value: object};
  } else if (typeof(object) === "boolean") {
    return { type: "boolean", value: object};
  } else if (typeof(object) === "function") {
    return { type: "function", value: object.toString() }
  } else if ((Array.isArray(object))) {
    return { type: "array", value : object.map(encode) }
  } else if (object instanceof Error) {
    return { type: "error", name: object.name, message: object.message }
  } else if (typeof (object) == "object") {
    let entries = {}; 
    for (const [key, val] of Object.entries(object)) {
      entries[key] = encode(val)
    }
    return { type: "object", value: entries}
  } 
  throw new Error("unsupported type")
}


/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  return JSON.stringify(encode(object))
}

function decode(object) {
  switch (object.type) {
    case "number":
      switch (object.value) {
        case "NaN":
          return NaN
        case "-Infinity":
          return -Infinity;
        case "Infinity":
          return Infinity
        default:
          return object.value
      }
    case "null":
    case "string":
    case "boolean":
      return object.value;
    case "undefined":
      return undefined;
    case "function":
      return new Function("return " + object.value)();
    case "array":
      return object.value.map(decode);
    case "date":
      return new Date(object.value);
    case "error":
      let error =  new Error(object.message);
      if (object.name) {
        error.name = object.name
      }
      return error
    case "object":
      let obj = {};
      for (const [key, val] of Object.entries(object.value)) {
        obj[key] = decode(val);
      } 
      return obj;
    default:
      throw new Error("unknown type")
  }
}

/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== 'string') {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }
  return decode(JSON.parse(string))
}

module.exports = {
  serialize,
  deserialize,
};
