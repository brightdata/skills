# Bright Data Skills

Skills that teach a coding agent how to get web data with Bright Data: scrape structured data, fetch blocked pages, search, drive a cloud browser, and watch the bill.

A skill is a folder with a SKILL.md plus reference files and scripts. Any agent that reads SKILL.md files can use them: Claude Code, Codex, Cursor, and others. Nothing here is tied to one agent.

## The skills

| Skill | What it does |
|---|---|
| [agent-onboarding](skills/agent-onboarding/SKILL.md) | Start here. Installs the CLI and the skills, logs in once, and routes every ask to the right skill. |
| [scrape](skills/scrape/SKILL.md) | Structured data from any site: ready scrapers (Web Scraper API), building one (Scraper Studio), and when to buy a dataset instead. Ships free-discovery scripts. |
| [fetch](skills/fetch/SKILL.md) | One URL in, unblocked page out (Web Unlocker): markdown, HTML, or a screenshot. |
| [search](skills/search/SKILL.md) | Anything that starts from a query: SERP API, Google verticals, the top-100 job, and answer engines. |
| [browser](skills/browser/SKILL.md) | Point your own Playwright, Puppeteer, or Selenium code at the cloud browser. |
| [billing](skills/billing/SKILL.md) | Balance, charges, and what a job will cost. |
| [brightdata-cli](skills/brightdata-cli/SKILL.md) | The bdata command line. |
| [brightdata-mcp](skills/brightdata-mcp/SKILL.md) | The MCP server, for agents that decide at run time. |
| [brightdata-sdk](skills/brightdata-sdk/SKILL.md) | The SDK, for code the user keeps. |

## Install

Two ways, pick one.

**With the Bright Data CLI** (installs into the current project for every agent it knows):

```
npm install -g @brightdata/cli
bdata skill add scrape
```

Add each skill you want by name. A name the CLI does not know yet fails with "Unknown skill" and the rest still install - the CLI's list catches up to this repo one release behind.

**By hand**: clone this repo and copy the folders you want from `skills/` into your agent's skills directory.

## Start with agent-onboarding

`agent-onboarding` is the entry point. It installs, logs in (one browser approval, no key ever pasted into chat), and routes to the task skill. The other eight assume it ran once.

MIT license.
