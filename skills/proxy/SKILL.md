---
name: brightdata-proxy
description: Generate working code that routes HTTP requests through Bright Data proxy networks (Datacenter, ISP, Residential, Mobile) and help users decide which network and IP pool type to use (shared pool, shared IPs, or dedicated IPs). Use this skill whenever the user mentions Bright Data, brightdata.com, BD proxies, brd.superproxy.io, geo.brdtest.com, a brd-customer- proxy username, a Bright Data zone, the superproxy host, or wants to scrape or route requests through Bright Data — including questions about proxy URL format, country or session or IP or sticky-session targeting, SSL certificate setup for residential or mobile proxies, KYC verification, ignoring SSL errors, choosing between shared pool and shared IPs and dedicated IPs, or integrating Bright Data into Python requests/httpx/aiohttp, Node fetch/axios, Playwright, Puppeteer, Selenium, or Scrapy.
---

# Bright Data Proxy

Generate working code and configuration for Bright Data's four proxy networks. This skill covers usage and integration — it does **not** walk users through control-panel UI setup. If the user hasn't created a zone yet, tell them to sign up at https://brightdata.com and use the in-app proxy creation helper (the control panel guides them through zone type, pool type, and credentials interactively — that's the right surface for setup, not this skill).

## Quick reference (canonical facts)

These are the values to use in generated code. They are easy to hallucinate wrong, so anchor on them.

- **Proxy host**: `brd.superproxy.io`
- **HTTP/HTTPS proxy port**: `33335` (current, paired with the **new** SSL CA — expires Sept 2034)
  - Legacy port `22225` exists for the old CA (expires Sept 2026, deprecated). Use 33335 unless the user explicitly says otherwise.
- **SOCKS5 port**: `22228`
- **Username format**: `brd-customer-CUSTOMER_ID-zone-ZONE_NAME` plus optional `-key-value` parameters appended (see Targeting below).
- **Password**: the zone password from the control panel (not the account password).
- **Test endpoint** (use in code samples, not against real targets): `https://geo.brdtest.com/mygeo.json` — returns exit IP, country, city, and ASN as JSON.
- **SSL CA**: bundled with this skill at `assets/brightdata_proxy_ca.crt` (Bright Data Proxy Root CA, valid until Sept 2034). Generated code should reference this path, not tell the user to go download it. The public download is at `https://brightdata.com/static/brightdata_proxy_ca.zip` if they ever need to fetch it independently.

The line `https://brightdata.com/cp/zones/proxy_examples` in the control panel shows live, account-specific code samples for every framework — point the user there for ground truth when uncertain.

## Bundled tools (in this skill)

- **`assets/brightdata_proxy_ca.crt`** — the Bright Data Root CA. Use this in `verify=`, `--cacert`, `ca:`, or `NODE_EXTRA_CA_CERTS` instead of having the user download it.
- **`scripts/smoke_test.sh`** — cURL-based credential smoke test. Run `./smoke_test.sh CUSTOMER_ID ZONE_NAME ZONE_PASSWORD [COUNTRY] [SESSION_ID]` (or set `BD_CUSTOMER_ID`/`BD_ZONE`/`BD_PASSWORD` env vars). Auto-locates the bundled CA, returns parsed JSON geo, distinct exit codes for auth vs HTTP vs network failure. Recommend this as the first thing the user runs after creating a zone.
- **`scripts/proxy_tester.html`** — single-file browser diagnostic. User configures their browser or OS proxy with the credentials, opens the file locally (or serves it from anywhere), and sees a live readout of their current exit IP/geo. Has a baseline-save feature so they can compare pre-proxy vs post-proxy exits visually. Credentials live in `sessionStorage` only — nothing is uploaded.

---

## Decision 1: which proxy network?

If the user hasn't said which network they're on, ask once, then proceed. Quick rubric:

