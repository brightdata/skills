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
| Tool config | URL query params `groups=` and `tools=` | env vars `GROUPS` and `TOOLS` |
| Default tool list | every tool on, 31 of them; `groups=` or `tools=` narrows it | every tool on, 32 of them; `GROUPS` or `TOOLS` narrows it |

The published package is `@brightdata/mcp`. Remote tracks its
own release line. Do not assume a tool name present in one is present in the
other, and do not carry a working config across. Confirm against the variant
actually in use.

## The key

Both `?token=` and `API_TOKEN` take the account API key. Find it the way the
CLI does: `BRIGHTDATA_API_KEY` if set, else `api_key` in the `credentials.json`
that `bdata login` writes (Linux `~/.config/brightdata-cli/`, macOS
`~/Library/Application Support/brightdata-cli/`, Windows
`%USERPROFILE%\AppData\Roaming\brightdata-cli\`). After login the variable is normally empty and
the key is only in the file: that is a logged-in machine, not a missing key,
so read it in code and never print it. To check that it exists, run
`node scripts/check-auth.mjs` from the `agent-onboarding` skill (it never
prints the key); never `cat`, `echo` or `jq` the file or the variable. To
pass it into a config or URL, read it inside the program or command that writes
the config, and keep it out of anything that prints (the shell-specific reads
are in that skill's `references/auth.md`). Neither exists: hand off to
`agent-onboarding`. Never ask the user to paste a key into chat.

## The routing default

Records from a site the agent can name go to a pre-built scraper:
`search_scrapers` to find it, `get_scraper_details` to see its inputs, then
`run_scraper`. Page content goes to `scrape_as_markdown`. Raw unlocked HTML through `scrape_as_html`
is the last resort, not the opening move. This is the misroute that burns the
most tokens and returns the worst data, so read the rule before writing prompts
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
