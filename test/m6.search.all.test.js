require('../distribution.js')();
require('./helpers/sync-guard');

const distribution = globalThis.distribution;
const id = distribution.util.id;

const gid = 'm6search';
const n1 = {ip: '127.0.0.1', port: 7310};
const n2 = {ip: '127.0.0.1', port: 7311};
const n3 = {ip: '127.0.0.1', port: 7312};
const group = {};

function putGroup(done) {
  group[id.getSID(n1)] = n1;
  group[id.getSID(n2)] = n2;
  group[id.getSID(n3)] = n3;

  distribution.node.start((startError) => {
    if (startError) {
      done(startError);
      return;
    }

    distribution.local.status.spawn(n1, (n1Error) => {
      if (n1Error) {
        done(n1Error);
        return;
      }
      distribution.local.status.spawn(n2, (n2Error) => {
        if (n2Error) {
          done(n2Error);
          return;
        }
        distribution.local.status.spawn(n3, (n3Error) => {
          if (n3Error) {
            done(n3Error);
            return;
          }
          distribution.local.groups.put({gid}, group, (localError) => {
            if (localError) {
              done(localError);
              return;
            }
            distribution[gid].groups.put({gid}, group, (groupErrors) => {
              if (groupErrors && Object.keys(groupErrors).length) {
                done(groupErrors);
                return;
              }
              distribution[gid].search.reset((resetError) => {
                if (resetError) {
                  done(resetError);
                  return;
                }
                done();
              });
            });
          });
        });
      });
    });
  });
}

test('m6 distributed search indexes pages and returns top results', (done) => {
  const pages = [
    {
      url: 'https://example.com/alpha',
      text: 'prompt injection incident incident',
    },
    {
      url: 'https://example.com/beta',
      text: 'prompt safety incident',
    },
    {
      url: 'https://example.com/gamma',
      text: 'unrelated robotics',
    },
  ];

  let pending = pages.length;
  for (const page of pages) {
    distribution[gid].search.enqueue(page.url, (enqueueError) => {
      if (enqueueError) {
        done(enqueueError);
        return;
      }
      distribution[gid].search.addPosting('prompt', page.url, page.text.includes('prompt') ? 1 : 0, (promptError) => {
        if (promptError) {
          done(promptError);
          return;
        }
        const incidentCount = (page.text.match(/incident/g) || []).length;
        distribution[gid].search.addPosting('incident', page.url, incidentCount, (incidentError) => {
          if (incidentError) {
            done(incidentError);
            return;
          }
          pending -= 1;
          if (pending === 0) {
            distribution[gid].search.query('prompt incident', 10, (queryError, results) => {
              try {
                expect(queryError).toBeNull();
                expect(results.slice(0, 2)).toEqual([
                  {url: 'https://example.com/alpha', score: 3},
                  {url: 'https://example.com/beta', score: 2},
                ]);
                done();
              } catch (assertionError) {
                done(assertionError);
              }
            });
          }
        });
      });
    });
  }
});

beforeAll((done) => {
  putGroup(done);
});

afterAll((done) => {
  const remote = {service: 'status', method: 'stop'};
  remote.node = n1;
  distribution.local.comm.send([], remote, () => {
    remote.node = n2;
    distribution.local.comm.send([], remote, () => {
      remote.node = n3;
      distribution.local.comm.send([], remote, () => {
        if (globalThis.distribution.node.server) {
          globalThis.distribution.node.server.close();
        }
        done();
      });
    });
  });
});
