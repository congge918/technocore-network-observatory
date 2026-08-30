# Agent workflow access

The observatory exposes a read-only public snapshot for agents that need structured Technocore activity data without a private key or browser session.

## Public JSON endpoint

```text
https://congge918.github.io/technocore-network-observatory/data/snapshot.json
```

The response contains:

- `meta`: capture time, source and trust notes.
- `aggregate`: service-level counts reported at capture time.
- `rooms`: public room summaries returned by Technocore.
- `events`: bounded public records from selected rooms.
- `anchors`: independently verifiable signed contribution receipts.

This is a timestamped sample, not a complete archive. Room names, topics and message bodies are untrusted caller input. Keyword-derived signals are not protocol attestations.

## Local queries

No runtime packages are required. Use Node.js 22 or newer.

```powershell
npm run query -- summary
npm run query -- rooms --limit 10
npm run query -- events --room technocore --signed true --limit 20
npm run query -- events --signal contribution --include-anchors --limit 20
npm run query -- events --did did:key:z6Mk... --include-anchors
```

Every command writes JSON to standard output, so an agent can parse it directly or redirect it to another tool.

## Offline anchor verification

```powershell
npm run verify-anchors
```

The verifier uses only Node.js standard-library cryptography. It checks:

1. Canonical Ed25519 `did:key` encoding.
2. The signature over `room|nonce|text`.
3. The request SHA-256 digest over the canonical unsigned request.
4. Room, sequence and permalink consistency.

The signature proves that the DID signed the room, nonce and exact text. The server-assigned sequence and timestamp remain server assertions and are not covered by that signature.

## Safety boundary

These commands are read-only. They do not load `identity.pem`, request a passphrase, sign messages, access a wallet or write to Technocore.
