# Offers, ranking & output formats

## Normalized offer record

Collapse every raw retailer result into this schema before comparing. This is
also the row shape for the structured-dataset output.

| Field | Notes |
|---|---|
| `retailer` | amazon / walmart / ebay / bestbuy / google_shopping / <local> |
| `seller` | first-party retailer vs third-party marketplace seller (or "n/a") |
| `title` | product title as listed (catch mismatched variants/sizes) |
| `price` | numeric, in the listing's original currency |
| `currency` | ISO code of `price` (USD, ILS, EUR, …) |
| `price_display` | price normalized to the user's display currency |
| `shipping` | shipping cost if known (0 = free, null = unknown) |
| `total` | `price_display` + shipping (+ import/tax if known) — the ranking key |
| `availability` | in_stock / out_of_stock / preorder / limited |
| `condition` | new / refurbished / used / open_box |
| `rating` | star rating + review count if available |
| `url` | direct link to the offer — **required**, never blank |
| `collected_at` | ISO timestamp the price was pulled |

## Ranking method (and guardrails)

- **Rank by `total` (landed cost), not sticker `price`.** A $10-cheaper item
  with $25 shipping loses. When shipping/tax is unknown, rank by price but flag
  the unknown explicitly — don't silently assume free shipping.
- **Gate before crowning a winner.** The "Best buy" must be `in_stock` and the
  same `condition` class the user wants (default: new). A cheaper
  out-of-stock / refurbished / used offer is listed but not the default pick;
  call it out as an alternative with its caveat.
- **Watch for variant mismatch.** Different storage/size/color/bundle are
  different products — only compare like-for-like. Note mismatches instead of
  ranking across them.
- **Flag third-party sellers.** A marketplace seller undercutting the
  first-party listing carries different return/warranty risk — surface it.
- Keep facts (the listed price + stock) separate from interpretation (your
  "best buy" call).

## Currency normalization

- Convert every offer to one display currency (`price_display`). State the rate
  and the date used, e.g. "converted at 1 USD = 3.7 ILS (2026-05-31)".
- Keep each offer's original `price` + `currency` in the dataset so the user can
  verify against the source page.
- For regions where the user buys both locally and via import (e.g. Israel via
  `amazon.com`), show landed cost including estimated shipping/import where
  known, and label it as an estimate.

---

## Output A — Comparison table + recommendation

```markdown
# Price Comparison: <product>
*Prices collected on <date> · region: <country> · display currency: <CUR>*

| Retailer | Price | Shipping | Total | Availability | Condition | Rating | Link |
|---|---|---|---|---|---|---|---|
| Walmart | $979 | Free | **$979** | In stock | New | — | [link](url) |
| Amazon | $999 | Free | $999 | In stock | New | 4.7★ (12k) | [link](url) |
| eBay | $940 | $15 | $955 | In stock | Refurbished | 4.5★ | [link](url) |
| Best Buy | $999 | Free | $999 | Out of stock | New | 4.6★ | [link](url) |

## Best buy
- **<Retailer> — $<total>**: cheapest in-stock, new. <one-line why.> [link](url)
- Runner-up: <Retailer> at $<total> — pick this if <reason, e.g. faster
  shipping / better return policy / higher rating>.
- Cheaper-but-caveated: <eBay refurbished $955> — only if you're OK with
  refurbished/no manufacturer warranty.

## Gaps & caveats
- Retailers with no result this run: <list>.
- Prices/currency notes: <conversion rate used; any "from" ranges or stale data>.
```

Every report **must** end by naming a single best in-stock buy (or stating that
nothing comparable is in stock). A table with no recommendation is not a
deliverable.

## Output B — Structured dataset

One row per normalized offer.

```bash
# Pipelines can emit CSV directly:
bdata pipelines run <dataset_id> collect_by_url "<url>" --format csv -o offer.csv
# Then merge retailer files and add total/condition/availability columns
# during normalization.
```

JSON shape:
```json
[
  {
    "retailer": "amazon",
    "seller": "Amazon.com",
    "title": "Apple iPhone 17 Pro 256GB",
    "price": 999.00,
    "currency": "USD",
    "price_display": 999.00,
    "shipping": 0,
    "total": 999.00,
    "availability": "in_stock",
    "condition": "new",
    "rating": {"stars": 4.7, "reviews": 12043},
    "url": "https://www.amazon.com/dp/...",
    "collected_at": "2026-05-31T00:00:00Z"
  }
]
```

## Output C — Both

Deliver the dataset (B) as the evidence layer and the comparison table +
recommendation (A) built on top, with each table row linking back to its
dataset entry.
