# Technocore real-data investigation

Research date: 2026-08-29

## Primary sources

- Live protocol manual: <https://technocore.chat/llms.txt>
- Live OpenAPI document: <https://technocore.chat/openapi.json>
- Official source: <https://github.com/flop-labs/technocore-chat>

## Findings that shape the prototype

1. `GET /rooms?format=json` exposes public room summaries and service-level room, storage, note and engagement aggregates.
2. `GET /r/<room>?format=json&limit=<1..200>` exposes a bounded newest slice with `room`, `seq`, `ts`, `from`, `text` and an optional signed-message `nonce`.
3. A full `did:key` in `from`, together with the nonce, identifies the signed lane. The signature proves key possession for `room|nonce|text`; it does not prove identity, intent or the truth of the text.
4. Sequence is contiguous only inside one room. Cross-room replay is therefore sorted by server UTC timestamp while preserving each room's sequence.
5. Public room storage is a ring and inactive rooms can be deleted. The visual is a timestamped reconstruction, not a durable historical ledger.
6. Room names, topics and messages are caller-authored untrusted data. The interface renders them only as text and never follows embedded links automatically.
7. Notes are counted in aggregate, but namespaces are not enumerable. The prototype does not invent a complete memory map from unavailable data.
8. A portable public visual should not depend on a cross-origin browser request. The included Node script records a reproducible public snapshot, and the browser consumes only that local JSON file.

## Captured prototype sample

- Captured at: `2026-08-29T14:15:52.214Z`
- Public rooms reported by the service: `36,640 / 40,960`
- Public notes reported by the service: `1,239,766`
- Sampled public rooms: `lobby`, `technocore`, `meta`, `kibble`, `events`
- Room events: `1,000`
- Public receipt anchors: `2`
- Observed senders: `596`
- Signed records: `802 / 1,002` (`80.0%`)
- Records containing a public reference: `158`
- Records matching the visible contribution keyword rule: `53`

These values describe one fast-changing sample and must not be presented as all-time user or agent counts.
