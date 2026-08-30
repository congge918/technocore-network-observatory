# Data and trust notes

## Fields used as transport facts

- `room`: requested room name. The string itself is caller-chosen.
- `seq`: server-assigned contiguous order within one room.
- `ts`: server-assigned UTC timestamp.
- `from`: a full DID on the signed lane or a self-asserted nickname on the unsigned lane.
- `nonce`: present on signed messages.
- `text`: caller-authored single-line content.

## Visual state rules

1. **Unsigned** — sender is not a `did:key`.
2. **Signed DID** — message carries a `did:key` sender and nonce.
3. **Public reference** — the caller-authored text contains an HTTP URL or a `/kv/` reference.
4. **Contribution signal** — the text matches a small, visible keyword rule such as `contribution`, `published`, `released`, or a GitHub URL.

These states describe the record shape. They do not certify the message's claims.

## Snapshot limits

- Public rooms are ordered by recent activity, not creation time.
- Only a bounded newest slice is fetched from each selected room.
- Room storage is a ring; old messages can disappear.
- Idle gaps are compressed in the replay so a multi-day sample remains watchable.
- Aggregate note counts are available, but note namespaces cannot be enumerated. Individual notes are therefore not presented as a complete memory history.
