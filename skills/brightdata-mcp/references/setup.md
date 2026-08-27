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
`POLLING_TIMEOUT` or `BASE_TIMEOUT`, or when traffic must stay inside your
network boundary.

## Client config

Use the block for the variant you picked, not both. Never a real key in the
file.

Remote, Pro mode, every tool the server carries, 74 of them:

```json
{
  "mcpServers": {
    "brightdata-remote": {
      "type": "http",
      "url": "https://mcp.brightdata.com/mcp?token=<YOUR_API_KEY>&pro=1"
    }
  }
}
```

Remote, one bundle instead of everything: keep that shape and use
`https://mcp.brightdata.com/mcp?token=<YOUR_API_KEY>&groups=ecommerce` as the
`url`, which yields the `ecommerce` group. In the Local source that group is 11
retail scrapers plus the 3 base tools, and Remote's copy of it is not verified
to match. Send one parameter or the other, never both. On Remote `groups=`
overrides `pro=1`, so a URL carrying both quietly drops Pro mode and hands the
model the bundle.

Local:

```json
{
  "mcpServers": {
    "brightdata-local": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<YOUR_API_KEY>",
        "GROUPS": "ecommerce,advanced_scraping",
        "TOOLS": "web_data_linkedin_person_profile"
      }
    }
  }
}
```

`web_data_linkedin_person_profile` belongs to the `social` group, not to either
group named there, so `TOOLS` is visibly adding a tool the groups do not carry.
Naming a tool that a listed group already includes changes nothing.

The `type` and `url` field names belong to the client, not to Bright Data.
Claude Code, Cursor, and VS Code accept that shape. Claude Desktop takes the
same URL through Settings, Connectors, Add custom connector. Remote also serves
SSE at `https://mcp.brightdata.com/sse?token=<YOUR_API_KEY>` for clients that
need it.

## Auth

Remote takes the API token as the `token` query parameter. No username is
involved. Remote also supports OAuth 2.1 for clients that implement the MCP
authorization spec, PKCE S256 required, endpoints under
`https://brightdata.com/users/auth/mcp/`.

Local requires `API_TOKEN` in the environment. Without it the server throws
`Cannot run MCP server without API_TOKEN env` and exits before opening any
connection, so a missing token looks like a dead server, not a tool error.

## First run

The Local server lists your active zones and creates missing ones: an unblocker
zone `mcp_unlocker` and a browser zone `mcp_browser`. Rename them with
`WEB_UNLOCKER_ZONE` and `BROWSER_ZONE`. Zone creation failures only log to
stderr, so a server that started is not proof the zones exist.

## Which tools the client sees, and group ids

Three modes. Which one wins when more than one is set depends on the variant,
and the two variants are documented as opposites.

**Local precedence, from the code.** `server.js:183-199` checks `PRO_MODE`
first and returns, so Pro mode wins and the `GROUPS` and `TOOLS` allowlist is
never consulted.

**Remote precedence, from the docs.** The remote advanced configuration page
says `groups` or `tools` overrides `pro=1`, tool selection takes priority over
Pro mode.

**One mechanism at a time.** Precedence differs by variant, so the safe pattern
on either one is to set a single mechanism and leave the other unset.

The three modes themselves:

1. Pro mode exposes everything, 74 tools in v2.11.1. Billed, and not covered by
   the free tier.
2. `GROUPS` or `TOOLS` set builds an allowlist. Only those names register.
3. Neither set is rapid mode, the free default. Local's five, read off
   `server.js`: `search_engine`, `scrape_as_markdown`, `search_engine_batch`,
   `scrape_batch`, `discover`. Remote's free five swap `discover` for
   `ask_brightdata_assistant`, which makes the assistant the first tool a free
   Remote user sees.

The allowlist gotcha, verified in `server.js`: once `GROUPS` or `TOOLS` is set,
the rapid defaults stop applying. Every group carries `search_engine`,
`scrape_as_markdown`, and `discover` with it, so a `GROUPS` value keeps those
three. A `TOOLS` value with no `GROUPS` does not, so `TOOLS="extract"` alone
gives the model exactly one tool.

Group ids: `ecommerce`, `social`, `browser`, `finance`, `business`, `research`,
`app_stores`, `travel`, `advanced_scraping`, `geo`, `code`. A twelfth id,
`custom`, is a placeholder in the source. `build_allowed_tools` does not filter
it out, so `GROUPS=custom` is accepted and resolves to the three base tools and
nothing else. Only the listing helper `get_all_group_ids` hides it. Use `TOOLS`
for bespoke picks.

## Local environment variables

| Variable | Default | Notes |
|---|---|---|
| `API_TOKEN` | none | Required. Server exits without it. |
| `PRO_MODE` | `false` | `true` exposes all tools. Billed. |
| `GROUPS` | none | Comma separated group ids. |
| `TOOLS` | none | Comma separated tool names, added on top of groups. |
| `WEB_UNLOCKER_ZONE` | `mcp_unlocker` | Point at your own zone to leave the free tier pool. |
| `BROWSER_ZONE` | `mcp_browser` | Scraping Browser zone. |
| `RATE_LIMIT` | unlimited | Format `100/1h` or `50/30m`. Bad format throws at startup. Unset means no limit in the code, though the local advanced configuration page claims a `100/1h` default. |
| `POLLING_TIMEOUT` | `600` | Seconds a `web_data_*` tool waits. One attempt per second. |
| `BASE_TIMEOUT` | no limit | Seconds. Covers search_engine, search_engine_batch, scrape_as_markdown, scrape_batch, list_dataset_fields and search_dataset. Not scrape_as_html, extract, discover or web_data_*. |
| `BASE_MAX_RETRIES` | `0` | Capped at 3. Retries only non 4xx failures. |

## Remote equivalents

The remote advanced configuration page documents these query parameters. `pro`
defaults to `0`. `groups=<ids>` and `tools=<names>` take the same values as the
Local env vars. `unlocker=<zone>` defaults to `mcp_unlocker` and is the Remote
stand-in for `WEB_UNLOCKER_ZONE`. `browser=<zone>` defaults to `mcp_browser`
and is the Remote stand-in for `BROWSER_ZONE`.

Unverified, confirmed on no Remote docs page: equivalents of `RATE_LIMIT`,
`POLLING_TIMEOUT`, `BASE_TIMEOUT`, and `BASE_MAX_RETRIES`, and whether Remote
auto-creates zones the way Local does.
