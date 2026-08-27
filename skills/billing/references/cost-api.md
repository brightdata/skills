# The Bright Data balance and cost endpoints

Answers the question "which endpoint holds this number, what does its response really look like, and how much of that has actually been checked".

Everything here is a free read. None of these calls starts a job or spends anything. Base host is `https://api.brightdata.com` and every call carries the header `Authorization: Bearer <key>`.

Facts marked **live** were checked against a real account on 2026-08-26 by reading status codes and field names only. Facts marked **docs only, not verified live** come from docs.brightdata.com and were not exercised. Where the two disagree, both are written down, because the drift is the thing most likely to break code.

## GET /customer/balance

No parameters. Returns 200 with a flat object of dollar amounts. Live shape:

```json
{"balance": 0, "credit": 0, "prepayment": 0, "pending_costs": 0}
```

Read `pending_costs` for money owed. Code written against the documented `pending_balance` reads undefined. Treat any missing field as absent, not as zero.

A missing or invalid key returns **401 with a short plain-text body** (live), such as `Invalid credentials` for a bad key or `User authentication is required` when the header is missing. The body is `text/html`, not JSON, so parsing it as JSON will fail. Branch on the status code.

## GET /zone/cost

| Parameter | Required | Notes |
|---|---|---|
| `zone` | yes | Zone name. Omitting it returns **400** (live). A name that does not exist returns **422** (live). |
| `from` | no | Inclusive start, `YYYY-MM-DD`. |
| `to` | no | **Exclusive** end, `YYYY-MM-DD`. |

Called with only a zone, the response is one object keyed by the account's customer id, holding six relative buckets:

```json
{"<customer_id>": {
  "back_m0": {"cost": 0, "range": {"from": "Aug-2026", "to": "Sep-2026"}},
  "back_m1": {"cost": 0, "range": {"from": "Jul-2026", "to": "Aug-2026"}},
  "back_m2": {"cost": 0, "bw": 0, "range": {"from": "Jun-2026", "to": "Jul-2026"},
              "reqs_serp": 0, "reqs_unblocker": 0},
  "back_d0": {"cost": 0, "range": {"from": "26-Aug-2026", "to": "27-Aug-2026"}},
  "back_d1": {"cost": 0, "range": {"from": "25-Aug-2026", "to": "26-Aug-2026"}},
  "back_d2": {"cost": 0, "range": {"from": "24-Aug-2026", "to": "25-Aug-2026"}}
}}
```

How to read the buckets (live):

- `back_m0`, `back_m1` and `back_m2` are this month and the two before it. `back_d0`, `back_d1` and `back_d2` are today and the two days before, and they sit inside `back_m0`, so never add the two sets together. Only `cost` and `range` are on every bucket, and the traffic fields appear only on buckets that saw traffic.
- Supplying `from` and `to` **replaces all six buckets with a single bucket named `custom`**, which is the reliable way to ask for a period. A **500** here usually means a date format the API could not read, not an outage.

Scope limit, docs only, not verified live: this endpoint cannot return Web Scraper API or Scraper Studio cost, because that spend is keyed by dataset id and collector rather than by zone. Use the cost export for those.

## POST /costs/export/json and POST /costs/export/csv

Both take the same JSON body. `dimension`, `from` and `to` are all required, and omitting one returns **400** (live).

| Field | Required | Notes |
|---|---|---|
| `dimension` | yes | One of the eleven the server accepts, listed below. |
| `from` | yes | Inclusive start, `YYYY-MM-DD`, UTC. |
| `to` | yes | **Exclusive** end, `YYYY-MM-DD`, UTC. |
| `filters` | no | Optional object in Bright Data's internal charges notation. Most callers send `{}` and scope with `dimension` instead. Documented example is `{"props": {"product": {"whitelist": ["dc", "unblocker"]}}}`. Docs only, not verified live. |

