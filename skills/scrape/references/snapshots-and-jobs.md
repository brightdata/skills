# Snapshots and jobs - a trigger returned an id

Answers the question "the call came back with an id instead of data, so what do I do with it".

Both scraping paths are asynchronous. Neither returns records from the trigger. They return different kinds of id, and the two are read through different endpoints. Getting this wrong is the most common way an agent stalls.

## Which id is this

| Id looks like | Came from | Read it with |
|---|---|---|
| `sd_abc123...` or `s_abc123...` | Web Scraper API trigger, or any `bdata pipelines` run | `datasets/v3` progress and snapshot |
| `c_abc123...` | `bdata scraper create` | Nothing. This is a scraper template (`collector_id`), not a job. Run it with `bdata scraper run` first, then poll the id that run returns. |
| Anything else | Scraper Studio `scraper run`, or `POST /dca/trigger` | `GET /dca/log/{job_id}` for status, `GET /dca/dataset?id=` for records |

Live triggers hand back the `sd_` form (`sd_mt9xuudv23gyk8mxyr` is a real one). Older ids and older docs show `s_`. Both are Web Scraper API snapshots and both read through the same two endpoints, so never treat an `sd_` id as a Studio job.

## Web Scraper API snapshots

Two endpoints, both authenticated with `Authorization: Bearer $BRIGHTDATA_API_KEY`.

```
GET https://api.brightdata.com/datasets/v3/progress/<snapshot_id>    poll until it reports ready
GET https://api.brightdata.com/datasets/v3/snapshot/<snapshot_id>    the records
```

Do not download early, and do not poll in a tight loop.

One CLI call does the whole thing:

```
bdata status <snapshot_id> --wait
```

`--wait` polls until complete, `--timeout <seconds>` defaults to 600 or `BRIGHTDATA_POLLING_TIMEOUT`, and `-o <path>` writes the result to a file.

## Scraper Studio jobs

Two endpoints. One tells you how the job is going, the other hands over the records.

```
GET https://api.brightdata.com/dca/log/{job_id}                            status and counters, never records
GET https://api.brightdata.com/dca/dataset?id=<collection_id>&format=json  the records, once the job is done
```

`/dca/log` is status only. Every record comes from `/dca/dataset`, so a job that reports done still needs the second call.

These are the fields in the job-log response of `GET /dca/log/{job_id}`. The API returns them lowercase.

| Field | Meaning |
|---|---|
| `status` | Whether the job is running, done, or failed |
| `inputs` | How many inputs went in |
| `lines` | How many output records came out |
| `fails` | How many inputs failed |
| `pages` | How many pages were loaded |
| `navigations` | How many navigations the browser made |

`lines` is the number to report as "records collected". `pages` and `navigations` explain why a job took longer or cost more than expected, but they are not the billing answer. Cost questions belong to the `billing` skill, not here.

Batch collections stay downloadable for 16 days, real-time collections for 7. After that the data is gone unless a delivery destination was configured.

## Delivery options, and the line the agent does not cross

Results do not have to come back through the API. Both paths can deliver to a webhook, to email, or to S3, Google Cloud Storage, Azure, Snowflake or SFTP.

The rules are short.

| Rule | Why |
|---|---|
| Delivery is configured once, by a person, in the control panel | It is account plumbing, not a per-call argument |
| The agent never configures it | The agent has no business writing to someone's bucket |
| The agent never asks for cloud credentials | An S3 key or a Snowflake password has no place in a chat transcript |
| The default is local | The agent polls, downloads, and writes files in the user's project |

If a user asks for results in their warehouse, the honest answer is that they set the destination up once in the control panel and the platform delivers there from then on. The `--deliver-webhook` flag on `bdata scraper create` sets only the stub URL on a new Studio template. It is not a general delivery mechanism, and its default is a placeholder.

## The script

[scripts/poll.mjs](../scripts/poll.mjs) takes either id and gives back the data.

```
node scripts/poll.mjs sd_abc123 --out records.json
node scripts/poll.mjs <collection_id>
```

It works out which kind of id it has from the prefix, polls with backoff, prints progress to stderr so stdout stays pipeable, and reads the API key from `BRIGHTDATA_API_KEY` or the CLI's `credentials.json` without ever printing it. Node 18 or newer, no dependencies.

## Never promise instant

A trigger is not an answer. State the choice, say the job is running, and let it run. Twenty to thirty seconds is a good case, and minutes is normal.

Where the key lives and what a refused call means: see the `agent-onboarding` skill.
