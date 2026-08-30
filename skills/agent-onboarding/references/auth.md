# The API key, and what a refused call means

## Where the key lives

Login (`bdata login`, or `bdata login --device` on headless machines) writes `credentials.json` in the CLI's config directory:

| OS | credentials.json |
|---|---|
| Windows | `%APPDATA%\brightdata-cli\credentials.json` (the CLI computes it from the user profile, `homedir\AppData\Roaming`, which equals `%APPDATA%` except under profile redirection) |
| macOS | `~/Library/Application Support/brightdata-cli/credentials.json` |
| Linux | `~/.config/brightdata-cli/credentials.json` (hardcoded, and `XDG_CONFIG_HOME` is ignored) |

The file holds `{"api_key": "..."}`. Read it in code, never print it.

Resolution order when a command runs:

1. `--api-key` flag on the command
2. `BRIGHTDATA_API_KEY` environment variable
3. `credentials.json`

For CI and containers, use the environment variable. Set it from a secrets store, and do not echo it into logs or commit it to a file.

## Reading the key in code

After `bdata login`, `BRIGHTDATA_API_KEY` is **unset, and that is normal**. Login writes the key into `credentials.json` and nowhere else. An empty environment variable on a logged-in machine is not a logged-out machine. Do not run `bdata login` again because of it, and do not ask the user for a key.

To use the key in your own REST call, read the file and put the value straight into a variable, or do the same read in-process. Never echo it to the terminal.

```
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.APPDATA+'/brightdata-cli/credentials.json')).api_key)"
```

That is the Windows path. On macOS and Linux, swap in the path from the table above. Send the output straight into a variable (`KEY=$(node -e ...)` in bash, `$key = node -e ...` in PowerShell) or do the same read inside the program that needs it. A key printed to a terminal or a log is a leaked key.

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
| 407 on a proxy-style request with `client_10040` | Account not KYC-approved for this proxy product (Residential and Mobile need it) | Send the user to brightdata.com/cp/kyc and do not retry until approved |
| `kyc_required` on POST /zone | Creating this zone type needs KYC | Same KYC page |
| `business_account_required` on POST /zone | Zone type needs a business account | Account settings. May also involve KYC |

## What needs KYC, what does not

- **Residential proxies:** KYC required.
- **Scraping APIs (Scraper API, Scraper Studio, SERP, Unlocker, Browser API):** no KYC for normal use.
- **Narrow exceptions:** targets disallowed by their own robots.txt (for example Reddit), government sites, domains on the blocked-classification list, and targets the compliance policy does not permit need KYC even through Web Unlocker (`ub_bad_endpoint_robots`, `policy_20051`, `policy_20000`, `policy_20050`). Typing passwords through Browser API needs KYC plus a compliance exception.

The agent never asks the user about KYC up front. It reads the error, then sends the user to the KYC page only when a call is actually refused for that reason.
