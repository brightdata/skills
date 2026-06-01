# Code templates for common frameworks

Working code patterns for Bright Data proxy integration across HTTP clients, scrapers, and browser-automation tools. Constants reused throughout:

```
HOST     = brd.superproxy.io
PORT     = 33335               # HTTP/HTTPS; use 22228 for SOCKS5
USER     = brd-customer-CUSTOMER_ID-zone-ZONE_NAME[-PARAMS]
PASSWORD = <zone password>
CA_PATH  = ./assets/brightdata_proxy_ca.crt   # only required for Residential/Mobile
```

For Residential/Mobile, load `CA_PATH` as shown in each example, or set the env var that the framework reads. The Bright Data Root CA is bundled with this skill at `assets/brightdata_proxy_ca.crt` — generated code should point at that path (relative or absolute, depending on where the user runs from). For Datacenter/ISP, the CA-related lines are optional.

---

## Python — `httpx`

```python
import httpx

CUSTOMER_ID = "your_id"
ZONE_NAME = "your_zone"
ZONE_PASSWORD = "your_password"

proxy_url = (
    f"http://brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}"
    f":{ZONE_PASSWORD}@brd.superproxy.io:33335"
)

# Sync
with httpx.Client(proxy=proxy_url, verify="./assets/brightdata_proxy_ca.crt", timeout=30) as client:
    r = client.get("https://geo.brdtest.com/mygeo.json")
    print(r.json())

# Async
import asyncio
async def main():
    async with httpx.AsyncClient(proxy=proxy_url, verify="./assets/brightdata_proxy_ca.crt") as client:
        r = await client.get("https://geo.brdtest.com/mygeo.json")
        print(r.json())
asyncio.run(main())
```

## Python — `aiohttp`

```python
import aiohttp, asyncio, ssl

CUSTOMER_ID = "your_id"
ZONE_NAME = "your_zone"
ZONE_PASSWORD = "your_password"

proxy_url = (
    f"http://brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}"
    f":{ZONE_PASSWORD}@brd.superproxy.io:33335"
)

# Build an SSL context that trusts the Bright Data CA (Residential/Mobile only — omit for DC/ISP)
ssl_ctx = ssl.create_default_context(cafile="./assets/brightdata_proxy_ca.crt")

async def fetch():
    async with aiohttp.ClientSession() as session:
        async with session.get(
            "https://geo.brdtest.com/mygeo.json",
            proxy=proxy_url,
            ssl=ssl_ctx,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            print(await resp.json())

asyncio.run(fetch())
```

## Python — Scrapy

In `settings.py`:

```python
DOWNLOADER_MIDDLEWARES = {
    "scrapy.downloadermiddlewares.httpproxy.HttpProxyMiddleware": 110,
}
```

In the spider:

```python
import scrapy

class MySpider(scrapy.Spider):
    name = "via_brightdata"
    custom_settings = {"CONCURRENT_REQUESTS": 8}

    def start_requests(self):
        CUSTOMER_ID = "your_id"
        ZONE_NAME = "your_zone"
        ZONE_PASSWORD = "your_password"
        proxy = (
            f"http://brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}"
            f":{ZONE_PASSWORD}@brd.superproxy.io:33335"
        )
        yield scrapy.Request(
            "https://geo.brdtest.com/mygeo.json",
            meta={"proxy": proxy},
            callback=self.parse,
        )

    def parse(self, response):
        self.logger.info(response.text)
```

For Residential/Mobile, set `DOWNLOADER_CLIENT_TLS_CIPHERS` or use a custom contextFactory to load the CA — or, for first-pass testing, set `meta={"proxy": proxy, "dont_filter": True}` and disable cert checks (use `OPENSSL_disable_certificate_verification`-style settings only in dev).

---

## Python — Playwright

```python
from playwright.sync_api import sync_playwright

CUSTOMER_ID = "your_id"
ZONE_NAME = "your_zone"
ZONE_PASSWORD = "your_password"

with sync_playwright() as p:
    browser = p.chromium.launch(
        proxy={
            "server": "http://brd.superproxy.io:33335",
            "username": f"brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}",
            "password": ZONE_PASSWORD,
        },
        # For Residential/Mobile if you haven't system-installed the cert:
        # ignore_https_errors must be set on the context, not launch:
    )
    context = browser.new_context(ignore_https_errors=True)  # only if not using CA install
    page = context.new_page()
    page.goto("https://geo.brdtest.com/mygeo.json")
    print(page.content())
    browser.close()
```

## Node.js — Playwright

```js
import { chromium } from 'playwright';

const CUSTOMER_ID = 'your_id';
const ZONE_NAME = 'your_zone';
const ZONE_PASSWORD = 'your_password';

const browser = await chromium.launch({
  proxy: {
    server: 'http://brd.superproxy.io:33335',
    username: `brd-customer-${CUSTOMER_ID}-zone-${ZONE_NAME}`,
    password: ZONE_PASSWORD,
  },
});
const context = await browser.newContext({ ignoreHTTPSErrors: true }); // only if no CA install
const page = await context.newPage();
await page.goto('https://geo.brdtest.com/mygeo.json');
console.log(await page.content());
await browser.close();
```

## Node.js — Puppeteer

Puppeteer doesn't accept proxy auth in the launch flags directly — pass the server, then authenticate per-page.

```js
import puppeteer from 'puppeteer';

const CUSTOMER_ID = 'your_id';
const ZONE_NAME = 'your_zone';
const ZONE_PASSWORD = 'your_password';

const browser = await puppeteer.launch({
  args: ['--proxy-server=http://brd.superproxy.io:33335'],
  // ignoreHTTPSErrors only if you haven't system-installed the CA:
  ignoreHTTPSErrors: true,
});
const page = await browser.newPage();
await page.authenticate({
  username: `brd-customer-${CUSTOMER_ID}-zone-${ZONE_NAME}`,
  password: ZONE_PASSWORD,
});
await page.goto('https://geo.brdtest.com/mygeo.json');
console.log(await page.content());
await browser.close();
```

