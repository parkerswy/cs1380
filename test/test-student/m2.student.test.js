/*
    In this file, add your own test cases that correspond to functionality introduced for each milestone.
    You should fill out each test case so it adequately tests the functionality you implemented.
    You are left to decide what the complexity of each test case should be, but trivial test cases that abuse this flexibility might be subject to deductions.

    Imporant: Do not modify any of the test headers (i.e., the test('header', ...) part). Doing so will result in grading penalties.
*/

require('../../distribution.js')();
const distribution = globalThis.distribution
const local = distribution.local;
const id = distribution.util.id;
const config = distribution.node.config;
require('../helpers/sync-guard');

beforeAll((done) => {
  distribution.node.start((e) => {
    if (e) {
      done(e);
      return;
    }
    done();
  });
});

afterAll((done) => {
  if (globalThis.distribution.node.server) {
    globalThis.distribution.node.server.close();
  }
  done();
});


test('(1 pts) student test', (done) => {
  const routes = local.routes;
  const yellService = {
    yell: (phrase) => String(phrase).toUpperCase() + '!',
  };
  routes.put(yellService, 'yell', (e) => {
    if (e) return done(e);
    routes.get('yell', (e, svc) => {
      if (e) return done(e);
      try {
        expect(svc.yell('happy chinese new year')).toBe('HAPPY CHINESE NEW YEAR!');
      } catch (err) {
        return done(err);
      }
      routes.rem('yell', (e, removed) => {
        if (e) return done(e);
        try {
          expect(removed).toBe(yellService);
        } catch (err) {
          return done(err);
        }
        routes.get('yell', (e, v) => {
          try {
            expect(e).toBeInstanceOf(Error);
            expect(v).toBeUndefined();
            done();
          } catch (err) {
            done(err);
          }
        });
      });
    });
  });
});


test('(1 pts) student test', (done) => {
  local.status.get('nid', (e, v) => {
    try {
      expect(e).toBeFalsy();
      expect(v).toEqual(id.getNID(config));
    } catch (error) {
      done(error)
      return;
    }
    local.status.get('abcd', (e, v) => {
      try {
        expect(e).toBeInstanceOf(Error);
        expect(v).toBeUndefined();
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});

test('(1 pts) student test', (done) => {
  const mathService = {
    add: (a, b, cb) => cb(null, a + b),
  };

  distribution.local.routes.put(mathService, 'math', (e1) => {
    if (e1) return done(e1);

    const remote = { node: config, service: 'math', method: 'add' };
    local.comm.send([2, 3], remote, (e2, v2) => {
      if (e2) return done(e2);

      try {
        expect(v2).toBe(5);
      } catch (err) {
        return done(err);
      }

      distribution.local.routes.rem('math', (e3) => {
        if (e3) return done(e3);
        done();
      });
    });
  });
});

test('(1 pts) student test', (done) => {
  // missing node
  const remote = {service: 'status', method: 'get'};

  local.comm.send([], remote, (e, v) => {
    try {
      expect(e).toBeInstanceOf(Error);
      expect(v).toBeFalsy();
      done();
    } catch (error) {
      done(error);
    }
  });
});

test('(1 pts) student test', (done) => {
  local.routes.get(undefined, (e, v) => {
  try {
    expect(e).toBeDefined();
    expect(e).toBeInstanceOf(Error);
    expect(v).toBeFalsy();
    done();
  } catch (error) {
    done(error);
    }
  });
});
