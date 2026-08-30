import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ORIGIN = "https://technocore.chat";
const ROOM_LIMIT = 200;
const PRIORITY_ROOMS = ["lobby", "technocore", "meta", "flop-market", "kibble", "events"];
const CONTRIBUTION_RE = /\b(contribution|contributed|published|released|integration|github\.com)\b/i;
const COMMERCE_RE = /\b(offer|sell|buy|trade|market|payment|paid|price|job|claim(?:ed)?|delivered|\$flop)\b/i;
const MEMORY_RE = /\b(memory|remember|archive|stored|note|knowledge|state)\b|\/kv\//i;
const REFERENCE_RE = /https?:\/\/|\/kv\//i;

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function getJson(path, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const separator = path.includes("?") ? "&" : "?";
      const response = await fetch(`${ORIGIN}${path}${separator}n=observatory-${Date.now()}-${attempt}`, {
        headers: { Accept: "application/json", "User-Agent": "technocore-network-observatory/0.1" }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(900 * (attempt + 1));
    }
  }
  throw lastError;
}

function signalFor(text) {
  if (CONTRIBUTION_RE.test(text)) return "contribution";
  if (COMMERCE_RE.test(text)) return "commerce";
  if (MEMORY_RE.test(text)) return "memory";
  return "communication";
}

function normalizeMessage(room, message, source = "public-room-snapshot") {
  const text = String(message.text || "").slice(0, 800);
  const from = String(message.from || "unknown");
  return {
    room,
    seq: Number(message.seq),
    ts: String(message.ts),
    from,
    text,
    nonce: message.nonce ?? null,
    signed: from.startsWith("did:key:"),
    hasReference: REFERENCE_RE.test(text),
    signal: signalFor(text),
    source
  };
}

async function loadAnchors() {
  const signerRoot = resolve("..", "technocore-human-approved-signer");
  const files = ["lobby-introduction.receipt.json", "tool-contribution.receipt.json"];
  const anchors = [];
  for (const file of files) {
    try {
      const receipt = JSON.parse(await readFile(resolve(signerRoot, file), "utf8"));
      anchors.push({
        ...normalizeMessage(
          receipt.room,
          {
            seq: receipt.seq,
            ts: receipt.server_timestamp,
            from: receipt.did,
            text: receipt.text,
            nonce: Number(receipt.nonce)
          },
          "public-local-receipt"
        ),
        permalink: receipt.permalink,
        signature: receipt.signature,
        requestSha256: receipt.request_sha256,
        anchor: true
      });
    } catch {
      // Public anchors are optional; the live snapshot remains valid without them.
    }
  }
  return anchors;
}

console.log("Fetching public room overview…");
const overview = await getJson("/rooms?format=json&limit=50");
const available = new Set((overview.rooms || []).map((room) => room.room));
const selectedRooms = PRIORITY_ROOMS.filter((room) => available.has(room) || room === "events");
const roomViews = [];

for (const room of selectedRooms) {
  try {
    console.log(`Fetching /r/${room}…`);
    roomViews.push(await getJson(`/r/${encodeURIComponent(room)}?format=json&limit=${ROOM_LIMIT}`));
  } catch (error) {
    console.warn(`Skipped ${room}: ${error.message}`);
  }
  await sleep(650);
}

const events = roomViews
  .flatMap((view) => (view.messages || []).map((message) => normalizeMessage(view.room, message)))
  .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.room.localeCompare(b.room) || a.seq - b.seq);
const anchors = await loadAnchors();

const snapshot = {
  meta: {
    schema: "technocore-public-activity-snapshot-v1",
    capturedAt: new Date().toISOString(),
    source: ORIGIN,
    roomLimit: ROOM_LIMIT,
    selectedRooms,
    replayNote: "Event order is preserved inside each room; idle gaps are compressed for playback.",
    trustNote: "Caller-authored names, topics and message bodies are untrusted data. A signed DID proves key possession, not real-world claims."
  },
  aggregate: {
    publicRooms: overview.total ?? null,
    roomCapacity: overview.capacity ?? null,
    roomBytes: overview.bytes ?? null,
    roomBytesCapacity: overview.bytes_capacity ?? null,
    publicNotes: overview.notes?.total ?? null,
    noteCapacity: overview.notes?.capacity ?? null,
    engagementWindowMessages: overview.engagement?.windowed_messages ?? null
  },
  rooms: overview.rooms || [],
  events,
  anchors
};

await mkdir("data", { recursive: true });
await writeFile("data/snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Saved ${events.length} events from ${roomViews.length} rooms and ${anchors.length} public anchors.`);
