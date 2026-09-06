---
name: brightdata-mcp
description: Bright Data's MCP server, the tool layer that gives an LLM agent live web access with no shell. Use when wiring Bright Data tools into an AI app or agent framework that picks its tools at run time, when connecting Claude, Cursor, or another MCP client to Bright Data, when choosing which MCP tools or groups to turn on, or when the user says MCP. Covers the Remote server hosted at mcp.brightdata.com and the Local self-hosted @brightdata/mcp package, and which tool each job should route to. Not for the agent doing the job itself from a shell, which is brightdata-cli. Not for fixed repeated code in an app, which is brightdata-sdk. Not for install or auth problems, which is agent-onboarding.
---

# Bright Data MCP

MCP is the interface for an AI app that decides at run time what to fetch. The
model reads a list of Bright Data tools and picks one per turn. There is no
shell to run and no code path to edit between turns, so the tool list you expose
and the routing rules you write are the entire product surface.

If a human or a coding agent is going to run the work from a terminal, that is
`brightdata-cli`. If the same job runs on a schedule from your own code, that is
`brightdata-sdk`. MCP is for run-time choice.

## Two variants that have drifted

Bright Data ships two, and the vendor calls them Remote (the hosted service at
`mcp.brightdata.com`) and Local (the self-hosted `@brightdata/mcp` package).

| | Remote | Local |
|---|---|---|
| Endpoint | `https://mcp.brightdata.com/mcp` (Streamable HTTP) or `/sse` | `npx @brightdata/mcp` over stdio |
| Auth | `?token=` on the URL for a client you control, or OAuth 2.1 (Bearer header, browser sign-in) when someone else runs the client | `API_TOKEN` env var |
| Tool config | URL query params such as `pro=1` and `groups=` | env vars `PRO_MODE`, `GROUPS`, `TOOLS` |
| Filter precedence | `groups=` or `tools=` overrides `pro=1` | `PRO_MODE` wins, the allowlist is skipped |

The published package is `@brightdata/mcp`. Remote tracks its
own release line. Do not assume a tool name present in one is present in the
other, and do not carry a working config across. Confirm against the variant
actually in use.

## The routing default

Records from a platform the agent can name go to a `web_data_*` scraper. Page
content goes to `scrape_as_markdown`. Raw unlocked HTML through `scrape_as_html`
is the last resort, not the opening move. This is the misroute that costs the
most credits and returns the worst data, so read the rule before writing prompts
or tool descriptions.

## References

- **references/setup.md** - open when connecting a client for the first time,
  when the agent sees the wrong number of tools, or when deciding between Remote
  and Local. Covers both installs, auth, zones, and the `GROUPS` and `TOOLS`
  filters.
- **references/choosing-tools.md** - open before writing the system prompt or
  tool guidance for an agent, or when an agent is scraping raw HTML for data a
  ready scraper already returns. Covers the full tool inventory and the routing
  table.