The server accepts exactly eleven dimensions, and it names them itself: send an invalid value and the 400 error prints the whitelist verbatim (live): `types, products, zones, datasets, web_apis, collectors, dca_jobs, snapshots, ws_api_snaps, domains, dca_jobs_dynamic`. The server's whitelist is the authoritative list. `dca_jobs` covers regular Scraper Studio jobs and `dca_jobs_dynamic` virtual ones, and it is worth confirming either with a live export before building on it.

Which dimension answers which question:

| Billing question | Dimension |
|---|---|
| Product comparison, or the broad cross-check | `products` |
| Charge type (requests vs records vs bandwidth) | `types` |
| One zone, or zone-backed products side by side | `zones` |
| A marketplace dataset purchase | `datasets` or `snapshots` |
| Web Scraper API by `dataset_id` | `web_apis` |
| One Web Scraper API snapshot | `ws_api_snaps` |
| A Scraper Studio collector rollup | `collectors` |
| One Scraper Studio job | `dca_jobs` |
| A target website across products | `domains` |

Do not explain one specific job's charge with `collectors`: it is a per-collector rollup and can carry charges no single job accounts for. Dimension meanings beyond the whitelist are docs only, not verified live.

**How to tell an empty answer from a wrong question.** An invalid dimension name cannot fool you, it returns 400 with the whitelist. The trap is a valid dimension that is the wrong one for the question. When a dimension comes back `{}`, do not report zero yet. Ask again for the same window with `dimension` set to `products`, which is the broad one. If `products` shows spend and the narrow dimension is still empty, the spend is attributed under a different dimension, so change the question rather than reporting no charges. Seen live: a window with Scraper Studio spend under `products` (`ide`) returned `{}` under `dca_jobs`. If both come back empty for that window, there was genuinely no spend in it, and you can say so plainly.

### Calling it

bash:

```bash
curl -s -X POST https://api.brightdata.com/costs/export/json \
  -H "Authorization: Bearer $BRIGHTDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"2026-08-01","to":"2026-09-01","dimension":"products"}'
```

PowerShell 5.1, where the variable needs the `$env:` prefix. The TLS line is harmless insurance, needed only on hosts whose .NET defaults lack TLS 1.2, and current Windows 10 and 11 work without it:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$body = '{"from":"2026-08-01","to":"2026-09-01","dimension":"products"}'
Invoke-RestMethod -Method Post -Uri "https://api.brightdata.com/costs/export/json" `
  -Headers @{ Authorization = "Bearer $env:BRIGHTDATA_API_KEY" } `
  -ContentType "application/json" -Body $body
