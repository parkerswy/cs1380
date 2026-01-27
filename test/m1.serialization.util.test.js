require('../distribution.js')();
require('./helpers/sync-guard');
const distribution = globalThis.distribution;
const util = distribution.util;

test('(3 pts) serializeDoesNotMutate', () => {
  const object = {a: 1, b: 2, c: 3};
  const copy = JSON.parse(JSON.stringify(object));
  util.serialize(object);
  expect(object).toEqual(copy);
});

test('(1 pts) serializeNumber', () => {
  const number = 42;
  const serialized = util.serialize(number);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(number);
});

test('(1 pts) serializeNaN', () => {
  const number = NaN;
  const serialized = util.serialize(number);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toBeNaN();
});

test('(1 pts) serializeInfinity', () => {
  const number = Infinity;
  const serialized = util.serialize(number);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(number);
});

test('(1 pts) serializeString', () => {
  const string = 'Hello, World!';
  const serialized = util.serialize(string);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(string);
});

test('(2 pts) serializeSimpleObject', () => {
  const object = {a: 1, b: 2, c: 3};
  const serialized = util.serialize(object);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(object);
});

test('(2 pts) serializeNestedObject', () => {
  const object = {a: 1, b: 2, c: 3, d: {e: 4, f: 5, g: 6}};
  const serialized = util.serialize(object);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(object);
});

test('(2 pts) serializeArray', () => {
  const array = [1, 2, 3, 4, 5];
  const serialized = util.serialize(array);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(array);
});

test('(3 pts) serializeNestedArray', () => {
  const array = [1, 2, 3, 4, 5, [6, 7, 8, 9, 10]];
  const serialized = util.serialize(array);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(array);
});

test('(2 pts) serializeNestedArrayAndObject', () => {
  const array = [1, 2, 3, 4, 5, [6, 7, 8, 9, 10], {a: 1, b: 2, c: 3}];
  const serialized = util.serialize(array);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(array);
});

test('(2 pts) serializeError', () => {
  const error = new Error('Hello, World!');
  const serialized = util.serialize(error);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(error);
});

test('(2 pts) serializeDate', () => {
  const date = new Date();
  const serialized = util.serialize(date);
  const deserialized = util.deserialize(serialized);
  expect(deserialized.getTime()).toEqual(date.getTime());
});

test('(1 pts) serializeUndefined', () => {
  const serialized = util.serialize(undefined);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toBeUndefined();
});

test('(1 pts) serializeNull', () => {
  const serialized = util.serialize(null);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toBeNull();
});

test('(4 pts) serializeFunction', () => {
  const fn = (a, b) => a + b;
  const serialized = util.serialize(fn);
  const deserialized = util.deserialize(serialized);

  expect(typeof deserialized).toEqual('function');
  expect(deserialized(42, 1)).toEqual(43);
});

test('(3 pts) serializeObjectWithFunctions', () => {
  const fn = (a, b) => a + b;
  const object = {func: fn};
  const serialized = util.serialize(object);
  const deserialized = util.deserialize(serialized);
  expect(typeof deserialized.func).toEqual('function');
  expect(deserialized.func(42, 1)).toEqual(43);
});

test('(4 pts) serializeObjectWithNameClashFunctions', () => {
  const object = {log: () => 42};
  const serialized = util.serialize(object);
  const deserialized = util.deserialize(serialized);
  expect(typeof deserialized.log).toEqual('function');
  expect(deserialized.log()).toEqual(42);
});

test('(4 pts) serializeRainbowObject', () => {
  const object = {
    n: 1,
    s: 'Hello, World!',
    a: [1, 2, 3, 4, 5],
    e: new Error('Hello, World!'),
    d: new Date(),
    o: {x: 1, y: 2, z: 3},
    n: null,
    u: undefined,
  };

  const serialized = util.serialize(object);
  const deserialized = util.deserialize(serialized);

  expect(deserialized).toEqual(object);
});

test('(4 pts) serialize and deserialize null', () => {
  const original = null;
  const serialized = util.serialize(original);
  expect(original).toEqual(util.deserialize(serialized));
});

test('(4 pts) serialize and deserialize undefined', () => {
  const original = undefined;
  const serialized = util.serialize(original);
  expect(original).toEqual(util.deserialize(serialized));
});

test('(4 pts) serialize and deserialize special string', () => {
  const original = '\\string\n\t\r"';
  const serialized = util.serialize(original);
  expect(original).toEqual(util.deserialize(serialized));
});

test('(4 pts) serialize and deserialize boolean true', () => {
  const original = true;
  const serialized = util.serialize(original);
  expect(original).toEqual(util.deserialize(serialized));
});

test('(4 pts) serialize and deserialize boolean false', () => {
  const original = false;
  const serialized = util.serialize(original);
  expect(original).toEqual(util.deserialize(serialized));
});

test('(4 pts) serialize and deserialize Date object', () => {
  const original = new Date();
  const serialized = util.serialize(original);
  expect(original.toString()).toEqual(util.deserialize(serialized).toString());
});

test('(4 pts) serialize and deserialize empty object', () => {
  const original = {};
  const serialized = util.serialize(original);
  expect(util.deserialize(serialized)).toEqual({});
});

test('(4 pts) serialize and deserialize empty array', () => {
  const original = [];
  const serialized = util.serialize(original);
  expect(util.deserialize(serialized)).toEqual([]);
});

test('(4 pts) serialize and deserialize complex array', () => {
  const original = [27, null, undefined, 'string', true, false, {}, []];
  const serialized = util.serialize(original);
  expect(util.deserialize(serialized)).toEqual([27,
    null, undefined, 'string', true, false, {}, []]);
});

test('(4 pts) serialize and deserialize array with functions', () => {
  const f = function() { };
  const original = [f];
  const serialized = util.serialize(original);
  const deserialized = util.deserialize(serialized);
  expect(typeof deserialized[0]).toEqual('function');
});

test('(4 pts) serialize and deserialize array with multiple functions', () => {
  const f = function() { };
  const original = [f, function() { }];
  const serialized = util.serialize(original);
  const deserialized = util.deserialize(serialized);
  expect(typeof deserialized[0]).toEqual('function');
  expect(typeof deserialized[1]).toEqual('function');
});

test('(4 pts) serialize and deserialize object with function', () => {
  const f = function() { };
  const original = {f: f};
  const serialized = util.serialize(original);
  const deserialized = util.deserialize(serialized);
  expect(typeof deserialized.f).toEqual('function');
});

test('(0 pts) serialize config', () => {
  const config = {ip: '127.0.0.1', port: 1380};
  const serialized = util.serialize(config);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(config);
});

test('(0 pts) deserialize rejects invalid argument types', () => {
  expect(() => util.deserialize(123)).toThrow();
});

test('(0 pts) deserialize rejects unknown serialized types', () => {
  const bad = JSON.stringify({type: 'not-a-real-type', value: 'x'});
  expect(() => util.deserialize(bad)).toThrow();
});
