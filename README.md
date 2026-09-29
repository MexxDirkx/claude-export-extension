# Claude Conversation Exporter

A Chrome/Edge (Manifest V3) extension that exports your claude.ai conversations
to **Markdown**, **plain text**, **HTML** and **raw JSON** — one conversation at
a time, or your whole archive as a ZIP.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open [claude.ai](https://claude.ai) and click the extension icon.

No build step: the extension runs the sources as they are.

## Using it

Pick your formats in the popup, then either:

- **Export this conversation** — saves loose files into `Downloads/claude-exports/`.
- **Export all conversations** — pages through your whole conversation list and
  saves `Downloads/claude-exports/claude-export-YYYY-MM-DD.zip`.

The archive is laid out format-first, so you can take just the format you want:

```
markdown/2026-09-02-song-lyrics.md
text/2026-09-02-song-lyrics.txt
html/2026-09-02-song-lyrics.html
json/2026-09-02-song-lyrics.json
export-errors.txt        (only if something failed)
```

A bulk export keeps running if you close the popup; the toolbar badge shows
progress and the popup reattaches when you reopen it.

## What gets exported

Human and assistant **prose**. Extended thinking, tool calls (web searches, bash,
file edits) and tool results are left out of the readable formats so transcripts
stay readable — the **raw JSON** keeps everything, so nothing is lost and a
richer renderer can be added later without re-downloading.

Conversations are trees: editing a prompt or regenerating a reply leaves the old
branch behind in the API response. The exporter walks the active chain from
`current_leaf_message_uuid` upwards, so abandoned branches never appear in a
transcript. (One conversation used in testing has 374 stored messages but only
362 on the active chain.)

## How it works

| Piece | Job |
|---|---|
| `src/content/` | The only code that calls the claude.ai API. Runs in the page, so the session cookie is sent automatically. |
| `src/background/` | Owns the export job: paging, concurrency, retries, downloads. Survives the popup closing. |
| `src/offscreen/` | Turns bytes into a `blob:` URL — MV3 service workers have no `URL.createObjectURL`. |
| `src/popup/` | A view over the worker's job state. |
| `src/core/` | Pure functions: thread building, renderers, ZIP writer, retry, pool, paging. No `chrome.*`, no DOM, no network — all unit-tested. |

API calls are relayed through the content script on purpose. A `fetch` from the
service worker is treated as cross-site, so the `SameSite` session cookie would
be dropped and every request would come back unauthorized.

**Permissions:** `downloads`, `offscreen`, `storage`, `scripting`, `activeTab`.
No broad host permissions, no cookie access, no network access to anything but
claude.ai from within your own page session.

## Development

```bash
npm test                                  # 55 unit + integration tests
node tools/make-fixtures.js some.har      # regenerate anonymised fixtures
node tools/replay-har.js some.har out/    # replay real captures into a real ZIP
```

Fixtures under `fixtures/` are derived from a real HAR capture with all
human-readable text replaced by filler; the message tree, block types and
timestamps are preserved so branch handling is tested against real shapes.

Third-party code: `src/vendor/marked.esm.js` (marked 18.0.11, MIT) renders
Markdown to HTML. Raw HTML inside messages is escaped rather than emitted, and
link/image URLs are restricted to safe schemes.