## Python — Selenium (with `selenium-wire` deprecated, prefer headers/CDP approach)

Vanilla Selenium can't pass username/password proxy auth directly. Three current approaches:

**1. Use the Bright Data Browser API** (recommended over raw Selenium-with-proxy when feasible — it's a managed remote Chromium that handles auth, fingerprinting, and unblocking for you).

**2. Selenium 4 with a Chrome extension that injects auth** (clean modern approach):

```python
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import os, zipfile

CUSTOMER_ID = "your_id"
ZONE_NAME = "your_zone"
ZONE_PASSWORD = "your_password"

manifest = """
{
  "version": "1.0.0", "manifest_version": 3, "name": "BD Proxy Auth",
  "permissions": ["proxy", "webRequest", "webRequestAuthProvider"],
  "host_permissions": ["<all_urls>"],
  "background": {"service_worker": "background.js"}
}
""".strip()

background = f"""
chrome.proxy.settings.set({{
  value: {{ mode: "fixed_servers",
    rules: {{ singleProxy: {{ scheme: "http", host: "brd.superproxy.io", port: 33335 }} }} }},
  scope: "regular"
}}, function() {{}});
chrome.webRequest.onAuthRequired.addListener(
  function(details, callback) {{
    callback({{ authCredentials: {{
      username: "brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}",
      password: "{ZONE_PASSWORD}"
    }} }});
  }}, {{ urls: ["<all_urls>"] }}, ["asyncBlocking"]
);
"""

ext_path = "/tmp/bd_proxy_ext.zip"
with zipfile.ZipFile(ext_path, "w") as z:
    z.writestr("manifest.json", manifest)
    z.writestr("background.js", background)

opts = Options()
opts.add_extension(ext_path)
driver = webdriver.Chrome(options=opts)
driver.get("https://geo.brdtest.com/mygeo.json")
print(driver.page_source)
driver.quit()
```

**3. Run Bright Data's Proxy Manager locally** and point Selenium at it with no auth — the Proxy Manager handles credentials. Best when you're already using Proxy Manager for other reasons.

**4. `selenium-wire` (legacy fallback — not recommended for new code)**: SeleniumWire is no longer maintained. It still works for proxy auth in many environments, but it lags Chromium security patches and ships with dependency-resolution issues. Use only if approaches 1–3 are blocked (e.g. you're stuck on an older Selenium pipeline you can't restructure).

```python
from seleniumwire import webdriver  # pip install selenium-wire

CUSTOMER_ID = "your_id"
ZONE_NAME = "your_zone"
ZONE_PASSWORD = "your_password"

proxy_url = (
    f"http://brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}"
    f":{ZONE_PASSWORD}@brd.superproxy.io:33335"
)

opts = {
    "proxy": {"http": proxy_url, "https": proxy_url, "no_proxy": "localhost,127.0.0.1"},
    # For Residential/Mobile without system-installed CA:
    "verify_ssl": False,
}

driver = webdriver.Chrome(seleniumwire_options=opts)
driver.get("https://geo.brdtest.com/mygeo.json")
print(driver.page_source)
driver.quit()
```

Known issues to flag if the user reports them: SeleniumWire conflicts with Selenium Manager (Selenium 4.11+), can't be combined with Chrome's `--headless=new` cleanly in some versions, and triggers macOS keychain prompts on first run. If anything breaks, escalate to approach 2 (extension-injection).

---

## Rotating sessions at scale

A common pattern: thousands of requests, each through its own sticky session for some logical unit (one session per "user", per "product page", per "search query") with the session reused across retries.

```python
import secrets, requests
from concurrent.futures import ThreadPoolExecutor

CUSTOMER_ID = "your_id"
ZONE_NAME = "your_zone"
ZONE_PASSWORD = "your_password"
CA = "./assets/brightdata_proxy_ca.crt"  # omit on DC/ISP

def fetch(target_url, session_id=None, country=None, max_retries=3):
    session_id = session_id or secrets.token_hex(8)
    parts = [f"brd-customer-{CUSTOMER_ID}", f"zone-{ZONE_NAME}"]
    if country:
        parts.append(f"country-{country}")
    parts.append(f"session-{session_id}")
    user = "-".join(parts)
    proxy = f"http://{user}:{ZONE_PASSWORD}@brd.superproxy.io:33335"
    proxies = {"http": proxy, "https": proxy}

    for attempt in range(max_retries):
        try:
            r = requests.get(target_url, proxies=proxies, verify=CA, timeout=30)
            r.raise_for_status()
            return r
        except (requests.RequestException) as e:
            if attempt == max_retries - 1:
                raise
            # Same session_id reused — retries hit the same exit IP unless it died

with ThreadPoolExecutor(max_workers=20) as pool:
    results = list(pool.map(lambda t: fetch(t, country="us"), target_urls))
```

To force a fresh IP on retry, regenerate `session_id` in the retry loop.

---

## SOCKS5

Same auth scheme, different port (`22228`) and scheme.

Python:

```python
import requests
proxy = (
    f"socks5h://brd-customer-{CUSTOMER_ID}-zone-{ZONE_NAME}"
    f":{ZONE_PASSWORD}@brd.superproxy.io:22228"
)
resp = requests.get("https://geo.brdtest.com/mygeo.json",
                    proxies={"http": proxy, "https": proxy}, timeout=30)
```

`socks5h://` (vs `socks5://`) routes DNS through the proxy — recommended unless you have a specific reason to resolve locally. Requires `requests[socks]` or `PySocks`.
