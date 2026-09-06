# The API key, and what a refused call means

## Where the key lives

Login (`bdata login`, or `bdata login --device` on headless machines) writes `credentials.json` in the CLI's config directory:

| OS | credentials.json |
|---|---|
| Windows | `%APPDATA%\brightdata-cli\credentials.json` |
| macOS | `~/Library/Application Support/brightdata-cli/credentials.json` |
| Linux | `~/.config/brightdata-cli/credentials.json` |

The file holds `{"api_key": "..."}`. Read it in code, never print it.

Resolution order when a command runs:

1. `--api-key` flag on the command
2. `BRIGHTDATA_API_KEY` environment variable
3. `credentials.json`

For CI and containers, use the environment variable. Set it from a secrets store, and do not echo it into logs or commit it to a file.

## A key from registration

When the agent created the account itself (SKILL.md, No account yet), the key is `credential.token` in the response of `POST https://brightdata.com/users/auth/agent_registration/claim/complete`. Install it with `bdata login --api-key <token>` from the program that holds it, which writes the same `credentials.json` and creates the two `cli_` zones, or put it in `BRIGHTDATA_API_KEY` for CI. Read it in-process; never print it or paste it into chat.

That completion response also carries the account's `entitlements` (`monthly_credits`, `trial_credit_usd`, `trial_days`). None of the billing reads return them, so keep them if the `billing` skill will need them.

Every non-2xx answer from the three registration endpoints is `{"error": "<code>", "error_description": "<next step>"}`:

| Code | Status | Do |
|---|---|---|
| `email_not_accepted` | 400 | Disposable, aliased, or invalid address. Ask for the user's real mailbox and retry |
| `browser_signup_required` | 403 | This email must sign up in the Control Panel. Do not retry; tell the user to sign up at brightdata.com with the same address |
| `registration_denied` | 403 | Refused. Do not retry; hand over to a person |
| `fraud_check_unavailable` | 503 | Wait the `Retry-After` seconds from the header, retry the same request, double the wait on each failure, three attempts in all, then hand over |
| `registration_disabled` | 503 | New registrations are paused. Use a fallback path, such as signup in the Control Panel |
| `rate_limited` | 429 | Back off and retry later |
| `invalid_request` | 400 | Malformed body. Fix it and retry |
| `otp_invalid` | 400 | The code did not match. Ask the user to re-read it and retry |
| `otp_expired` | 400 | Request a fresh code through `/claim` |
| `invalid_claim_token`, `claim_expired` | 400 | The pending registration is unusable, or older than 24 hours. Start over |

A person can later finish standard signup (password, GitHub, or Google) with the same email and get full access to the same account. That creates no duplicate and does not invalidate the key the agent received.

## An OAuth session is not a key

An MCP client connected to `mcp.brightdata.com` through OAuth 2.1 holds an access token issued for that resource with the single scope `mcp`, sent only as a bearer header on MCP requests. The CLI resolves a key from `--api-key`, `BRIGHTDATA_API_KEY` or `credentials.json` and nothing else, so an OAuth session does not log the CLI in: on such a machine `bdata zones --json` still answers `Error: No API key found.`, which is expected rather than a failure. Use an API key for the CLI, the SDKs and `api.brightdata.com`, from login or from registration. The OAuth flow itself is in the `brightdata-mcp` skill, references/setup.md, Auth.

## Reading the key in code

After `bdata login`, `BRIGHTDATA_API_KEY` is **unset, and that is normal**. Login writes the key into `credentials.json` and nowhere else. An empty environment variable on a logged-in machine is not a logged-out machine. Do not run `bdata login` again because of it, and do not ask the user for a key.

To use the key in your own REST call, put it straight into a variable, or do the same read in-process. Never echo it to the terminal.

PowerShell, with the Windows path:

```
$key = node -e "console.log(JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'AppData','Roaming','brightdata-cli','credentials.json'),'utf8')).api_key)"
```

bash, with the Linux path (on macOS swap in the path from the table above):

```
KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.config/brightdata-cli/credentials.json','utf8')).api_key)")
```

Both forms land the key in a shell variable with nothing on screen. Running the inner `node -e` on its own prints the key, so never run it bare: a key printed to a terminal or a log is a leaked key. Better still, do the same read inside the program that needs it.

The bundled scripts already do this for you. `check-auth.mjs`, `find-scraper.mjs`, `poll.mjs` and `trigger.mjs` each resolve the key themselves, from the environment variable first and then the same credentials paths, so they need no key argument and no environment variable set.

**PowerShell.** The `$BRIGHTDATA_API_KEY` written throughout these docs is bash syntax. In PowerShell the same variable is `$env:BRIGHTDATA_API_KEY`. Copy the bash form into PowerShell and it expands to nothing, the request goes out with an empty `Bearer` header, and it comes back 401 or `Auth method is not supported` even though the machine is logged in.

## REST without the CLI

```
curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/zone/get_active_zones
```

A valid key returns the zone list. This is the same endpoint `bdata zones` calls - one free request, no credits. (`/zones` does not exist and returns 404.)

## Refused calls

| Response | Meaning | Action |
|---|---|---|
| `Error: No API key found.` (first printed line; local, before any request) | This machine is not logged in | `bdata login` (`--device` on headless), or set `BRIGHTDATA_API_KEY` |
| 401 on api.brightdata.com | Key invalid, revoked, or missing | Log in again (`bdata login`, `--device` on headless), or re-set `BRIGHTDATA_API_KEY` |
| 401 on mcp.brightdata.com from an OAuth client | Access token expired, missing, or invalid | Refresh with the `refresh_token` grant and retry once; do not log in, the CLI key is a different credential |
| 407 on a proxy-style request with `client_10040` | Account not KYC-approved for this proxy product (Residential and Mobile need it) | Send the user to brightdata.com/cp/kyc and do not retry until approved |
| `kyc_required` on POST /zone | Creating this zone type needs KYC | Same KYC page |
| `business_account_required` on POST /zone | Zone type needs a business account | Account settings. May also involve KYC |

## What needs KYC, what does not

- **Residential proxies:** KYC required.
- **Scraping APIs (Scraper API, Scraper Studio, SERP, Unlocker, Browser API):** no KYC for normal use.
- **Narrow exceptions:** targets disallowed by their own robots.txt (for example Reddit), government sites, domains on the blocked-classification list, and targets the compliance policy does not permit need KYC even through Web Unlocker (`ub_bad_endpoint_robots`, `policy_20051`, `policy_20000`, `policy_20050`). Typing passwords through Browser API needs KYC plus a compliance exception.

The agent never asks the user about KYC up front. It reads the error, then sends the user to the KYC page only when a call is actually refused for that reason.
