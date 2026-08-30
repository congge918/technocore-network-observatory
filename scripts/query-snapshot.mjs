import { readFile } from "node:fs/promises";

const usage = `Usage:
  npm run query -- summary
  npm run query -- rooms [--limit 20]
  npm run query -- events [--room ROOM] [--did DID] [--signal SIGNAL]
                         [--signed true|false] [--limit 20] [--include-anchors]`;

function fail(message) {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
}

function parseOptions(args) {
  const options = { includeAnchors: false, limit: 20 };
  const valueFlags = new Map([
    ["--room", "room"],
    ["--did", "did"],
    ["--signal", "signal"],
    ["--signed", "signed"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--include-anchors") {
      options.includeAnchors = true;
      continue;
    }
    if (flag === "--limit") {
      const limit = Number(args[++index]);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail("--limit must be an integer from 1 to 200.");
      options.limit = limit;
      continue;
    }
    const key = valueFlags.get(flag);
    if (!key || args[index + 1] == null) fail(`Unknown or incomplete option: ${flag}`);
    options[key] = args[++index];
  }

  if (options.signed != null && !["true", "false"].includes(options.signed)) {
    fail("--signed must be true or false.");
  }
  return options;
}

const [command = "summary", ...args] = process.argv.slice(2);
if (["--help", "-h", "help"].includes(command)) {
  console.log(usage);
  process.exit(0);
}
if (!["summary", "rooms", "events"].includes(command)) fail(`Unknown command: ${command}`);

const options = parseOptions(args);
const snapshot = JSON.parse(await readFile("data/snapshot.json", "utf8"));

if (command === "summary") {
  const senders = new Set(snapshot.events.map((event) => event.from));
  const signals = Object.create(null);
  for (const event of snapshot.events) signals[event.signal] = (signals[event.signal] || 0) + 1;
  console.log(
    JSON.stringify(
      {
        schema: snapshot.meta.schema,
        capturedAt: snapshot.meta.capturedAt,
        source: snapshot.meta.source,
        publicRooms: snapshot.aggregate.publicRooms,
        sampledEvents: snapshot.events.length,
        observedSenders: senders.size,
        signedEvents: snapshot.events.filter((event) => event.signed).length,
        verifiedAnchors: snapshot.anchors.length,
        signals
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (command === "rooms") {
  console.log(JSON.stringify(snapshot.rooms.slice(0, options.limit), null, 2));
  process.exit(0);
}

let events = options.includeAnchors ? [...snapshot.events, ...snapshot.anchors] : [...snapshot.events];
if (options.room) events = events.filter((event) => event.room === options.room);
if (options.did) events = events.filter((event) => event.from === options.did);
if (options.signal) events = events.filter((event) => event.signal === options.signal);
if (options.signed != null) events = events.filter((event) => event.signed === (options.signed === "true"));
events.sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts) || left.seq - right.seq);

const selected = events.slice(-options.limit);
console.log(
  JSON.stringify(
    {
      filters: {
        room: options.room || null,
        did: options.did || null,
        signal: options.signal || null,
        signed: options.signed ?? null,
        includeAnchors: options.includeAnchors,
        limit: options.limit
      },
      count: selected.length,
      events: selected
    },
    null,
    2
  )
);
