# The CDP swap

Answers the question "how do I point the driver I already wrote at Bright Data's browser instead of the local one, so that it actually connects".

## The one line that changes

Every driver has exactly one call that starts a browser on this machine. That call becomes a connect call against a remote endpoint. The automation above and below it does not change; the only new code is what supplies the endpoint.

```
wss://brd-customer-<CUSTOMER_ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9222
```

Host and port are fixed for Playwright and Puppeteer, while Selenium is the exception and uses `https://` on port `9515` (see the Selenium section). The three placeholders are the only parts that vary per account.

## The API key comes first

All three pieces are read with the account API key. Resolve it the way the CLI does:

1. `BRIGHTDATA_API_KEY`, if set.
2. Else `api_key` in the CLI's `credentials.json`, which `bdata login` writes:
   - Linux: `~/.config/brightdata-cli/credentials.json`
   - macOS: `~/Library/Application Support/brightdata-cli/credentials.json`
   - Windows: `%APPDATA%\brightdata-cli\credentials.json`
3. Neither exists: the user is not set up. Hand off to the `agent-onboarding` skill. Never ask the user to paste a key into chat.

After `bdata login` the environment variable is normally empty and the key is only in the file. That is a logged-in machine, not a missing key. Reading the stored key in code is expected and allowed (`agent-onboarding`, `references/auth.md`, "Reading the key in code"): do it in-process and never print it.

## The three pieces, all free reads

Every call sends `Authorization: Bearer <key>` to `https://api.brightdata.com`. None of them costs anything or starts a browser session.

| Piece | Read | Take |
|---|---|---|
| `<CUSTOMER_ID>` | `GET /status` | `customer` (shaped `hl_...`) |
| `<ZONE>` | `GET /zone/get_active_zones` (same as `bdata zones --json`) | `name` of an entry whose `type` is `browser_api`. Match by type, never by name: names differ per account |
| `<PASSWORD>` | `GET /zone/passwords?zone=<ZONE>` | `passwords[0]`. This is the zone's password, not the API key |

`BRIGHTDATA_BROWSER_ZONE`, when set, names the zone and skips the search. When the account has several `browser_api` zones and no override, ask the user once which to use and record the answer in that variable. No `browser_api` zone at all: see SKILL.md, The zone.

Do not use `bdata zones info <zone>` to get the password: it prints it to the terminal.

## The agent finishes the job

Do not hand the user placeholders to fill. Do the reads above yourself, wire the result into the script, run it once, and report whether it connected. Pick one of two designs and say which you picked and why.

| | A. Endpoint in a secret | B. Look up at run time |
|---|---|---|
| Script reads | One variable holding the full endpoint | The API key, then the three reads |
| Who fills it | The agent, once, from the three reads | Nobody; the script does it every run |
| Exposed to the script | Only the zone password | The full account API key |
| Pick when | CI, servers, containers, or anyone running it who should not hold the account key | Every machine that runs it is already logged in (CLI or `BRIGHTDATA_API_KEY`), e.g. each person on their own account |

The variable name in A is the project's own choice: no Bright Data tool sets or reads it, so the agent that picks it must also fill it. Fill it without the value passing through the screen: pipe it straight into the secrets store (for example a CI secret command reading stdin), or into the user's own shell environment. A local `.env` is the last resort: it puts the zone password on disk in plaintext, so only with the file git-ignored, readable by the user alone, and the user told so.

A script can support both: use the endpoint variable when it is set, else look up.

## Playwright (Node), design B

Before, launching locally:

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
```

After:

```js
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function apiKey() {
  if (process.env.BRIGHTDATA_API_KEY) return process.env.BRIGHTDATA_API_KEY;
  const dir = process.platform === 'win32' ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'brightdata-cli')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'brightdata-cli')
    : join(homedir(), '.config', 'brightdata-cli');
  try { return JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8')).api_key; }
  catch { throw new Error('No Bright Data API key: run `bdata login` or set BRIGHTDATA_API_KEY'); }
}

async function brightdataEndpoint() {
  const headers = { Authorization: `Bearer ${apiKey()}` };
  const get = async (path) => {
    const res = await fetch(`https://api.brightdata.com${path}`, { headers });
    if (!res.ok) throw new Error(`Bright Data ${path.split('?')[0]}: HTTP ${res.status}`);
    return res.json();
  };
  const { customer } = await get('/status');
  const zone = process.env.BRIGHTDATA_BROWSER_ZONE
    || (await get('/zone/get_active_zones')).find((z) => z.type === 'browser_api')?.name;
  if (!zone) throw new Error('No browser_api zone on this account');
  const { passwords } = await get(`/zone/passwords?zone=${encodeURIComponent(zone)}`);
  return `wss://brd-customer-${customer}-zone-${zone}:${passwords[0]}@brd.superproxy.io:9222`;
}

const redact = (e) => String(e?.message || e).replace(/:\/\/[^@\s]+@/g, '://<redacted>@');
let browser;
try { browser = await chromium.connectOverCDP(await brightdataEndpoint()); }
catch (e) { console.error(redact(e)); process.exit(1); }
```

Everything after that line (`newPage`, `goto`, selectors, `close`) stays as the user wrote it. `headless` is gone because the remote browser decides that. Top-level `await` needs an ES module: `.mjs`, or `"type": "module"` in `package.json`. For design A, replace `await brightdataEndpoint()` with the variable, and fail with a clear message when it is unset.

Driver connect errors can include the full URL with the password. Always pass them through a redaction like the one above before printing or logging.

## Puppeteer

`puppeteer.connect({ browserWSEndpoint: endpoint })` replaces `puppeteer.launch(...)`. Same `wss://` string, same port 9222, same lookup and redaction.

## Selenium

Build a remote driver against `https://brd-customer-<CUSTOMER_ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9515`. Node uses `new Builder().usingServer(...)`, Python uses `ChromiumRemoteConnection`, C# uses `HttpCommandExecutor`. The pieces come from the same three reads.

## Country targeting

Append `-country-<cc>` to the zone segment, using a lowercase two-letter ISO code. Nothing else in the string moves.

```
wss://brd-customer-<CUSTOMER_ID>-zone-<ZONE>-country-de:<PASSWORD>@brd.superproxy.io:9222
```

## The password rule

The endpoint is a credential, because the zone password sits in the URL. Never print it, log it, commit it, or paste it into the conversation; when showing the user what changed, show the placeholder shape. Keep it in memory, or in a secrets store under design A. If it was echoed somewhere it should not be, rotate the zone password.

## When the connect fails

Go straight to [errors.md](errors.md). A failure here is almost always one of the three pieces or an account state, and the status code plus the error code together say which. If the agent's own sandbox cannot reach `brd.superproxy.io`, say that plainly instead of reporting the script as working.
