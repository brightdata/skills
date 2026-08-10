---
name: bright-data-billing
description: |
  Explain and investigate Bright Data billing, free-tier credits, trial
  balances, paid balances, product billing units, actual consumption, and
  estimated costs. Use when a user asks how they were charged, why usage was
  higher than expected, how many credits an operation consumes, what balance
  remains, or how much a future workload may cost. Use authenticated Bright
  Data account and usage APIs before asking the user for information.
---

# Bright Data Billing

Use this skill to explain Bright Data billing, investigate actual account usage, and estimate future costs.

## Core Principles

1. Billing is determined by the Bright Data product, plan, and actual usage.  
2. MCP, CLI, SDK, REST API, and the Control Panel are access methods. They do not change the underlying product’s billing unit.  
3. One credit does not universally equal one page, job, tool call, API call, or result set.  
4. Retrieve available account, plan, usage, and cost data through authenticated APIs before asking the user.  
5. Use actual billing data for completed or running workloads. Use formulas only for future estimates or when account data is unavailable.  
6. Clearly distinguish free-tier credits, trial balance, deposited balance, pending charges, and paid plan usage.  
7. Use the least-privileged API key that provides the required data.  
8. Never ask the user to paste an API key into the conversation.  
9. Do not infer free-credit availability from a zero monetary balance.  
10. This skill is read-only. Do not perform billing, payment, plan, or account write operations.
11. Do not invoke product endpoints (e.g., `POST /request`, scraper triggers, browser sessions) to probe account state — they consume paid usage. Answer "can the account make requests?" from `GET /status` and zone configuration, never by firing a live test request.

## API Key Permissions

Billing and cost APIs require an API key with billing or cost-data access.

The relevant API key permission types are:

- **Admin:** Full account access, including billing, financial information, products, and account configuration.  
- **Finance:** Access to billing and financial information.  
- **Ops:** Product configuration access without billing access.  
- **User:** Product usage without billing or product configuration access.  
- **Limit:** Limited account and proxy credential management access.

For billing and cost data:

- Prefer a **Finance** API key.  
- Use an **Admin** API key only when broader account and product access is required.  
- Do not automatically recommend or request an Admin key.  
- `POST /costs/export/json` is a read-only export even though it uses the POST method.  
- The Cost Breakdown API accepts API keys with cost-data access. There is no separate billing-admin scope.

A Finance key may not be able to retrieve product-specific data such as Scraper API snapshots or Scraper Studio jobs. When both billing and product data are required, use separate least-privileged credentials where supported:

- A Finance key for balance and cost data.  
- A product-authorized key for snapshot, job, and usage data.

Only account administrators can create or modify API keys.

If the required API key is missing or returns `401` or `403`, direct the user or their account administrator to configure it here:

