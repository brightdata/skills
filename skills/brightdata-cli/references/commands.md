# The bdata command surface

Answers the question "which command does this job, and what does `--help` not tell me".

`bdata --help` and `bdata <command> --help` are the source of truth for flags and are always current. This file holds what the help text leaves out.

## Contents

- [Commands at a glance](#commands-at-a-glance)
- [Where the key comes from](#where-the-key-comes-from)
- [Structured records: pipelines](#structured-records-pipelines)
- [Zone resolution and the stale SERP zone](#zone-resolution-and-the-stale-serp-zone)
- [A key from agent registration](#a-key-from-agent-registration)
- [Output](#output)
- [Build and fix a scraper](#build-and-fix-a-scraper)
- [Drive a browser](#drive-a-browser)
- [Wire up a repo](#wire-up-a-repo)
- [Not in the CLI](#not-in-the-cli)

## Commands at a glance

Two binaries, one tool: `bdata` and `brightdata`.

| Job | Command |
|---|---|
| Sign in, sign out | `login` (`--device` on a machine with no browser), `logout` |
| The one free account check | `zones --json` |
| One page as markdown, HTML, screenshot or JSON | `scrape <url>` |
| Search results from Google, Bing or Yandex | `search "<query>"` |
| Results ranked against a stated intent | `discover "<query>"` |
| Records from a site a pre-built scraper covers | `pipelines search`, `pipelines info`, `pipelines run` |
| A scraper for a site no pre-built scraper covers | `scraper create`, then `scraper run` |
| Click through a page step by step | `browser open <url>`, then `browser snapshot` |
| Balance and spend | `budget` |
| Local settings | `config get <key>`, `config set <key> <value>` |
| Register the Bright Data MCP server in an agent | `add mcp` |

## Where the key comes from

Highest first: the `--api-key` flag, then `BRIGHTDATA_API_KEY`, then `credentials.json` in the CLI's config directory. The paths per OS and what each refused call means are in the agent-onboarding skill's references/auth.md. Never print the key.

Running `login` again on a machine that already works replaces the stored key, so run `bdata zones --json` first and skip the login when it succeeds.

## Structured records: pipelines

Look a scraper up every time. Never guess a `dataset_id`, a method or a field name.

```
bdata pipelines search "amazon reviews"
bdata pipelines info <dataset_id> <method>
bdata pipelines run <dataset_id> <method> "<url>"
```

`info` without a method lists the methods. `run` takes URLs, one `--<field> <value>` flag per input field that `info` names, or `--input` with JSON. `discover_by_*` methods return up to `--limit-per-input` records per input (default 10), and every record is billed.

`run` waits for the result. With `--async` it prints a snapshot ID instead: check it with `bdata pipelines status <snapshot_id>` (`--wait` polls until done) and read it with `bdata pipelines results <snapshot_id>`. Waiting defaults to 600 seconds, or `BRIGHTDATA_POLLING_TIMEOUT`.

`discover` is an AI web search. It is unrelated to the `discover_by_*` methods of the scrapers.

## Zone resolution and the stale SERP zone

`scrape` uses `--zone`, then `BRIGHTDATA_UNLOCKER_ZONE`, then `default_zone_unlocker`.

`search` uses `--zone`, then `BRIGHTDATA_SERP_ZONE`, then `default_zone_serp`, and only when all three are empty falls back to the unlocker zone the way `scrape` finds it. `login` sets `default_zone_unlocker` to `cli_unlocker` when it is unset and never sets `default_zone_serp`, so on a fresh machine `search` runs on the unlocker zone.

What breaks it is a `default_zone_serp` that names a zone the account does not have. The CLI never checks a configured zone against the account, so every `search` then fails with `zone "<name>" not found`. Detect it by comparing the configured name with the account's zones:

```
bdata config get default_zone_serp
bdata zones --json
```

Read the text, not the exit code: `config get` on an unset key exits 1, and unset is the healthy state here. A name `zones` does not list is the bug. Point the key at a real unlocker zone from that output:

```
bdata config set default_zone_serp <unlocker-zone-name>
```

## A key from agent registration

An account created through agent registration has its own zones (`agent_unlocker`, `agent_serp`, `agent_browser_api`), and its key cannot create zones. The CLI's zone defaults use `cli_` names (`bdata login` sets `default_zone_unlocker` to `cli_unlocker`), which that account does not have, so `scrape` and `search` fail until the defaults point at the account's own zones:

```
bdata config set default_zone_unlocker agent_unlocker
bdata config set default_zone_serp agent_serp
```

`bdata browser` takes `--zone agent_browser_api` for the same reason.

To pass that key to the CLI without putting it on a shell line, follow the agent-onboarding skill's references/auth.md, section "A key from registration".

## Output

Pass `--json --pretty` whenever something parses the output. In CLI 0.4.1 `budget balance`, `budget zones` and `budget zone` print text even with these flags (only bare `bdata budget --json` returns JSON), and `budget` has no `-o`. `-o <path>` writes a file; for structured results it picks the format from the extension (`.json`, `.md`, `.html` or `.csv`), while `scrape` writes the page in the format `-f` chose, so `-o page.html` without `-f html` saves markdown.

`scrape -f json` returns the response with its metadata (status, headers) and the page body, not parsed fields. For parsed fields, use `pipelines`.

`scrape --async` prints a Web Unlocker response ID. No `bdata` command reads that result, so use `scrape` without `--async`.

## Build and fix a scraper

For a site no pre-built scraper covers. Scraper Studio writes the scraper from a plain-language description, runs it, and repairs it when the page changes: `scraper create <url> "<description>"`, `scraper run <collector_id> <url>`, `scraper heal <collector_id> "<what broke>"`, `scraper approve <collector_id>`. `create` can take several minutes. Flags are in `bdata scraper <command> --help`.

## Drive a browser

A stateful session on Bright Data's cloud browser, one command at a time. `open <url>`, then `snapshot` to get element refs, then act on a ref with `click`, `type`, `fill`, `select` and the rest; `close` ends the session. Session options (`--session`, `--zone`, default `cli_browser`, `--country`) go on the `browser` command. A full snapshot is large, so pass `--interactive` or `--compact`. Every subcommand is in `bdata browser --help`.

```
bdata browser open https://example.com --session shop
bdata browser snapshot --session shop --interactive
```

## Wire up a repo

Install the Bright Data skills into any coding agent with `npx -y skills add brightdata/skills -y`, or one skill with `--skill <name>`. `bdata skill add` installs only the names built into the CLI release, so it can lag behind this repo.

`bdata add mcp --agent <claude-code,cursor,codex>` with `--global` or `--project` writes a `bright-data` server entry, with the API key in plain text, into that agent's config. Without a TTY, pass `--agent`, plus `--global` or `--project` for Claude Code or Cursor.

In CLI 0.4.1 only Claude Code `--global` (`~/.claude.json`) and Cursor `--global` or `--project` (`~/.cursor/mcp.json`, `.cursor/mcp.json`) land where the agent reads them. Claude Code `--project` writes `.claude/settings.json`, which Claude Code does not read for servers (it reads `.mcp.json`; the `brightdata-mcp` skill's references/setup.md has that block). Codex always gets `~/.codex/mcp.json` (`--agent codex --project` exits with an error, and in a list with another agent Codex still gets that global file), while Codex reads `[mcp_servers.<name>]` tables in `~/.codex/config.toml`, or `.codex/config.toml` in a trusted project. For Codex, show the user this table and let them add it with their key:

```toml
[mcp_servers.bright-data]
command = "npx"
args = ["@brightdata/mcp"]

[mcp_servers.bright-data.env]
API_TOKEN = "<YOUR_API_KEY>"
```

Show the user what it will change before running it.

## Not in the CLI

There is no schedule command. Recurring runs are set up in the Bright Data control panel, or by the host's own scheduler calling `bdata` on a timer.
