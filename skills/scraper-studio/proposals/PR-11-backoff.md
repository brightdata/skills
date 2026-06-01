# PR-11 — Handle the AI-Flow concurrent-job cap

Status: **split into two halves.**

- **Half A (CLI):** auto-backoff on 429 + stderr stub-recovery note. **Shipped**
  in the `cli` repo (commit on branch `feat/scraper-create-429-backoff`).
- **Half B (API / server):** prevent stubs at the source. **Open**, this proposal
  describes both asks for the product team.

---

## Problem

Bright Data's AI Flow caps concurrent `scraper create` generations per account.
The cap is currently **3** and is enforced at the AI-trigger step
(`POST /dca/collectors/{id}/automate_template`). When exceeded, the API returns:

```
429 Cannot run more than 3 jobs in parallel
```

The cap was undocumented in the skill and in `bdata scraper create --help` before
this proposal landed. Users who scripted multi-domain workflows (parallel `for`
loops, fan-out scrapers, etc.) hit it constantly and discovered it only by
observing the error.

Worse, the *template-creation* step (`POST /dca/collector`) succeeds even when
the user is already at the cap. The CLI prints `Template created: c_…`, then a
moment later the AI-trigger 429s. The half-built **stub collector** persists in
the user's dashboard. With no `DELETE /dca/collector/{id}` endpoint, the only
recovery is a manual click in the web UI.

A real session from our 4-round audit (R4): a user launched 10 parallel
`scraper create` invocations. 3 succeeded. 7 hit the cap and produced 7 stubs.
After 4 rounds of partial re-runs, all 10 scrapers were built, but 7 orphan
stubs remained in the dashboard. The CLI never told the user the cap existed.

## Half A: client-side workaround (shipped)

The CLI now treats the cap as a recoverable transient error.

### What lands in the CLI

1. Per-request `retry: Retry_config` on the shared HTTP client
   (`src/utils/client.ts`). Configurable `max_attempts`, `base_ms`, `max_ms`,
   and an `on_retry` callback. Other commands (scrape, search, discover,
   pipelines, browser) are unaffected — they keep today's short schedule.

2. AI Scraper Studio specific config in `src/commands/scraper.ts`:
   - Base 30s, ceiling 240s, default 4 attempts ≈ 7.5 min total max wait.
   - Full-jitter exponential backoff (delay ∈ `[exp/2, exp]`) so concurrent
     shell processes don't all retry on the same tick.

3. Two new flags on `bdata scraper create`:
   - `--max-retries <n>` — override the count (default 4).
   - `--no-retry` — disable retries; fail fast on 429.

4. Status line during the wait so callers know the CLI isn't hung:
   ```
   Hit AI-Flow concurrent-job cap (429). Waiting 32s before retry 1/4...
   ```

5. Stderr stub-recovery note on every terminal failure that leaves a
   half-built collector, pointing at the dashboard URL.

### What's documented

- `SKILL.md` "Common mistakes" gets a new entry naming the cap and the
  `--max-retries` / `--no-retry` levers.
- `SKILL.md` "Troubleshooting" gets two new rows: the in-progress backoff
  message (informational) and the retries-exhausted case (actionable).
- `references/api-flow.md` documents the cap inline on the AI-trigger
  endpoint and references this proposal for the open server-side asks.

### What's not in this half

The CLI cannot delete stub collectors because no `DELETE` endpoint exists.
The auto-backoff dramatically reduces the *rate* of stub creation
(parallel launches now serialise instead of failing 7/10), but any
terminal failure still leaves one behind.

---

## Half B: server-side asks (open, this is the proposal)

Two complementary asks. Either solves the stub-creation problem at the
source. Both are small changes.

### Ask 1: reject the template POST upfront when the cap is full

Today, `POST /dca/collector` always succeeds. The cap is only enforced at
the next step (`POST .../automate_template`), so a 429 there leaves a
collector behind with no template attached.

Move the cap check **earlier**: reject `POST /dca/collector` with `429`
when the user is already at the limit. No stub is created. The client
already retries on 429 via Half A, so the user experience is the same —
just with no dashboard cleanup needed afterward.

This is the preferred fix. Implementation is small (a single concurrency
check at the start of the template-creation handler).

### Ask 2: expose `DELETE /dca/collector/{id}`

Even with Ask 1 landed, users will occasionally have stubs from other
failure modes (poll status=failed, network errors mid-trigger, etc.). A
public `DELETE` endpoint lets the CLI clean up on its way out:

```
DELETE /dca/collector/{collector_id}
```

The CLI would call this on terminal failure (unless `--keep-stub-on-failure`
is passed). A future CLI release would also expose `bdata scraper delete
<collector_id>` for manual cleanup of older stubs.

Ask 1 is strictly preferable (no stub ever created beats deleting it
after); Ask 2 is a useful fallback if Ask 1 is non-trivial server-side.

---

## Composes with

- **PR-12** (shipped): replaced the misleading 403 "Access denied" hint
  when running on a stub. PR-11 stops most stubs from existing in the
  first place, so PR-12's hint fires less often — but is still useful
  when one does slip through.
- **PR-2** (shipped): on-failure `-o` envelope contains `collector_id`,
  `status`, `view_url`. PR-11's stderr stub-recovery note duplicates the
  `view_url` for users who don't `cat` the file. The two are
  intentionally redundant.
- **PR-13** (deferred to product): schema-honoring contract. Orthogonal
  but worth landing together — it's the other major source of silent
  failure in `scraper create` outputs.

## Acceptance criteria for Half B

- [ ] **Ask 1 (preferred):** `POST /dca/collector` returns `429 Cannot run
      more than N jobs in parallel` when the cap is full. The current
      template-side enforcement remains as a backstop.
- [ ] **Ask 2:** `DELETE /dca/collector/{id}` is a documented, supported
      endpoint. CLI integrates it on terminal-failure paths in a follow-up.
- [ ] The documented cap value (currently 3) is mentioned in the
      Bright Data developer docs alongside the `automate_template`
      endpoint.
