import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyAnchor } from "./lib/verify-anchor.mjs";

const snapshotPath = resolve(process.argv[2] || "data/snapshot.json");

try {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!Array.isArray(snapshot.anchors) || snapshot.anchors.length === 0) {
    throw new Error("Snapshot contains no public evidence anchors.");
  }
  const anchors = snapshot.anchors.map(verifyAnchor);
  console.log(JSON.stringify({ valid: true, verified: anchors.length, anchors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ valid: false, error: error.message }, null, 2));
  process.exitCode = 1;
}
