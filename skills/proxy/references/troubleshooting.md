# Troubleshooting Bright Data proxy issues

**Got a specific error code?** Look it up in the official catalog first: https://docs.brightdata.com/proxy-networks/errorCatalog. Inspect response headers for the code — Bright Data is transitioning from the legacy `x-brd-err-code` header to the RFC 9209 standard `Proxy-Status` header, so check both. Codes follow a `category_number` shape (e.g. `client_10000` = client/auth, `policy_20050` = Bright Data policy block, `target_40011` = destination-side issue) which tells you which layer failed at a glance.

Otherwise, work through the symptom-based list below from top to bottom. Most issues fall in the first three categories.

## Auth and URL-format failures

**407 Proxy Authentication Required**
- The username has the wrong shape. Confirm the exact prefix `brd-customer-` and segment `-zone-`. Customer ID is a numeric/alphanumeric string from the control panel — not the user's email, not the zone name.
- Wrong password. The zone has its own password, separate from the account password. Find it in the zone's overview page in the control panel.
- Parameters appended without leading `-`. Example: `brd-customer-X-zone-Ycountry-us` is wrong; `brd-customer-X-zone-Y-country-us` is right.

**Connection refused / timeout on port**
- Wrong port. Use `33335` for HTTP/HTTPS proxy (current). `22225` is the legacy port for the old CA — works but deprecated. SOCKS5 is `22228`.
- Wrong host. `brd.superproxy.io`. The old `zproxy.lum-superproxy.io` still appears in some older docs and integration guides — both currently resolve, but generated code should prefer `brd.superproxy.io`.
- User is behind a firewall that blocks the proxy port. Verify with `curl -v --connect-timeout 5 telnet://brd.superproxy.io:33335` or equivalent.

## TLS and certificate errors

These mostly hit Residential and Mobile users who haven't completed network access setup.

**`SSL: CERTIFICATE_VERIFY_FAILED` (Python) / `unable to verify the first certificate` (Node) / `SSL certificate problem: unable to get local issuer certificate` (cURL)**
- Residential/Mobile only. Pick one:
  - **Best**: download the Bright Data CA (`https://brightdata.com/static/brightdata_proxy_ca.zip`) and load it: Python `verify="/path/to/brightdata_proxy_ca.crt"`, cURL `--cacert PATH`, Node `NODE_EXTRA_CA_CERTS=PATH`.
  - Or system-install the cert (Windows / macOS Keychain / Linux `/usr/local/share/ca-certificates/` + `update-ca-certificates` / iOS / Android — instructions per OS).
  - Or complete KYC verification in the control panel — after approval, the cert is no longer required.
  - Last resort: disable verification (`verify=False` in Python, `rejectUnauthorized: false` in Node, `-k` in cURL). Don't recommend this for production.
- Datacenter and ISP don't need any of this — they use the public PKI normally. A cert error on DC/ISP means something else (corporate MITM proxy in the way, system clock skew, etc).

**Port/cert mismatch**
- Port `22225` requires the **old** CA (expires Sept 2026, deprecated).
- Port `33335` requires the **new** CA (expires Sept 2034).
- Using the new CA against `22225` or vice versa will fail. Default to `33335` + new CA.

## Targeting and rotation issues

**Targeting silently ignored on DC/ISP**
- Datacenter and ISP zones support `-country-XX` only. `-state-`, `-city-`, `-zip-`, `-asn-`, `-os-`, `-carrier-` are Residential/Mobile features. The proxy may accept the username but ignore the unsupported parameters.

**Same IP keeps coming back even without `-session-`**
- The super proxy keeps the same exit peer for some duration after a successful request to allow connection reuse. To force rotation, add `-session-RANDOM` and change `RANDOM` each request.
- Check for HTTP keep-alive: if the client is reusing a TCP connection, the proxy is correctly reusing the peer. Close-and-reconnect to force re-routing.

**Sticky session "broke" mid-flow**
- Idle timeouts per network (approximate): Datacenter ~1 min, Residential ~5 min, ISP ~7 min, Mobile ~10 min. Long idle gaps drop the peer; the next request gets a new IP.
- Workarounds: lower the gap, send a keep-alive ping, or use dedicated IPs with `-ip-A.B.C.D` for true pinning.

**`-ip-A.B.C.D` returning 502 "no peer available"**
- Zone doesn't have dedicated IPs allocated (DC/ISP shared-pool and shared-IPs zones can't pin to specific IPs).
- The IP is currently offline. Pick another from your allocated set.
- `-const` combined with an unreachable peer behaves the same way — drop `-const` to allow fallback.

## Destination-side blocks

**403 / 429 / CAPTCHA from the destination (not from Bright Data)**
- The destination flagged the proxy IP or the request shape. Triage:
  - Try a different network: DC → ISP → Residential → Mobile, in that order of "looks more like a real user".
  - Add a sticky session — many sites flag rapid IP changes within a session.
  - Slow down: lower request rate, add jitter.
  - Add realistic headers (User-Agent, Accept-Language, etc).
  - For heavily protected sites (sneakers, ticketing, social media, etc), consider Web Unlocker API or Browser API instead of raw proxies.
- Don't test proxies against Google, Bing, or other search engines — Bright Data blocks direct search-engine access on the proxy networks. Use the SERP API.

**Geo not matching expectation**
- `-country-XX` requests are best-effort. Bright Data picks a peer in the country but the exact geo can vary. Test what you're actually getting via `https://geo.brdtest.com/mygeo.json` through the proxy.
- DNS resolution location matters. If the destination uses geo-based CDN routing, the resolved CDN edge might be in a different country than the exit IP. Try `-dns-remote` (resolve at the peer, i.e. in-country) to align them.

## Performance issues

**Slow requests**
- Datacenter is fastest, Mobile is slowest (often 1–5s extra latency for mobile carriers). If speed matters and the target allows it, use DC or ISP.
- Residential/Mobile latency varies wildly with peer quality. Setting `-country-XX` near your target server helps.
- Don't reuse the same `-session-` across thousands of requests — you'll hammer one peer. Rotate.

**High failure rates**
- Check the zone's success-rate dashboard in the control panel.
- For DC/ISP shared-pool, some IPs will be hot/burned at any moment. Failure rate baseline is non-zero; retries with new sessions handle it.
- Pay attention to error codes: a 502 from the super proxy is different from a 403 from the destination. Don't retry indefinitely on 4xx from the destination.

## When to escalate from proxies to higher-level products

- Hitting consistent blocks even on Residential with sticky sessions: try **Web Unlocker API** (handles CAPTCHAs, fingerprinting, retries).
- Need a real browser environment with proxy + anti-detect: **Browser API** (managed remote Chromium).
- Scraping search engines: **SERP API**.
- Scraping a well-known site (Amazon, LinkedIn, Instagram, etc): **Web Scraper APIs** — structured data, no proxy management needed.

The general escalation order: raw proxy → Web Unlocker → Browser API → Web Scraper APIs. Each step abstracts more, costs more per request, and succeeds more.
