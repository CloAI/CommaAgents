import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { randomUUID, randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const [runtime, rootArgument, outputArgument, trialsArgument = "5"] =
  process.argv.slice(2);
if (!runtime || !rootArgument || !outputArgument)
  throw new Error("Usage: node compare.mjs RUNTIME ROOT OUTPUT [TRIALS]");
const root = resolve(rootArgument);
const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
const trials = Number(trialsArgument);
const timeout = (promise, milliseconds = 30000) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Benchmark timeout")),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
};
const summarize = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
    p99: sorted[Math.floor((sorted.length - 1) * 0.99)],
  };
};
function startWorker(mode = "server") {
  const started = performance.now();
  const child = spawn(runtime, [worker, root, mode], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const lines = [];
  const waiters = [];
  let failure;
  const closed = new Promise((resolveClose, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        failure = new Error(`Worker exited ${code}: ${stderr}`);
        for (const waiter of waiters.splice(0)) waiter.reject(failure);
        reject(failure);
      } else resolveClose();
    });
  });
  closed.catch(() => {});
  createInterface({ input: child.stdout }).on("line", (line) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(value);
    else lines.push(value);
  });
  return {
    child,
    closed,
    elapsed: () => performance.now() - started,
    next() {
      return timeout(
        new Promise((resolveNext, reject) => {
          if (failure) reject(failure);
          else if (lines.length) resolveNext(lines.shift());
          else waiters.push({ resolve: resolveNext, reject });
        }),
      );
    },
  };
}
async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const events = [];
  let eventHandler;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "response") {
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      if (message.ok) request.resolve(message);
      else request.reject(new Error(JSON.stringify(message.error)));
    } else if (message.type === "bench.delta") {
      if (eventHandler) eventHandler(message);
      else events.push(message);
    }
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values())
      request.reject(new Error("Unexpected socket close"));
    pending.clear();
  });
  await timeout(
    new Promise((resolveOpen, reject) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
  );
  return {
    socket,
    events,
    onEvent(handler) {
      eventHandler = handler;
    },
    request(type, name, arguments_ = {}) {
      const requestId = randomUUID();
      return timeout(
        new Promise((resolveRequest, reject) => {
          pending.set(requestId, { resolve: resolveRequest, reject });
          socket.send(
            JSON.stringify({
              type,
              requestId,
              [type === "command" ? "command" : "channel"]: name,
              arguments: arguments_,
            }),
          );
        }),
      );
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = new Promise((resolveClose) =>
        socket.addEventListener("close", resolveClose, { once: true }),
      );
      socket.close();
      await timeout(closed);
    },
  };
}
async function slowReader(url) {
  const endpoint = new URL(url);
  const socket = createConnection({
    host: endpoint.hostname.replace(/[\[\]]/g, ""),
    port: Number(endpoint.port),
  });
  socket.on("error", () => {});
  await once(socket, "connect");
  const handshake = timeout(
    new Promise((resolveHandshake, reject) => {
      let response = "";
      function onHandshake(chunk) {
        response += chunk.toString();
        if (!response.includes("\r\n\r\n")) return;
        socket.off("data", onHandshake);
        if (!response.startsWith("HTTP/1.1 101"))
          return reject(new Error("Slow-reader handshake failed"));
        socket.pause();
        resolveHandshake();
      }
      socket.on("data", onHandshake);
    }),
  );
  socket.write(
    `GET /ws HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n\r\n`,
  );
  await handshake;
  const payload = Buffer.from(
    JSON.stringify({
      type: "subscribe",
      requestId: randomUUID(),
      channel: "bench.watch",
      arguments: {},
    }),
  );
  const mask = randomBytes(4);
  const header =
    payload.length < 126
      ? Buffer.from([0x81, 0x80 | payload.length])
      : Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 255]);
  socket.write(
    Buffer.concat([
      header,
      mask,
      Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4])),
    ]),
  );
  return socket;
}
const results = [];
for (let trial = 0; trial < trials; trial++) {
  for (const [mode, workload] of [
    ["execution", "core-agent-and-template"],
    ["lifecycle", "daemon-run-persistence"],
  ]) {
    const execution = startWorker(mode);
    try {
      const result = await execution.next();
      if (result.benchmarkFailure && !runtime.includes("bun")) {
        throw new Error(`${workload}: ${result.benchmarkFailure}`);
      }
      await timeout(execution.closed);
      results.push({ trial, workload, ...result });
    } finally {
      execution.child.kill();
    }
  }
  const server = startWorker();
  const clients = new Set();
  let slow;
  try {
    const ready = await server.next();
    const startupMs = server.elapsed();
    const control = await connect(ready.url);
    clients.add(control);
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    const idle = (await control.request("command", "bench.metrics")).data;
    results.push({ trial, workload: "startup-idle", startupMs, ready, idle });
    for (const connections of [1, 10, 100]) {
      const group = await Promise.all(
        Array.from({ length: connections }, () => connect(ready.url)),
      );
      group.forEach((client) => clients.add(client));
      await Promise.all(
        group.map((client) =>
          client.request("command", "bench.echo", { payload: "warmup" }),
        ),
      );
      const latencies = [];
      const beforeMetrics = (await control.request("command", "bench.metrics"))
        .data;
      const started = performance.now();
      await Promise.all(
        group.map(async (client) => {
          for (let index = 0; index < 100; index++) {
            const start = performance.now();
            const response = await client.request("command", "bench.echo", {
              payload: "x".repeat(128),
            });
            if (response.data !== "x".repeat(128))
              throw new Error("Echo mismatch");
            latencies.push(performance.now() - start);
          }
        }),
      );
      const durationMs = performance.now() - started;
      const metrics = (await control.request("command", "bench.metrics")).data;
      results.push({
        trial,
        workload: "command-roundtrip",
        connections,
        durationMs,
        requestsPerSecond: (latencies.length / durationMs) * 1000,
        latencyMs: summarize(latencies),
        cpu: {
          user: metrics.cpu.user - beforeMetrics.cpu.user,
          system: metrics.cpu.system - beforeMetrics.cpu.system,
        },
        metrics,
      });
      await Promise.all(group.map((client) => client.close()));
      group.forEach((client) => clients.delete(client));
    }
    for (const [connections, size, count] of [
      [1, 128, 1000],
      [10, 128, 1000],
      [100, 128, 100],
      [1, 65536, 100],
    ]) {
      const group = await Promise.all(
        Array.from({ length: connections }, () => connect(ready.url)),
      );
      group.forEach((client) => clients.add(client));
      let received = 0;
      let finish;
      const completion = new Promise((resolveComplete) => {
        finish = resolveComplete;
      });
      group.forEach((client) => {
        let expected = 0;
        client.onEvent((message) => {
          if (
            message.data.sequence !== expected++ ||
            message.data.payload.length !== size
          )
            throw new Error("Stream integrity mismatch");
          if (++received === connections * count) finish();
        });
      });
      const setupStarted = performance.now();
      await Promise.all(
        group.map((client) => client.request("subscribe", "bench.watch")),
      );
      const setupMs = performance.now() - setupStarted;
      const started = performance.now();
      await Promise.all([
        control.request("command", "bench.publish", { size, count }),
        timeout(completion),
      ]);
      const durationMs = performance.now() - started;
      results.push({
        trial,
        workload: "burst-stream-fanout",
        connections,
        size,
        count,
        received,
        setupMs,
        durationMs,
        messagesPerSecond: (received / durationMs) * 1000,
      });
      await Promise.all(group.map((client) => client.close()));
      group.forEach((client) => clients.delete(client));
    }
    const paced = await connect(ready.url);
    clients.add(paced);
    await paced.request("subscribe", "bench.watch");
    const deliveryLatencies = [];
    for (let index = 0; index < 100; index++) {
      let delivered;
      const delivery = new Promise((resolveDelivery) => {
        delivered = resolveDelivery;
      });
      const start = performance.now();
      paced.onEvent((message) => {
        if (message.data.sequence !== 0 || message.data.payload.length !== 128)
          throw new Error("Paced stream mismatch");
        deliveryLatencies.push(performance.now() - start);
        delivered();
      });
      await Promise.all([
        control.request("command", "bench.publish", { count: 1, size: 128 }),
        timeout(delivery),
      ]);
      await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    }
    results.push({
      trial,
      workload: "paced-token-delivery",
      intervalMs: 5,
      latencyMs: summarize(deliveryLatencies),
    });
    await paced.close();
    clients.delete(paced);
    const churnStart = performance.now();
    for (let index = 0; index < 30; index++) {
      const client = await connect(ready.url);
      clients.add(client);
      await client.request("subscribe", "bench.watch");
      await client.close();
      clients.delete(client);
    }
    results.push({
      trial,
      workload: "reconnect-subscribe",
      connections: 30,
      durationMs: performance.now() - churnStart,
    });
    slow = await slowReader(ready.url);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        (await control.request("command", "bench.metrics")).data.subscribers ===
        1
      )
        break;
      if (attempt === 99)
        throw new Error("Slow-reader subscription not registered");
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    const before = (await control.request("command", "bench.metrics")).data;
    await control.request("command", "bench.publish", {
      size: 65536,
      count: 1000,
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    const after = (await control.request("command", "bench.metrics")).data;
    const disconnected = after.subscribers === 0;
    if (!runtime.includes("bun") && !disconnected)
      throw new Error("Node failed to disconnect overloaded reader");
    results.push({
      trial,
      workload: "slow-reader",
      publishedBytes: 65536000,
      disconnected,
      before,
      after,
    });
    slow.destroy();
    slow = undefined;
    await control.request("subscribe", "bench.watch");
    const controlClosed = new Promise((resolveClosed) =>
      control.socket.addEventListener("close", resolveClosed, { once: true }),
    );
    server.child.stdin.write("stop\n");
    results.push({
      trial,
      workload: "shutdown-active-subscription",
      ...(await server.next()),
    });
    await timeout(controlClosed);
    clients.delete(control);
    await timeout(server.closed);
  } finally {
    slow?.destroy();
    for (const client of clients) client.socket.close();
    server.child.kill();
  }
  console.error(`Completed trial ${trial + 1}/${trials}`);
}
const output = resolve(outputArgument);
await mkdir(dirname(output), { recursive: true });
const buildHashes = {};
for (const directory of ["packages/core/dist", "packages/daemon/dist"]) {
  const hash = createHash("sha256");
  for (const entry of (
    await readdir(resolve(root, directory), { recursive: true })
  )
    .filter((entry) => entry.endsWith(".js"))
    .sort()) {
    hash.update(entry);
    hash.update(await readFile(resolve(root, directory, entry)));
  }
  buildHashes[directory] = hash.digest("hex");
}
await writeFile(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      runtime,
      runtimeVersion: execFileSync(runtime, ["--version"], {
        encoding: "utf8",
      }).trim(),
      sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      dirty:
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
        }).trim().length > 0,
      workerHash: createHash("sha256")
        .update(await readFile(worker))
        .digest("hex"),
      buildHashes,
      root,
      trials,
      loadGenerator: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(output);
