# The Bright Data balance and cost endpoints

Answers the question "which endpoint holds this number, what does its response really look like, and how much of that has actually been checked".

Everything here is a free read. None of these calls starts a job or spends anything. Base host is `https://api.brightdata.com` and every call carries the header `Authorization: Bearer <key>`.

Facts marked **live** were checked against a real account on 2026-08-26 by reading status codes and field names only. Facts marked **docs only, not verified live** come from docs.brightdata.com and were not exercised. Where the two disagree, both are written down, because the drift is the thing most likely to break code.

## GET /customer/balance

No parameters. Returns 200 with a flat object of dollar amounts.

The published schema and the live response do not match, and this matters.

| Field | In the docs | On a live account |
|---|---|---|
| `balance` | yes, "the amount of money in your account" | yes |
| `pending_balance` | yes, "the amount you will be billed for in the next billing cycle" | **absent** |
| `pending_costs` | not documented | **present**, and it is the pending figure |
| `credit` | not documented | present |
| `prepayment` | not documented | present |

Live shape:

```json
{"balance": 0, "credit": 0, "prepayment": 0, "pending_costs": 0}
```

Read `pending_costs` for money owed. Code written against the documented `pending_balance` reads undefined, which is exactly the bug in the CLI's own `budget balance` command. Treat any missing field as absent, not as zero.

A missing or invalid key returns **401 with a short plain-text body** (live), such as `Invalid credentials` for a bad key or `User authentication is required` when the header is missing. The body is `text/html`, not JSON, so parsing it as JSON will fail. Branch on the status code.

## GET /zone/cost

| Parameter | Required | Notes |
|---|---|---|
| `zone` | yes | Zone name. Omitting it returns **400** (live). A name that does not exist returns **422** (live). |
| `from` | no | Inclusive start, `YYYY-MM-DD`. |
| `to` | no | **Exclusive** end, `YYYY-MM-DD`. |

Called with only a zone, the response is one object keyed by an internal zone id, holding six relative buckets:

```json
{"<zone_id>": {
  "back_m0": {"cost": 0, "range": {"from": "Aug-2026", "to": "Sep-2026"}},
  "back_m1": {"cost": 0, "range": {"from": "Jul-2026", "to": "Aug-2026"}},
  "back_m2": {"cost": 0, "bw": 0, "range": {"from": "Jun-2026", "to": "Jul-2026"},
              "reqs_serp": 0, "reqs_unblocker": 0},
  "back_d0": {"cost": 0, "range": {"from": "26-Aug-2026", "to": "27-Aug-2026"}},
  "back_d1": {"cost": 0, "range": {"from": "25-Aug-2026", "to": "26-Aug-2026"}},
  "back_d2": {"cost": 0, "range": {"from": "24-Aug-2026", "to": "25-Aug-2026"}}
}}
```

Three things to know, all live.

- There are two sets of keys. `back_m0`, `back_m1` and `back_m2` are this month and the two months before it. `back_d0`, `back_d1` and `back_d2` are today and the two days before it. **The day buckets sit inside `back_m0`, so never add the two sets together.** Adding all six double counts recent days and mixes three months into one figure.
- Only `cost` and `range` are always there. `bw`, `reqs_serp` and `reqs_unblocker` appear only on buckets that saw traffic. The docs sample shows `bw` on every bucket and no `range` at all, which is the opposite of what a live account returns.
- Supplying `from` and `to` **replaces all six buckets with a single bucket named `custom`**. This is the reliable way to ask for a period. A date the API cannot read returns **500**, not 400, and the message is misleading: it says `You must provide period with both to and from` even when both were sent. Read a 500 here as a bad date format, not as an outage (live).

Scope limit, docs only, not verified live: this endpoint cannot return Web Scraper API or Scraper Studio cost, because that spend is keyed by dataset id and collector rather than by zone. Use the cost export for those.

## POST /costs/export/json and POST /costs/export/csv

