// @ts-check
require('../../distribution.js')({ ip: '127.0.0.1', port: 9009 });
require('../helpers/sync-guard');
const distribution = globalThis.distribution;

beforeAll((done) => {
  distribution.node.start((e) => done(e || undefined));
});

afterAll((done) => {
  if (distribution.node.server) distribution.node.server.close();
  done();
});

function nowSec() {
  return Number(process.hrtime.bigint()) / 1e9;
}

async function bench(callFn, N, conc) {
  for (let i = 0; i < Math.min(50, N); i++) await callFn();

  let idx = 0;
  const t0 = nowSec();

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= N) return;
      await callFn();
    }
  }

  await Promise.all(Array.from({ length: conc }, worker));

  const total_s = nowSec() - t0;
  return {
    throughput_rps: N / total_s,
    latency_s: total_s / N,
  };
}

async function characterize(label, callFn) {
  const N = 1000;

  // latency baseline
  const lat = await bench(callFn, N, 1);

  // throughput run
  const thr = await bench(callFn, N, 100);

  console.log(`${label} throughput: ${thr.throughput_rps.toFixed(2)} rps`);
  console.log(`${label} latency: ${lat.latency_s.toFixed(8)} s`);
}

describe('T6 throughput/latency', () => {
  jest.setTimeout(60_000);

  test('comm', async () => {
    const remote = {
      node: { ip: '127.0.0.1', port: 9009 },
      service: 'status',
      method: 'get',
    };

    const callComm = () =>
      new Promise((resolve, reject) => {
        distribution.local.comm.send(['nid'], remote, (e, v) => {
          if (e) reject(e);
          else resolve(v);
        });
      });

    await characterize('comm', callComm);
  });

  /*
  test('rpc', async () => {
    const callRPC = () =>
      new Promise((resolve, reject) => {
        distribution.local.rpc.send(
          [2],
          { node: { ip: '127.0.0.1', port: 9009 }, service: 'addOneService', method: 'addOne' },
          (e, v) => (e ? reject(e) : resolve(v))
        );
      });

    await characterize('rpc', callRPC);
  });
  */
});
