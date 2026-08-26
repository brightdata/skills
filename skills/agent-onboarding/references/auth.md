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

## REST without the CLI

```
curl -H "Authorization: Bearer $BRIGHTDATA_API_KEY" https://api.brightdata.com/zone/get_active_zones
```

A valid key returns the zone list. This is the same endpoint `bdata zones` calls - one free request, no credits. (`/zones` does not exist and returns 404.)

## Refused calls

| Response | Meaning | Action |
|---|---|---|
| `Error: No API key found` (local, before any request) | This machine is not logged in | `bdata login` (`--device` on headless), or set `BRIGHTDATA_API_KEY` |
| 401 on api.brightdata.com | Key invalid, revoked, or missing | Log in again (`bdata login`, `--device` on headless), or re-set `BRIGHTDATA_API_KEY` |
| 407 on a proxy-style request with `client_10040` | Account not KYC-approved for this proxy product (Residential and Mobile need it) | Send the user to brightdata.com/cp/kyc and do not retry until approved |
| `kyc_required` on POST /zone | Creating this zone type needs KYC | Same KYC page |
| `business_account_required` on POST /zone | Zone type needs a business account | Account settings. May also involve KYC |

## What needs KYC, what does not

- **Residential proxies:** KYC required.
- **Scraping APIs (Scraper API, Scraper Studio, SERP, Unlocker, Browser API):** no KYC for normal use.
- **Narrow exceptions:** targets disallowed by their own robots.txt (for example Reddit), government sites, domains on the blocked-classification list, and targets the compliance policy does not permit need KYC even through Web Unlocker (`ub_bad_endpoint_robots`, `policy_20051`, `policy_20000`, `policy_20050`). Typing passwords through Browser API needs KYC plus a compliance exception.

The agent never asks the user about KYC up front. It reads the error, then sends the user to the KYC page only when a call is actually refused for that reason.