Both take the same JSON body. `dimension`, `from` and `to` are all required, and omitting one returns **400** (live).

| Field | Required | Notes |
|---|---|---|
| `dimension` | yes | One of the nine below. |
| `from` | yes | Inclusive start, `YYYY-MM-DD`, UTC. |
| `to` | yes | **Exclusive** end, `YYYY-MM-DD`, UTC. |
| `filters` | no | Optional object in Bright Data's internal charges notation. Most callers send `{}` and scope with `dimension` instead. Documented example is `{"props": {"product": {"whitelist": ["dc", "unblocker"]}}}`. Docs only, not verified live. |

The nine documented dimensions are `products`, `types`, `zones`, `datasets`, `web_apis`, `collectors`, `domains`, `ws_api_snaps` and `snapshots`. They group cost by product family, by network or charge type, by zone, by marketplace dataset purchase, by Web Scraper API `dataset_id`, by Scraper Studio collector, by target domain, by Web Scraper API snapshot and by dataset snapshot. Dimension meanings are docs only, not verified live.

**A wrong dimension can look like a zero bill.** An unrecognized value such as `totally_bogus` returns 400, but `dca_jobs` and `dca_jobs_dynamic` are accepted and return 200 with an empty object every time (live). An agent that passes one of those and reports "no charges" is reporting the absence of a valid query, not the absence of spend. Stick to the nine.

**How to tell an empty answer from a wrong question.** When a dimension comes back `{}`, do not report zero yet. Ask again for the same window with `dimension` set to `products`, which is the broad one. If `products` shows spend and the narrow dimension is still empty, the dimension name is wrong or unsupported on this account, so fix the name instead of reporting no charges. If both come back empty for that window, there was genuinely no spend in it, and you can say so plainly.

### Calling it

bash:

```bash
curl -s -X POST https://api.brightdata.com/costs/export/json \
  -H "Authorization: Bearer $BRIGHTDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"2026-08-01","to":"2026-09-01","dimension":"products"}'
```

PowerShell 5.1, where the TLS line is not optional and the variable needs the `$env:` prefix:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$body = '{"from":"2026-08-01","to":"2026-09-01","dimension":"products"}'
Invoke-RestMethod -Method Post -Uri "https://api.brightdata.com/costs/export/json" `
  -Headers @{ Authorization = "Bearer $env:BRIGHTDATA_API_KEY" } `
  -ContentType "application/json" -Body $body