[https://brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users)

Do not ask the user to paste the configured key into the conversation.

## Source Priority

Use sources in this order:

1. Actual account data returned by Bright Data APIs.  
2. Account entitlement, plan, and zone configuration.  
3. Official product billing and pricing documentation.  
4. User-provided workload assumptions for future estimates.

For historical billed costs, `POST /costs/export/json` is the source of truth. It returns the same billing data used by Cost Explorer and invoices.

## Determine the Type of Question

Classify the request before answering.

### Current Account State

Examples:

- How much balance do I have?  
- Do I have free credits?  
- Am I using trial credit or deposited funds?  
- Which plan am I on?  
- Can my account continue making requests?

Retrieve account, entitlement, balance, and plan data.

### Actual Consumption or Charge

Examples:

- Why did this job consume so many credits?  
- How many records did this snapshot deliver?  
- What did I spend on this collector?  
- How much did this SERP API zone cost?  
- How much bandwidth did this Browser API zone consume?

Retrieve usage, job, snapshot, zone, and cost data.

### Future Estimate

Examples:

- How many credits will 10,000 records consume?  
- How much will 50 GB cost?  
- How many pages will this scraper load?  
- What will 5,000 SERP requests cost?

Retrieve the account’s current plan and rate, then calculate using the expected workload. Ask the user only for quantities that cannot be retrieved or reasonably derived.

### General Billing Explanation

Explain the applicable rule using official documentation. Do not access account data unless the question requires a personalized answer.

## Retrieve Account and Usage Data First

Call only the endpoints relevant to the question.

| Question | Endpoint | Relevant response |
| :---- | :---- | :---- |
| Can the account make requests? | `GET /status` | `status`, `can_make_requests`, `auth_fail_reason` |
| What is the monetary balance? | `GET /customer/balance` | `balance`, `pending_costs`, `credit`, `prepayment` |
| Which products and zones exist? | `GET /zone/get_all_zones` | Zone name, product type, and status |
| What plan is a zone using? | `GET /zone?zone={zone_name}` | Plan, product, type, IPs, bandwidth, and available pricing overrides |
| What did a specific zone consume or cost? | `GET /zone/cost?zone={zone_name}` | Cost and bandwidth grouped by date and charge type |
| What was actually billed across the account? | `POST /costs/export/json` | Billed USD grouped by date and selected dimension |
| How many requests were made per domain? | `GET /domains/req?from={date}&to={date}` | Request counts, nested zone → date → domain. **`from` and `to` are required** — omitting them returns `400` |
| How much bandwidth was used per domain? | `GET /domains/bw?from={date}&to={date}` | Bandwidth in bytes, nested zone → date → domain. **`from` and `to` are required** — omitting them returns `400` |
| How many Scraper API records were collected? | `GET /datasets/v3/snapshots` | `dataset_size` for each snapshot |
| What happened in a Scraper Studio job? | `GET /dca/log/{job_id}` | Status, inputs, lines, failures, pages, and navigations |

Use the account-entitlement endpoint available in the runtime to retrieve:

- Free-tier eligibility and remaining credits.  
- Trial balance and expiration.  
- Whether the account is risk-flagged.  
- PAYG, custom, or pre-commit status.  
- Account-level or product-level pricing overrides.

If this information is not exposed through the available authenticated APIs, direct the user to:

[https://brightdata.com/cp/billing/overview](https://brightdata.com/cp/billing/overview)

### Important Balance Distinction

`GET /customer/balance` returns monetary account information. Verified live response shape:

```json
{"balance": 125.5, "credit": 0, "prepayment": 0, "pending_costs": 0}
```

- `balance`: Money in the account.
- `pending_costs`: Amount expected to be billed in the next billing cycle.
- `credit`: Account credit, in **dollars** — this is NOT the free-tier credit count.
- `prepayment`: Prepaid amount on the account.

The field is `pending_costs`, not `pending_balance`. Read the actual keys from the response rather than assuming a name.

None of these represent the number of remaining free-tier credits. `credit` is especially easy to misread: it is a monetary figure, not a count of the 5,000 recurring free-tier credits. Free-tier and trial entitlement are not exposed by this endpoint — use the account-entitlement endpoint if available in the runtime, otherwise direct the user to Billing Overview.

## Zone-Based Billing

Zones are not limited to proxy products.

Zones are also used for:

- Web Unlocker API  
- SERP API  
- Browser API  
- Residential Proxy  
- Datacenter Proxy  
- ISP Proxy

For a zone-based billing question:

1. Identify the relevant zone from the request context or `GET /zone/get_all_zones`.  
2. Call `GET /zone?zone={zone_name}` to retrieve the product and plan.  
3. Call `GET /zone/cost?zone={zone_name}` for zone-specific cost and bandwidth.  
4. Call `GET /domains/req` or `GET /domains/bw` when a domain-level breakdown is needed.  
5. Use Cost Breakdown with `dimension: "zones"` when comparing several zones or reconciling account billing.  
6. Use Cost Breakdown with `dimension: "products"` when comparing product families.

Do not treat zones as proxy-only objects.

For SERP API billing, use the SERP zone and its applicable request-based plan.

For Browser API billing, use the Browser API zone and its bandwidth consumption.

## Use Cost Breakdown for Actual Charges

Call:

`POST https://api.brightdata.com/costs/export/json`

Request body:

- `dimension`: The dimension by which to group costs.  
- `filters`: Optional filters. Use an empty object when no filter is needed.  
- `from`: Inclusive start date in `YYYY-MM-DD` format.  
- `to`: Exclusive end date in `YYYY-MM-DD` format.

Supported dimensions include:

- `products`  
- `types`  
- `zones`  
- `datasets`  
- `web_apis`  
- `collectors`  
- `domains`  
- `ws_api_snaps`  
- `snapshots`

Choose the most specific dimension:

| Billing question | Dimension |
| :---- | :---- |
| Scraper API snapshot | `ws_api_snaps` |
| Scraper API product or dataset | `web_apis` |
| Scraper Studio collector | `collectors` |
| Web Unlocker, SERP, Browser API, or proxy zone | `zones` |
| Target website | `domains` |
| General product comparison | `products` |
| Marketplace Dataset | `datasets` or `snapshots` |

The `from` date is inclusive and the `to` date is exclusive. Dates use UTC.

### Cost Breakdown response shape

The response is a **date-keyed object**, not an array. Each date maps to `{dimension_value: usd}`, plus a `total` key aggregating the whole range:

```json
{
  "2026-01-15": {"data_api": 6.52, "serp": 0.02, "unblocker": 0.01},
  "2026-02-02": {"data_api": 3.76},
  "total": {"serp": 0.02, "data_api": 10.28, "unblocker": 0.01}
}
```

Read the range total from `total`, and per-day figures from the date keys. An empty object means no billed usage in that range — which is a real answer, not a failure. Product keys are internal names (`data_api` = Scraper API, `unblocker` = Web Unlocker, `serp` = SERP API, `ide` = Scraper Studio).

Do not replace actual cost data with a manually calculated estimate when Cost Breakdown data is available.

## Free Tier

Use this page as the primary free-tier reference:

[https://docs.brightdata.com/general/account/billing-and-pricing/free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier)

### Eligibility

Do not assume that every newly created account received free credits.

Before stating that an account has a free tier, check its eligibility and entitlements.

Accounts that are risk-flagged receive:

- No recurring free-tier credits.  
- No signup trial balance.  
- No payment-method trial bonus.

Accounts on a custom PAYG plan or a pre-commit plan may also be ineligible for recurring free-tier credits.

### Allowance

An eligible account receives:

- 5,000 recurring free credits per month.  
- Renewal on the first day of each month.  
- No rollover of unused credits.  
- One shared account-level pool.

The recurring free tier applies to:

- Web Unlocker API  
- SERP API  
- Scraper API  
- Scraper Studio

### Consumption Units

| Product | Free-tier billing unit |
| :---- | :---- |
| Web Unlocker API | Request |
| SERP API | Request |
| Scraper API | Delivered record |
| Scraper Studio | Page load |

Do not treat a free-tier credit as a universal monetary unit.

Do not derive a universal dollar value per credit from the approximate total value of the free tier.

### When Free Credits Run Out

- If the account has deposited funds, eligible usage continues against the paid balance at the account’s applicable PAYG rate.  
- If the account has no deposited funds, the eligible service stops.  
- The presence of a payment method alone does not mean the account has deposited funds.

## Trial Balance

The trial balance is separate from the recurring free tier.

For an eligible, non-risk-flagged account:

- Signup grants a one-time $2 trial balance.  
- The $2 trial expires seven days after signup.  
- Adding a payment method grants an additional $5.  
- The additional $5 expires 30 days after it is granted.  
- Trial balance can be used across Bright Data products.  
- Trial balance is not limited to Browser API or proxy products.

Always retrieve the account’s actual trial balance and expiration before telling the user that trial funds remain.

## Paid Balance and Plans

Bright Data uses a prepaid wallet model for PAYG usage.

Distinguish between:

- Recurring free-tier credits.  
- Trial or promotional funds.  
- Deposited funds.  
- Pending charges.  
- Monthly commitment.  
- Product-specific plan or negotiated rate.  
- Actual billed usage.

Use account and zone APIs to determine the active plan. Do not ask the user which plan they use when authenticated plan data is available.

For custom or negotiated pricing, use the rate returned by the account or plan configuration. Do not substitute public list pricing.

## Product Billing Units

Use the account’s actual plan as the source of truth.

| Product | Common billing unit | Billing identifier |
| :---- | :---- | :---- |
| Web Unlocker API | Successful request | Zone |
| SERP API | Successful request | Zone |
| Scraper API | Delivered record | Dataset and snapshot |
| Scraper Studio | Page load or current plan unit | Collector and job |
| Browser API | Bandwidth | Zone |
| Residential Proxy | Bandwidth | Zone |
| Datacenter Proxy | Bandwidth or allocated IP, depending on plan | Zone |
| ISP Proxy | Bandwidth or allocated IP, depending on plan | Zone |
| Discover API | Current product entitlement and pricing | Discover task |
| Marketplace Datasets | Records, snapshot, or subscription, depending on purchase | Dataset and snapshot |

Mobile Proxy is deprecated and must not be presented as an available product.

## Resolve Named Operations to Products

Do this only when the user names an operation instead of a product.

Do not ask which interface they used if the product can be resolved from context.

| Operation | Billed product |
| :---- | :---- |
| MCP `search_engine` | Web Unlocker-backed search request |
| MCP `scrape_as_markdown` | Web Unlocker API |
| MCP `scrape_as_html` | Web Unlocker API |
| MCP `search_engine_batch` | One underlying request per query |
| MCP `scrape_batch` | One underlying request per URL |
| MCP `web_data_*` | Scraper API |
| MCP `scraping_browser_*` | Browser API |
| MCP `discover` | Discover API |
| CLI or SDK operation | Product called by that operation |

MCP Pro mode only controls which tools are exposed. It is not a billing plan and does not make the underlying product free.

## Investigate Zone-Based Consumption

Use this workflow for Web Unlocker, SERP API, Browser API, and proxy products:

1. Retrieve all zones using `GET /zone/get_all_zones` if the zone is unknown.  
2. Identify the relevant zone by name and product type.  
3. Retrieve the plan using `GET /zone?zone={zone_name}`.  
4. Retrieve zone cost and bandwidth using `GET /zone/cost?zone={zone_name}`.  
5. Retrieve per-domain requests using `GET /domains/req`.  
6. Retrieve per-domain bandwidth using `GET /domains/bw`.  
7. Use Cost Breakdown with `zones`, `products`, or `domains` for reconciliation.  
8. Explain the charge using the zone’s actual product, plan, and usage.

For SERP API, explain the relationship between successful requests and actual cost.

For Browser API, explain the relationship between transferred bandwidth and actual cost.

## Investigate Scraper API Consumption

If a snapshot or dataset ID is available:

1. Call `GET /datasets/v3/snapshots`.  
2. Find the relevant snapshot.  
3. Read `dataset_size`, which is the number of records collected.  
4. Call Cost Breakdown with `dimension: "ws_api_snaps"` for actual billed cost.  
5. Explain the charge using both the delivered record count and actual cost.

Do not ask the user how many records were delivered when the API can retrieve `dataset_size`.

A single input URL, request, or snapshot can produce many delivered records. Therefore, one job or one input does not necessarily equal one billing unit.

## Investigate Scraper Studio Consumption

If a job ID is available:

1. Call `GET /dca/log/{job_id}`.  
2. Read:  
- `Status`  
- `Inputs`  
- `Lines`  
- `Fails`  
- `Pages`  
- `Navigations`  
3. Use Cost Breakdown with `dimension: "collectors"` to retrieve actual billed cost.  
4. Explain which job behavior contributed to consumption.

Do not ask the user for page or output counts if job metadata is available.

Do not assume that `Lines`, `Pages`, or `Navigations` is the final billable quantity without checking the current billing rule. Cost Breakdown remains the source of truth for actual charges.

## Running or Unfinished Jobs

For a running job:

- Retrieve its current status and usage.  
- Retrieve accrued billing data.  
- Report actual cost accrued so far.  
- Label any projected final cost as an estimate.  
- Explain the assumptions behind the projection.

Do not state that all billing information is unavailable for a running job. Current consumption and accrued cost may already be available.

Only the final total remains unknown until the job stops producing billable usage.

## Future Cost Estimates

For a future estimate:

1. Resolve the product.  
2. Retrieve the current plan and applicable rate.  
3. Retrieve free-tier and trial eligibility when relevant.  
4. Identify the product’s billing unit.  
5. Determine the expected quantity.  
6. Calculate the estimate.  
7. Clearly label assumptions and variables.

### Request-Based Products

Use:

`Estimated consumption = Number of billable requests`

Examples:

- Web Unlocker requests  
- SERP API requests  
- URLs or queries inside a batch request

One batch operation may create multiple billable requests.

### Record-Based Products

Use:

`Estimated consumption = Number of delivered records`

A single Scraper API request or snapshot may deliver many records.

### Page-Load-Based Products

Use:

`Estimated consumption = Number of billable page loads`

Account for:

- Starting pages  
- Pagination pages  
- Detail pages  
- Additional navigation  
- Billable retries

### Bandwidth-Based Products

Use:

`Estimated cost = Expected bandwidth × Account rate`

Retrieve the zone’s current rate before calculating.

### IP-Based Products

Use the plan-specific formula, which may include:

`Allocated IPs × IP rate × Billing period`

Additional bandwidth or feature costs may apply.

## Clarifying Questions

Ask questions only when the required information cannot be retrieved.

Appropriate questions for future estimates include:

- How many records do you expect to receive?  
- How many URLs or search queries will you submit?  
- How many pages do you expect the scraper to load?  
- How much bandwidth do you expect to consume?  
- What date range should the estimate cover?

Do not ask:

- Which plan the user is on when account or zone plan data is available.  
- Whether the user has deposited funds when balance data is available.  
- How many records were delivered when snapshot data is available.  
- How many pages a job loaded when job metadata is available.  
- Which interface was used when the underlying product can be resolved.  
- Which zone was used when it can be resolved from account data or request context.

If the user supplies a snapshot ID, job ID, collector ID, zone name, or date range, use it directly.

## Error Handling

### Missing or Invalid Authentication

If an API returns `401`:

- Explain that the configured API key is missing, expired, revoked, or invalid.  
- Direct the user to configure an API key at: [https://brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users)  
- Do not ask them to paste the key into the conversation.

### Insufficient Permissions

If an API returns `403`:

- Explain which information requires billing, cost-data, or product access.  
- Recommend a Finance key for billing and cost data.  
- Recommend a product-authorized key for snapshot, job, or product usage data.  
- Use an Admin key only if the user’s organization explicitly requires one combined key.  
- Direct the account administrator to: [https://brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users)

### Missing Resource

If an API returns `404`:

- Verify the zone, snapshot, job, collector, or dataset ID.  
- Check whether the resource has expired or belongs to another account.  
- Ask the user for the identifier only if it cannot be resolved from context.

### Partial Billing Data

If product usage is available but billing access is unavailable:

- Explain the consumption quantity.  
- State that actual billed cost could not be retrieved.  
- Direct the user to configure a Finance key or open Billing Overview.

If billing data is available but product details are unavailable:

- Report the actual billed cost.  
- State that the exact request, record, page, or bandwidth explanation requires product-level access.

## Response Format

### Direct Answer

State what was charged or the estimated consumption.

### Account State

Include only information relevant to the question:

- Free-tier eligibility and remaining credits.  
- Trial balance and expiration.  
- Deposited balance.  
- Pending charges.  
- Applicable product plan.

### Usage and Calculation

Show:

- Product  
- Zone, snapshot, collector, or job where relevant  
- Billing unit  
- Actual or expected quantity  
- Actual billed cost, when available  
- Formula used for estimates

### Explanation

Explain why the number of jobs, requests, URLs, records, pages, tool calls, or browser actions may differ from the billable quantity.

### Sources

Link to the relevant API or official documentation.

## Documentation References

### API Key Permissions and Configuration

**Authentication and API key permissions**  
[https://docs.brightdata.com/api-reference/authentication](https://docs.brightdata.com/api-reference/authentication)

**Configure API keys**  
[https://brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users)

**Users and permissions**  
[https://docs.brightdata.com/general/account/users-management](https://docs.brightdata.com/general/account/users-management)

### Account and Cost APIs

**Account status**  
[https://docs.brightdata.com/api-reference/account-management-api/Get_account_status](https://docs.brightdata.com/api-reference/account-management-api/Get_account_status)

**Total Balance API**  
[https://docs.brightdata.com/api-reference/account-management-api/Get_total_balance_through_API](https://docs.brightdata.com/api-reference/account-management-api/Get_total_balance_through_API)

**Cost Breakdown API**  
[https://docs.brightdata.com/api-reference/account-management-api/Export_cost_breakdown](https://docs.brightdata.com/api-reference/account-management-api/Export_cost_breakdown)

**Domain Consumption API**  
[https://docs.brightdata.com/api-reference/account-management-api/domain-consumption](https://docs.brightdata.com/api-reference/account-management-api/domain-consumption)

**All Zones API**  
[https://docs.brightdata.com/api-reference/account-management-api/get-all-zones](https://docs.brightdata.com/api-reference/account-management-api/get-all-zones)

**Zone Info API**  
[https://docs.brightdata.com/api-reference/account-management-api/Get_Zone_info](https://docs.brightdata.com/api-reference/account-management-api/Get_Zone_info)

**Zone Cost and Bandwidth API**  
[https://docs.brightdata.com/api-reference/account-management-api/Get_the_total_cost_and_bandwidth_stats_for_a_Zone](https://docs.brightdata.com/api-reference/account-management-api/Get_the_total_cost_and_bandwidth_stats_for_a_Zone)

### Product Usage APIs

**Scraper API snapshots**  
[https://docs.brightdata.com/api-reference/scrapers/management-apis/get-snapshots](https://docs.brightdata.com/api-reference/scrapers/management-apis/get-snapshots)

**Scraper Studio job metadata**  
[https://docs.brightdata.com/api-reference/scraper-studio-api/job-data](https://docs.brightdata.com/api-reference/scraper-studio-api/job-data)

### Billing Documentation

**Free tier**  
[https://docs.brightdata.com/general/account/billing-and-pricing/free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier)

**Public pricing**  
[https://brightdata.com/pricing](https://brightdata.com/pricing)

**Costs Explorer**  
[https://docs.brightdata.com/general/account/billing-and-pricing/costs-explorer](https://docs.brightdata.com/general/account/billing-and-pricing/costs-explorer)

**Limited Trial restrictions**  
[https://docs.brightdata.com/general/account/limited-trial-restrictions](https://docs.brightdata.com/general/account/limited-trial-restrictions)

**Billing and pricing FAQs**  
[https://docs.brightdata.com/general/account/billing-and-pricing/faqs](https://docs.brightdata.com/general/account/billing-and-pricing/faqs)

### Conditional References

Use the general Billing page only for commitments, billing cycles, invoices, and proxy plan behavior:

[https://docs.brightdata.com/general/account/billing-and-pricing/billing](https://docs.brightdata.com/general/account/billing-and-pricing/billing)

Use the MCP FAQ only for MCP-specific behavior:

[https://docs.brightdata.com/ai/mcp-server/faqs](https://docs.brightdata.com/ai/mcp-server/faqs)

Use Billing Overview as a manual fallback when the required account entitlement is unavailable through API:

[https://brightdata.com/cp/billing/overview](https://brightdata.com/cp/billing/overview)

Use Billing Settings only for payment methods, auto-recharge, or alerts:

[https://brightdata.com/cp/billing/settings](https://brightdata.com/cp/billing/settings)

