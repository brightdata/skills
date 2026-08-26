---
name: fetch
description: 'Use when the user wants one known URL returned as content: "get me this page", read this article, this page as markdown, save the raw HTML, screenshot this page, or page text for a RAG index or model context. Also when a plain fetch of a URL came back blocked or challenged instead of the real page: a 403 or another error status, a CAPTCHA, a bot wall, or an empty body. Wraps Bright Data Web Unlocker, so a blocked page still comes back. Not records or many pages of data from a site (use scrape), not a search query with no URL (use search), not driving a browser with your own Playwright, Puppeteer or Selenium code (use browser), not cost or credits (use billing), not auth or KYC failures (use agent-onboarding).'
---

# Bright Data - Fetch

One URL in, one page out, as markdown, HTML, or a screenshot. Nothing is parsed for you.

The shape is borrowed from a built-in web fetch tool. The product is not. A built-in tool only asks for the page. This one unblocks it: IP rotation, browser fingerprints, cookies, CAPTCHA solving and automatic retries on every request, from a country you choose. JavaScript rendering is the one capability that is off by default. The REST body can ask for it with the `render` parameter, and the CLI has no flag for it in v0.3.5, so a CLI fetch never renders.

## The call

**CLI.** The command is `bdata scrape`, not `bdata fetch`. The verb collides with the `scrape` skill, so trust this line and not the name.

```
bdata scrape https://example.com/article
```

Markdown is the default. `bdata login` sets the zone default to `cli_unlocker`, so a fresh login needs no `--zone`. Override with `--zone <name>`, or `BRIGHTDATA_UNLOCKER_ZONE`, or `bdata config set default_zone_unlocker <name>`.

**REST.** The same request, for any machine with no CLI.

```
POST https://api.brightdata.com/request
     Authorization: Bearer $BRIGHTDATA_API_KEY
     Content-Type: application/json

     {"zone":"cli_unlocker","url":"https://example.com/article",
      "format":"raw","data_format":"markdown"}
```

`format` is the envelope and `data_format` is the page. `"format":"raw"` returns the body itself, `"format":"json"` wraps it with status and headers. The rest of the REST surface, including every parameter this call accepts, is documented in the `scrape` skill under its web-unlocker reference.

## Formats

| Want | CLI | REST body | Note |
|---|---|---|---|
| Markdown (default) | `-f markdown` | `"format":"raw","data_format":"markdown"` | For a model, an index, or a human |
| Raw HTML | `-f html` | `"format":"raw"`, no `data_format` | When the user's own code parses it |
| Screenshot | `-f screenshot` | `"format":"raw","data_format":"screenshot"` | Binary PNG. The CLI writes `screenshot.png` unless `-o <path>` says otherwise |
| Response metadata | `-f json` | `"format":"json"` | Status and headers around the body |

The other flags that exist: `--country <code>`, `--async`, `-o <path>`, `--json`, `--pretty`, `--timing`, and `--mobile`, which v0.3.5 advertises but parses and never sends, so it is a silent no-op.

## Example - one blocked article

The ask: *"my script gets a 403 on this URL, I just need the article text"*

1. One URL, and the page itself is the answer. Stay in this skill.
2. The 403 is the reason to be here, not a problem to route around. Unblocking is the product.
3. Text for a human or a model, so markdown, which is already the default.

```
bdata scrape https://www.example-news.com/2026/08/some-article
```

Then state the choice in one line the user can override with one word:

> Fetched the page with Web Unlocker as markdown. Say `fields` if you want the data fields pulled out instead, and I will use a maintained scraper.

## When a fetch is refused

Read the error first. A 403 from the target site is not on this list, because that is the ordinary case this skill exists to solve.

| What comes back | What it means |
|---|---|
| `No Web Unlocker zone specified.` | No zone resolved. Pass `--zone`, or log in again to get `cli_unlocker`. |

Two other refusals are not this skill's to fix. A missing or dead key (`No API key found`, or 401) means the machine is not logged in. A few targets need KYC on the account before Bright Data will serve them: sites that block themselves in robots.txt such as Reddit, government sites, and sites on Bright Data's blocked list. Most sites need none of this. Both belong to the `agent-onboarding` skill, which carries the exact error codes. Send the user there, and never send anyone to KYC before a call has actually been refused.

## Handoff boundaries

| The ask | Skill |
|---|---|
| Data fields, or many pages of one site | `scrape` |
| The same site fetched twice with a parser in between | `scrape`, because that is a scraper being written by hand |
| A query with no URL | `search` |
| Their own browser code, pointed at an unblocked browser | `browser` |

A fetch whose real purpose is pulling data fields out of the page is a scrape ask. Hand it over.

Never promise JavaScript rendering on a CLI fetch, and never reach for a browser or a proxy because a page returned 403. That is what this one call already handles.
