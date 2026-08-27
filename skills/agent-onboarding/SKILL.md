---
name: agent-onboarding
description: The entry point to all Bright Data skills - start here, and it guides the agent to the right skill for the task at hand - web data and scraping, fetching or unblocking a page, search, browser automation, and the CLI, SDK and MCP surfaces. Use when Bright Data is not set up or stops authenticating - the CLI is missing ("bdata is not recognized"), login is needed or fails ("No API key found"), a call is refused with 401, 407 or another auth error, an expected zone like cli_unlocker is missing, a key must be set in a project's .env, CI, or a container (BRIGHTDATA_API_KEY), or the user asks to install Bright Data, log in, get started, or which skill fits their task. Auth for every other Bright Data skill lives here.
---

# Bright Data - Start Here

Install the CLI and the skills, log in once, then route to the task skill.

**Never ask the user to paste an API key into chat.** Login is one browser approval. The key never touches the conversation.

## Already set up?

Three free checks before doing any work:

1. `bdata --version` works: skip to Add the skills.
2. `bdata zones --json` shows `cli_unlocker` and `cli_browser`: logged in, skip straight to the route table.
3. The skill folders already exist in the project: the skills are installed, so skip Add the skills entirely rather than running the installs again.

Only the first check passes: go to Log in. On Windows, "bdata is not recognized" can also mean installed but not on PATH - apply the PATH fix in Install before reinstalling.

## Install

| OS | Command |
|---|---|
| Windows | `npm install -g @brightdata/cli` |
| macOS and Linux | `npm install -g @brightdata/cli`, or `curl -fsSL https://cli.brightdata.com/install.sh \| bash` |

The curl script is for interactive machines only: it runs `bdata login` by itself at the end, so on a headless machine it exits 1 after installing, and on a logged-in machine it replaces the saved key. In CI and containers use npm or npx.

The npm command needs Node.js. Windows notes: if `npm` is missing, install Node.js LTS first (nodejs.org or `winget install OpenJS.NodeJS.LTS`), then retry. If `bdata` is still not recognized after install, npm's global directory is not on PATH. Fix it for this session and tell the user to add it permanently. In PowerShell:

```
$env:PATH += ";$(npm config get prefix)"
```

cmd rejects that line. The cmd version:

```
for /f "delims=" %p in ('npm config get prefix') do set PATH=%PATH%;%p
```

Both lines die with the session. To make it permanent, the user adds npm's prefix directory, the path `npm config get prefix` prints, to their user PATH through the Windows environment variable settings (Start, "Edit the system environment variables", then Environment Variables). Do not reach for `setx` here. It truncates PATH at 1024 characters, so on a machine with a long PATH it destroys the value it was meant to extend.

If `npm install -g` is blocked on the machine, skip installing: `npx -y @brightdata/cli <command>` runs the same CLI on demand, use it wherever a command says `bdata`.

## Add the skills

These are the skills the agent will route to. Run each line (semicolon chaining breaks in cmd, separate lines work in every shell):

```
bdata skill add scrape
bdata skill add datasets
bdata skill add fetch
bdata skill add search
bdata skill add browser
bdata skill add brightdata-cli
bdata skill add brightdata-mcp
bdata skill add brightdata-sdk
bdata skill add billing
```

Always pass the skill name - a bare `bdata skill add` needs a person. Run it from the project root, because it installs into the current directory's agent folders. A name the registry does not carry yet fails with "Unknown skill" and prints the list it does carry: skip that name and continue, the rest still install.

## Log in

```
bdata login
```

The browser opens on the user's machine, they approve once, and the CLI writes the key by itself. Nothing to paste anywhere.

On SSH, in containers, or on any machine without a browser, use `bdata login --device` instead. It prints a pairing code and a URL (to stderr), show both to the user, they approve from any device, and the command waits and then writes the key. The code expires after about 15 minutes. Bare `bdata login` cannot work there: it waits about two minutes for a browser callback that cannot arrive, then exits 1 with `Timed out waiting for callback`, and its printed fallback URL only works on the machine running the command.

**Never run login on a machine that already passes the zones check.** With an active browser session, login completes by itself and silently replaces the saved API key, which breaks anything still using the old key. The curl install script counts too - it runs login by itself.

Do not use `bdata login --github` in scripts or unattended runs. It shells out to `gh`, and on any failure it drops into an interactive prompt. With no terminal attached (CI, scripts), that prompt never returns.

To confirm login actually worked, run `node scripts/check-auth.mjs --json` ([scripts/check-auth.mjs](scripts/check-auth.mjs) - the same zones check, packaged for scripts). One free call, and it exits nonzero on any failure.

## Route to the task skill

Users ask for data, not for tools. When two rows both fit, prefer `scrape`: ready scrapers and Scraper Studio cover most real jobs end to end.

| The user wants | Skill |
|---|---|
| To scrape a site, or data or information from it (LinkedIn, Amazon, ...) | `scrape` |
| A page as markdown, HTML, or a screenshot | `fetch` |
| Anything starting from a search query | `search` |
| To point their own browser code at our cloud browser - Playwright, Puppeteer, Selenium, or an AI that clicks by itself | `browser` |
| A big already-collected corpus, needed once, where months old is fine ("every US company") | `datasets` |
| Setup, building or testing scrapers, quick one-off checks | `brightdata-cli` |
| Their AI app to decide at run time | `brightdata-mcp` |
| Code that repeats the same job on a schedule | `brightdata-sdk` |
| To build their own API or service on top of Bright Data ("build me a scraper API") | `brightdata-sdk` |
| Balance, charges, credits used, or what a job will cost | `billing` |

Torn between CLI, SDK, MCP, or plain REST for the same task: read [references/interfaces.md](references/interfaces.md).

## No-install path (CI, containers, restricted machines)

The npx fallback above gives the full CLI with nothing installed. Otherwise set `BRIGHTDATA_API_KEY` from the account settings page and call the REST API directly. Write the key into the environment or a secrets store without printing it. Read [references/auth.md](references/auth.md) for the endpoints and the credential order.

## When a call is refused

`Error: No API key found` means this machine is not logged in: log in (see Log in above), or set `BRIGHTDATA_API_KEY`. A 401 means the key is invalid or revoked: log in again. Nearly every use case (Scraper API, Scraper Studio, SERP, Unlocker, Browser API) needs no KYC. If a call ever comes back with a KYC error, [references/auth.md](references/auth.md) says what to do.

Read [references/auth.md](references/auth.md) before handling any refused call - it has the full error table and the narrow Web Unlocker exceptions.
