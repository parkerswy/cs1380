#!/usr/bin/env node
// @ts-check
/// <reference types="node" />

/**
 * @typedef {Object} Args
 * @property {string[]} _
 * @property {boolean | string} [aws]
 * @property {boolean | string} [help]
 * @property {string} [ami]
 * @property {string} [branch]
 * @property {string} [cluster]
 * @property {string} [gid]
 * @property {string} [limit]
 * @property {string} [nodes]
 * @property {string} [peer]
 * @property {string} [region]
 * @property {string} [repo]
 * @property {string} [seeds]
 * @property {string} [tag]
 * @property {boolean | string} [fresh]
 * @property {string} ["base-port"]
 * @property {string} ["coordinator-port"]
 * @property {string} ["github-token-env"]
 * @property {string} ["github-user"]
 * @property {string} ["idle-ms"]
 * @property {string} ["instance-type"]
 * @property {string} ["key-name"]
 * @property {string} ["max-rounds"]
 * @property {string} ["round-size"]
 * @property {string} ["security-group-id"]
 * @property {string} ["ssh-key"]
 * @property {string} ["ssh-user"]
 * @property {string} ["subnet-id"]
 * @property {string} [target]
 *
 * @typedef {Object} SearchNode
 * @property {string} ip
 * @property {number} port
 * @property {string} [instanceId]
 * @property {string} [privateIp]
 * @property {string} [state]
 *
 * @typedef {Object} Cluster
 * @property {string} gid
 * @property {{ip: string, port: number}} coordinator
 * @property {SearchNode[]} nodes
 * @property {string} [branch]
 * @property {string} [createdAt]
 * @property {number} [idleMs]
 * @property {number} [lastUsed]
 * @property {string} [mode]
 * @property {string} [region]
 * @property {string} [repo]
 * @property {string} [securityGroupId]
 * @property {string} [sshKey]
 * @property {string} [sshUser]
 * @property {string} [stoppedAt]
 *
 * @typedef {{stdout: string, stderr: string}} ExecResult
 * @typedef {{url: string, score: number}} SearchResult
 * @typedef {(query: string, limit: number) => Promise<SearchResult[]>} QueryRunner
 * @typedef {{search: Record<string, Function>}} SearchServices
 */

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const readline = require("node:readline");
const {spawn} = require("node:child_process");
const distributionFactory = require("../distribution.js");

const DEFAULT_CLUSTER_FILE = path.resolve(process.cwd(), "store", "search-cluster.json");
const DEFAULT_AWS_CLUSTER_FILE = path.resolve(process.cwd(), "store", "search-aws-cluster.json");
const DEFAULT_REPO = "https://github.com/parkerswy/cs1380.git";
const DEFAULT_BRANCH = "search-engine";
const LEGACY_DEFAULT_BRANCH = "main";
const DEFAULT_IDLE_MS = 5 * 60 * 1000;

/**
 * @param {string[]} argv
 * @returns {Args}
 */
