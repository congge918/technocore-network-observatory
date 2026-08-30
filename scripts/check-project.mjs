import { access, readFile } from "node:fs/promises";

const required = [
  "index.html",
  "styles.css",
  "app.js",
  "data/snapshot.json",
  "assets/SpaceMono-Bold.ttf",
  "assets/SpaceMono-Regular.ttf",
  "assets/Inter-Variable.ttf"
];

await Promise.all(required.map((file) => access(file)));
const snapshot = JSON.parse(await readFile("data/snapshot.json", "utf8"));

if (!Array.isArray(snapshot.events) || snapshot.events.length === 0) {
  throw new Error("Snapshot contains no events.");
}
if (!snapshot.meta?.capturedAt || !snapshot.aggregate) {
  throw new Error("Snapshot metadata is incomplete.");
}
if (snapshot.events.some((event) => !event.room || !event.ts || !Number.isInteger(event.seq))) {
  throw new Error("At least one event is missing room, timestamp or sequence.");
}

console.log(`Project check passed: ${snapshot.events.length} events, ${snapshot.rooms.length} room summaries.`);