| Network | When to recommend |
|---|---|
| **Datacenter** | Cheapest, fastest. Use for unprotected targets (news sites, public APIs, light scraping, account management at low scale, geo-bypass on permissive sites). |
| **ISP** | Static IPs that look residential to the destination. Best for long-lived sessions, account management on protected platforms, anything where IP reputation matters but you want speed and stability. |
| **Residential** | Real-user IPs from a 100M+ pool. Default choice when datacenter and ISP get blocked. Best success rate on hard targets. Pay-per-GB; slower. Requires SSL cert or KYC (see Residential/Mobile network access below). |
| **Mobile** | 3G/4G/5G mobile carrier IPs. Most expensive. Use only when the target is extreme (Instagram, TikTok, some banking). Same network-access requirements as Residential. |

Default reach order when the user is unsure: Datacenter → Residential. ISP and Mobile are deliberate choices for specific needs.

## Decision 2: which IP pool type? (Datacenter and ISP)

Bright Data sells Datacenter and ISP traffic in three IP-allocation modes. The user picks this when they create the zone in the control panel.

| Pool type | What it is | When to recommend |
|---|---|---|
| **Shared pool** (also called "pay-per-GB" or "unlimited") | Pull random IPs from a huge shared pool. No fixed IPs allocated to you. Pay per GB of traffic. | Default for high-volume rotating scraping. You don't care which IP you get, you just want a fresh one frequently. |
| **Shared IPs** | A fixed set of N IPs leased to you, but shared with other Bright Data customers. Cheaper than dedicated. | Mid-budget. You want some IP stability but not exclusivity. Useful when the target accepts moderately-warm IPs. |
| **Dedicated IPs** | A fixed set of N IPs leased exclusively to you. No other customer uses them. Highest cost per IP. | Account management on platforms that fingerprint IPs heavily, anything needing a clean reputation you control, anything where another customer's bad behavior on a shared IP would burn you. |

For Residential and Mobile the equivalent of "dedicated" is **dedicated gIPs** (groups of IPs) selected via the `-gip-` parameter — not the same as DC/ISP dedicated. Don't confuse the two.

---

## Proxy URL format & authentication

The username carries all per-request configuration. The general form:

```
brd-customer-CUSTOMER_ID-zone-ZONE_NAME[-param1-value1][-param2-value2]...
```

Composed into a proxy URL it looks like:

```
http://brd-customer-CUSTOMER_ID-zone-ZONE_NAME[-PARAMS]:ZONE_PASSWORD@brd.superproxy.io:33335
```

Notes:
- The scheme is `http://` even for HTTPS targets — that's the proxy's own scheme, not the destination's.
- Always URL-encode the password if it contains special characters.
- Parameters are appended to the username with hyphens — they are **not** query-string params on the URL.
- Zone name cannot be changed after creation; the user has to make a new zone if they want a different name.

## Username parameters (targeting, rotation, session)

| Parameter | Applies to | What it does | Example suffix on username |
|---|---|---|---|
| `-country-XX` | All networks | ISO country code (2-letter, lowercase). `eu` = random EU country. | `-country-us` |
| `-state-XX` | **Residential, Mobile only** | US state, 2-letter, requires `-country-us` | `-country-us-state-ny` |
| `-city-NAME` | **Residential, Mobile only** | City, no spaces (`sanfrancisco`), requires country | `-country-us-city-sanfrancisco` |
| `-zip-NNNNN` | **Residential, Mobile only** | US zip, 5 digits | `-country-us-zip-37501` |
| `-asn-NNNNN` | **Residential, Mobile only** | Target a specific ASN | `-asn-56386` |
| `-os-X` | **Residential only** | `windows`, `macos`, `android` | `-os-windows` |
| `-carrier-X` | **Mobile only** | Specific carrier (e.g. `-carrier-dt`) | `-carrier-dt` |
| `-session-STRING` | All | Sticky session — same session ID returns the same exit IP for the session's lifetime. Use a random string per logical "user session" to implement rotation. | `-session-abc12345` |
| `-ip-A.B.C.D` | Zones with **dedicated IPs** only | Pin to a specific allocated IP | `-ip-1.2.3.4` |
| `-gip-NAME` | **Dedicated Residential or Mobile** only | Pin to a specific gIP group | `-gip-us_7922_fl_hollywood_0` |
| `-dns-local` / `-dns-remote` | All | `remote` = resolve DNS at the proxy peer (default for residential); `local` = resolve on super proxy | `-dns-remote` |
| `-const` | Residential, Mobile | Bind to the same peer; if peer is unavailable, return 502 "no peer available" instead of switching | `-const` |
| `-direct` | All | Force the request from the super proxy itself (skip peer routing). Rarely needed. | `-direct` |
| `-c_tag-VALUE` | All | Custom tag echoed back in response headers, for correlating req/resp at scale | `-c_tag-job42-row7` |

