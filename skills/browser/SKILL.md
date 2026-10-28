---
name: browser
description: 'Use when the user already has browser automation and wants it unblocked or run in the cloud: Playwright, Puppeteer, Selenium or another driver, a headless script that gets blocked, detected, or rate limited locally, or a computer-use AI that clicks by itself and needs somewhere to click. Also for asks that name CDP, connectOverCDP, browserWSEndpoint, a remote WebDriver, a websocket browser endpoint, or Browser API. Not for building the scraper for them (use scrape), not for one page as markdown, HTML, or a screenshot (use fetch), not for a search query (use search).'
---

# Bright Data - Browser

The user already wrote the automation. This skill changes the launch line so it runs on Bright Data's cloud browser instead of the local one, wires in the credentials that line needs, and runs it once to prove it connects. Their automation logic does not move.

## The one question

**Who does the clicking - your code, your AI model, or us?**

| Who clicks | Where it goes |
|---|---|
| Their code: Playwright, Puppeteer, or Selenium | Stay here. Point it at our cloud browser, nothing to rewrite. |
| Their computer-use model, the AI that clicks by itself | Stay here. Same swap, same endpoint. |
| The agent itself, step by step from a terminal | Stay here and drive `bdata browser`: `open`, `snapshot`, `click <ref>`, `type <ref>`, `close`, one command per action, no code to hold. The `brightdata-cli` skill's reference carries the full subcommand list. |
| Us | `scrape`. Scraper Studio does the clicking, and the user gets fields back instead of a driver to maintain. |

Ask it when the request names a framework, a technique, or an agent but leaves who drives the browser unstated. Ask it once, then act. A user holding working Playwright code and a blocked local browser never needs to hear about Scraper Studio.

## What the swap is

The local launch call becomes a remote connect call against a websocket:

```
wss://brd-customer-<CUSTOMER_ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9222
```

Selenium is the one exception. It speaks WebDriver, not CDP, so it uses `https://` on port `9515` with the same credentials. Selectors, waits, navigation, screenshots and page logic all stay exactly as written.

The agent fills the three pieces itself, with free API reads and the key the user already has (`BRIGHTDATA_API_KEY`, else the CLI's stored login), never with placeholders left for the user. No key anywhere means the user is not set up: hand off to `agent-onboarding`, never ask for a key in chat. [references/connect.md](references/connect.md) has the lookup and the two ways to wire it.

## The zone

Find the Browser API zone by type, not by name, before writing the string:

```
bdata zones --json
```

Take the `name` of the entry whose `"type"` is `"browser_api"`, and use it wherever the connect string says `<ZONE>`. It is `cli_browser` after `bdata login`, `agent_browser_api` on an account made by agent registration, `mcp_browser` when the MCP server set the account up, and any name at all when a person created it by hand: read the type, then use whatever name it carries. This is one free read and it starts no session. If `bdata` is not recognized, npm's global directory is not on PATH, and the fix lives in the `agent-onboarding` skill's Install section.

No entry of that type at all is not a connect string to fix, but it is not an account problem yet either. The remedy, after the user agrees (it changes their account), is one free call, `POST https://api.brightdata.com/zone` with body `{"zone":{"name":"cli_browser","type":"browser_api"},"plan":{"type":"browser_api"}}`. `bdata browser open` creates one on demand too, but that starts a billable session, and it uses the name `cli_browser` unless given `--zone <name>` or `BRIGHTDATA_BROWSER_ZONE`, so on an account whose browser zone has another name, pass that name or it makes a second zone. Do not reach for `bdata login` on a machine that is already logged in: it replaces the stored key. Escalate to `agent-onboarding` when the creation is refused with `kyc_required` or `business_account_required`, or on permissions, which means a key from agent registration and a zone the person must make in the Control Panel.

## The boundaries

Building the scraper belongs to `scrape`, and so does any ask where the user wants data and does not care what drives the browser. One page as markdown, HTML, or a screenshot belongs to `fetch`. Anything starting from a search query belongs to `search`. This skill is for a driver that already exists.

## Logging into sites

Typing passwords through Browser API is blocked by default. It needs KYC plus a compliance exception. Never promise a login flow before that is approved, and never retry into the block. The deep detail lives one skill over: open `agent-onboarding` and read the `references/auth.md` file inside it, which lists what needs KYC, what does not, and the approval path.

## Read next

- **Read [references/connect.md](references/connect.md) before writing the connect line** - the exact string, where the key and each of the three pieces come from, the two designs (endpoint in a secret, or looked up at run time) and when to pick which, and the Playwright edit end to end.
- **Read [references/errors.md](references/errors.md) the moment a connect attempt fails** - the 407 `client_100xx` codes and what each means, the Browser API auth codes, and the retry rule.

## Red flags - stop if you catch yourself doing one of these

- Offering Scraper Studio to a user who already has working driver code
- Rewriting their automation instead of changing the endpoint line
- Pointing Selenium at port 9222, or Playwright at 9515
- Printing, logging, or committing the assembled endpoint, which carries the password, or printing a connect error without redacting it
- Running `bdata zones info <zone>` in a terminal: it prints the zone password
- Leaving the user a variable to fill, or asking for a key, when the agent can read the stored key itself
- Retrying a 407 without reading which code came with it
- Sending the user to KYC before an error actually refused the connect
- Hardcoding or guessing a zone name instead of finding the `browser_api` zone by type
- Creating a zone without asking the user first
