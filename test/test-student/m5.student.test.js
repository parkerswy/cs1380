/*
    In this file, add your own test cases that correspond to functionality introduced for each milestone.
    You should fill out each test case so it adequately tests the functionality you implemented.
    You are left to decide what the complexity of each test case should be, but trivial test cases that abuse this flexibility might be subject to deductions.

    Imporant: Do not modify any of the test headers (i.e., the test('header', ...) part). Doing so will result in grading penalties.
*/

const distribution = require('../../distribution.js')();
require('../helpers/sync-guard');
const id = distribution.util.id;

const bballavgscoreGroup = {};
const avgwrdlGroup = {};
const freqGroup = {};
const highestexamscoreGroup = {}
const numgradesGroup = {}

/*
  The local node will be the orchestrator.
*/

const n1 = {ip: '127.0.0.1', port: 7110};
const n2 = {ip: '127.0.0.1', port: 7111};
const n3 = {ip: '127.0.0.1', port: 7112};


test('(1 pts) student test', (done) => {
    const mapper = (key, value) => {
    const words = value.split(/\s+/).filter((e) => e !== '');
    const out = {};
    out[key] = {
      totalLength: words.reduce((sum, word) => sum + word.length, 0),
      wordCount: words.length,
    };
    return [out];
  };

  const reducer = (key, values) => {
    const totalLength = values.reduce((sum, v) => sum + v.totalLength, 0);
    const totalCount = values.reduce((sum, v) => sum + v.wordCount, 0);
    const avgLength = totalCount === 0 ? 0 : totalLength / totalCount;
    const out = {};
    out[key] = parseFloat(avgLength.toFixed(2));
    return out;
  };

  const dataset = [
    {'doca': 'abd def ghs jrw'},
    {'docb': 'a b c d e f g h i'},
    {'docc': 'folder reduce mapper'},
  ];

  const expected = [
    {'doca': 3},
    {'docb': 1},
    {'docc': 6},
  ];

  const doMapReduce = () => {
    distribution.avgwrdl.mr.exec({keys: getDatasetKeys(dataset), map: mapper, reduce: reducer}, (e, v) => {
      try {
        expect(v).toEqual(expect.arrayContaining(expected));
        expect(v).toHaveLength(expected.length);
        done();
      } catch (e) {
        done(e);
      }
    });
  };

  let cntr = 0;

  dataset.forEach((o) => {
    const key = Object.keys(o)[0];
    const value = o[key];
    distribution.avgwrdl.store.put(value, key, (e, v) => {
      cntr++;
      if (cntr === dataset.length) {
        doMapReduce();
      }
    });
  });
});


test('(1 pts) student test', (done) => {
  const mapper = (key, value) => {
    const words = value.split(/\s+/);
    const out = [];
    words.forEach((word) => {
      const o = {};
      o[word.toLowerCase()] = 1;
      out.push(o);
    });
    return out;
  };

  const reducer = (key, values) => {
    const out = {};
    out[key] = values.reduce((sum, v) => sum + v, 0);
    return out;
  };

  const dataset = [
    {'doc1': 'hello sally hello chuck'},
    {'doc2': 'sally sells sea shells by the sea shore'},
    {'doc3': 'how much wood would a woodchuck chuck if a woodchuck could chuck wood'},
  ];

  const expected = [
    {'chuck': 3}, {'hello': 2}, {'sally': 2}, {'sea': 2}, {'wood': 2}, 
    {'a': 2}, {'woodchuck': 2}, {'sells': 1}, {'shells': 1}, {'by': 1}, 
    {'the': 1}, {'shore': 1}, {'how': 1}, {'much': 1}, {'would': 1}, 
    {'if': 1}, {'could': 1}
  ];

  const doMapReduce = () => {
    distribution.freq.mr.exec({keys: getDatasetKeys(dataset), map: mapper, reduce: reducer}, (e, v) => {
      try {
        expect(v).toEqual(expect.arrayContaining(expected));
        expect(v).toHaveLength(expected.length);
        done();
      } catch (e) {
        done(e);
      }
    });
  };

  let cntr = 0;

  dataset.forEach((o) => {
    const key = Object.keys(o)[0];
    const value = o[key];
    distribution.freq.store.put(value, key, (e, v) => {
      cntr++;
      if (cntr === dataset.length) {
        doMapReduce();
      }
    });
  });
});


