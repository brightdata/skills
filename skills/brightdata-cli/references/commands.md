# The bdata command surface

Answers the question "which command and which flag does this job, and where does the CLI get the key from".

## Contents

- [The shape of every command](#the-shape-of-every-command)
- [Where the key comes from](#where-the-key-comes-from)
- [Sign in and check the account](#sign-in-and-check-the-account)
- [Get data](#get-data)
- [Zone resolution and the stale SERP zone](#zone-resolution-and-the-stale-serp-zone)
- [Build and fix a scraper](#build-and-fix-a-scraper)
- [Drive a browser](#drive-a-browser)
- [Wire up a repo](#wire-up-a-repo)
- [Not in the CLI](#not-in-the-cli)

## The shape of every command

Two binaries, one tool: `bdata` and `brightdata`. The CLI's own messages and examples say `brightdata`, with one exception: the next-step lines that `scraper create` and `scraper heal` print are spelled `bdata`.

Global options, valid before any subcommand:

| Option | Does |
|---|---|
| `-v, --version` | Print the version and exit |
| `-k, --api-key <key>` | Use this key, overriding env and stored credentials |
| `--timing` | Print request timing |
| `-h, --help` | Help for the command or subcommand it follows |

Most data commands also take `-o, --output <path>`, `--json`, and `--pretty`. `-o` picks the format from the file extension. Use `--json --pretty` whenever something downstream parses the output.

Full command list: `login`, `logout`, `scrape`, `search`, `pipelines`, `status`, `zones`, `config`, `init`, `version`, `skill`, `budget`, `browser`, `discover`, `scraper`, `add`, `help`.

Every table below is mapped from `--help` on the matching subcommand of `@brightdata/cli`.

## Where the key comes from

Resolution order, highest first: the `--api-key` flag, then the `BRIGHTDATA_API_KEY` environment variable, then `credentials.json` in the CLI's own config directory.

That directory is hardcoded per platform and `XDG_CONFIG_HOME` is ignored. For the exact paths, the file shape, and what each refused call means, read the agent-onboarding skill's references/auth.md. Never print the key.

## Sign in and check the account

| Command | Purpose | Key flags |
|---|---|---|
| `login` | Authenticate and store the key | `-d, --device` (headless and SSH safe), `-k, --api-key <key>`, `-c, --customer-id <id>`, `-g, --github` |
| `logout` | Delete the stored credentials | none |
| `init` | Interactive setup wizard for auth and zone defaults | `--skip-auth`, `-k, --api-key <key>` |
| `zones` | List active zones. The one free account check | `--json`, `--pretty`, `-o` |
| `zones info <name>` | Detail for a single zone | `--json`, `--pretty`, `-o` |
| `budget balance` | Account balance | `--json`, `--pretty` |
| `budget zones` | Cost and bandwidth across all active zones | `--from <date>`, `--to <date>` |
| `budget zone <name>` | Cost and bandwidth for one zone | `--from <date>`, `--to <date>` |
| `config` | Print the whole local config | `--json`, `--pretty`, `-o` |
| `config get <key>` | Read one value | none |
| `config set <key> <value>` | Write one value | none |
| `version` | Version detail | `--json`, `--pretty` |

Only four config keys exist: `default_zone_unlocker`, `default_zone_serp`, `default_format`, `api_url`. Anything else is rejected.

The full flow, the zones it creates, and the `--github` warning live in the agent-onboarding skill. Re-running `login` on a machine that is already authenticated silently replaces the stored key and breaks anything still using the old one, so run `bdata zones --json` first and skip the login if it succeeds.

## Get data

| Command | Purpose | Key flags |
|---|---|---|
| `scrape <url>` | One page through Web Unlocker | `-f, --format <markdown\|html\|screenshot\|json>`, `--country <code>`, `--zone <name>`, `--async` (`--mobile` is accepted but not yet sent with the request) |
| `search <query>` | SERP results | `--engine <google\|bing\|yandex>`, `--type <web\|news\|images\|shopping>`, `--country`, `--language`, `--page <n>`, `--device <desktop\|mobile>`, `--zone <name>` |
| `discover <query>` | Web results ranked by a stated intent | `--intent <text>`, `--num-results <n>`, `--filter-keywords <words>`, `--include-content`, `--country` (default `US`), `--city`, `--language` (default `en`), `--start-date`, `--end-date`, `--no-remove-duplicates`, `--timeout <s>` |
| `pipelines <type> [params...]` | Structured records from a supported site | `--format <json\|csv\|ndjson\|jsonl>`, `--timeout <s>` |
| `pipelines list` | Every pipeline type the CLI knows | prints a plain name list; the output flags apply to data runs, not to `list` |
| `status <job-id>` | Poll an async snapshot job | `--wait`, `--timeout <s>` |

`status` polls the async snapshot jobs that `pipelines` triggers (`/datasets/v3/progress`). `--async` on `scrape` returns a Web Unlocker response id from a different job system: fetch its result with `GET /unblocker/get_result?response_id=...`, not with `bdata status`. `pipelines` ships 43 built-in types covering Amazon, Walmart, eBay, LinkedIn, Instagram, Facebook, TikTok, X, YouTube, Reddit, Google Maps, Zillow, Booking and more. Read the live list rather than guessing a name.

`discover` is an AI web search. It is not the discovery-input mode of the record scrapers, which is a different thing with the same word attached.

`--type images` sends `tbm=isch`, `--type news` sends `tbm=nws`, and `--type shopping` sends `udm=28`.

Polling defaults to 600 seconds and honours `BRIGHTDATA_POLLING_TIMEOUT`.

```
bdata pipelines linkedin_person_profile https://www.linkedin.com/in/satyanadella --format csv -o profile.csv
```

## Zone resolution and the stale SERP zone

`scrape` resolves its zone as `--zone`, then `BRIGHTDATA_UNLOCKER_ZONE`, then `default_zone_unlocker`.

`search` resolves in five steps: `--zone`, then `BRIGHTDATA_SERP_ZONE`, then `default_zone_serp`, then `BRIGHTDATA_UNLOCKER_ZONE`, then `default_zone_unlocker`.

`login` never sets `default_zone_serp`: only `bdata init` (interactive or not, it writes zone defaults either way) and an explicit `config set` write it. The DEFAULTS object in `dist/utils/config.js` holds `default_format` and `api_url` and nothing else, no `config.json` ships inside the package, and `login` writes only `default_zone_unlocker`. On a fresh machine step three is empty, `search` falls through to the unlocker zone, and it works.

What breaks it is a `default_zone_serp` that is already set and names a zone the account does not have, a leftover from an earlier experiment or a hand-written value, `cli_serp` being the usual example. The CLI never validates a configured zone against the account, so that one truthy value both goes out on the wire and blocks the fall-through at step four. Every `search` then returns `zone "<name>" not found` with `Status: 400` (verified live), with no hint about the cause and no self-heal.

Detect it by reading the configured name and checking it against the account's own zone list. Read the printed text, not the exit code: `config get` on an unset key prints `is not set` and exits 1, and unset is the healthy state here.

```
bdata config get default_zone_serp
bdata zones --json
```

A name that `zones` does not list is the bug. Repair it by pointing the key at a real unlocker zone picked from that same output, usually `cli_unlocker`:

```
bdata config set default_zone_serp cli_unlocker
```

An unlocker zone serves SERP traffic.

## Build and fix a scraper

For a site no pipeline covers. Studio writes the scraper, runs it, and repairs it when the page changes.

| Command | Purpose | Key flags |
|---|---|---|
| `scraper create <url> <description>` | Build a scraper from a plain-language description | `--name <name>`, `--deliver-webhook <url>`, `--timeout <s>`, `--max-retries <n>`, `--no-retry` |
| `scraper run <collector_id> [url]` | Run it and return the data | `--urls <list>`, `--input-file <path>`, `--sync`, `--sync-timeout <25-50>`, `--timeout <s>`, `--name <name>`, `--version <version>` |
| `scraper heal <collector_id> <prompt>` | Repair a broken scraper via AI | `--url <url>`, `--auto-approve`, `--auto-save`, `--timeout <s>`, `--max-retries <n>`, `--no-retry` |
| `scraper approve <collector_id>` | Accept a heal waiting at the gate | `--reject`, `--auto-save`, `--url <url>`, `--timeout <s>` |

`create` takes 5 to 10 minutes, so budget for it. The description caps at 500 characters and a heal prompt caps at 1000. Without `--auto-approve` a heal stops at the approval gate and waits for `scraper approve`.

`run` defaults to async and polls. `--sync` is single-URL only and the server caps it between 25 and 50 seconds, so keep it for small fast pages. Batches go through `--urls` or `--input-file`, where the file holds one URL per line, or a JSON array of strings, or a JSON array of `{"url": "..."}` objects. Batch polling defaults to 3600 seconds.

`--legacy-output` on `create`, `heal` and `approve` emits the pre-v0.3 payload shape. Leave it alone unless migrating.

```
bdata scraper run <collector_id> https://news.ycombinator.com --sync --pretty
```

## Drive a browser

A stateful session on Bright Data's cloud browser, driven one command at a time. Elements are addressed by the `ref` values a snapshot hands back, such as `e1`.

Navigate and read: `open <url>`, `back`, `forward`, `reload`, `snapshot`, `screenshot [path]`, `get text [selector]`, `get html [selector]`.

Act: `click <ref>`, `type <ref> <text>` (`--append`, `--submit`), `fill <ref> <value>`, `select <ref> <value>`, `check <ref>`, `uncheck <ref>`, `hover <ref>`, `scroll` (`--direction`, `--distance`, `--ref`).

Inspect and clean up: `status`, `network`, `cookies`, `sessions`, `close` (`--all`).

Session-level options go on the `browser` command itself and are accepted before or after the subcommand: `--session <name>` (default `default`), `--zone <name>` (default `cli_browser`), `--country <code>`, `--timeout <ms>` (default 30000), `--idle-timeout <ms>` (default 600000). `--headed` is accepted but answers that headed mode is not implemented yet.

Snapshot shaping, worth using because a full snapshot is large: `--compact` keeps interactive elements and their ancestors, `--interactive` returns a flat list of interactive elements only, `--depth <n>` caps depth, `--selector <sel>` scopes to a subtree, `--wrap` adds AI-safe content boundaries. Screenshots take `--full-page` and `--base64`.

```
bdata browser open https://example.com --session shop
bdata browser snapshot --session shop --interactive
```

## Wire up a repo

| Command | Purpose | Key flags |
|---|---|---|
| `skill list` | Show the installable Bright Data skills | none |
| `skill add <name>` | Install one skill into this repo's agent folders | none |
| `add mcp` | Register the Bright Data MCP server | `--agent <claude-code,cursor,codex>`, `--global`, `--project` |

`skill add` is non-interactive only when a name is given. A bare `bdata skill add` opens a picker in an interactive terminal; without a TTY it exits 1 immediately with `Interactive skill selection requires a TTY`, so always pass the name in scripts and CI. It installs into the current working directory, so run it from the project root.

`brightdata-cli` is itself a name in the registry. `bdata skill add brightdata-cli` installs that published skill, a separate artifact, not a reinstall of this file.

```
bdata skill add scrape
```

## Not in the CLI

There is no `schedule` subcommand and no cron anywhere in the tool. Recurring runs are configured in the Bright Data control panel, which offers hourly, daily, weekly and custom. From a terminal, the alternative is the host's own scheduler calling `bdata` on a timer.