```

Change the two dates for the window you want, and remember `to` is exclusive. A whole month is the 1st of that month to the 1st of the next. **Month to date is the 1st of this month to the 1st of next month**, which is exactly what the body above asks for. Never put today's date in `to`, because that silently drops today.

### The JSON response

Keyed by day, each day mapping a resource key to billed dollars for that day. **A `total` key sits alongside the dates** with the sum for the whole range (live), so iterating the keys as dates will count everything twice.

```json
{
  "2026-06-11": {"unblocker": 0, "data_api": 0},
  "2026-06-12": {"unblocker": 0},
  "total":      {"unblocker": 0, "data_api": 0, "dataset_api": 0}
}
```

Resource keys are internal names that depend on the dimension. Seen live: `unblocker`, `data_api` and `dataset_api` for `products`, and `reqs_serp`, `reqs_unblocker` and `records` for `types`. The docs also show opaque dataset ids sitting alongside them, docs only, not verified live. Days with no spend are simply absent, and a range with no spend returns `{}`.

**The `zones` dimension mixes plain zone names with synthetic keys (live).** Zone-backed spend appears under the real zone name (`cli_unlocker`), and those names CAN be passed to `/zone/cost`. Most other keys are synthetic per-dataset keys carrying a prefix, such as `v__ds_api_`, `v__cli_ds_api_` and `v__dca_ds_api_`, followed by a dataset identifier, plus `v__dca_<collector>` keys that carry a Scraper Studio collector name. The prefix is the meaningful part, because it decides the product line: `v__dca_ds_api_*` bills as `dataset_api`, plain `v__dca_<collector>` keys bill as `ide`, which is Scraper Studio (live), and `v__ds_api_*` and `v__cli_ds_api_*` bill as `data_api`. Match on the prefix when you group these, and never pass a synthetic key to `/zone/cost`, which wants a real zone name.

Exclusivity confirmed live. Asking `from=2026-06-11&to=2026-06-12` returns that day, and asking `from=2026-06-11&to=2026-06-11` returns nothing.

**The current day lags (live).** For today, the export runs minutes behind `/zone/cost`, so a same-day read under-reports and two reads a few minutes apart will disagree with each other. The export is the source of truth for closed days only. Answer a today question from `/zone/cost`, and if a same-day export figure has to be reported at all, say plainly that the day is still settling.

### The CSV response

`Content-Type: text/csv`. Live, the header row is `Day,Id,Value` and each row is one day, one resource, one amount, with `Id` carrying a display name such as `Web Unlocker API` rather than the internal key the JSON uses.

Prefer the JSON variant, and if you must parse the CSV, read the header row rather than assuming a shape.

Docs only, not verified live: the export is rate limited to 1,000 requests a minute and 5,000 an hour, and it "accepts any API key with cost-data access", with no separate billing admin scope. The docs also call these values the source of truth for billing, matching the control panel Cost Explorer and rolling up into the invoice.

## Supporting reads

**GET /zone/get_active_zones** takes no parameters and returns an array of `{name, type}` (live). Types seen include `unblocker` and `browser_api`, and the docs also list `serp`, `isp` and `mobile`. This is how you get the zone names that `/zone/cost` needs. **GET /zone/get_all_zones** returns an array of `{name, type, status}` (live), where `status` distinguishes active from deleted zones.

**GET /zone?zone=<name>** returns `created`, `password`, `ips`, `plan` and `perm` (live). The `plan` object carries `start`, `type`, `vips_type`, `ub_premium`, `product`, `cost_override` and `trial_id`, where `product` is a short code such as `dc`. Useful for naming the product behind a zone and for spotting a negotiated rate through `cost_override`. **The `password` field holds the zone's real credentials in plain text (live), so never echo this response raw into a chat, a log, or a report.** Pull the one field you need and drop the rest.

**GET /domains/req** and **GET /domains/bw** break usage down per target website. `from` and `to` are required, and omitting them returns **400** (live). The response nests zone, then day as an ISO timestamp, then domain, mapping to a request count or bytes (live). Synthetic `v__` keys from the zones dimension appear here too as pseudo-zones. This is the read for "which site ate the budget", and it reports usage, never dollars.

**GET /datasets/v3/snapshots** lists Web Scraper API snapshots, each carrying `dataset_size`, the number of records delivered (live). One input URL can produce many records, so this is the count that explains a per-record charge. Pair it with the cost export's `ws_api_snaps` dimension for the dollars.

**GET /customer/bw** and **GET /zone/bw** return bandwidth and request counts rather than money. The response is keyed by customer id, then a wrapper object whose `data` key holds the per-zone objects (aggregates sit under `sums`), then by zone, then by metric, with names such as `bw_sum`, `bw_dn`, `bw_up`, `reqs_unblocker_billable` and `reqs_serp_billable` (live). They answer how much traffic moved, never how much it cost. They accept both `YYYY-MM-DD` and full ISO timestamps (live), and the docs do not say whether their `to` is exclusive.

**GET /status** returns **200** with `status`, `customer`, `can_make_requests`, `auth_fail_reason` and `ip` (live). It is a free way to ask whether the account can work, which beats firing a billable request to find out.

Treat `can_make_requests` as a hint and never as proof. Live, it came back `false` with an `auth_fail_reason` of `zone_not_found` on an account that was successfully billing traffic in the same minute. A `false` here means one lookup behind the endpoint failed, not that the account is unable to work, so never report it to a user as a blocked or broken account and never stop work on the strength of it alone. Only a `true` is worth much, and even then the real answer comes from the cost reads above.

## The docs pages behind these endpoints

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

