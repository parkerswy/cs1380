const util = require('@brown-ds/distribution/distribution/util/util.js');

const distribution = require('../../distribution.js')();

const baseValue = [42, 'Hello, World!', true, null, undefined, NaN, Infinity];
const funcValue = (a, b) => a + b;
const complexValue = {
  n: 1,
  s: 'Hello, World!',
  a: [1, 2, 3, 4, 5],
  e: new Error('Hello, World!'),
  d: new Date(),
  o: { x: 1, y: 2, z: 3 },
  n2: null,
  u: undefined,
};

test('latency characterization (3 workloads)', () => {
  const workloads = {
    base: baseValue,
    func: funcValue,
    complex: complexValue,
  };
  const N = 30;
  const results = [];
  for (const [name, value] of Object.entries(workloads)) {
    let serTotal = 0n;
    let deserTotal = 0n;
    for (let i = 0; i < N; i++) {
      const t1 = process.hrtime.bigint();
      const s = util.serialize(value);
      const t2 = process.hrtime.bigint();
      util.deserialize(s);
      const t3 = process.hrtime.bigint();
      serTotal += (t2 - t1);
      deserTotal += (t3 - t2);
    }

    // Convert nanoseconds to seconds
    const serSeconds = Number(serTotal) / 1e9;
    const deserSeconds = Number(deserTotal) / 1e9;
    const totalSeconds = serSeconds + deserSeconds;

    // Average latency (seconds per operation)
    const avgSerSeconds = serSeconds / N;
    const avgDesSeconds = deserSeconds / N;
    const pairLatency = totalSeconds / N;

    // Throughput (operations per second)
    const serThroughput = N / serSeconds;
    const desThroughput = N / deserSeconds;
    const pairThroughput = N / totalSeconds; 

    results.push({
      workload: name,
      iterations: N,
      // total times 
      totalSerializeSeconds: serSeconds,
      totalDeserializeSeconds: deserSeconds,
      totalSeconds: totalSeconds,
      // average latency 
      avgSerializeSeconds: avgSerSeconds,
      avgDeserializeSeconds: avgDesSeconds,
      // throughput
      serializeOpsPerSecond: serThroughput,
      deserializeOpsPerSecond: desThroughput,
      serializeDeserializePairsPerSecond: pairThroughput,
    });
  }
  console.log('M1 latency & throughput (seconds-based) results:', JSON.stringify(results, null, 2));
});