function parseArgs(argv) {
  /** @type {Args} */
  const args = {_: []};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/search-control.js crawl  [--gid search] [--nodes 3] [--target 100000]
  node scripts/search-control.js start  [--gid search] --aws
  node scripts/search-control.js query  [--gid search]
  node scripts/search-control.js status [--gid search]
  node scripts/search-control.js reset  [--gid search]

Options:
  --aws                  Use EC2 workers instead of local worker processes
  --cluster <path>       Cluster config file (default: store/search-cluster.json)
  --coordinator-port <n> Temporary local coordinator port (default: 9099)
  --base-port <n>        First worker port for crawl-created local nodes (default: 9100)
  --seeds <path>         Seed URL file for crawl (default: scripts/m6-seeds.txt)
  --round-size <n>       Crawl attempts per node per round (default: 2)
  --repo <url>           Git repository to clone on AWS nodes
                         (default: ${DEFAULT_REPO})
  --branch <name>        Git branch to checkout on AWS nodes
                         (default: ${DEFAULT_BRANCH})
  --fresh                Ignore saved AWS cluster config and create new nodes

AWS options:
  --region <name>        AWS region (or AWS_REGION)
  --nodes <n>            Number of EC2 workers to create on first crawl (default: 3)
  --ami <id>             AMI id; defaults to Ubuntu 22.04 from SSM
  --instance-type <type> EC2 instance type (default: t3.micro)
  --key-name <name>      EC2 key pair name
  --ssh-key <path>       Private key path for SSH
  --ssh-user <user>      SSH user (default: ubuntu)
  --security-group-id <id> Reuse an existing security group
  --subnet-id <id>       Optional subnet id for run-instances
  --peer <n|sid|ip>      AWS node to coordinate command from (default: 0)
  --idle-ms <n>          Stop instances after this much idle time (default: 300000)
  --github-token-env <n> Env var with GitHub token for private clone/pull
                         (default: SEARCH_GITHUB_TOKEN, fallback: GITHUB_TOKEN)
  --github-user <name>   GitHub credential username (default: x-access-token)
`);
}

/**
 * @param {Function} fn
 * @param {any[]} args
 * @returns {Promise<any>}
 */
function call(fn, args) {
  return new Promise((resolve, reject) => {
    fn(...args, (error, value) => {
      const emptyErrorMap = error && typeof error === "object" &&
        !(error instanceof Error) && Object.keys(error).length === 0;
      if (error && !emptyErrorMap) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{env?: NodeJS.ProcessEnv, input?: string}} [options]
 * @returns {Promise<ExecResult>}
 */
function execFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      stdio: [options.input == null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (options.input != null && child.stdin) {
      child.stdin.end(options.input);
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({stdout, stderr});
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
      }
    });
  });
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string[]} args
 * @param {Cluster | string} [clusterOrRegion]
 * @returns {Promise<string>}
 */
async function aws(args, clusterOrRegion) {
  const region = typeof clusterOrRegion === "string" ?
    clusterOrRegion :
    clusterOrRegion && clusterOrRegion.region;
  const fullArgs = region ? args.concat(["--region", region]) : args;
  const result = await execFile("aws", fullArgs);
  return result.stdout.trim();
}

/**
 * @param {string[]} args
 * @param {Cluster | string} [clusterOrRegion]
 * @returns {Promise<any>}
 */
async function awsJson(args, clusterOrRegion) {
  const output = await aws(args, clusterOrRegion);
  return output ? JSON.parse(output) : {};
}

/**
 * @param {Args} args
 * @param {string} name
 * @param {string} envName
 * @returns {string}
 */
function requireOption(args, name, envName) {
  const value = args[name] || (envName && process.env[envName]);
  if (!value) {
    throw new Error(`missing --${name}${envName ? ` or ${envName}` : ""}`);
  }
  return String(value);
}

/**
 * @param {SearchNode} node
 * @returns {string}
 */
function getSid(node) {
  return globalThis.distribution.util.id.getSID(node);
}

/**
 * @param {string} file
 */
function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
}

/**
 * @param {string} file
 * @returns {Cluster}
 */
function readCluster(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * @param {string} file
 * @param {Cluster} cluster
 */
function writeCluster(file, cluster) {
  ensureDir(file);
  fs.writeFileSync(file, `${JSON.stringify(cluster, null, 2)}\n`);
}

/**
 * @param {Args} args
 * @returns {string}
 */
function clusterPathFor(args) {
  const fallback = args.aws ? DEFAULT_AWS_CLUSTER_FILE : DEFAULT_CLUSTER_FILE;
  return path.resolve(process.cwd(), String(args.cluster || fallback));
}

/**
 * @param {string} file
 * @returns {string[]}
 */
function readSeeds(file) {
  return fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
}

/**
 * @param {number} port
 */
async function startDistribution(port) {
  globalThis.distribution = distributionFactory({ip: "127.0.0.1", port});
  await call(globalThis.distribution.node.start, []);
}

async function stopCoordinator() {
  const server = globalThis.distribution &&
    globalThis.distribution.node &&
    globalThis.distribution.node.server;
  if (!server || !server.listening) {
    return;
  }
  await new Promise((resolve) => server.close(resolve));
}

/**
 * @param {string} gid
 * @param {SearchNode[]} nodes
 */
async function installGroup(gid, nodes) {
  const group = {};
  for (const node of nodes) {
    group[getSid(node)] = node;
  }
  await call(globalThis.distribution.local.groups.put, [{gid}, group]);
  await call(globalThis.distribution[gid].groups.put, [{gid}, group]);
  return group;
}

/**
 * @param {SearchNode[]} nodes
 */
async function stopNodes(nodes) {
  for (const node of nodes) {
    try {
      await call(globalThis.distribution.local.comm.send, [
        [],
        {node, service: "status", method: "stop"},
      ]);
      console.log(`[search-control] stopped ${node.ip}:${node.port}`);
    } catch (error) {
      console.error(`[search-control] could not stop ${node.ip}:${node.port}: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }
}

