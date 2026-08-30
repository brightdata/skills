---
name: brightdata-cli
description: Runs Bright Data jobs from a terminal with the bdata CLI, the published npm package @brightdata/cli. Use when the agent itself needs to run a Bright Data job from a shell right now, when it is building or testing a scraper, when a quick one-off check of a page, a search, a zone or a bill is enough, or when the user names bdata, brightdata, or the Bright Data CLI. Not for deterministic code that repeats the same job on a schedule, which belongs to brightdata-sdk. Not for an AI app that picks its tools at run time, which belongs to brightdata-mcp. Not for a first-time install or a login that will not go through, which belongs to agent-onboarding.
---

# Bright Data CLI

`bdata` runs a Bright Data job straight from a shell. Reach for it when the agent does the work itself, right now.

## Is this the right skill

| The job | Skill |
|---|---|
| Setup, building or testing a scraper, a quick one-off check, run it now from a shell | this skill |
| The same job repeated on a schedule, inside app code | `brightdata-sdk` |
| An AI app that chooses its own tool at run time | `brightdata-mcp` |
| First-time setup only: nothing installed yet, or login will not go through | `agent-onboarding` |

Project setup the agent does for itself stays here. Only the first-time install and a login that will not go through bounce to `agent-onboarding`.

Package `@brightdata/cli`, verified at v0.3.5.

## Before the first command

Install and login belong to `agent-onboarding`. One free call proves the account works:

```
bdata zones --json
```

## Check the config before the first search

A fresh v0.3.5 install carries no `default_zone_serp`, so `bdata search` falls through to the unlocker zone and works. A `default_zone_serp` already set to a zone the account does not have blocks that fall-through, and every search then returns `zone "<name>" not found` with `Status: 400`, no hint and no self-heal. Recover by picking a real zone from `bdata zones` and passing `--zone <name>`, or by `bdata config set default_zone_serp <name>`.

Detection and the repair are in [references/commands.md](references/commands.md#zone-resolution-and-the-stale-serp-zone).

## Pick the command

| Want | Start with |
|---|---|
| A page as markdown, HTML, screenshot or JSON | `bdata scrape <url>` |
| Search results from Google, Bing or Yandex | `bdata search "<query>"` |
| Records from a supported site (Amazon, LinkedIn, TikTok, ...) | `bdata pipelines <type> [params...]` |
| Results ranked against a stated intent | `bdata discover "<query>"` |
| A scraper for a site no pipeline covers | `bdata scraper create`, then `run` |
| To click through a page step by step | `bdata browser open <url>` |
| Balance and spend | `bdata budget balance` |
| Skills or MCP wired into this repo | `bdata skill add <name>`, `bdata add mcp` |

Every subcommand, its flags, and the credential order live in [references/commands.md](references/commands.md).

## Rules

- Pass `--json --pretty` whenever the output gets parsed. `-o <path>` writes a file and the extension picks the format.
- Never print the API key. The CLI owns the file it sits in.
- There is no schedule command. Recurring runs are set up in the control panel.
