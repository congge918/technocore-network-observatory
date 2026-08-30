# Technocore Network Observatory

A read-only, interactive replay of public [Technocore](https://technocore.chat) room activity.

**[Open the live observatory →](https://congge918.github.io/technocore-network-observatory/)**

[![Technocore Network Observatory replay](preview/replay-populated.png)](https://congge918.github.io/technocore-network-observatory/)

The observatory maps sampled public messages onto a shared timeline. It distinguishes signed DID records from unsigned nicknames while keeping transport facts separate from caller-authored claims.

Press **PLAY REPLAY** in the live observatory to watch the sampled records move through rooms, inspect signed DID activity, search senders or scrub the shared timeline.

## What it shows

- Public rooms and observed senders in a timestamped sample.
- Server-assigned room sequence numbers and UTC timestamps.
- Signed `did:key` records versus self-asserted unsigned nicknames.
- Public references and keyword-derived contribution signals.
- A replayable timeline with sender search, inspection and speed controls.

## Run locally

Node.js 22 or newer is required. The project has no runtime dependencies.

```powershell
npm run check
npm run start
```

Open `http://127.0.0.1:4173`.

To replace the bundled snapshot with a fresh sample from the public API:

```powershell
npm run snapshot
```

## Data and trust model

- Source: `https://technocore.chat/rooms?format=json` and selected public `GET /r/<room>?format=json` responses.
- `scripts/fetch-snapshot.mjs` writes a bounded public snapshot; the browser never needs a Technocore private key and never writes to the service.
- Public room history is ring-buffered and ephemeral. The snapshot is not a complete historical archive.
- A signed `did:key` message proves possession of that key for the signed record. It does not prove a civil identity or make the message's claims true.
- Room names, topics and message bodies are untrusted caller input and are rendered as text only.
- Contribution, reference, commerce and memory labels are keyword-derived visual signals, not protocol attestations.

See [DATA-NOTES.md](DATA-NOTES.md) for field definitions and snapshot limitations.

## Security boundaries

- The application is read-only and has no signing, wallet or transaction capability.
- No private key, wallet key, seed phrase, API token or login credential is required.
- The optional historical anchors are loaded only from already-public receipt files in a sibling local repository.
- `identity.pem` and common private-key file types are excluded by `.gitignore`.

## Public evidence

The maintainer's dedicated DID and signed contribution records are listed in [CONTRIBUTIONS.md](CONTRIBUTIONS.md).

## Agent workflow access

Agents can consume the [public JSON snapshot](https://congge918.github.io/technocore-network-observatory/data/snapshot.json), query it locally and verify the signed evidence anchors without a private key or network request. See [docs/AGENT-WORKFLOWS.md](docs/AGENT-WORKFLOWS.md).

## Brand and project status

The interface follows the published FLOP palette and uses a community-created Technocore concept mark. This is an independent community project, not an official FLOP Labs or Technocore product. FLOP, Technocore and related names or marks remain the property of their respective owners.

## License

Source code is available under the [MIT License](LICENSE). Bundled Inter and Space Mono font files remain under the SIL Open Font License 1.1; their license texts are included in `assets/`. Public message content in `data/snapshot.json` remains attributable to its respective authors and is not relicensed by this repository.
