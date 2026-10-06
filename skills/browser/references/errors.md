# Connect-time failures

Answers the question "the swap is written, the connect attempt was refused, so what is actually wrong".

## 407 first

A 407 at connect is proxy authentication. It is not a driver bug and not a network fault, so rewriting the automation will never fix it. The `client_100xx` code that travels with it says which cause; the `x-brd-err-msg` text adds detail.

| The 407 carries | Meaning | Action |
|---|---|---|
| `client_10000` | Wrong zone password or wrong customer id (same code for both) | Read `x-brd-err-msg`, re-read that piece from the API, retry once |
| `client_10001` | Malformed username, e.g. a bad `-country-` suffix | Fix the string shape, retry once |
| `client_10002` | Zone not found or not active | Re-find the zone by type `browser_api` (below), retry once |
| `client_10010` | No credentials in the URL | The endpoint was empty or lost its `user:pass@`; check what the script passed |
| `client_10020` | Account suspended | Stop. The user reactivates it at brightdata.com/cp/setting/billing (`billing` skill) |
| `client_10030` | Client IP not allowlisted for the zone (also returned by api.brightdata.com when the account restricts API access by IP) | Stop. Tell the user the allowlist must include this machine |
| `client_10040` | KYC required: the account is not approved for this | Stop. Route to `agent-onboarding` and brightdata.com/cp/kyc. Do not retry until approved |
| nothing readable | The driver swallowed the error text | Read the raw connect error (redacted), not just the status, before changing anything |

**Never retry a 407 blindly.** The same wrong string or the same unapproved account returns the same 407 every time, so a retry loop turns one clear failure into a stuck agent.

## Browser API auth codes

The Browser API error page also lists these codes; the docs do not say whether they arrive with a 407.

| Code | What the docs report | Which piece is wrong |
|---|---|---|
| `wrong_customer_name` | "Invalid username." | The `brd-customer-<CUSTOMER_ID>` segment |
| `zone_not_found` | "The specified zone does not exist or is not active." | The `-zone-<ZONE>` segment, or the zone exists but is not active |
| `wrong_password` | "Incorrect zone password." | The password after the colon |
| `missing_credentials` | "Authentication credentials missing." | No `user:pass@` in the URL at all |

One trap is worth naming before reading any code: the password in the endpoint is the zone's own password, not the account API key. An API key in the password slot will always be refused.

Connect errors can echo the full URL, password included. Mask the zone password in them before printing or logging (connect.md shows how).

## Check the cheap thing before touching the string

```
bdata zones --json
```

Free, read-only, no session started.

| What comes back | What it means |
|---|---|
| No entry with `"type":"browser_api"` at all | Not a string problem, and not an account problem yet. Read the note under this table. |
| The zone in your string is listed, but its `type` is not `browser_api` | Wrong zone type. A Web Unlocker zone will not accept a CDP connect. Use the name of the `browser_api` entry instead. |
| The zone in your string is listed with `"type":"browser_api"` | The zone is fine. The customer id or the password is the problem. |

Match the zone by its type, not its name: it is `cli_browser` after `bdata login`, `agent_browser_api` after agent registration, `mcp_browser` from the MCP server, and any name a person chose. This listing returns active zones only, so an absent row cannot tell a zone that was never created from one that exists but is no longer active, which is the same inactive case the `zone_not_found` row above names. The remedy is the same either way, after the user agrees (it changes their account): one free call, `POST https://api.brightdata.com/zone` with body `{"zone":{"name":"cli_browser","type":"browser_api"},"plan":{"type":"browser_api"}}`. Do not run `bdata login` for this, it replaces the stored key. A key from agent registration cannot create zones, so on such an account make the zone in the Control Panel. Only when the creation itself comes back `kyc_required` or `business_account_required` is this an account problem for `agent-onboarding`.

## The connect that never completed

`client_timeout` belongs here rather than with the session codes below. The docs define it as the connection from the client to the browser not being established within 30 seconds, so no session ever existed. Treat it as a connect failure: check the local network, and check any proxy or firewall sitting between the client and `brd.superproxy.io`. The endpoint string is only worth re-reading once the network is ruled out, because a wrong credential comes back as a 407, not as a timeout.

## Failures that are not connect failures

Every code in the table below arrives after a successful connect, so it means the swap worked and something else ended the session. `client_timeout` is not one of them, for the reason just above. Do not go back and edit the endpoint for any of these.

| Code | Meaning |
|---|---|
| `session_timeout` | The session hit the 60-minute ceiling. Split the work across sessions. |
| `network_inactivity_timeout` | Five minutes with no traffic through the session. Disconnect when finished instead of idling. |
| `inactivity_timeout` | Five minutes with no CDP command. Same remedy. |
| `navigate_domains_limit` | A session is scoped to one domain. Open a new session per domain. |
| `no_free_workers` | No browser was available. This one is genuinely worth a retry. |
| `browser_disconnected`, `worker_disconnect`, `job_killed` | Infrastructure fault on the far side. Retry or open a new session. |

## The retry rule

| Situation | Retry |
|---|---|
| 407 with `client_10020`, `client_10030` or `client_10040` | Never. Account or allowlist problem; stop and route it. |
| 407 with `client_10000`, `client_10001`, `client_10002` or an auth code | Once, and only after fixing the piece the code named. |
| `no_free_workers`, `browser_disconnected`, `worker_disconnect`, `job_killed` | Yes, with a backoff. |
| `session_timeout`, `navigate_domains_limit` | No. Restructure the run instead. |
| A blocked password field on a login form | No. That needs KYC plus a compliance exception. The KYC note in SKILL.md says what to do and names where the deep detail lives. |

## Where else to look

Anything that turns out to be about the account rather than this connect belongs to `agent-onboarding`: a 401 on `api.brightdata.com`, `Error: No API key found`, `kyc_required`, `business_account_required`, or a zone that `bdata login` will not recreate. Open that skill and read the `references/auth.md` file inside it, which holds the full refused-call table.
