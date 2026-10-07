<p align="center">
  <img src="https://brightdata.com/wp-content/themes/brightdata/assets/images/favicon.png" alt="Bright Data" width="80" height="80">
</p>

<h1 align="center">Bright Data Skills</h1>

<p align="center">
  <strong>Teach any coding agent to get web data: scrape, fetch, search, browse, and watch the bill</strong>
</p>

<p align="center">
  <a href="https://brightdata.com"><img src="https://img.shields.io/badge/Powered%20by-Bright%20Data-3D7FFC?style=for-the-badge" alt="Powered by Bright Data"></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge" alt="MIT License"></a>
  <a href="#the-skills"><img src="https://img.shields.io/badge/Skills-10-9D97F4?style=for-the-badge" alt="10 Skills"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#the-skills">Skills</a> •
  <a href="#agent-onboarding">Agent Onboarding</a> •
  <a href="#scrape">Scrape</a> •
  <a href="#datasets">Datasets</a> •
  <a href="#fetch">Fetch</a> •
  <a href="#search">Search</a> •
  <a href="#browser">Browser</a> •
  <a href="#billing">Billing</a> •
  <a href="#the-interface-guides">CLI, MCP, SDK</a>
</p>

---

## Overview

A skill is a folder with a SKILL.md plus reference files and scripts. Any agent that reads SKILL.md files can use these: Claude Code, Codex, Cursor, and others. Nothing here is tied to one agent.

With the skills installed, an agent can:

- **Scrape any site for structured data** with ready scrapers, or build a new scraper in Scraper Studio when none fits
- **Buy a ready dataset** when the data is already collected, instead of scraping it
- **Fetch any blocked page** through Web Unlocker as markdown, HTML, or a screenshot
- **Search Google and other engines** and get structured JSON, including the AI answer engines
- **Drive a cloud browser** with the user's own Playwright, Puppeteer, or Selenium code
- **Check balance and costs** before and after every job
- **Pick the right surface** for the task: CLI for the terminal, MCP for agents that decide at run time, SDK for code the user keeps

## Quick Start

Install the CLI, then add the skills to your project:

```
npm install -g @brightdata/cli
bdata skill add agent-onboarding
bdata skill add scrape
bdata skill add datasets
bdata skill add fetch
bdata skill add search
bdata skill add browser
bdata skill add billing
bdata skill add brightdata-cli
bdata skill add brightdata-mcp
bdata skill add brightdata-sdk
```

Add each skill you want by name. A name the CLI does not know yet fails with "Unknown skill" and the rest still install, because the CLI's list catches up to this repo one release behind.

Prefer no CLI? Clone this repo and copy the folders you want from `skills/` into your agent's skills directory.

Then log in once. The browser opens, the user approves, and the key never touches the chat:

```
bdata login
```

## The Skills

| Skill | What it does |
|-------|-------------|
| [`agent-onboarding`](skills/agent-onboarding/SKILL.md) | Start here. Installs the CLI and the skills, logs in once, and routes every ask to the right skill |
| [`scrape`](skills/scrape/SKILL.md) | Structured data from any site: ready scrapers, Scraper Studio, and free discovery scripts |
| [`datasets`](skills/datasets/SKILL.md) | Buy a ready dataset from the Dataset Marketplace instead of scraping it |
| [`fetch`](skills/fetch/SKILL.md) | One URL in, unblocked page out: markdown, HTML, or a screenshot |
| [`search`](skills/search/SKILL.md) | Anything that starts from a query: SERP API, Google verticals, the top-100 job, answer engines |
| [`browser`](skills/browser/SKILL.md) | Point Playwright, Puppeteer, or Selenium code at the cloud browser |
| [`billing`](skills/billing/SKILL.md) | Balance, charges, and what a job will cost |
| [`brightdata-cli`](skills/brightdata-cli/SKILL.md) | The bdata command line |
| [`brightdata-mcp`](skills/brightdata-mcp/SKILL.md) | The MCP server, for agents that decide at run time |
| [`brightdata-sdk`](skills/brightdata-sdk/SKILL.md) | The Python and Node.js SDKs, for code the user keeps |

## Agent Onboarding

The entry point. It installs everything, handles the one-time login without ever pasting a key into chat, registers an account by email when the user has none, fixes the common Windows and PATH problems, and routes the task to the right skill. The other nine assume it ran once.

## Scrape

Structured data from any site. The skill checks what already exists before spending anything: a bundled top-25 table costs zero calls, and one free call searches the whole live catalogue. When a ready scraper fits, it runs it. When none fits, Scraper Studio builds one from a plain-language prompt, heals it when the site changes, and runs single URLs synchronously or whole URL lists as one batch.

## Datasets

Not scraping. When the data is already collected and sold as a download, a huge generic corpus, needed once, where a few months old is fine, the agent checks coverage with free calls and hands the purchase to a person in the control panel.

## Fetch

One URL in, unblocked page out through Web Unlocker: markdown for reading, HTML for parsing, or a screenshot. The command is `bdata fetch` (`bdata scrape` on CLI 0.3.5 and older).

## Search

Anything that starts from a query. SERP API for structured results, the Google verticals (Maps, Shopping, News, and more), the top-100 job for deep rank tracking in one request, and the AI answer engines (ChatGPT, Perplexity, Gemini, Copilot, Google AI Mode) with their verified dataset ids.

## Browser

For the user's own browser automation code. The skill hands Playwright, Puppeteer, or Selenium the right connect string for the cloud browser, which does the unblocking, and explains the errors that only show up in cloud sessions.

## Billing

Balance, charges by product and by zone, and what a job will cost before it runs. REST first, verified against the live cost APIs.

## The Interface Guides

Three thin skills answer "which door do I use": [`brightdata-cli`](skills/brightdata-cli/SKILL.md) for one-off checks typed at a shell, [`brightdata-mcp`](skills/brightdata-mcp/SKILL.md) for AI apps that pick tools at run time, and [`brightdata-sdk`](skills/brightdata-sdk/SKILL.md) for code the user keeps and schedules.

## License

MIT