```

Change the two dates for the window you want, and remember `to` is exclusive. A whole month is the 1st of that month to the 1st of the next. **Month to date is the 1st of this month to the 1st of next month**, which is exactly what the body above asks for. Never put today's date in `to`, because that silently drops today.

### The JSON response

Keyed by day, each day mapping a resource key to billed dollars for that day. **A `total` key sits alongside the dates** with the sum for the whole range, so iterating the keys as dates will count everything twice. The published schema and example show only date keys and no `total`, so this is live behavior the docs do not describe.

```json
{
  "2026-06-11": {"unblocker": 0, "data_api": 0},
  "2026-06-12": {"unblocker": 0},
  "total":      {"unblocker": 0, "data_api": 0, "dataset_api": 0}
}
```

Resource keys are internal names that depend on the dimension. Seen live: `unblocker`, `data_api` and `dataset_api` for `products`, and `reqs_serp`, `reqs_unblocker` and `records` for `types`. The docs also show opaque dataset ids sitting alongside them, docs only, not verified live. Days with no spend are simply absent, and a range with no spend returns `{}`.

**The `zones` dimension does not return plain zone names (live).** Most keys on a live account are synthetic per-dataset keys carrying a prefix, such as `v__ds_api_`, `v__cli_ds_api_` and `v__dca_ds_api_`, followed by a dataset identifier. The prefix is the meaningful part, because it decides the product line: `v__dca_ds_api_*` bills as `dataset_api`, while `v__ds_api_*` and `v__cli_ds_api_*` bill as `data_api`. Match on the prefix when you group these, do not try to read the suffix as a zone, and do not assume a key from this dimension can be passed to `/zone/cost`, which wants a real zone name.

Exclusivity confirmed live. Asking `from=2026-06-11&to=2026-06-12` returns that day, and asking `from=2026-06-11&to=2026-06-11` returns nothing.

**The current day lags (live).** For today, the export runs minutes behind `/zone/cost`, so a same-day read under-reports and two reads a few minutes apart will disagree with each other. The export is the source of truth for closed days only. Answer a today question from `/zone/cost`, and if a same-day export figure has to be reported at all, say plainly that the day is still settling.

### The CSV response

`Content-Type: text/csv`. Live, the header row is `Day,Id,Value` and each row is one day, one resource, one amount, with `Id` carrying a display name such as `Web Unlocker API` rather than the internal key the JSON uses.

The docs describe a different, pivoted layout, one row per day and one column per resource id. That is not what came back. Prefer the JSON variant, and if you must parse the CSV, read the header row rather than assuming a shape.

Docs only, not verified live: the export is rate limited to 1,000 requests a minute and 5,000 an hour, and it "accepts any API key with cost-data access", with no separate billing admin scope. The docs also call these values the source of truth for billing, matching the control panel Cost Explorer and rolling up into the invoice.

## Supporting reads

**GET /zone/get_active_zones** takes no parameters and returns an array of `{name, type}` (live). Types seen include `unblocker` and `browser_api`, and the docs also list `serp`, `res_rotating`, `isp` and `mobile`. This is how you get the zone names that `/zone/cost` needs. **GET /zone/get_all_zones** additionally returns deleted zones and a `status` of `active` or `deleted`, docs only, not verified live.

**GET /zone?zone=<name>** returns `created`, `password`, `ips`, `plan` and `perm` (live). The `plan` object carries `start`, `type`, `vips_type`, `ub_premium`, `product`, `cost_override` and `trial_id`, where `product` is a short code such as `dc`. Useful for naming the product behind a zone and for spotting a negotiated rate through `cost_override`.

**GET /customer/bw** and **GET /zone/bw** return bandwidth and request counts rather than money. The response is keyed by customer id, then by zone, then by metric, with names such as `bw_sum`, `bw_dn`, `bw_up`, `reqs_unblocker_billable` and `reqs_serp_billable` (live). They answer how much traffic moved, never how much it cost. They accept both `YYYY-MM-DD` and full ISO timestamps (live), and the docs do not say whether their `to` is exclusive.

**GET /status** returns **200** with `status`, `customer`, `can_make_requests`, `auth_fail_reason` and `ip` (live). It is a free way to ask whether the account can work, which beats firing a billable request to find out.

Treat `can_make_requests` as a hint and never as proof. Live, it came back `false` with an `auth_fail_reason` of `zone_not_found` on an account that was successfully billing traffic in the same minute. A `false` here means one lookup behind the endpoint failed, not that the account is unable to work, so never report it to a user as a blocked or broken account and never stop work on the strength of it alone. Only a `true` is worth much, and even then the real answer comes from the cost reads above.

## What no API will tell you

- **Remaining free tier credits.** No field anywhere counts them. They are at brightdata.com/cp/billing/overview under Free Tier Credits, with the renewal date. A money balance of zero says nothing about credits left, because they are separate pools.
- **A price quote for a job that has not run.** There is no estimate endpoint. Work the estimate out from the billing unit and the account's recent rate for the same zone or dataset.
- **The account's negotiated rate as a number.** Custom pay-as-you-go and pre-commit accounts pay rates the public price list does not show. For Web Unlocker and SERP you can derive it by asking `/zone/cost` for a period and dividing the `custom` bucket's `cost` by its `reqs_unblocker` or `reqs_serp`. The cost export reports dollars only and carries no unit counts, so for per-record products there is no rate to derive and the published price is all you have.
- **Invoices.** They arrive by email, by the third Israeli business day. Docs only, not verified live.
