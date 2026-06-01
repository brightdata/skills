# Scraper Studio — underlying REST flow

Read this when debugging unexpected CLI output, when the user wants to hit the API directly, or when you need to understand which artefact (`collector_id` vs `response_id`) is recoverable from which failure path.

All endpoints are under `https://api.brightdata.com`. Auth header: `Authorization: Bearer $BRIGHTDATA_API_KEY`.

## `scraper create` — three chained calls

### 1. Create template

```
POST /dca/collector
{
  "name": "cli-scraper-1747146000",        // auto-generated unless --name
  "deliver": {
    "type": "webhook",
    "endpoint": "https://example.com/webhook",   // stub unless --deliver-webhook
    "filename": {"template": "data", "extension": "json"}
  }
}
```

Returns:
```json
{ "id": "c_mp3tuab31lswoxvpws", "name": "cli-scraper-1747146000", ... }
```

The `id` is the **`collector_id`**. Hold onto it from this point forward — every subsequent failure path can still surface it.

### 2. Trigger AI generation

```
POST /dca/collectors/{collector_id}/automate_template
{
  "description": "Extract title, price ...",
  "urls": ["https://example.com/product/1"]      // CLI wraps the single URL in an array
}
```

Returns:
```json
{ "id": "ia_xyz...", "queued": false }
```

### 3. Poll progress

```
GET /dca/collectors/{collector_id}/automate_template/progress
```

Returns one of:
```json
{ "status": "queued",  "completed_steps": [] }
{ "status": "planner", "completed_steps": ["a"] }
{ "status": "running", "completed_steps": ["a","b"], "step": "preview_picker" }
{ "status": "done",    "completed_steps": ["a","b","c","d"], ... }
{ "status": "failed",  "completed_steps": [...], "error": "..." }
```

The CLI treats anything other than `done` (and other than `failed`) as still running and polls until `done`, timeout, or a non-`done` terminal status. The default poll timeout is 600 seconds (`--timeout`).

**Recoverability:** all three calls can fail. In every case the `collector_id` from step 1 is still valid — open `https://brightdata.com/cp/scrapers/{collector_id}` to inspect or finish manually.

---

## `scraper run` — three possible paths

### Path A — default async + poll

```
POST /dca/trigger_immediate?collector={collector_id}&name=...&version=...
{
  "url": "https://example.com/page"
}
```

Returns:
```json
{ "response_id": "r_abc..." }
```

The CLI then polls:
```
GET /dca/get_result?response_id={response_id}
```

Response classification:
- **200 + JSON body that isn't `null` and isn't `{"pending":true}`** → ready, parse and return.
- **200 + empty / whitespace / `null` / `{"pending":true,...}`** → still pending.
- **202** → still pending.
- **4xx / 5xx** → pending (CLI keeps trying briefly; persistent failure surfaces via the poll timeout).

Default poll timeout: 600 seconds (`--timeout`).

### Path B — `--sync` (`/dca/crawl`)

One-shot synchronous extraction. Cap is **25–50 seconds** server-side; the CLI sends `timeout=<sync-timeout>s` (default 50).

```
POST /dca/crawl?collector={collector_id}&timeout=50s&name=...&version=...
{
  "url": "https://example.com/page"
}
```

Outcomes:
- **200 + body** → ready, return.
- **202 + `{"error":"crawl_results_timeout","response_id":"r_late_..."}`** → server-side timeout. CLI prints the `response_id` and tells the user to **re-run without `--sync`**. The same request can be picked up async by polling `/dca/get_result?response_id=...` (which is what `bdata scraper run <collector_id> <url>` will do under the hood — though it triggers a new request, so for true reuse of the existing `response_id` you'd call `get_result` directly).
- Other non-200 → surfaced as an error.

### Path C — auto-fallback to batch

Triggered when path A or B returns a body that contains the marker `realtime job limit` (case-insensitive). Typically looks like:

```json
[{
  "input": {"url": "https://example.com/listing"},
  "error": "Request generated 501 pages and exceeded realtime job limit of 51 pages"
}]
```

The CLI then makes:

```
POST /dca/trigger?collector={collector_id}&name=...&version=...
[
  { "url": "https://example.com/listing" }   // body is an array
]
```

Returns:
```json
{ "collection_id": "d_batch_...", "start_eta": "2026-05-13T12:00:00Z" }
```

Then polls:
```
GET /dca/dataset?id={collection_id}
```

Dataset response classification:
- **200 + array body** → ready.
- **200 + `{"status":"building"}`** → pending.
- **202** → pending.
- **Empty body** → pending.

Batch defaults: 10 s poll interval, 3600 s (1 hour) timeout.

---

## `scraper heal` — trigger + poll

Maintenance twin of `create`'s AI flow, against an existing collector.

### 1. Trigger self-healing

```
POST /dca/collectors/{collector_id}/refactor_template
{
  "prompt": "Price returns null — selector moved …",
  "custom_input": []
}
```

### 2. Poll progress

```
GET /dca/collectors/{collector_id}/refactor_template/progress
```

Returns the same job-progress shape as `automate_template/progress`
(`{status, completed_steps, step}`); the CLI polls until `status: "done"`,
timeout, or a terminal `failed` / `error` / `cancelled`. Default poll timeout
600 s (`--timeout`).

### 3. Approval gate + resume

The self-healing flow pauses at `status: "pending_answer"` / `step:
"user_approval"`, returning `diff` (before/after templates) and
`preview_result` (sample output). It does **not** auto-advance. To commit (or
discard) the fix:

```
POST /dca/collectors/{collector_id}/resume_automation_job
{ "message": true }     // true = approve, false = reject
```

After resuming, `refactor_template/progress` continues to `done`. `scraper
approve` wraps this; `scraper heal --auto-approve` calls it automatically.

**Recoverability:** if the heal fails, the collector is unchanged and still
works — nothing is left half-built (unlike a failed `create`).

---

## Two artefacts, two failure recoveries

| Artefact | Printed by | Used to recover via | Persists if step fails |
|---|---|---|---|
| `collector_id` (`c_…`) | `scraper create` step 1, every failure path of `create`, every error path of `run` | Web UI (`/cp/scrapers/{id}`), subsequent `scraper run` calls, direct API hits | yes — template exists even if AI generation never finished |
| `response_id` (`r_…`) | async path A trigger response, `--sync` 202 timeout | `GET /dca/get_result?response_id=...` | yes — server keeps the running job |

The CLI is engineered so neither artefact ever silently disappears — both are printed in every failure path. If the user reports "the command failed", first thing to ask: "what `collector_id` / `response_id` did it print?"

---

## Status sentinels in the CLI (for reading source / logs)

The CLI uses a few internal string sentinels you may see in `--timing` or debug output:

| Sentinel | Meaning |
|---|---|
| `__running__` | Generation progress is not yet `done` (matches `queued`, `planner`, `running`, etc.) |
| `__ready__` | Result body is parseable and non-empty |
| `__pending__` | Result body is empty / `null` / `{"pending":true}` / 202 / 4xx / 5xx — poll again |

These are implementation details — don't expose them to end users.
