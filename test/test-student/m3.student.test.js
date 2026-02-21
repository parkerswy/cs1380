/*
    In this file, add your own test cases that correspond to functionality introduced for each milestone.
    You should fill out each test case so it adequately tests the functionality you implemented.
    You are left to decide what the complexity of each test case should be, but trivial test cases that abuse this flexibility might be subject to deductions.

    Imporant: Do not modify any of the test headers (i.e., the test('header', ...) part). Doing so will result in grading penalties.
*/

const { id } = require('@brown-ds/distribution/distribution/util/util.js');

const distribution = require('../../distribution.js')();
require('../helpers/sync-guard');

test('(1 pts) student test', (done) => {
  const node = {ip: '127.0.0.5', port: 8006};
  const group = {
    "vn0e1": {ip: '127.0.0.5', port: 8007},
    "20k3e": {ip: '127.0.0.5', port: 8008}
  }
  const groupConfig = {gid: "group"}
  distribution.local.groups.put(groupConfig, group, (e, v) => {
    try {
      expect(e).toBeFalsy()
      expect(v).toEqual(group)
    } catch (e) {
      return done(e)
    }
    distribution.local.groups.add("group", node, (e, v) => {
      const expectedGroup = {
        ...group, ...{[id.getSID(node)]: node},
      };
      try {
        expect(e).toBeFalsy()
        expect(v).toEqual(expectedGroup)
        return done()
      } catch(e) {
        return done(e)
      }
    })
  })
});


test('(1 pts) student test', (done) => {
  // test group get
  const group = {
    "vn0e1": {ip: '127.0.0.5', port: 8007},
    "20k3e": {ip: '127.0.0.5', port: 8008}
  }
  const expected = {}
  for (const node of [n1, n2, n3]) {
    expected[id.getSID(node)] = group
  }
  distribution.mygroup.groups.put("newgroup", group, (e, v) => {
    distribution.mygroup.groups.get("newgroup", (e, v) => {
      try {
        expect(e).toEqual({})
        expect(v).toEqual(expected)
        return done()
      } catch(e) {
        return done(e)
      }
    })
  })
});


test('(1 pts) student test', (done) => {
  // get group status heapUsed
  let expectedSids = []
  for (const node of [n1, n2, n3]) {
    expectedSids.push(id.getSID(node))
  }
  distribution.mygroup.status.get("heapUsed", (e, v) => {
    try {
      expect(e).toEqual({})
      expect(Object.keys(v)).toHaveLength(3);
      expectedSids.forEach((sid) => {
        expect(v[sid]).toBeDefined();
      });
      Object.values(v).forEach((value) => {
        expect(typeof value).toBe('number');
      });
      return done();
    } catch (e) {
      return done(e)
    }
  })
});

test('(1 pts) student test', (done) => {
  // routes put
  const yellService = {};
  yellService.yell = (s) => {
    return s.toUpperCase();
  };

  distribution.mygroup.routes.put(yellService, 'yell', (e, v) => {
    const remote = {node: n1, service: "routes", method: "get"}
    distribution.local.comm.send(['yell'], remote, (e, v) => {
      try {
        expect(e).toBeFalsy()
        expect(v.yell("hello")).toEqual("HELLO")
        return done()
      } catch (e) {
        return done(e)
      }
    })
  })
});

test('(1 pts) student test', (done) => {
  // comm 
  const sids = Object.values(mygroupGroup).map((node) => id.getSID(node));
  const remote = {service: 'status', method: 'get'};

  distribution.mygroup.comm.send(['sid'], remote, (e, v) => {
    try {
      expect(e).toEqual({});
      expect(Object.values(v)).toEqual(expect.arrayContaining(sids));
      return done();
    } catch (error) {
      return done(error);
    }
  });
});

/* Infrastructure for the tests */

// This group is used for testing most of the functionality
const mygroupGroup = {};

const n1 = {ip: '127.0.0.1', port: 8000};
const n2 = {ip: '127.0.0.1', port: 8001};
const n3 = {ip: '127.0.0.1', port: 8002};


beforeAll((done) => {
  const remote = {service: 'status', method: 'stop'};

  remote.node = n1;
  distribution.local.comm.send([], remote, (e, v) => {
    remote.node = n2;
    distribution.local.comm.send([], remote, (e, v) => {
      remote.node = n3;
      distribution.local.comm.send([], remote, (e, v) => {});
      });
    });

  mygroupGroup[id.getSID(n1)] = n1;
  mygroupGroup[id.getSID(n2)] = n2;
  mygroupGroup[id.getSID(n3)] = n3;

  distribution.node.start((e) => {
    if (e) {
      done(e);
      return;
    }
    const groupInstantiation = (e, v) => {
      const mygroupConfig = {gid: 'mygroup'};
      distribution.local.groups
        .put(mygroupConfig, mygroupGroup, (e, v) => {
          if (e) {
            done(e)
            return
          }
        });
    };

    distribution.local.status.spawn(n1, (e, v) => {
      if (e) {
        done(e);
        return;
      }
      distribution.local.status.spawn(n2, (e, v) => {
        if (e) {
          done(e);
          return;
        }
        distribution.local.status.spawn(n3, (e, v) => {
          if (e) {
            done(e);
            return;
          }
          groupInstantiation();
          return done()
      });
    });
  });
});
});

afterAll((done) => {
  distribution.mygroup.status.stop((e, v) => {
    const remote = {service: 'status', method: 'stop'};
    remote.node = n1;
    distribution.local.comm.send([], remote, (e, v) => {
      remote.node = n2;
      distribution.local.comm.send([], remote, (e, v) => {
        remote.node = n3;
        distribution.local.comm.send([], remote, (e, v) => {
          if (globalThis.distribution.node.server) {
            globalThis.distribution.node.server.close();
          }
          return done();
        });
      });
    });
  });
});
