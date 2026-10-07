# MCP, CLI, SDK, or REST

Answers the question "the account works, so which way in should this task use?"

## The rule

Read the situation, not the wish. Four situations, one interface each:

| The situation | Interface |
|---|---|
| The agent does the work itself, right now: setup, building and testing scrapers, quick one-off checks | CLI |
| Deterministic code, the same job repeated, or the user wants their own API or service on top of Bright Data | SDK |
| An AI app that decides at run time | MCP |
| Nothing can be installed and Node.js is absent (otherwise npx carries the CLI) | REST directly |

Same platform behind all four. Moving between interfaces never changes which product runs, only how the call is made.

## What each one looks like

**CLI.** The agent is at the keyboard and the work is still being figured out. `bdata` is the shortest path to a real response, so it is the right surface for the first scrape, for testing a scraper while building it, and for a check the user asked for once and will not ask for again. Onboarding installs it.

**SDK.** The job is settled and will run again unchanged, so it belongs in the user's own repo. The Python and Node.js SDKs turn the working call into code the project owns and runs on its own schedule, with no agent in the loop. Moving a command that already works in the CLI into the SDK is the normal end of a build.

**MCP.** The caller is a model, not a script. The app cannot know at build time which tool it will need, so it needs a list of tools to pick from while it runs. That is the whole reason MCP exists. If the order of calls is known in advance, this is SDK work in the wrong shape.

**REST.** No install is possible. If Node.js is present, `npx -y @brightdata/cli <command>` runs the full CLI with nothing installed, so reach for that before plain REST. Otherwise a locked-down CI runner, a slim container, or a machine where npm and pip are blocked can still call the API over plain HTTPS with a bearer token and an environment variable. Nothing is lost by doing it this way, it is only more code to write.

## Where the detail lives

- `brightdata-cli` skill owns the command surface and the flags.
- `brightdata-sdk` skill owns both SDKs, Python and Node.js.
- `brightdata-mcp` skill owns the server, its groups, and its tools.
- [auth.md](auth.md) owns the credential order and the REST auth header, for every interface including plain REST.
