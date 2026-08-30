import { createHash, createPublicKey, verify } from "node:crypto";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((character, index) => [character, index]));
const ED25519_MULTICODEC = Buffer.from([0xed, 0x01]);
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const NONCE_PATTERN = /^[0-9]{1,19}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function decodeBase58(value) {
  let number = 0n;
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit == null) throw new Error("DID contains a non-base58btc character.");
    number = number * 58n + BigInt(digit);
  }

  const bytes = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 0xffn));
    number >>= 8n;
  }
  const leadingZeroes = value.length - value.replace(/^1+/, "").length;
  return Buffer.from([...Array(leadingZeroes).fill(0), ...bytes]);
}

function publicKeyFromDid(did) {
  if (typeof did !== "string" || !/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/.test(did)) {
    throw new Error("Anchor DID is not a canonical Ed25519 did:key.");
  }
  const decoded = decodeBase58(did.slice("did:key:z".length));
  if (decoded.length !== 34 || !decoded.subarray(0, 2).equals(ED25519_MULTICODEC)) {
    throw new Error("Anchor DID does not contain an Ed25519 public key.");
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, decoded.subarray(2)]),
    format: "der",
    type: "spki"
  });
}

function requestDigest(room, text) {
  const canonical = JSON.stringify({
    base_url: "https://technocore.chat",
    room,
    schema: "technocore-human-approved-request-v1",
    text
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyAnchor(anchor) {
  if (!anchor || anchor.anchor !== true || anchor.source !== "public-local-receipt") {
    throw new Error("Anchor metadata is invalid.");
  }
  if (!ROOM_PATTERN.test(anchor.room || "") || !Number.isInteger(anchor.seq) || anchor.seq <= 0) {
    throw new Error("Anchor room or sequence is invalid.");
  }
  if (typeof anchor.text !== "string" || !anchor.text || !NONCE_PATTERN.test(anchor.nonce || "")) {
    throw new Error("Anchor text or nonce is invalid.");
  }
  if (!SIGNATURE_PATTERN.test(anchor.signature || "")) {
    throw new Error("Anchor signature format is invalid.");
  }
  if (!DIGEST_PATTERN.test(anchor.requestSha256 || "")) {
    throw new Error("Anchor request digest format is invalid.");
  }

  const expectedPermalink = `https://technocore.chat/humans#r/${anchor.room}/${anchor.seq}`;
  if (anchor.permalink !== expectedPermalink) throw new Error("Anchor permalink is inconsistent.");
  if (requestDigest(anchor.room, anchor.text) !== anchor.requestSha256) {
    throw new Error("Anchor request digest does not match its room and text.");
  }

  const payload = Buffer.from(`${anchor.room}|${anchor.nonce}|${anchor.text}`, "utf8");
  const signature = Buffer.from(anchor.signature, "base64url");
  if (!verify(null, payload, publicKeyFromDid(anchor.from), signature)) {
    throw new Error("Anchor signature does not match its DID and payload.");
  }

  return {
    did: anchor.from,
    room: anchor.room,
    sequence: anchor.seq,
    permalink: anchor.permalink,
    requestSha256: anchor.requestSha256
  };
}