/**
 * @param {Args} args
 * @param {(services: SearchServices, cluster: Cluster) => Promise<any>} work
 */
async function withCoordinator(args, work) {
  const clusterPath = clusterPathFor(args);
  const cluster = readCluster(clusterPath);
  const gid = String(args.gid || cluster.gid || "search");
  const port = Number(args["coordinator-port"] || cluster.coordinator.port || 9099);
  await startDistribution(port);
  await installGroup(gid, cluster.nodes);
  try {
    return await work(globalThis.distribution[gid], cluster);
  } finally {
    await stopCoordinator();
  }
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 */
function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.connect({host, port});
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`timeout waiting for ${host}:${port}`));
        } else {
          setTimeout(probe, 1000);
        }
      });
    };
    probe();
  });
}

/**
 * @param {Cluster} cluster
 * @param {SearchNode} node
 * @param {string} remoteCommand
 * @returns {string[]}
 */
function sshArgs(cluster, node, remoteCommand) {
  const args = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
  ];
  if (cluster.sshKey) {
    args.push("-i", cluster.sshKey);
  }
  args.push(`${cluster.sshUser}@${node.ip}`, "bash", "-lc", remoteCommand);
  return args;
}

/**
 * @param {Cluster} cluster
 * @param {SearchNode} node
 * @param {string} remoteCommand
 * @param {string} [input]
 */
async function ssh(cluster, node, remoteCommand, input) {
  let lastError;
  let lastWasTransient = false;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      return await execFile("ssh", sshArgs(cluster, node, remoteCommand), {input});
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /Connection timed out|Connection refused|No route to host|Operation timed out/.test(message);
      lastWasTransient = transient;
      if (!transient || attempt === 12) {
        break;
      }
      await sleep(10000);
    }
  }
  if (!lastWasTransient) {
    throw lastError;
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`could not SSH to ${node.ip}:22 after retries; check that the instance is running, has a public IP, and its security group allows inbound SSH. Last error: ${detail}`);
}

/**
 * @param {string} value
 * @returns {string}
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {Args} args
 * @returns {{token: string, user: string, envName: string}}
 */
function githubAuth(args) {
  const envName = String(args["github-token-env"] || "SEARCH_GITHUB_TOKEN");
  const token = process.env[envName] || process.env.GITHUB_TOKEN || "";
  return {
    envName,
    token,
    user: String(args["github-user"] || "x-access-token"),
  };
}

/**
 * @param {string} region
 * @returns {Promise<string>}
 */
async function getDefaultAmi(region) {
  const data = await awsJson([
    "ssm", "get-parameter",
    "--name", "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id",
    "--query", "Parameter.Value",
    "--output", "json",
  ], region);
  return String(data);
}

/**
 * @param {string} region
 * @returns {Promise<string>}
 */
async function getDefaultVpc(region) {
  const data = await awsJson([
    "ec2", "describe-vpcs",
    "--filters", "Name=isDefault,Values=true",
    "--query", "Vpcs[0].VpcId",
    "--output", "json",
  ], region);
  if (!data || data === "None") {
    throw new Error("could not find a default VPC; pass --security-group-id and --subnet-id");
  }
  return String(data);
}

/**
 * @param {Args} args
 * @param {string} region
 * @param {string} tag
 * @returns {Promise<string>}
 */
