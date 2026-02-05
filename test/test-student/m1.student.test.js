/*
    In this file, add your own test cases that correspond to functionality introduced for each milestone.
    You should fill out each test case so it adequately tests the functionality you implemented.
    You are left to decide what the complexity of each test case should be, but trivial test cases that abuse this flexibility might be subject to deductions.

    Imporant: Do not modify any of the test headers (i.e., the test('header', ...) part). Doing so will result in grading penalties.
*/

const util = require('@brown-ds/distribution/distribution/util/util.js');

const distribution = require('../../distribution.js')();
require('../helpers/sync-guard');

test('(1 pts) student test', () => {
  const object = {a: 1, b: [1,2,3, {d: "E"}], c: 3};
  let serialized = util.serialize(object);
  expect(object).toEqual(util.deserialize(serialized));
});


test('(1 pts) student test', () => {
  const date = new Date(Date.UTC(2026, 3, 6));
  const arr = [date, "abc", null, undefined, NaN, 1991, true, Infinity];
  let serialized = util.serialize(arr);
  const des = util.deserialize(serialized);
  expect(des).toEqual(arr);
  expect(des[0] instanceof Date).toBe(true);
});


test('(1 pts) student test', () => {
  const shout = (phrase, punc) => phrase.toUpperCase() + punc.repeat(5);
  const serialized = util.serialize(shout);
  const deserialized = util.deserialize(serialized);
  expect(typeof deserialized).toBe('function');
  expect(deserialized('hey', '!')).toBe('HEY!!!!!');
  expect(deserialized('yo', '?')).toBe('YO?????');
});

test('(1 pts) student test', () => {
  function makeErr(msg) {
    const e = new Error(msg);
    return e;
  }
  const serialized = util.serialize(makeErr);
  const deserialized = util.deserialize(serialized);
  const err = deserialized('boom');
  expect(err instanceof Error).toBe(true);
  expect(err.message).toBe('boom');
});

test('(1 pts) student test', () => {
  const shared = { x: 1, y: [2, 3] };
  const obj = { a: shared, b: shared, note: "aliasing" };
  const serialized = util.serialize(obj);
  const deserialized = util.deserialize(serialized);
  expect(deserialized).toEqual(obj);
  expect(deserialized.a).toBe(deserialized.b);
});
