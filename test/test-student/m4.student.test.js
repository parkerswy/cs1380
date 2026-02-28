/*
    In this file, add your own test cases that correspond to functionality introduced for each milestone.
    You should fill out each test case so it adequately tests the functionality you implemented.
    You are left to decide what the complexity of each test case should be, but trivial test cases that abuse this flexibility might be subject to deductions.

    Imporant: Do not modify any of the test headers (i.e., the test('header', ...) part). Doing so will result in grading penalties.
*/

const distribution = require('../../distribution.js')();
const id = distribution.util.id;
require('../helpers/sync-guard');

test('(1 pts) student test', (done) => {
  const key = 'abcde';
  const file1 = "HELLO";
  const file2 = "BYE"

  distribution.mygroup.mem.put(file1, key, (e, v) => {
    if (e) return done(e);
    distribution.mygroup.mem.put(file2, {key, gid: 'myothergroup'}, (e, v) => {
      if (e) return done(e);
      distribution.mygroup.mem.get(key, (e, v) => {
        if (e) return done(e);
        expect(v).toEqual(file1);
        done();
      });
    });
  });
});


test('(1 pts) student test', (done) => {
  const data = {competition: 'Olympics', medal: 'Gold'};
  const key = 'Pan Zhan Le';

  distribution.local.mem.put(data, key, (e, v) => {
    try {
      expect(e).toBeFalsy();
      expect(v).toEqual(data);
      done();
    } catch (error) {
      done(error);
    }
  });
});


test('(1 pts) student test', (done) => {
  const data = {competition: 'Olympics', medal: 'Gold'};
  const key = 'Alyssa';

  distribution.local.store.put(data, key, (e, v) => {
    distribution.local.store.get(key, (e, v) => {
      try {
        expect(e).toBeFalsy();
        expect(v).toEqual(data);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});

test('(1 pts) student test', (done) => {
  const data = {competition: 'Olympics', medal: 'Silver'};
  const key = 'Kyle';

  distribution.mygroup.store.put(data, key, (e, v) => {
    distribution.myothergroup.store.get(key, (e, v) => {
      try {
        expect(e).toBeInstanceOf(Error);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});

test('(1 pts) student test', (done) => {
  const key = 'olympian';
  const nodes = [
    {ip: '127.0.0.23', port: 8080},
    {ip: '127.0.0.24', port: 8081},
    {ip: '127.0.0.25', port: 8082},
  ];

  const kid = id.getID(key);
  const nids = nodes.map((node) => id.getNID(node));

  const hash = id.rendezvousHash(kid, nids);
  let expectedHash = 'd25f33796d62e87004d40a95068f504d0e8013d157791010d90069948e5fe276';

  try {
    expect(expectedHash).toBeTruthy();
    expect(hash).toEqual(expectedHash);
    done();
  } catch (error) {
    done(error);
  }
});


/*
    Following is the setup for the tests.
*/

const mygroup = {};
const myothergroup = {};

const n1 = {ip: '127.0.0.1', port: 9001};
const n2 = {ip: '127.0.0.1', port: 9002};
const n3 = {ip: '127.0.0.1', port: 9003};

beforeAll((done) => {
  const remote = {service: 'status', method: 'stop'};

  const fs = require('fs');
  const path = require('path');

  fs.rmSync(path.join(__dirname, '../store'), {recursive: true, force: true});
  fs.mkdirSync(path.join(__dirname, '../store'));

  remote.node = n1;
  distribution.local.comm.send([], remote, (e, v) => {
    remote.node = n2;
    distribution.local.comm.send([], remote, (e, v) => {
      remote.node = n3;
      distribution.local.comm.send([], remote, (e, v) => {
        startNodes();
        });
      });
    });

  const startNodes = () => {
    mygroup[id.getSID(n1)] = n1;
    mygroup[id.getSID(n2)] = n2;
    myothergroup[id.getSID(n3)] = n3;

    distribution.node.start((e) => {
      if (e) {
        done(e);
        return;
      }
      const groupInstantiation = () => {
        const mygroupConfig = {gid: 'mygroup'};
        const myothergroupConfig = {gid: 'myothergroup', hash: id.rendezvousHash};

        // Create the groups
        distribution.local.groups.put(myothergroupConfig, myothergroup, (e, v) => {
          distribution.local.groups.put(mygroupConfig, mygroup, (e, v) => {
            distribution.mygroup.groups.put(mygroupConfig, mygroup, (e, v) => {
              done();
            });
          });
        });
      };

      // Start the nodes
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
          });
        });
    });
    })
  }
})

afterAll((done) => {
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
        done();
      });
    });
  });
});