**Critical constraint**: Datacenter and ISP zones only support **country** targeting. State, city, zip, ASN, OS, and carrier targeting are Residential/Mobile-only. Don't generate code that puts `-city-` on a DC or ISP zone — it will silently fail or 400.

## Session and rotation patterns

- **Want a fresh IP on every request?** Omit `-session-`. The super proxy hands you a new peer each request.
- **Want to keep the same IP across a multi-step flow (login → action → action)?** Generate a random `session_id` once and reuse it: `-session-{session_id}`. New value = new IP.
- **Idle session timeouts** (lose the IP if idle too long, per Bright Data docs): Datacenter ~1 min, Residential ~5 min, ISP ~7 min, Mobile ~10 min. For longer-than-timeout flows, send a keep-alive request or accept that the IP will rotate.
- **Maximum control**: dedicated IPs zone + `-ip-A.B.C.D` to pin every request to a specific allocated IP. No randomness.

---

## Core code patterns

### cURL (for testing/debugging)

```bash
curl --proxy brd.superproxy.io:33335 \
  --proxy-user 'brd-customer-CUSTOMER_ID-zone-ZONE_NAME:ZONE_PASSWORD' \
  --cacert ./assets/brightdata_proxy_ca.crt \
  'https://geo.brdtest.com/mygeo.json'
```

