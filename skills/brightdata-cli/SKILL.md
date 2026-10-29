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

Package `@brightdata/cli`.

## Before the first command

Install and login belong to `agent-onboarding`. One free call proves the account works:

```
bdata zones --json
```

## When a command says a zone is not found

The CLI uses zone names from its config, and it never checks them against the account. A `zone "<name>" not found` error means the config names a zone this account does not have: a leftover `default_zone_serp`, or an account made by agent registration, whose zones carry other names. The check and the fix are in [references/commands.md](references/commands.md#zone-resolution-and-the-stale-serp-zone).

## Pick the command

| Want | Start with |
|---|---|
| A page as markdown, HTML, screenshot or JSON | `bdata scrape <url>` |
| Search results from Google, Bing or Yandex | `bdata search "<query>"` |
| Records from a site a pre-built scraper covers (Amazon, LinkedIn, TikTok, ...) | `bdata pipelines search "<site>"`, then `info`, then `run` |
| Results ranked against a stated intent | `bdata discover "<query>"` |
| A scraper for a site no pre-built scraper covers | `bdata scraper create`, then `run` |
| To click through a page step by step | `bdata browser open <url>` |
| Balance and spend | `bdata budget` |
| Skills or MCP wired into this repo | `npx -y skills add brightdata/skills -y`; for MCP, `bdata add mcp --agent <agent>` with `--project` or `--global` (limits in [references/commands.md](references/commands.md#wire-up-a-repo)) |

Flags are in `bdata <command> --help`. What the help text leaves out (the key order, pipelines, zones, output) is in [references/commands.md](references/commands.md).

## Rules

- Pass `--json --pretty` whenever the output gets parsed. For billing use bare `bdata budget --json`; in CLI 0.4.1 `budget balance`, `budget zones` and `budget zone` ignore both flags and print text. `-o <path>` writes a file: for structured results the extension (`.json`, `.md`, `.html`, `.csv`) picks the format, while `scrape` keeps the format `-f` chose, so `-o page.html` needs `-f html`.
- Never print the API key. The CLI owns the file it sits in.
- There is no schedule command. Recurring runs are set up in the control panel.
