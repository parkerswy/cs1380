// @ts-check

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const nodeUtil = require("util");

/**
 * @param {Function} fn
 * @returns {{ kind: "module"|"global"|"process"|"buffer", container: string, key: string } | null}
 */
function findNativeFunctionRef(fn) {
  /** @type {Array<{kind:"module"|"global"|"process"|"buffer", container:string, obj:any}>} */
  const containers = [
    { kind: "module", container: "fs", obj: fs },
    { kind: "module", container: "path", obj: path },
    { kind: "module", container: "os", obj: os },
    { kind: "module", container: "crypto", obj: crypto },
    { kind: "module", container: "util", obj: nodeUtil },
    { kind: "process", container: "process", obj: process },
    { kind: "buffer", container: "Buffer", obj: Buffer },
    { kind: "global", container: "globalThis", obj: globalThis },
  ];

  for (const c of containers) {
    const keys = Object.getOwnPropertyNames(c.obj);
    for (const k of keys) {
      try {
        if (c.obj[k] === fn) {
          return { kind: c.kind, container: c.container, key: k };
        }
      } catch {
      }
    }
  }
  return null;
}

/**
 * @param {{ kind: string, container: string, key: string }} ref
 * @returns {Function}
 */
function resolveNativeFunctionRef(ref) {
  let obj;
  switch (ref.kind) {
    case "module":
      obj = require(ref.container);
      break;
    case "global":
      obj = globalThis;
      break;
    case "process":
      obj = process;
      break;
    case "buffer":
      obj = Buffer;
      break;
    default:
      throw new Error("unknown native function ref kind");
  }
  const fn = obj[ref.key];
  if (typeof fn !== "function") {
    throw new Error("native function ref did not resolve to function");
  }
  return fn;
}

/**
 * @param {any} object
 * @param {WeakMap<object, number>} seen
 * @param {{v:number}} nextId
 * @returns {any}
 */
function encode(object, seen = new WeakMap(), nextId = { v: 1 }) {
  if (object === null) {
    return { type: "null", value: null };
  }
  if (object === undefined) {
    return { type: "undefined"};
  }
  if (typeof object === "string") {
    return { type: "string", value: object };
  }
  if (typeof object === "boolean") {
    return { type: "boolean", value: object };
  }
  if (typeof object === "number") {
    if (Number.isNaN(object)) return { type: "number", value: "NaN" };
    if (object === Infinity) return { type: "number", value: "Infinity" };
    if (object === -Infinity) return { type: "number", value: "-Infinity" };
    return { type: "number", value: object };
  }
  if (typeof object === "bigint") {
    return { type: "bigint", value: object.toString() };
  }
  if (object instanceof Date) {
    return { type: "date", value: object.toISOString() };
  }
  if (object instanceof Error) {
    return { type: "error", name: object.name, message: object.message };
  }
  if (typeof object === "function") {
    const ref = findNativeFunctionRef(object);
    if (ref) {
      return { type: "native_function", ref };
    }
    return { type: "function", value: object.toString() };
  }
  if (typeof object === "object") {
    const existingId = seen.get(object);
    if (existingId !== undefined) {
      return { type: "ref", value: existingId };
    }
    const id = nextId.v++;
    seen.set(object, id);
    if (Array.isArray(object)) {
      return {
        type: "array",
        id,
        value: object.map((x) => encode(x, seen, nextId)),
      };
    }
    const entries = {};
    for (const [k, v] of Object.entries(object)) {
      entries[k] = encode(v, seen, nextId);
    }
    return { type: "object", id, value: entries };
  }
  throw new Error("unsupported type");
}

/**
 * @param {any} object
 * @param {Map<number, any>} byId
 * @returns {any}
 */
function decode(object, byId = new Map()) {
  switch (object.type) {
    case "number":
      switch (object.value) {
        case "NaN":
          return NaN;
        case "Infinity":
          return Infinity;
        case "-Infinity":
          return -Infinity;
        default:
          return object.value;
      }
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "string":
    case "boolean":
      return object.value;
    case "bigint":
      return BigInt(object.value);
    case "date":
      return new Date(object.value);
    case "error": {
      const e = new Error(object.message);
      if (object.name) e.name = object.name;
      return e;
    }
    case "native_function":
      return resolveNativeFunctionRef(object.ref);
    case "function":
      return new Function("return " + object.value)();
    case "ref": {
      const v = byId.get(object.value);
      if (v === undefined) throw new Error("dangling ref");
      return v;
    }
    case "array": {
      const arr = [];
      byId.set(object.id, arr);
      const decoded = object.value.map((x) => decode(x, byId));
      arr.push(...decoded);
      return arr;
    }
    case "object": {
      const obj = {};
      byId.set(object.id, obj);
      for (const [k, v] of Object.entries(object.value)) {
        obj[k] = decode(v, byId);
      }
      return obj;
    }
    default:
      throw new Error("unknown type");
  }
}

/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  return JSON.stringify(encode(object));
}

/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== "string") {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }
  return decode(JSON.parse(string));
}

module.exports = {
  serialize,
  deserialize,
};
