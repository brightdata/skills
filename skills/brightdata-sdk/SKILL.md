---
name: brightdata-sdk
description: Bright Data's Python and Node.js SDKs for calling Web Scraper API, SERP, Web Unlocker and Scraper Studio from application code. Use when the user is writing code they keep that calls Bright Data on a schedule or inside a pipeline, when the same job runs again and again, when a Bright Data package is imported in Python or Node.js, when the user wants their own API or service built on top of Bright Data ("build me a scraper API", "wrap this in an endpoint"), or when the user names the SDK. Not for one-off checks typed at a shell, which belong to brightdata-cli. Not for an AI app that chooses its tools at run time, which belongs to brightdata-mcp. Not for install, login or API key problems, which belong to agent-onboarding.
---

# Bright Data SDKs

Two published packages, one skill. The request is the same in both languages, so follow the language the repo already uses.

| Language | Package | Registry | Verified version | Install |
|---|---|---|---|---|
| Python | `brightdata-sdk` | PyPI | 2.5.2, released 2026-08-12 | `pip install brightdata-sdk` |
| Node.js | `@brightdata/sdk` | npm | 1.2.0, published 2026-08-02 | `npm install @brightdata/sdk` |

## Which reference to open

- A `pyproject.toml`, a `requirements.txt` or `.py` files are in the project: open `references/python.md`.
- A `package.json` or `.js`, `.mjs` and `.ts` files are in the project: open `references/nodejs.md`.
- Both languages are present and neither clearly owns the job: ask which runtime will run it, then open that one file.

## When the SDK is the right surface

The user keeps the code. A cron job, a backend service, an ETL step, an enrichment pipeline: anything where the same call runs again and again from a file under version control. Reach for the SDK the moment a Bright Data call is going to live in a repo rather than in a terminal.

Two neighbours own the other cases. A one-off check typed at a shell is `brightdata-cli`. An AI app that picks its tools at run time is `brightdata-mcp`.

## Auth

Install, login and API key problems belong to `agent-onboarding`, which owns credential paths and what a refused call means. See its `references/auth.md`.

The one fact this skill needs: both SDKs read `BRIGHTDATA_API_TOKEN` first, accept `BRIGHTDATA_API_KEY` as an alternate, and fall back to the credentials the Bright Data CLI stored at login. Never write a key into source. Both reference files show the key coming from the environment.

## What both packages cover

Page fetch, SERP search, per-platform scrapers, a crawler, dataset access, Browser API connect strings, and a Scraper Studio namespace. The shape differs by language: Python is async first and uses snake_case, Node.js uses camelCase and has to be closed, either with `close()` by hand or with `await using` on modern runtimes. Read the reference file rather than translating method names by hand.

## Scraper Studio is not verified live

Both packages ship a Scraper Studio namespace and both READMEs claim it runs custom collectors. No live run was made against a real collector, so this stays unconfirmed. Treat it as "per README, not verified live" and say so to the user before building on it. Each reference file carries the exact quote and the exact method signature.
