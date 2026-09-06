# Connect-time failures

Answers the question "the swap is written, the connect attempt was refused, so what is actually wrong".

## 407 first

A 407 at connect is proxy authentication. It is not a driver bug and not a network fault, so rewriting the automation will never fix it. Two very different causes hide behind the same status code, and the error code that travels with it decides which.

| The 407 carries | Meaning | Action |
|---|---|---|
| `client_10040` | The account itself is not approved for this product. Nothing about the endpoint string is wrong. | Stop. Route to the `agent-onboarding` auth flow, and send the user to brightdata.com/cp/kyc. Do not retry until approved. |
| one of the four auth codes below | One of the three pieces of the endpoint is wrong. | Fix the named piece, then retry once. |
| nothing readable | The full error text was swallowed by the driver. | Read the raw connect error, not just the status number, before changing anything. |

**Never retry a 407 blindly.** A KYC refusal returns the same 407 every time, so a retry loop turns one clear failure into a stuck agent. A credential mistake also returns the same 407 every time, because the string is wrong and repeating it does not make it right.

## The four auth codes

These separate a wrong zone from a wrong password, which is the distinction most connect failures come down to.

| Code | What the docs report | Which piece is wrong |
|---|---|---|
| `wrong_customer_name` | "Invalid username." | The `brd-customer-<CUSTOMER_ID>` segment |
| `zone_not_found` | "The specified zone does not exist or is not active." | The `-zone-<ZONE>` segment, or the zone exists but is not active |
| `wrong_password` | "Incorrect zone password." | The password after the colon |
| `missing_credentials` | "Authentication credentials missing." | No `user:pass@` in the URL at all |

Note the split: a zone name that does not exist and a password that does not match are two different codes, so guessing between them is never necessary. Read the code.

One trap is worth naming before reading the code at all: the password in the endpoint is the zone's own password, not the account API key. The two are different credentials, and an API key in the password slot will always be refused.

## Check the cheap thing before touching the string

```
bdata zones --json
```

Free, read-only, no session started.

| What comes back | What it means |
|---|---|
| No `cli_browser` at all | Not a string problem, and not an account problem yet. Read the note under this table. |
| `cli_browser` present but its `type` is not `browser_api` | Wrong zone type. A Web Unlocker zone will not accept a CDP connect. |
| `cli_browser` present with `"type":"browser_api"` | The zone is fine. The customer id or the password is the problem. |

This listing returns active zones only, so an absent row cannot tell a zone that was never created from one that exists but is no longer active, which is the same inactive case the `zone_not_found` row above names. The remedy is the same either way and it is local first: `bdata login` recreates `cli_browser`, and `bdata browser open` creates it on demand too, though that one starts a billable session. Only when the creation itself comes back `kyc_required` or `business_account_required` is this an account problem for `agent-onboarding`.

## The connect that never completed

`client_timeout` belongs here rather than with the session codes below. The docs define it as the connection from the client to the browser not being established within 30 seconds, so no session ever existed. Treat it as a connect failure: check the local network, and check any proxy or firewall sitting between the client and `brd.superproxy.io`. The endpoint string is only worth re-reading once the network is ruled out, because a wrong credential comes back as a 407, not as a timeout.

## Failures that are not connect failures

Every code in the table below arrives after a successful connect, so it means the swap worked and something else ended the session. `client_timeout` is not one of them, for the reason just above. Do not go back and edit the endpoint for any of these.

| Code | Meaning |
|---|---|
| `session_timeout` | The session hit the 60-minute ceiling. Split the work across sessions. |
| `network_inactivity_timeout` | Five minutes with no traffic through the session. Disconnect when finished instead of idling. |
| `navigate_domains_limit` | A session is scoped to one domain. Open a new session per domain. |
| `no_free_workers` | No browser was available. This one is genuinely worth a retry. |
| `browser_disconnected`, `worker_disconnect`, `job_killed` | Infrastructure fault on the far side. Retry or open a new session. |

## The retry rule

| Situation | Retry |
|---|---|
| 407 with `client_10040` | Never. Route to `agent-onboarding` and stop. |
| 407 with an auth code | Once, and only after fixing the piece the code named. |
| `no_free_workers`, `browser_disconnected`, `worker_disconnect`, `job_killed` | Yes, with a backoff. |
| `session_timeout`, `navigate_domains_limit` | No. Restructure the run instead. |
| A blocked password field on a login form | No. That needs KYC plus a compliance exception. The KYC note in SKILL.md says what to do and names where the deep detail lives. |

## Where else to look

Anything that turns out to be about the account rather than this connect belongs to `agent-onboarding`: a 401 on `api.brightdata.com`, `Error: No API key found`, `kyc_required`, `business_account_required`, or a zone that `bdata login` will not recreate. Open that skill and read the `references/auth.md` file inside it, which holds the full refused-call table.
