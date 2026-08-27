# Billing investigations and estimates, step by step

Answers "why did this cost that", "what is going on right now", and "what will it cost", with the exact reads for each. Endpoint shapes and their verification status live in [cost-api.md](cost-api.md).

## Classify the question first

- **Current account state.** "How much balance do I have", "am I on trial money", "can this account make requests". Read balance and zones, and remember `GET /status` is a hint, not proof.
- **Actual consumption or charge.** "Why did this job cost so much", "what did this zone spend". Read the job or snapshot metadata, then the cost export for the dollars. Actual billed data always beats a formula.
- **Future estimate.** "What will 10,000 records cost". No API answers this. Build the estimate from the billing unit and the account's own rate, and label it an estimate.
- **General explanation.** "How does Bright Data bill scraping". Answer from the billing docs, and touch the account's data only when the question is personal.

## Workflow: a zone-backed product (Web Unlocker, SERP, Browser API, proxies)

1. Unknown zone: `GET /zone/get_all_zones`, match by name and `type`.
2. `GET /zone?zone=<name>` for the product and plan behind it. Never echo the raw response, it carries the zone password.
3. `GET /zone/cost?zone=<name>&from=<date>&to=<date>` for cost and usage in the window. Always pass the dates.
4. "Which website did this": `GET /domains/req` and `GET /domains/bw`, dates required.
5. Reconciling several zones or products: the cost export with `zones` or `products`.

Explain a SERP or Unlocker charge as successful requests times the account's rate, and a Browser API or proxy charge as bandwidth times the rate. The real rate divides the window's `cost` by its request count, per cost-api.md.

## Workflow: Web Scraper API

1. `GET /datasets/v3/snapshots`, find the snapshot, read `dataset_size`. That is the delivered-record count, and one input URL can deliver many records.
2. The cost export with `ws_api_snaps` for that snapshot's dollars, or `web_apis` for the whole dataset.
3. Explain the charge as records delivered times the per-record rate. Never ask the user how many records came back when the snapshot read answers it.

## Workflow: Scraper Studio

1. `GET /dca/log/{job_id}` for the job's status, inputs, lines, failures, pages and navigations. The scrape skill's snapshots-and-jobs reference covers this read, including the privacy note on its `trigger` field.
2. The cost export with `dca_jobs` for the job's dollars, cross-checking an empty answer against `products` per cost-api.md. A collector-wide rollup is `collectors`, and it can carry charges no single job accounts for, so never explain one job's charge with it.
3. Explain which behavior drove the count: pagination, detail pages, retries and extra navigations each count as page loads.

## A job still running

Report what has accrued so far from the reads above, label any projection of the final figure as an estimate, and say what it assumes. Never claim billing data is unavailable just because the job is unfinished, and never present the projection as the total.

## Estimates, by billing unit

No endpoint returns a quote. Find the unit, count the units, multiply by the account's own rate, and say it is an estimate.

- **Per request** (Web Unlocker, SERP): billable units are successful requests. A batch of ten URLs is ten requests.
- **Per delivered record** (Web Scraper API): count records, not inputs. Listing pages multiply.
- **Per page load** (Scraper Studio): count start pages, pagination, detail pages, retries and navigations.
- **Per GB** (Browser API, most proxy plans): expected bandwidth times the zone's rate.
- **Per IP** (some datacenter and ISP plans): allocated IPs times the IP rate for the period, plus any bandwidth component.

Rates: derive the account's real per-request rate from `/zone/cost` where possible. For per-record products no read exposes a rate, so use the published price and say it is the list price, not this account's rate.

## What to ask, and what never to ask

Worth asking, because no read answers it: how many records, URLs, queries or pages the user expects, how much bandwidth, and which date window the answer should cover.

Never ask, because a free read answers it: which plan the account is on, which zone was used, whether there are deposited funds, how many records a snapshot delivered, or how many pages a job loaded. If the user hands over a snapshot id, job id, collector id, zone name or date range, use it directly.

## When a read is refused

- **401**: the key is missing, revoked or invalid. Route to the `agent-onboarding` skill, and never ask the user to paste a key into the chat.
- **403**: the key is real but lacks billing access. Say which data needs Finance or Admin access and point the admin at brightdata.com/cp/setting/users.
- **404**: a snapshot, job or dataset id is wrong, expired, or belongs to another account. A wrong zone name is different: the zone endpoints answer 422, not 404 (live). Re-check the id before asking the user for a new one.
- **Partial access**: report the half that worked, name the access the other half needs, and do not stall the whole answer on it.

## What each MCP tool bills as

For "what did my agent's tool call cost". Pro mode changes which tools are exposed, never what anything costs.

| Tool | Billed as |
|---|---|
| `search_engine`, `search_engine_batch` | SERP or Unlocker-backed requests, one per query |
| `scrape_as_markdown`, `scrape_as_html` | Web Unlocker, one request per URL |
| `scrape_batch` | Web Unlocker, one request per URL in the batch |
| `web_data_*` | Web Scraper API, per delivered record |
| `scraping_browser_*` | Browser API, per GB of session traffic |

## The docs pages worth citing

All under `docs.brightdata.com/api-reference/account-management-api/` unless noted.

| Topic | Page |
|---|---|
| Balance | `Get_total_balance_through_API` |
| Cost export | `Export_cost_breakdown` |
| Zone cost and bandwidth | `Get_the_total_cost_and_bandwidth_stats_for_a_Zone` |
| Per-domain consumption | `domain-consumption` |
| Zone list and zone info | `get-all-zones`, `Get_Zone_info` |
| Account status | `Get_account_status` |
| Snapshots | `docs.brightdata.com/api-reference/scrapers/management-apis/get-snapshots` |
| Studio job log | `docs.brightdata.com/api-reference/scraper-studio-api/job-data` |

Billing concepts, under `docs.brightdata.com/general/account/`:

| Topic | Page |
|---|---|
| Free tier | `billing-and-pricing/free-tier` |
| Costs Explorer | `billing-and-pricing/costs-explorer` |
| Billing FAQs | `billing-and-pricing/faqs` |
| Trial restrictions | `limited-trial-restrictions` |
| Users and key permissions | `users-management` |

Outside the docs: public pricing at `brightdata.com/pricing`, and Billing Overview in the control panel at `brightdata.com/cp/billing/overview`.
