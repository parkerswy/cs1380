# distribution

This is the distribution library. 

## Environment Setup

We recommend using the prepared [container image](https://github.com/brown-cs1380/container).

## Installation

After you have setup your environment, you can start using the distribution library.
When loaded, distribution introduces functionality supporting the distributed execution of programs. To download it:

```sh
$ npm i '@brown-ds/distribution'
```

This command downloads and installs the distribution library.

## Testing

There are several categories of tests:
  *	Regular Tests (`*.test.js`)
  *	Scenario Tests (`*.scenario.js`)
  *	Extra Credit Tests (`*.extra.test.js`)
  * Student Tests (`*.student.test.js`) - inside `test/test-student`

### Running Tests

By default, all regular tests are run. Use the options below to run different sets of tests:

1. Run all regular tests (default): `$ npm test` or `$ npm test -- -t`
2. Run scenario tests: `$ npm test -- -c` 
3. Run extra credit tests: `$ npm test -- -ec`
4. Run the `non-distribution` tests: `$ npm test -- -nd`
5. Combine options: `$ npm test -- -c -ec -nd -t`

## Usage

To try out the distribution library inside an interactive Node.js session, run:

```sh
$ node
```

Then, load the distribution library:

```js
> let distribution = require("@brown-ds/distribution")();
> distribution.node.start(console.log);
```

Now you have access to the full distribution library. You can start off by serializing some values. 

```js
> s = distribution.util.serialize(1); // '{"type":"number","value":"1"}'
> n = distribution.util.deserialize(s); // 1
```

You can inspect information about the current node (for example its `sid`) by running:

```js
> distribution.local.status.get('sid', console.log); // null 8cf1b (null here is the error value; meaning there is no error)
```

You can also store and retrieve values from the local memory:

```js
> distribution.local.mem.put({name: 'nikos'}, 'key', console.log); // null {name: 'nikos'} (again, null is the error value) 
> distribution.local.mem.get('key', console.log); // null {name: 'nikos'}

> distribution.local.mem.get('wrong-key', console.log); // Error('Key not found') undefined
```

You can also spawn a new node:

```js
> node = { ip: '127.0.0.1', port: 8080 };
> distribution.local.status.spawn(node, console.log);
```

Using the `distribution.all` set of services will allow you to act 
on the full set of nodes created as if they were a single one.

```js
> distribution.all.status.get('sid', console.log); // {} { '8cf1b': '8cf1b', '8cf1c': '8cf1c' } (now, errors are per-node and form an object)
```

You can also send messages to other nodes:

```js
> distribution.local.comm.send(['sid'], {node: node, service: 'status', method: 'get'}, console.log); // null 8cf1c
```

Most methods in the distribution library are asynchronous and take a callback as their last argument.
This callback is called when the method completes, with the first argument being an error (if any) and the second argument being the result.
If you wanted to run this same sequence of commands in a script, you could do something like this (note the nested callbacks):

```js
let distribution = require("@brown-ds/distribution")();
// Now we're only doing a few of the things we did above
const out = (cb) => {
  distribution.local.status.stop(cb); // Shut down the local node
};
distribution.node.start(() => {
  // This will run only after the node has started
  const node = {ip: '127.0.0.1', port: 8765};
  distribution.local.status.spawn(node, (e, v) => {
    if (e) {
      return out(console.log);
    }
    // This will run only after the new node has been spawned
    distribution.all.status.get('sid', (e, v) => {
      // This will run only after we communicated with all nodes and got their sids
      console.log(v); // { '8cf1b': '8cf1b', '8cf1c': '8cf1c' }
      // Shut down the remote node
      distribution.local.comm.send([], {service: 'status', method: 'stop', node: node}, () => {
        // Finally, stop the local node
        out(console.log); // null, {ip: '127.0.0.1', port: 1380}
      });
    });
  });
});
```

# Results and Reflections
name: Wan Yi Sze 
email: wan_yi_sze@brown.edu
cslogin: wsze3

## M0
### Summary
My implementation consists of 8 components addressing T1--8. The most challenging aspect was learning shell commands because I rarely use them and am not very familiar with it.

### Correctness & Performance Characterization
To characterize correctness, we developed 8 that test the following cases: 
- generates correct 1/2/3-grams from a token stream
- extracts the expected plain text from HTML input
- extracts the correct set of URLs from an HTML page resolving against a given base URL
- turns processed terms into local index
- incrementally merges multiple local index files into one global index and matches the expected merged result
- normalizes input text into the canonical token stream used downstream
- searches a global index and returns the matching lines for a term
- stems tokens correctly 

I characterized performance using throughput metrics for each stage of the pipeline. For the crawler, I measured pages downloaded per second by timing how long it took to run crawl.sh over a fixed set of URLs and dividing the number of successful crawls by the elapsed time. For the indexer, I measured pages indexed per second by timing only the index.sh step (excluding crawling), summing indexing time across pages, and dividing the number of successful index operations by that total indexing time. For querying, I measured queries per second by timing a batch of representative queries against a d/global-index.txt, and dividing the number of successful query runs by the total query time.

The throughput of various subsystems is described in the `"throughput"` portion of package.json. The characteristics of my development machines are summarized in the `"dev"` portion of package.json.

### Wild Guess
5000 lines of code because it would probably take a lot more code to ensure fault tolerance and low latency etc. 

## M1
### Summary
I had 2 recursive functions for serializing and deserializing, namely encode and decode. Encode converts values into tagged objects, with the "type" field indicating its type and the value field storing the data. Decode reverses this process and reconstructs the original values.

My implementation comprises 4 software components, totaling 213 lines of code. Key challenges included debugging the recursive implementation for serialization and deserialization. I addressed it by using the JS debugger to see where it went wrong.

### Correctness & Performance Characterization
*Correctness*: I wrote 5 tests; these tests take 2.28s to execute locally. This includes nested objects and arrays with mixed types, special JavaScript values like null, undefined, NaN, Infinity, booleans, numbers, strings, correct Date round-tripping, function serialization and deserialization via behavioral checks, error construction and message preservation, and object aliasing.

*Performance*: The latency of various subsystems is described in the `"latency"` portion of package.json. The characteristics of my development machines are summarized in the `"dev"` portion of package.json.

## M2
### Summary
My implementation comprises 4 software components, totaling 274 lines of code. Key challenges included 

### Correctness & Performance Characterization
*Correctness*: I wrote 5 tests; these tests take 0.654 s to execute.

*Performance*: I characterized the performance of comm and RPC by sending 1000 service requests in a tight loop. Average throughput and latency is recorded in `package.json`.

### Key Feature
How would you explain the implementation of `createRPC` to someone who has no background in computer science — i.e., with the minimum jargon possible?
`createRPC` makes a new function that sends your inputs to the computer that owns the original function, runs it and delivers the output back.