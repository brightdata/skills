# Bright Data Node.js SDK

Answers the question "how do I call Bright Data from Node.js code the user keeps?"

## Contents

- [The package](#the-package)
- [The client](#the-client)
- [The key](#the-key)
- [Core methods](#core-methods)
- [A runnable example](#a-runnable-example)
- [Scraper Studio, per README, not verified live](#scraper-studio-per-readme-not-verified-live)
- [Gotchas](#gotchas)

## The package

`@brightdata/sdk` on npm. MIT licensed. Requires Node 20 or newer. Source at github.com/brightdata/sdk-js. Docs at https://docs.brightdata.com/api-reference/SDK-JS.

```bash
npm install @brightdata/sdk
```

It ships ESM and CommonJS builds plus TypeScript declarations, so `import` and `require` both work and types come for free. The docs site calls it the JavaScript SDK, but it is a backend package with no browser build.

## The client

The exported class name is lowercase.

```javascript
import { bdclient } from '@brightdata/sdk';
const client = new bdclient();
```

The client implements `Symbol.asyncDispose`, so `await using client = new bdclient()` disposes it when the scope ends and no explicit close is needed. That form wants TypeScript 5.2 or newer, or a runtime that supports explicit resource management. Everywhere else, close by hand with `await client.close()`, which is what the disposer calls anyway. Closing is not optional either way, because the client holds an undici connection pool that will keep a process alive.

## The key

Credentials belong to `agent-onboarding`. See its `references/auth.md` for paths and refused calls. The constructor argument is `apiKey`, camelCase. Leave it out and let the environment supply the key. Resolution order, from `client.mjs`:

1. the `apiKey` option
2. `BRIGHTDATA_API_TOKEN`, then `BRIGHTDATA_API_KEY`
3. the credentials stored by the Bright Data CLI at login
4. otherwise an `AuthenticationError`

**Trap.** The JSDoc example shipped inside the package, and therefore the tooltip an editor shows, passes `api_token`, `auto_create_zones`, `web_unlocker_zone`, `serp_zone` and `log_level` in snake_case. None of those keys exist, and the real name for the last one is `logLevel`. The options schema accepts only `apiKey`, `webUnlockerZone`, `serpZone`, `logLevel`, `verbose`, `structuredLogging`, `autoCreateZones`, `rateLimit`, `ratePeriod`, `timeout` and the four `browser*` keys. It is a plain object schema rather than a strict one, so an unknown key is dropped without a warning. In TypeScript the compiler catches it. In plain JavaScript the client silently falls back to the environment, and if nothing is there it throws an auth error that points nowhere near the real mistake. Copy from this file, not from the tooltip.

Other environment variables the client reads: `BRIGHTDATA_WEB_UNLOCKER_ZONE`, `BRIGHTDATA_SERP_ZONE`, `BRIGHTDATA_BROWSERAPI_USERNAME`, `BRIGHTDATA_BROWSERAPI_PASSWORD` and `BRIGHTDATA_VERBOSE`.

## Core methods

Four overloads ship, in this order, from `client.d.ts`:

```typescript
scrapeUrl(url: string,   opts?: ScrapeJSONOptions): Promise<SingleJSONResponse>
scrapeUrl(url: string,   opts?: ScrapeOptions):     Promise<SingleRawResponse>
scrapeUrl(url: string[], opts?: ScrapeJSONOptions): Promise<BatchJSONResponse>
scrapeUrl(url: string[], opts?: ScrapeOptions):     Promise<BatchRawResponse>
search.google(query, options?)   // also .bing and .yandex, four overloads each, shaped differently
```

`SingleRawResponse` is `string`, `SingleJSONResponse` is `{ status_code, headers, body }`, and the batch pair are arrays of those with `BRDError` mixed in.

Return shape follows the options. No `format` means raw, and raw resolves to a plain string. `format: 'json'` resolves to `{ status_code, headers, body }`. Pass an array of URLs or queries and the result is an array whose entries are either the value or a `BRDError`, so check each entry rather than assuming the batch all worked.

The order matters on `scrapeUrl`, because `opts` is optional on all four of its overloads and TypeScript takes the first one that fits. A bare `scrapeUrl(url)` with no options therefore infers `SingleJSONResponse` even though the call returns a raw string at run time, so pass at least `{ format: 'raw' }` when the inferred type has to be right.

The search router does not share that trap. It ships four overloads per engine as well, but the two JSON ones declare `options` as a required parameter rather than an optional one (`api/search/router.d.ts`), so a bare `search.google(query)` cannot match them and falls through to the raw string overload, which is what the call actually returns. Only `scrapeUrl` needs the explicit `{ format: 'raw' }`.

`dataFormat` accepts `'html'`, `'markdown'`, `'md'` and `'screenshot'`, where `'md'` is a convenience alias the schema rewrites to `'markdown'`. Other useful options are `country`, `method` and `zone`.

Search takes those plus three of its own, all from `schemas/request.mjs`: `numResults` (1 to 100, default 10), `language` (a 2 to 5 character code) and `start` (result offset, default 0).

`client.scrape` is a per platform router, separate from `scrapeUrl`. Per `api/scrape/router.d.ts` it carries `amazon`, `linkedin`, `instagram`, `facebook`, `tiktok`, `youtube`, `reddit`, `pinterest`, `perplexity`, `digikey`, `chatGPT` and `snapshot`. Watch the capitals on `chatGPT`, which is the one name that is not plain lowercase.

`discoverTrigger(query, opts?)` is the manual counterpart to `discover()`. It returns a `DiscoverJob` rather than polling for you, so you drive it with `job.wait({ timeout })` and then `job.fetch()`. Also on the client: `crawler`, `discover()`, `datasets`, `browser`, `saveResults()`, `listZones()` and `close()`.

## A runnable example

```javascript
// Fetch a page and a SERP. The token comes from the environment, never from source.
import { bdclient } from '@brightdata/sdk';

// The client reads BRIGHTDATA_API_TOKEN on its own. Check it here so a missing
// key fails with a clear line instead of deep inside a request.
if (!process.env.BRIGHTDATA_API_TOKEN) {
  throw new Error(
    'BRIGHTDATA_API_TOKEN is not set. Export it, or log in with the ' +
      'Bright Data CLI. See the agent-onboarding skill.'
  );
}

const client = new bdclient();

try {
  // No options means raw mode, and raw mode resolves to a plain string.
  const html = await client.scrapeUrl('https://example.com', { country: 'us' });
  console.log(html.length);

  // The same call in markdown, which is the shape an index wants.
  const markdown = await client.scrapeUrl('https://example.com', {
    dataFormat: 'markdown',
  });
  console.log(markdown.slice(0, 200));

  const serp = await client.search.google('bright data node sdk', { format: 'json' });
  console.log(serp.status_code, serp.body.slice(0, 200));
} finally {
  // Always close, otherwise the undici pool keeps the process alive.
  await client.close();
}
```

Top level `await` needs ESM, so use a `.mjs` file or set `"type": "module"`. In CommonJS use `const { bdclient } = require('@brightdata/sdk')` and wrap the body in an async function.

## Scraper Studio, per README, not verified live

The package ships `client.scraperStudio`. The README claims: "Trigger and fetch results from your custom scrapers built in Scraper Studio."

That claim was not exercised against a real collector, so do not present it as working. The signatures, from `api/scraperstudio/service.d.ts`:

```typescript
run(collector: string, options: { input, timeout?, pollInterval? }): Promise<RunResult[]>
trigger(collector: string, input: Record<string, unknown>): Promise<ScraperStudioJob>
status(jobId: string): Promise<JobStatus>
fetch(responseId: string): Promise<unknown[]>
```

`collector` is a collector id such as `'c_abc123'`. `input` is one object or an array of them. The polling defaults differ by language and by unit, so read them side by side: Python waits 180 seconds with a 10 second interval, Node waits 500000 ms with a 10000 ms interval. That is about 8 minutes of patience in Node against 3 minutes in Python, from the same numbers written in different units. Note also that `run` takes an options object while Python takes `input` directly, so the two languages differ in shape as well as in defaults. Worth flagging to the user: the official Scraper Studio quickstart documents only REST, cURL and hand written `fetch`, never an SDK path, so these methods are ahead of the product docs.

## Gotchas

- Zones default to `sdk_unlocker` and `sdk_serp`, and `autoCreateZones` defaults to true, so the SDK creates them on first use.
- A batch call resolves rather than rejects on partial failure. Entries can be `BRDError`.
