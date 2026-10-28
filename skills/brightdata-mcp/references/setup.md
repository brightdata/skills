# Setting up Bright Data MCP

Answers the question: how do I connect an MCP client to Bright Data, and how do
I control which tools the model ends up seeing?

## Contents

- Pick a variant
- Client config
- Auth
- First run
- Which tools the client sees, and group ids
- Local environment variables
- Remote equivalents

## Pick a variant

Remote (the hosted service at `mcp.brightdata.com`) needs no install and no
Node. Pick it for end users, for clients that only accept a URL, and for
machines you do not control.

Local (the self-hosted `@brightdata/mcp` package) runs on the user's machine
over stdio. Pick it for the knobs the Remote URL does not expose, such as
`RATE_LIMIT` or `BASE_TIMEOUT`, for the `extract` tool, or when traffic must
stay inside your network boundary.

## Client config

Use the block for the variant you picked, not both. Never a real key in the
file.

Remote, every tool the server carries, 31 of them:

```json
{
  "mcpServers": {
    "brightdata-remote": {
      "type": "http",
      "url": "https://mcp.brightdata.com/mcp?token=<YOUR_API_KEY>"
    }
  }
}
```

Remote, a smaller set instead of everything: keep that shape and add a group,
for example
`https://mcp.brightdata.com/mcp?token=<YOUR_API_KEY>&groups=scrapers`, which
yields the 3 base tools plus the 6 pre-built scraper tools.

Local:

```json
{
  "mcpServers": {
    "brightdata-local": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<YOUR_API_KEY>",
        "GROUPS": "scrapers,advanced_scraping",
        "TOOLS": "chatgpt_ai_insights"
      }
    }
  }
}
```

`chatgpt_ai_insights` belongs to the `geo` group, not to either group named
there, so `TOOLS` is visibly adding a tool the groups do not carry. Naming a
tool that a listed group already includes changes nothing. Leave out `GROUPS`
and `TOOLS` entirely to get every tool.

The `type` and `url` field names belong to the client, not to Bright Data.
Claude Code, Cursor, and VS Code accept that shape. Claude Desktop takes the
same URL through Settings, Connectors, Add custom connector. Remote also serves
SSE at `https://mcp.brightdata.com/sse?token=<YOUR_API_KEY>` for clients that
need it.

For Claude Code at project scope, the block belongs in the repo's `.mcp.json`:
that is the file Claude Code reads for project-level servers, and
`bdata add mcp --agent claude-code --project` targets a different settings
file. Show the user the block and where it goes, and let them add it. Do not
edit their MCP config yourself.

## Auth

Remote takes either of two credentials. Both reach the same tools and draw on
the same account credits.

- `?token=<YOUR_API_KEY>` on the `/mcp` or `/sse` URL. No username is involved.
  For server-side agents, CI jobs and scripts you control end to end.
- OAuth 2.1, an `Authorization: Bearer <access_token>` header. For desktop
  assistants, distributed clients, and any app run by someone who is not the
  account owner, or whenever a long-lived key must not sit in a config file.
  The user signs in through a browser and no key is pasted anywhere. Any
  client that implements the MCP authorization spec connects this way with no
  hardcoded credentials.

What a client written against Remote's OAuth has to get right:

- Discovery starts with a `401`. A `POST /mcp` with no token answers `401` and
  `WWW-Authenticate: Bearer resource_metadata="https://mcp.brightdata.com/.well-known/oauth-protected-resource", scope="mcp"`.
  Parse that URL rather than hardcoding it. It names the authorization server,
  `https://brightdata.com`, whose own metadata is at
  `https://brightdata.com/.well-known/oauth-authorization-server`.
- Clients are public. Register once with
  `POST https://brightdata.com/users/auth/mcp/register` (RFC 7591, open, no
  existing credential needed) to get a `client_id`; no `client_secret` comes
  back. Every `redirect_uri` you will use must be listed at registration, and
  loopback addresses such as `http://localhost:8765/callback` are accepted. An
  unregistered redirect URI or an unknown `client_id` gets `400 Bad Request`
  with no redirect.
- PKCE with `S256` is mandatory; `plain` is rejected. The `resource` parameter,
  `resource=https://mcp.brightdata.com`, is mandatory on both the authorization
  request and the token request (RFC 8707), and it is the one most clients
  forget. The only scope is `mcp`. The only grant types are
  `authorization_code` and `refresh_token`, so client credentials do not work.
- Endpoints: authorize `https://brightdata.com/users/auth/mcp/authorize`, token
  `https://brightdata.com/users/auth/mcp/token`, keys
  `https://brightdata.com/users/auth/mcp/jwks`. A user who is not signed in is
  sent through the Bright Data sign-in page and returned to the flow.
- Treat any `401` from `mcp.brightdata.com` as the signal to refresh with the
  `refresh_token` grant (`resource` required there too), then retry the request
  once. Do not schedule refreshes against a hardcoded lifetime. `invalid_grant`
  with `Invalid, expired, or already used refresh token` means start the
  authorization flow again.