test('(1 pts) student test', (done) => {
  const mapper = (key, value) => {
    const [player, score] = value.split(' ');
    return [{[player]: parseInt(score)}];
  };

  const reducer = (key, values) => {
    const out = {};
    out[key] = values.reduce((a, b) => a + b, 0) / values.length;
    return out;
  };

  const dataset = [
    {'2024-01-01': 'Lebron 32'},
    {'2024-01-02': 'Stephen 34'},
    {'2024-01-03': 'Michael 35'},
    {'2024-01-04': 'Kobe 39'},
    {'2024-01-05': 'Ming 38'},
    {'2024-01-06': 'Lebron 45'},
    {'2024-01-07': 'Stephen 40'},
    {'2024-01-08': 'Michael 42'},
    {'2024-01-09': 'Kobe 47'},
    {'2024-01-10': 'Lebron 37'},
    {'2024-01-11': 'Stephen 34'},
  ];

  const expected = [{'Lebron': 38.0}, {'Stephen': 36}, {'Michael': 38.5}, {'Kobe': 43.0}, {'Ming': 38.0}];

  const doMapReduce = () => {
    distribution.bballavgscore.mr.exec({keys: getDatasetKeys(dataset), map: mapper, reduce: reducer}, (e, v) => {
      try {
        expect(v).toEqual(expect.arrayContaining(expected));
        expect(v).toHaveLength(expected.length);
        done();
      } catch (e) {
        done(e);
      }
    });
  };

  let cntr = 0;
  // Send the dataset to the cluster
  dataset.forEach((o) => {
    const key = Object.keys(o)[0];
    const value = o[key];
    distribution.bballavgscore.store.put(value, key, (e, v) => {
      cntr++;
      // Once the dataset is in place, run the map reduce
      if (cntr === dataset.length) {
        doMapReduce();
      }
    });
  });
});

test('(1 pts) student test', (done) => {
  const mapper = (key, value) => {
    const [subject, score] = value.split(' ');
    return [{[subject]: parseInt(score)}];
  };

  const reducer = (key, values) => {
    const out = {};
    out[key] = values.reduce((a, b) => Math.max(a, b), -Infinity);
    return out;
  };

  const dataset = [
    {'exam1': 'Physics 90'},
    {'exam2': 'Physics 99'},
    {'exam3': 'Chemistry 83'},
    {'exam4': 'Biology 94'},
    {'exam5': 'Math 99'},
    {'exam6': 'Math 98'},
    {'exam7': 'Biology 93'},
    {'exam8': 'Chemistry 100'},
    {'exam9': 'Chemistry 100'},
  ];

  const expected = [{'Physics': 99}, {'Chemistry': 100}, {'Math': 99}, {'Biology': 94}];

  const doMapReduce = () => {
    distribution.highestexamscore.mr.exec({keys: getDatasetKeys(dataset), map: mapper, reduce: reducer}, (e, v) => {
      try {
        expect(v).toEqual(expect.arrayContaining(expected));
        expect(v).toHaveLength(expected.length);
        done();
      } catch (e) {
        done(e);
      }
    });
  };

  let cntr = 0;
  // Send the dataset to the cluster
  dataset.forEach((o) => {
    const key = Object.keys(o)[0];
    const value = o[key];
    distribution.highestexamscore.store.put(value, key, (e, v) => {
      cntr++;
      // Once the dataset is in place, run the map reduce
      if (cntr === dataset.length) {
        doMapReduce();
      }
    });
  });
});