async function ensureSecurityGroup(args, region, tag) {
  if (args["security-group-id"]) {
    return String(args["security-group-id"]);
  }

  const name = `${tag}-sg`;
  const existing = await awsJson([
    "ec2", "describe-security-groups",
    "--filters", `Name=group-name,Values=${name}`,
    "--query", "SecurityGroups[0].GroupId",
    "--output", "json",
  ], region);
  if (existing && existing !== "None") {
    return String(existing);
  }

  const vpc = await getDefaultVpc(region);
  const groupId = await awsJson([
    "ec2", "create-security-group",
    "--group-name", name,
    "--description", "CS1380 M6 search workers",
    "--vpc-id", vpc,
    "--query", "GroupId",
    "--output", "json",
  ], region);

  const basePort = Number(args["base-port"] || 9100);
  const nodes = Math.max(1, Number(args.nodes || 3));
  const lastPort = basePort + nodes - 1;
  await aws([
    "ec2", "authorize-security-group-ingress",
    "--group-id", String(groupId),
    "--ip-permissions",
    `IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0}]`,
    `IpProtocol=tcp,FromPort=${basePort},ToPort=${lastPort},IpRanges=[{CidrIp=0.0.0.0/0}]`,
  ], region).catch(() => "");
  return String(groupId);
}

/**
 * @param {string[]} instanceIds
 * @param {string} region
 * @returns {Promise<Array<{InstanceId: string, State: string, PublicIpAddress?: string, PrivateIpAddress?: string}>>}
 */
async function describeInstances(instanceIds, region) {
  const data = await awsJson([
    "ec2", "describe-instances",
    "--instance-ids", ...instanceIds,
    "--query", "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIpAddress:PublicIpAddress,PrivateIpAddress:PrivateIpAddress}",
    "--output", "json",
  ], region);
  return Array.isArray(data) ? data : [];
}

/**
 * @param {Cluster} cluster
 * @returns {Promise<Cluster>}
 */
async function refreshAwsIps(cluster) {
  const ids = cluster.nodes.map((node) => node.instanceId);
  const instances = await describeInstances(ids, cluster.region);
  const byId = new Map(instances.map((instance) => [instance.InstanceId, instance]));
  for (const node of cluster.nodes) {
    const instance = byId.get(node.instanceId);
    if (instance) {
      node.ip = instance.PublicIpAddress || node.ip;
      node.privateIp = instance.PrivateIpAddress || node.privateIp;
      node.state = instance.State;
    }
  }
  return cluster;
}

/**
 * @param {string[]} instanceIds
 * @param {string} region
 * @param {"running" | "stopped"} state
 */
async function waitForInstances(instanceIds, region, state) {
  const waiter = state === "running" ? "instance-running" : "instance-stopped";
  await aws(["ec2", "wait", waiter, "--instance-ids", ...instanceIds], region);
}

/**
 * @param {Args} args
 * @param {string} clusterPath
 * @returns {Promise<Cluster>}
 */