- Error strings are returned verbatim, so a test suite can assert on them:
  `Missing required parameter: code_challenge`,
  `Unsupported code_challenge_method; only S256 is supported`,
  `resource parameter is required (RFC 8707)`,
  `Missing or invalid required parameters: code, code_verifier, redirect_uri, client_id, resource`,
  `Supported grant types: authorization_code, refresh_token`.
- A `403 Forbidden` with an HTML body and no OAuth error from `brightdata.com`
  means the client sent the Python standard library default User-Agent
  (`Python-urllib/*`), which the host blocks. Set an explicit `User-Agent`.
  `requests`, `httpx`, `aiohttp`, Node, Go and Java clients are unaffected.

The access token is issued for the resource `https://mcp.brightdata.com` with
the single scope `mcp`, and it is sent only as a bearer header on MCP
requests. The CLI resolves an API key from `--api-key`, `BRIGHTDATA_API_KEY`
or `credentials.json` and nothing else, so an OAuth session does not log the
CLI in. Use an API key for `api.brightdata.com` and the SDKs; getting one is
`agent-onboarding` territory.

Local requires `API_TOKEN` in the environment. Without it the server throws
`Cannot run MCP server without API_TOKEN env` and exits before opening any
connection, so a missing token looks like a dead server, not a tool error.

## First run

Both variants list your active zones and create missing ones: a Fetch API
zone `mcp_unlocker` and a browser zone `mcp_browser`. Rename them with
`WEB_UNLOCKER_ZONE` and `BROWSER_ZONE` on Local, or `unlocker=` and `browser=`
on Remote. Zone creation failures only log, so a server that started
is not proof the zones exist.

## Which tools the client sees, and group ids

Two modes, the same on both variants:

1. Neither `groups`/`GROUPS` nor `tools`/`TOOLS` set: every tool is on, 31 on
   Remote and 32 on Local.
2. Either one set builds an allowlist. Only those names register. `tools` adds
   on top of `groups`.

A `groups` value keeps the three base tools, because every group carries
`search_engine`, `scrape_as_markdown` and `ask_brightdata_assistant`. A
`tools` value with no `groups` does not, so `TOOLS="extract"` alone gives the
model exactly one tool.

Group ids:

| Group | Adds to the 3 base tools |
|---|---|
| `scrapers` | the 6 pre-built scraper tools |
| `advanced_scraping` | `search_engine_batch`, `scrape_batch`, `scrape_as_html`, `session_stats`, and `extract` on Local |
| `browser` | the 14 `scraping_browser_*` tools |
| `geo` | `chatgpt_ai_insights`, `perplexity_ai_insights` |
| `social`, `business` | the 6 scraper tools plus `list_dataset_fields` and `search_dataset` |
| `ecommerce`, `finance`, `research`, `app_stores`, `travel`, `code` | the 6 scraper tools, the same as `scrapers` |

The site-named groups are kept so older configs keep working. Since the
pre-built scrapers replaced the per-site tools, they no longer differ from
`scrapers`, so prefer `scrapers` in new configs. A thirteenth id, `custom`,
resolves to the three base tools and nothing else. Use `tools` for bespoke
picks.

There is no Pro mode on either variant: `pro=1` on Remote is ignored, and
Local has no `PRO_MODE`. Every tool is already on by default.

## Local environment variables

| Variable | Default | Notes |
|---|---|---|
| `API_TOKEN` | none | Required. Server exits without it. |
| `GROUPS` | none | Comma separated group ids. |
| `TOOLS` | none | Comma separated tool names, added on top of groups. |
| `WEB_UNLOCKER_ZONE` | `mcp_unlocker` | Fetch API zone. Point at your own zone to leave the free tier pool. |
| `BROWSER_ZONE` | `mcp_browser` | Scraping Browser zone. |
| `RATE_LIMIT` | unlimited | Format `100/1h` or `50/30m`. Bad format throws at startup. |
| `BASE_TIMEOUT` | no limit | Seconds. Covers search_engine, search_engine_batch, scrape_as_markdown, scrape_batch, list_dataset_fields and search_dataset. Not scrape_as_html, extract, the scraper tools or the browser tools. |
| `BASE_MAX_RETRIES` | `0` | Capped at 3. Retries only non 4xx failures. |

`chatgpt_ai_insights` and `perplexity_ai_insights` poll for up to 600 seconds,
which is longer than many clients wait, so expect client-side timeouts before
the tool gives up.

## Remote equivalents

Remote reads these query parameters: `token=`, `groups=<ids>` and
`tools=<names>` (the same values as the Local env vars), `unlocker=<zone>`
(the Fetch API zone, default `mcp_unlocker`, the stand-in for
`WEB_UNLOCKER_ZONE`) and `browser=<zone>` (default `mcp_browser`, the stand-in for `BROWSER_ZONE`).
Remote has no equivalent of `RATE_LIMIT`, `BASE_TIMEOUT` or
`BASE_MAX_RETRIES`.