test('(1 pts) student test', (done) => {
  const mapper = (key, value) => {
    const out = {};
    out[value] = 1;
    return [out];
  };

  const reducer = (key, values) => {
    const out = {};
    out[key] = values.reduce((a, b) => a + b, 0);
    return out;
  };

  const dataset = [
    {"Abby": "A"},
    {"Ivan": "B"},
    {"Amanda": "A"},
    {"Eric": "B"},
    {"Victor": "B"},
    {"Kevin": "A"},
    {"Matthew": "C"},
    {"Ann": "C"},
    {"Susmita": "A"},
  ];

  const expected = [{"A": 4}, {"B": 3}, {"C": 2}];

  const doMapReduce = () => {
    distribution.numgrades.mr.exec({keys: getDatasetKeys(dataset), map: mapper, reduce: reducer}, (e, v) => {
      try {
        expect(v).toEqual(expect.arrayContaining(expected));
        expect(v).toHaveLength(expected.length);
        done();
      } catch (e) {
        done(e);
      }
    });
  };

  let cntr = 0;
  // Send the dataset to the cluster
  dataset.forEach((o) => {
    const key = Object.keys(o)[0];
    const value = o[key];
    distribution.numgrades.store.put(value, key, (e, v) => {
      cntr++;
      // Once the dataset is in place, run the map reduce
      if (cntr === dataset.length) {
        doMapReduce();
      }
    });
  });
});

function getDatasetKeys(dataset) {
  return dataset.map((o) => Object.keys(o)[0]);
}

beforeAll((done) => {
  try {
    bballavgscoreGroup[id.getSID(n1)] = n1;
    bballavgscoreGroup[id.getSID(n2)] = n2;
    bballavgscoreGroup[id.getSID(n3)] = n3;

    avgwrdlGroup[id.getSID(n1)] = n1;
    avgwrdlGroup[id.getSID(n2)] = n2;
    avgwrdlGroup[id.getSID(n3)] = n3;

    freqGroup[id.getSID(n1)] = n1;
    freqGroup[id.getSID(n2)] = n2;
    freqGroup[id.getSID(n3)] = n3;
  
    highestexamscoreGroup[id.getSID(n1)] = n1;
    highestexamscoreGroup[id.getSID(n2)] = n2;
    highestexamscoreGroup[id.getSID(n3)] = n3;

    numgradesGroup[id.getSID(n1)] = n1;
    numgradesGroup[id.getSID(n2)] = n2;
    numgradesGroup[id.getSID(n3)] = n3;

    const startNodes = (cb) => {
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
            cb();
          });
        });
      });
    };

    distribution.node.start((e) => {
      if (e) {
        done(e);
        return;
      }
      const bballavgscoreConfig = {gid: 'bballavgscore'};
      startNodes(() => {
        distribution.local.groups.put(bballavgscoreConfig, bballavgscoreGroup, (e, v) => {
          distribution.bballavgscore.groups.put(bballavgscoreConfig, bballavgscoreGroup, (e, v) => {
            const avgwrdlConfig = {gid: 'avgwrdl'};
            distribution.local.groups.put(avgwrdlConfig, avgwrdlGroup, (e, v) => {
              distribution.avgwrdl.groups.put(avgwrdlConfig, avgwrdlGroup, (e, v) => {
                const freqConfig = {gid: 'freq'};
                distribution.local.groups.put(freqConfig, freqGroup, (e, v) => {
                  distribution.freq.groups.put(freqConfig, freqGroup, (e, v) => {
                    const highestexamscoreConfig = {gid: 'highestexamscore'};
                    distribution.local.groups.put(highestexamscoreConfig, highestexamscoreGroup, (e, v) => {
                      distribution.highestexamscore.groups.put(highestexamscoreConfig, highestexamscoreGroup, (e, v) => {
                        const numgradesConfig = {gid: 'numgrades'};
                        distribution.local.groups.put(numgradesConfig, numgradesGroup, (e, v) => {
                          distribution.numgrades.groups.put(numgradesConfig, numgradesGroup, (e, v) => {
                            done();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  } catch (e) {
    done(e);
  }
});

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