async function createAwsCluster(args, clusterPath) {
  const gid = String(args.gid || "search");
  const region = String(args.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1");
  const nodes = Math.max(1, Number(args.nodes || 3));
  const basePort = Number(args["base-port"] || 9100);
  const tag = String(args.tag || `${gid}-m6-search`);
  const keyName = requireOption(args, "key-name", "SEARCH_AWS_KEY_NAME");
  const sshKey = requireOption(args, "ssh-key", "SEARCH_AWS_SSH_KEY");
  const instanceType = String(args["instance-type"] || "t3.micro");
  const ami = String(args.ami || process.env.SEARCH_AWS_AMI || await getDefaultAmi(region));
  const securityGroupId = await ensureSecurityGroup(args, region, tag);

  const runArgs = [
    "ec2", "run-instances",
    "--image-id", ami,
    "--instance-type", instanceType,
    "--key-name", keyName,
    "--security-group-ids", securityGroupId,
    "--count", String(nodes),
    "--tag-specifications", `ResourceType=instance,Tags=[{Key=Name,Value=${tag}},{Key=Project,Value=cs1380-m6-search}]`,
    "--query", "Instances[].InstanceId",
    "--output", "json",
  ];
  if (args["subnet-id"]) {
    runArgs.splice(runArgs.indexOf("--count"), 0, "--subnet-id", String(args["subnet-id"]));
  }
  const instanceIds = await awsJson(runArgs, region);
  await waitForInstances(instanceIds, region, "running");

  const cluster = {
    mode: "aws",
    gid,
    region,
    sshUser: String(args["ssh-user"] || "ubuntu"),
    sshKey,
    repo: String(args.repo || DEFAULT_REPO),
    branch: String(args.branch || DEFAULT_BRANCH),
    idleMs: Number(args["idle-ms"] || DEFAULT_IDLE_MS),
    coordinator: {ip: "127.0.0.1", port: Number(args["coordinator-port"] || 9099)},
    securityGroupId,
    nodes: instanceIds.map((instanceId, index) => ({
      instanceId,
      ip: "",
      privateIp: "",
      port: basePort + index,
    })),
    createdAt: new Date().toISOString(),
    lastUsed: Date.now(),
  };
  await refreshAwsIps(cluster);
  writeCluster(clusterPath, cluster);
  return cluster;
}

/**
 * @param {Args} args
 * @param {string} clusterPath
 * @param {string} reason
 * @returns {Promise<Cluster>}
 */
async function createFreshAwsCluster(args, clusterPath, reason) {
  if (fs.existsSync(clusterPath)) {
    const backupPath = `${clusterPath}.${Date.now()}.bak`;
    fs.copyFileSync(clusterPath, backupPath);
    console.log(`[search-control] backed up old AWS cluster config to ${backupPath}`);
  }
  console.log(`[search-control] creating fresh AWS cluster: ${reason}`);
  return createAwsCluster(args, clusterPath);
}

/**
 * @param {Cluster} cluster
 * @param {SearchNode} node
 * @param {Args} args
 */
async function setupRemoteNode(cluster, node, args) {
  const repoDir = "cs1380";
  const auth = githubAuth(args);
  const setup = [
    "set -e",
    "GITHUB_TOKEN=\"$(cat)\"",
    "AUTH_HOME=\"\"",
    "cleanup_github_auth() { if [ -n \"$AUTH_HOME\" ] && [ -d \"$AUTH_HOME\" ]; then rm -rf \"$AUTH_HOME\"; fi; }",
    "trap cleanup_github_auth EXIT",
    "if [ -n \"$GITHUB_TOKEN\" ]; then",
    "  AUTH_HOME=\"$(mktemp -d)\"",
    "  umask 077",
    `  printf 'machine github.com\\n  login %s\\n  password %s\\n' ${shellQuote(auth.user)} "$GITHUB_TOKEN" > "$AUTH_HOME/.netrc"`,
    "fi",
    "git_with_auth() { if [ -n \"$AUTH_HOME\" ]; then HOME=\"$AUTH_HOME\" git \"$@\"; else git \"$@\"; fi; }",
    "if command -v apt-get >/dev/null 2>&1; then",
    "  sudo apt-get update -y",
    "  sudo apt-get install -y git curl ca-certificates",
    "  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then",
    "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -",
    "    sudo apt-get install -y nodejs",
    "  fi",
    "fi",
    "node --version",
    "npm --version",
    `if [ ! -d ${shellQuote(repoDir)}/.git ]; then git_with_auth clone ${shellQuote(cluster.repo || DEFAULT_REPO)} ${shellQuote(repoDir)}; fi`,
    `cd ${shellQuote(repoDir)}`,
    `git_with_auth fetch origin ${shellQuote(cluster.branch || DEFAULT_BRANCH)}`,
    `git checkout ${shellQuote(cluster.branch || DEFAULT_BRANCH)}`,
    "git_with_auth pull --ff-only origin $(git branch --show-current)",
    "npm install",
  ].join("\n");
  try {
    await ssh(cluster, node, setup, auth.token);
  } catch (error) {
    const suffix = auth.token ? "" : `; for private repos set ${auth.envName} or GITHUB_TOKEN locally before running --aws`;
    if (error instanceof Error) {
      throw new Error(`${error.message}${suffix}`);
    }
    throw error;
  }
}

/**
 * @param {Cluster} cluster
 * @param {SearchNode} node
 */
async function startRemoteSearchNode(cluster, node) {
  const boot = [
    "set -e",
    "cd cs1380",
    "mkdir -p logs",
    `(pkill -f "cs1380-search-node-${node.port}" || true)`,
    `nohup node -e 'process.title="cs1380-search-node-${node.port}"; require("./distribution.js")(); const d=globalThis.distribution; d.node.config={ip:"0.0.0.0",port:${node.port}}; d.node.start((e)=>{ if(e){ console.error(e); process.exit(1); } });' > logs/search-node-${node.port}.log 2>&1 &`,
  ].join(" && ");
  await ssh(cluster, node, boot);
  try {
    await waitForPort(node.ip, node.port, 120000);
  } catch (error) {
    let remoteLog = "";
    try {
      const result = await ssh(cluster, node, `cd cs1380 && tail -n 80 logs/search-node-${node.port}.log || true`);
      remoteLog = result.stdout || result.stderr || "";
    } catch (logError) {
      remoteLog = `could not fetch remote log: ${
        logError instanceof Error ? logError.message : String(logError)
      }`;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}. If the remote log says the node started, check the EC2 security group allows inbound TCP ${node.port}. Remote log:\n${remoteLog}`);
  }
}

/**
 * @param {Args} args
 * @returns {Promise<{cluster: Cluster, clusterPath: string}>}
 */
async function ensureAwsCluster(args) {
  const clusterPath = clusterPathFor({...args, aws: true});
  let cluster;
  if (args.fresh) {
    cluster = await createFreshAwsCluster(args, clusterPath, "--fresh was passed");
  } else if (fs.existsSync(clusterPath)) {
    cluster = readCluster(clusterPath);
  } else {
    cluster = await createAwsCluster(args, clusterPath);
  }
  cluster.repo = String(args.repo || cluster.repo || DEFAULT_REPO);
  cluster.branch = String(args.branch ||
    (cluster.branch === LEGACY_DEFAULT_BRANCH ? DEFAULT_BRANCH : cluster.branch) ||
    DEFAULT_BRANCH);

  let ids = cluster.nodes.map((node) => node.instanceId);
  let states;
  try {
    states = await describeInstances(ids, cluster.region);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/InvalidInstanceID|InvalidInstanceId|does not exist|not found/i.test(message)) {
      throw error;
    }
    cluster = await createFreshAwsCluster(args, clusterPath, "saved EC2 instance ids no longer exist");
    ids = cluster.nodes.map((node) => node.instanceId);
    states = await describeInstances(ids, cluster.region);
  }
  const unusable = states.filter((instance) =>
    instance.State === "terminated" || instance.State === "shutting-down"
  );
  if (states.length !== ids.length || unusable.length) {
    cluster = await createFreshAwsCluster(args, clusterPath, "saved EC2 instances are not reusable");
    ids = cluster.nodes.map((node) => node.instanceId);
    states = await describeInstances(ids, cluster.region);
  }
  const stopped = states.filter((instance) => instance.State === "stopped").map((instance) => instance.InstanceId);
  if (stopped.length) {
    await aws(["ec2", "start-instances", "--instance-ids", ...stopped], cluster.region);
    await waitForInstances(stopped, cluster.region, "running");
  }
  await refreshAwsIps(cluster);
  cluster.idleMs = Number(args["idle-ms"] || DEFAULT_IDLE_MS);
  cluster.lastUsed = Date.now();
  writeCluster(clusterPath, cluster);

  for (const node of cluster.nodes) {
    await setupRemoteNode(cluster, node, args);
    await startRemoteSearchNode(cluster, node);
  }
  cluster.lastUsed = Date.now();
  writeCluster(clusterPath, cluster);
  return {cluster, clusterPath};
}

/**
 * @param {string} clusterPath
 * @param {number} idleMs
 */
function scheduleAwsIdleStop(clusterPath, idleMs) {
  const script = `
const fs = require("node:fs");
const {spawnSync} = require("node:child_process");
const clusterPath = ${JSON.stringify(clusterPath)};
const idleMs = ${Number(idleMs)};
setTimeout(() => {
  try {
    const cluster = JSON.parse(fs.readFileSync(clusterPath, "utf8"));
    if (Date.now() - Number(cluster.lastUsed || 0) < idleMs - 1000) return;
    const ids = cluster.nodes.map((node) => node.instanceId).filter(Boolean);
    if (!ids.length) return;
    spawnSync("aws", ["ec2", "stop-instances", "--instance-ids", ...ids, "--region", cluster.region], {stdio: "ignore"});
    cluster.stoppedAt = new Date().toISOString();
    fs.writeFileSync(clusterPath, JSON.stringify(cluster, null, 2) + "\\n");
  } catch {}
}, idleMs);
`;
  const child = spawn(process.execPath, ["-e", script], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/**
 * @param {Args} args
 * @param {(cluster: Cluster, gid: string) => Promise<any>} work
 */
async function withAwsCoordinator(args, work) {
  const {cluster, clusterPath} = await ensureAwsCluster(args);
  const gid = String(args.gid || cluster.gid || "search");
  await startDistribution(Number(args["coordinator-port"] || cluster.coordinator.port || 9099));
  await installGroup(gid, cluster.nodes);
  try {
    const result = await work(cluster, gid);
    cluster.lastUsed = Date.now();
    writeCluster(clusterPath, cluster);
    scheduleAwsIdleStop(clusterPath, Number(args["idle-ms"] || cluster.idleMs || DEFAULT_IDLE_MS));
    return result;
  } finally {
    await stopCoordinator();
  }
}

/**
 * @param {Args} args
 * @param {Cluster} cluster
 * @returns {SearchNode}
 */
function pickAwsPeer(args, cluster) {
  const peer = args.peer == null ? "0" : String(args.peer);
  const byIndex = Number(peer);
  if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < cluster.nodes.length) {
    return cluster.nodes[byIndex];
  }
  const selected = cluster.nodes.find((node) =>
    node.ip === peer ||
    node.privateIp === peer ||
    node.instanceId === peer ||
    getSid(node) === peer
  );
  if (!selected) {
    throw new Error(`no AWS peer matches ${peer}`);
  }
  return selected;
}

/**
 * @param {Args} args
 * @param {Cluster} cluster
 * @param {string} gid
 * @param {string} method
 * @param {any[]} message
 */
async function sendToAwsPeer(args, cluster, gid, method, message) {
  const peer = pickAwsPeer(args, cluster);
  return call(globalThis.distribution.local.comm.send, [
    message,
    {node: peer, gid, service: "search", method},
  ]);
}

/**
 * @param {Args} args
 */
async function crawlCommand(args) {
  if (args.aws) {
    const seedPath = path.resolve(process.cwd(), String(args.seeds || "scripts/m6-seeds.txt"));
    const seeds = readSeeds(seedPath);
    await withAwsCoordinator(args, async (cluster, gid) => {
      const seedResult = await sendToAwsPeer(args, cluster, gid, "seed", [seeds]);
      console.log(JSON.stringify({seeded: seeds.length, result: seedResult}, null, 2));
      const crawlResult = await sendToAwsPeer(args, cluster, gid, "crawl", [{
        targetPages: Number(args.target || 100000),
        roundSize: Number(args["round-size"] || 2),
        maxRounds: Number(args["max-rounds"] || 1000000),
      }]);
      console.log(JSON.stringify(crawlResult, null, 2));
    });
    return;
  }

  const gid = String(args.gid || "search");
  const nodes = Math.max(1, Number(args.nodes || 3));
  const basePort = Number(args["base-port"] || 9100);
  const coordinatorPort = Number(args["coordinator-port"] || 9099);
  const clusterPath = clusterPathFor(args);
  const seedPath = path.resolve(process.cwd(), String(args.seeds || "scripts/m6-seeds.txt"));

  await startDistribution(coordinatorPort);
  const spawned = [];
  try {
    for (let i = 0; i < nodes; i += 1) {
      const node = {ip: "127.0.0.1", port: basePort + i};
      await call(globalThis.distribution.local.status.spawn, [node]);
      spawned.push(node);
    }
    await installGroup(gid, spawned);
    writeCluster(clusterPath, {
      gid,
      coordinator: {ip: "127.0.0.1", port: coordinatorPort},
      nodes: spawned,
      createdAt: new Date().toISOString(),
    });
    console.log(`[search-control] started ${spawned.length} node(s) for gid=${gid}`);
    console.log(`[search-control] wrote ${clusterPath}`);
    const seeds = readSeeds(seedPath);
    const seedResult = await call(globalThis.distribution[gid].search.seed, [seeds]);
    console.log(JSON.stringify({seeded: seeds.length, result: seedResult}, null, 2));

    const crawlResult = await call(globalThis.distribution[gid].search.crawl, [{
      targetPages: Number(args.target || 100000),
      roundSize: Number(args["round-size"] || 2),
      maxRounds: Number(args["max-rounds"] || 1000000),
    }]);
    console.log(JSON.stringify(crawlResult, null, 2));
  } finally {
    await stopNodes(spawned);
    await stopCoordinator();
  }
}

/**
 * @param {Args} args
 */
async function startCommand(args) {
  if (!args.aws) {
    throw new Error("start is currently for AWS clusters only; use crawl for local test nodes");
  }
  const {cluster, clusterPath} = await ensureAwsCluster(args);
  cluster.lastUsed = Date.now();
  writeCluster(clusterPath, cluster);
  scheduleAwsIdleStop(clusterPath, Number(args["idle-ms"] || cluster.idleMs || DEFAULT_IDLE_MS));
  console.log(JSON.stringify({
    started: cluster.nodes.map((node) => ({
      instanceId: node.instanceId,
      ip: node.ip,
      port: node.port,
      state: node.state,
    })),
    idleStopMs: Number(args["idle-ms"] || cluster.idleMs || DEFAULT_IDLE_MS),
  }, null, 2));
}

/**
 * @param {Args} args
 */
async function statusCommand(args) {
  if (args.aws) {
    await withAwsCoordinator(args, async (cluster, gid) => {
      const result = await sendToAwsPeer(args, cluster, gid, "stats", []);
      console.log(JSON.stringify(result, null, 2));
    });
    return;
  }

  await withCoordinator(args, async (services) => {
    const result = await call(services.search.stats, []);
    console.log(JSON.stringify(result, null, 2));
  });
}

/**
 * @param {Args} args
 */
async function resetCommand(args) {
  if (args.aws) {
    await withAwsCoordinator(args, async (cluster, gid) => {
      const result = await sendToAwsPeer(args, cluster, gid, "reset", []);
      console.log(JSON.stringify(result, null, 2));
    });
    return;
  }

  await withCoordinator(args, async (services) => {
    const result = await call(services.search.reset, []);
    console.log(JSON.stringify(result, null, 2));
  });
}

/**
 * @param {Args} args
 */
async function queryCommand(args) {
  if (args.aws) {
    await withAwsCoordinator(args, async (cluster, gid) => {
      await queryRepl(args, (query, limit) => sendToAwsPeer(args, cluster, gid, "query", [query, limit]));
    });
    return;
  }

  await withCoordinator(args, async (services) => {
    await queryRepl(args, (query, limit) => call(services.search.query, [query, limit]));
  });
}

/**
 * @param {Args} args
 * @param {QueryRunner} runQuery
 */
async function queryRepl(args, runQuery) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "search> ",
  });

  const ask = () => rl.prompt();
  rl.on("line", async (line) => {
    const query = line.trim();
    if (!query) {
      ask();
      return;
    }
    try {
      const results = await runQuery(query, Number(args.limit || 10));
      for (let i = 0; i < results.length; i += 1) {
        const item = results[i];
        console.log(`${i + 1}. ${item.url} (${item.score})`);
      }
      if (!results.length) {
        console.log("No results");
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
    ask();
  });

  await new Promise((resolve) => {
    rl.on("close", resolve);
    ask();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.help) {
    usage();
    return;
  }

  if (command === "crawl") await crawlCommand(args);
  else if (command === "start") await startCommand(args);
  else if (command === "query") await queryCommand(args);
  else if (command === "status") await statusCommand(args);
  else if (command === "reset") await resetCommand(args);
  else {
    usage();
    throw new Error(`unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