(For Datacenter and ISP zones, the `--cacert` flag is optional. For Residential and Mobile it's required unless the user has system-installed the CA or completed KYC — see "Residential & Mobile network access" below.)

To bypass cert verification entirely (only OK if user has chosen the "ignore SSL errors" path):

```bash
curl -k --proxy brd.superproxy.io:33335 \
  --proxy-user 'brd-customer-CUSTOMER_ID-zone-ZONE_NAME:ZONE_PASSWORD' \
  'https://geo.brdtest.com/mygeo.json'
```

### Python — `requests`

```python
import requests

CUSTOMER_ID = "your_customer_id"
ZONE_NAME = "your_zone_name"
ZONE_PASSWORD = "your_zone_password"

proxy_user = f"brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}"
proxy_url = f"http://{proxy_user}:{ZONE_PASSWORD}@brd.superproxy.io:33335"

proxies = {"http": proxy_url, "https": proxy_url}

# Preferred: verify TLS using the bundled Bright Data CA
resp = requests.get(
    "https://geo.brdtest.com/mygeo.json",
    proxies=proxies,
    verify="./assets/brightdata_proxy_ca.crt",  # path to bundled cert
    timeout=30,
)
print(resp.json())
```

Country targeting:

```python
proxy_user = f"brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}-country-us"
```

Sticky session (rotate per logical user, same IP within a session):

```python
import secrets
session_id = secrets.token_hex(8)
proxy_user = f"brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}-country-us-session-{session_id}"
```

Rotation across many requests — give each request its own session ID:

```python
import secrets, requests

def proxy_for_request():
    sid = secrets.token_hex(8)
    user = f"brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}-session-{sid}"
    url = f"http://{user}:{ZONE_PASSWORD}@brd.superproxy.io:33335"
    return {"http": url, "https": url}

for target in targets:
    requests.get(target, proxies=proxy_for_request(), verify=CA_PATH, timeout=30)
```

### Node.js — undici / fetch (Node 18+)

```js
import { fetch, ProxyAgent } from 'undici';

const CUSTOMER_ID = 'your_customer_id';
const ZONE_NAME = 'your_zone_name';
const ZONE_PASSWORD = 'your_zone_password';

const proxyUser = `brd-customer-${CUSTOMER_ID}-zone-${ZONE_NAME}`;
const proxyUrl = `http://${proxyUser}:${ZONE_PASSWORD}@brd.superproxy.io:33335`;

const agent = new ProxyAgent(proxyUrl);

const res = await fetch('https://geo.brdtest.com/mygeo.json', { dispatcher: agent });
console.log(await res.json());
```

For CA verification on Node, set `NODE_EXTRA_CA_CERTS=/path/to/brightdata_proxy_ca.crt` in the environment, or pass a custom `Agent` with `ca` set. To bypass cert checks (last resort): `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Node.js — axios with https-proxy-agent

```js
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = `http://brd-customer-${CUSTOMER_ID}-zone-${ZONE_NAME}:${ZONE_PASSWORD}@brd.superproxy.io:33335`;
const agent = new HttpsProxyAgent(proxyUrl);

const res = await axios.get('https://geo.brdtest.com/mygeo.json', {
  httpAgent: agent,
  httpsAgent: agent,
  proxy: false, // important: tell axios to use our agent, not its own proxy logic
});
console.log(res.data);
```

For framework integrations (Playwright, Puppeteer, Selenium, Scrapy, httpx, aiohttp) and additional patterns, see `references/code-templates.md`.

---

## Residential & Mobile network access

Residential and Mobile have a network access policy that Datacenter and ISP don't. The user must pick **one** of these three before requests will succeed against arbitrary HTTPS targets:

1. **Use the Bright Data CA certificate** (preferred — what most users should do). The cert is already bundled in this skill at `assets/brightdata_proxy_ca.crt`. Two ways to apply it:
   - **Load it in code** for each request (no system install needed). For Python `requests`: `verify="./assets/brightdata_proxy_ca.crt"`. For cURL: `--cacert ./assets/brightdata_proxy_ca.crt`. For Node: set `NODE_EXTRA_CA_CERTS=./assets/brightdata_proxy_ca.crt` env var or pass a custom Agent with `ca`. This is the cleanest path and what we recommend by default in generated code.
   - **System-install the cert** (Windows / macOS Keychain / Linux `update-ca-certificates` / iOS / Android). Needed when using third-party tools that don't expose a CA-cert option. Copy the bundled `assets/brightdata_proxy_ca.crt` to the appropriate trust store, restart the app afterward. Public mirror at `https://brightdata.com/static/brightdata_proxy_ca.zip` if the user prefers to grab it independently.
2. **KYC verification**. Submit identity verification in the Bright Data control panel. After approval, the cert is no longer required for native proxy access.
3. **Ignore SSL errors** (last resort, not recommended for production). In Python: `requests.get(..., verify=False)`. In Node: `rejectUnauthorized: false` or `NODE_TLS_REJECT_UNAUTHORIZED=0`. In cURL: `-k`. This works but loses end-to-end encryption guarantees against MITM — fine for throwaway testing, bad for anything handling credentials or PII.

Generated code for Residential/Mobile should default to path 1a (load CA in code) with the cert path as a placeholder the user fills in. Mention path 2 and 3 as alternatives, briefly.

For Datacenter and ISP, none of this is required — they don't enforce the network access policy.

---

## Testing & debugging

Before scraping a real target, confirm the proxy works. Two bundled tools cover this end-to-end:

**1. Command-line smoke test** — `scripts/smoke_test.sh`:

```bash
./scripts/smoke_test.sh CUSTOMER_ID ZONE_NAME ZONE_PASSWORD
# with optional country and sticky session:
./scripts/smoke_test.sh CUSTOMER_ID ZONE_NAME ZONE_PASSWORD us my-session-1

# or via env vars:
BD_CUSTOMER_ID=xxx BD_ZONE=yyy BD_PASSWORD=zzz ./scripts/smoke_test.sh
```

It hits `geo.brdtest.com/mygeo.json` through the zone and returns the parsed JSON (IP, country, city, ASN). Exit codes distinguish auth failure (2) from HTTP error (3), so it's also fine to script around.

**2. Browser diagnostic** — `scripts/proxy_tester.html`:

Open the file in a browser. It continuously polls the geo endpoint and displays exit IP/country/city/ASN. Fill in your zone credentials and it generates the exact proxy config string to paste into your browser or OS proxy settings. The "Save as baseline" button captures your pre-proxy IP so you can visually confirm the proxy is active (the status flips to green and shows the before→after change). Useful when explaining to teammates that the proxy is working, or for debugging "is my browser actually going through the proxy" questions.

For ad-hoc one-liners, the raw cURL works too:

```bash
curl --proxy brd.superproxy.io:33335 \
  --proxy-user 'brd-customer-CUSTOMER_ID-zone-ZONE_NAME:ZONE_PASSWORD' \
  --cacert ./assets/brightdata_proxy_ca.crt \
  'https://geo.brdtest.com/mygeo.json'
```

Expected: JSON with `ip`, `country`, `asn`, `geo`. If you see this, auth and routing are working. **Do not** test against Google, Bing, or other search engines directly — Bright Data blocks direct search-engine access on the proxy networks. Use the SERP API for that.

Common errors and what they mean (high-signal subset):

- **407 Proxy Authentication Required**: wrong username structure or wrong zone password. Double-check `brd-customer-` prefix and `-zone-` segment. The customer ID is from the control panel, not your email.
- **502 "no peer available"**: usually from `-const` or `-ip-` to an IP that's offline. Drop `-const` or pick a different IP.
- **403 from the destination** (not from Bright Data): the destination blocked the proxy IP. Try Residential, add a sticky session, slow down request rate, or use Web Unlocker API.
- **TLS / certificate errors on Residential/Mobile**: you skipped the network-access setup. Install the cert (or load it in code), or fall back to `verify=False` for the moment.
- **Targeting silently ignored** on DC/ISP: you used `-city-` or `-state-` on a DC/ISP zone. They only honor `-country-`.

For any specific Bright Data error code not covered above, look it up in the full catalog: https://docs.brightdata.com/proxy-networks/errorCatalog. Inspect the response headers for the precise code — Bright Data is transitioning from the legacy `x-brd-err-code` header to the RFC 9209 standard `Proxy-Status` header, so generated debugging code should check both. Codes follow a `category_number` shape that tells you which layer failed at a glance: `client_*` (auth or request shape, e.g. `client_10000`), `policy_*` (Bright Data policy block, e.g. `policy_20050`), `target_*` (destination-side failure, e.g. `target_40011`), and the like.

---

## When the user hasn't set up a zone yet

Don't try to script the control-panel flow or call account-management APIs to create zones for them — those flows are interactive and account-specific. Instead, say:

> Sign up at https://brightdata.com (the free trial gives $5 credit, no card needed for some tiers). Once you're in, click **Proxies & Scraping** → **Add** and the in-app helper will walk you through choosing the network, the pool type, and naming the zone. When it finishes, copy the **customer ID**, **zone name**, and **zone password** from the zone's overview page and paste them in here — I'll generate the code.

The control panel's `proxy_examples` page (https://brightdata.com/cp/zones/proxy_examples) also has live, account-specific snippets for many languages and frameworks — use it as a sanity check if anything in this skill seems out of date.

---

## Reference files

- `references/code-templates.md` — full working code for Playwright, Puppeteer, Selenium (modern auth-extension approach + SeleniumWire fallback), Scrapy, httpx, aiohttp, and a few language variants. Read this when the user asks about a specific framework that isn't covered above.
- `references/troubleshooting.md` — extended error catalog and debugging recipes. Read when the user reports an error or unexpected behavior.
- `assets/brightdata_proxy_ca.crt` — Bright Data Proxy Root CA (port 33335, expires Sept 2034). Reference this path in any generated code that uses Residential or Mobile zones.
- `scripts/smoke_test.sh` — cURL credential smoke test (see Testing section).
- `scripts/proxy_tester.html` — single-file browser diagnostic (see Testing section).
