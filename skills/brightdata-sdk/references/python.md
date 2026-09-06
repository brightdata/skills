# Bright Data Python SDK

Answers the question "how do I call Bright Data from Python code the user keeps?"

## Contents

- [The package](#the-package)
- [The client](#the-client)
- [The key](#the-key)
- [Core methods](#core-methods)
- [A runnable example](#a-runnable-example)
- [Scraper Studio](#scraper-studio)
- [Gotchas](#gotchas)

## The package

`brightdata-sdk` on PyPI. Source at github.com/brightdata/sdk-python. Docs at https://docs.brightdata.com/api-reference/SDK. The distribution name is `brightdata-sdk` but the import name is `brightdata`, and installing `brightdata` instead gets an unofficial third party wrapper around Bright Data, which is a worse trap than an unrelated package because the wrong install still looks plausible.

On the Python floor, the two sources disagree. The vendor's own `pyproject.toml` sets `requires-python = ">=3.10"`, while the published metadata that pip actually enforces (`Requires-Python`, fed by `setup.py`) says `>=3.9`.

```bash
pip install brightdata-sdk
```

## The client

Async is the primary client and the one to reach for. A synchronous wrapper ships alongside it for scripts that have no event loop.

```python
from brightdata import BrightDataClient      # async
from brightdata import SyncBrightDataClient  # sync
```

Both are context managers and both must be entered. The HTTP session is opened in `__aenter__`, so calling a method on a bare client raises `RuntimeError: BrightDataClient not initialized.`

## The key

Credentials belong to `agent-onboarding`. See its `references/auth.md` for paths and refused calls. The constructor argument is `token`. Leave it out and let the environment supply the key. Resolution order, from `client.py`:

1. the explicit `token=` argument
2. `BRIGHTDATA_API_TOKEN`, then `BRIGHTDATA_API_KEY`
3. the credentials stored by the Bright Data CLI at login

`python-dotenv` is a hard dependency of the package, and `load_dotenv()` runs at import time in `client.py`, so a `.env` file is picked up without any extra step. Never pass a literal key in source.

## Core methods

```python
await client.scrape_url(url, zone=None, country="", response_format="raw",
                        method="GET", timeout=None, mode="sync",
                        poll_interval=2, poll_timeout=30)
await client.search.google(query, location=None, language="en", device="desktop",
                           num_results=10, zone=None, **kwargs)
await client.search.bing(...)    # same shape, no device argument
await client.search.yandex(...)  # no device argument, language defaults to "ru"
```

`url` and `query` each accept a single string or a list. The two result objects do not carry the same fields. `ScrapeResult` carries `.success`, `.status`, `.data`, `.cost`, `.error` and timing fields. `SearchResult` carries `.success`, `.data`, `.cost`, `.error`, `.raw_html` plus query and paging fields such as `.query`, `.total_found`, `.page` and `.results_per_page`, and it has no `.status` at all, so reading `.status` off a search result raises `AttributeError`. Check `.success` before touching `.data` on either one.

Yandex is the exception that will bite you. Google and Bing parse into `.data`, but Bright Data ships no parsed format for Yandex at all, so `YandexDataNormalizer` returns raw HTML and nothing else. Its docstring records the verification: `brd_json=1` comes back HTTP 400 "JSON output is not supported", and no `parsed_yandex` data format exists. A Yandex result therefore arrives in `.raw_html` with `.data` left empty every time, never populated, so parse the HTML yourself with something like BeautifulSoup rather than looping over `.data`.

Also present: `client.discover()` for AI web search, `client.crawler.trigger()` and `.download()`, `client.datasets.<name>`, `client.scrape.<platform>` for the per-platform scrapers, and `client.browser.get_connect_url()`. Zones default to `sdk_unlocker` and `sdk_serp`, and `auto_create_zones` is `True`, so the SDK creates them on first use.

## A runnable example

```python
"""Fetch a page and a SERP. The token comes from the environment, never from source."""

import asyncio
import os

from brightdata import BrightDataClient


async def main() -> None:
    # The client reads BRIGHTDATA_API_TOKEN on its own. Check it here so a
    # missing key fails with a clear line instead of deep inside a request.
    if not os.getenv("BRIGHTDATA_API_TOKEN"):
        raise SystemExit(
            "BRIGHTDATA_API_TOKEN is not set. Export it, or log in with the "
            "Bright Data CLI. See the agent-onboarding skill."
        )

    # `async with` is required. A bare client has no HTTP session yet.
    async with BrightDataClient() as client:
        page = await client.scrape_url("https://example.com", country="us")
        if not page.success:
            raise RuntimeError(f"scrape failed: {page.error}")
        print(page.status, page.cost, len(page.data or ""))

        serp = await client.search.google("bright data python sdk", num_results=10)
        for row in serp.data or []:
            print(row)


if __name__ == "__main__":
    asyncio.run(main())
```

For a plain script with no event loop, swap in `SyncBrightDataClient`, drop every `await`, turn `async with` into `with`, and turn `async def main()` into `def main()`. Then finish the swap at the bottom of the file: drop `import asyncio` and call `main()` directly, because `asyncio.run()` handed a plain function raises rather than running it.

## Scraper Studio

The package ships `client.scraper_studio` with `run`, `trigger`, `status` and `fetch` for running custom collectors built in Scraper Studio. The signature, from `scraper_studio/service.py`:

```python
await client.scraper_studio.run(collector, input, timeout=..., poll_interval=...)
```

`collector` is a collector id such as `"c_abc123"`, and `input` is one dict or a list of dicts. A list is triggered one entry at a time and the records are concatenated. `trigger()` returns a `ScraperStudioJob` for manual polling. Worth flagging to the user: the official Scraper Studio quickstart documents only REST, cURL, `requests` and `fetch`, never an SDK path, so these methods are ahead of the product docs.

## Gotchas

- `mode="sync"` on `scrape_url` inherits the client default request timeout of 30 seconds (`DEFAULT_TIMEOUT = 30` in `client.py`). A slow page needs an explicit `timeout=`, not a mode change.
- `mode="async"` is scoped, not faster. The README lists batches of many URLs first under "when to use async mode", then background processing while the caller gets on with other work. What it recommends sync for is the single URL case, where the default sync mode returns faster. The about 145 seconds in `web_unlocker/service.py` is one async round trip, not a per URL cost, which is exactly why the figure argues against async for one URL and not against async for a batch.
- The `poll_timeout` trap follows straight from that number. `scrape_url` carries its own default of `poll_timeout=30` and forwards it down to the Web Unlocker service, whose own default is 180. Thirty seconds cannot outlast a roughly 145 second completion, so an async call left on the default times out before the result ever lands. Pass `poll_timeout=180` or more, matching the service level default, whenever you use `mode="async"`.
- `.data` is `None` on failure, so guard it rather than indexing straight into it.
