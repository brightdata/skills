# The CDP swap

Answers the question "how do I point the driver I already wrote at Bright Data's browser instead of the local one".

## The one line that changes

Every driver has exactly one call that starts a browser on this machine. That call becomes a connect call against a remote endpoint. Nothing above it and nothing below it changes.

```
wss://brd-customer-<CUSTOMER_ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9222
```

Host and port are fixed for Playwright and Puppeteer, while Selenium is the exception and uses `https://` on port `9515` (full detail in the Selenium section below). The three placeholders are the only parts that vary per account.

## Where the three pieces come from

| Piece | Where it lives | Free way to read it |
|---|---|---|
| `<CUSTOMER_ID>` | The account id, prefixed `hl_` | `GET https://api.brightdata.com/status` returns it as `customer` |
| `<ZONE>` | The Browser API zone name, `cli_browser` after login | `bdata zones --json`, and look for `"type":"browser_api"` |
| `<PASSWORD>` | The zone's own password, not the API key | `GET https://api.brightdata.com/zone/passwords?zone=cli_browser` returns a `passwords` array, take the first |

Both API reads take `Authorization: Bearer $BRIGHTDATA_API_KEY`, cost nothing, and start no browser session. All three also appear together on the zone's Overview tab in the control panel, which is the path for a user who has no CLI.

Assemble the string in code and read it from the environment at run time. `bdata browser open` builds the same string for itself, but running it starts a real billable session, so it is not a way to preview the endpoint.

## Playwright (Node) - the whole edit

Before, launching locally:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://example.com');
await page.click('#load-more');
console.log(await page.title());
await browser.close();
```

After, connecting to the cloud browser:

```js
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.BRIGHTDATA_BROWSER_CDP);
const page = await browser.newPage();
await page.goto('https://example.com');
await page.click('#load-more');
console.log(await page.title());
await browser.close();
```

One line moved. `launch` became `connectOverCDP`, and the endpoint arrives from the environment so the password never lands in the source file. `headless` is gone because the remote browser decides that, not the caller. Both snippets are ES modules, which is what the top-level `await` needs, so save them as `.mjs` or set `"type": "module"` in `package.json`.

Set the variable from a secrets store or a local `.env` that is git-ignored:

```
BRIGHTDATA_BROWSER_CDP=wss://brd-customer-<CUSTOMER_ID>-zone-cli_browser:<PASSWORD>@brd.superproxy.io:9222
```

Leave the variable unset and the driver gets `undefined` instead of an endpoint, so it throws a type error locally with no status code attached. Nothing reached the proxy, so this is not a credential failure and [errors.md](errors.md) has no code to match. Set the variable, then connect.

## Puppeteer

`const browser = await puppeteer.connect({ browserWSEndpoint: process.env.BRIGHTDATA_BROWSER_CDP })` replaces `puppeteer.launch(...)`. Same `wss://` string, same port 9222, and the same ES module rule for that top-level `await`.

## Selenium

Build a remote driver against `https://brd-customer-<CUSTOMER_ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9515`. Node uses `new Builder().usingServer(...)`, Python uses `ChromiumRemoteConnection`, C# uses `HttpCommandExecutor`.

## Country targeting

Append `-country-<cc>` to the zone segment, using a lowercase two-letter ISO code. Nothing else in the string moves.

```
wss://brd-customer-<CUSTOMER_ID>-zone-cli_browser-country-de:<PASSWORD>@brd.superproxy.io:9222
```

## The password rule

That endpoint is a credential, because the zone password sits in the URL. Never print it, never log it, never write it into a commit, and never paste it into the conversation. When showing the user what changed, show the placeholder shape above, not the assembled value. If the string has already been echoed somewhere it should not be, rotate the zone password rather than hoping.

## When the connect fails

Go straight to [errors.md](errors.md). A failure here is almost always one of the three pieces or an account state, and the status code plus the error code together say which.
