# Sentiment, themes & output formats

## Normalized mention record

Collapse every raw result into this schema before analysis. This is also the row
shape for the structured-dataset output.

| Field | Notes |
|---|---|
| `platform` | reddit / x / instagram / tiktok / youtube / review / news |
| `date` | ISO date of the mention |
| `author` | handle or display name (or "n/a") |
| `text` | the mention content (trim to the relevant part) |
| `url` | direct link to the mention — **required**, never blank |
| `engagement` | likes/upvotes/comments/views if available |
| `sentiment` | positive / neutral / negative / mixed |
| `sentiment_reason` | one short clause explaining the call |
| `themes` | 1–3 tags (pricing, support, quality, UX, shipping, feature:X) |

## Sentiment method (and guardrails)

- Classify from the **text as written**, in context. A 5-star phrasing with "but…"
  is usually `mixed`, not `positive`.
- Mark sarcasm and ambiguous posts `mixed` rather than guessing — don't inflate either
  side. Note when a platform's sample is too small to generalize.
- Report sentiment as counts **and** percentages, with the denominator (e.g. "61%
  positive of 142 classified mentions"). Never present a percentage without N.
- Keep facts (the quote) separate from interpretation (your label).

## Theme clustering

Group mentions by recurring topic. For each theme: count, dominant sentiment, and 1–2
representative cited quotes. Themes are where the actionable insight lives — they tell
the user *why* people feel how they do.

---

## Output A — Digest report template

```markdown
# Brand Listening: <brand>
*Data collected on <date> · window: last <N> days · platforms: <list>*

## Snapshot
- Total mentions: <N> across <platforms>
- Sentiment: <P>% positive · <Q>% neutral · <R>% negative · <S>% mixed  (N classified)
- Volume by platform: reddit <n>, x <n>, youtube <n>, ...
- Net trend vs prior window: <up/down/flat, if comparable>

## What's driving sentiment (themes)
| Theme | Mentions | Dominant sentiment | Representative quote (cited) |
|---|---|---|---|
| Pricing | 22 | negative | "…too expensive for what you get" — [r/x](url), <date> |
| Support | 14 | positive | "…support fixed it in an hour" — [@user](url), <date> |

## Notable mentions
- **[High reach]** "<quote>" — <author>, <platform>, <date>. [link](url)
- **[Complaint]** "<quote>" — ... [link](url)
- **[Advocacy]** "<quote>" — ... [link](url)

## Gaps & caveats
- Platforms with no mentions found this window: <list>
- Anything that couldn't be measured / needed escalation.

## So what — recommendations
- <Actionable takeaway tied to a theme, e.g. "Pricing objection is the #1 negative
  driver — address with a value comparison on the pricing page.">
- <2–4 total, each grounded in the data above.>
```

Every report **must** end with the "So what" section. Raw data without interpretation
is not a deliverable.

## Output B — Structured dataset

One row per normalized mention.

```bash
# Pipelines can emit CSV directly:
bdata pipelines run <dataset_id> collect_by_url "<url>" --format csv -o reddit_mentions.csv
# Then merge platform files and add sentiment/themes columns during normalization.
```

JSON shape:
```json
[
  {
    "platform": "reddit",
    "date": "2026-05-28",
    "author": "u/example",
    "text": "switched to <brand> and support has been great",
    "url": "https://reddit.com/r/.../comments/...",
    "engagement": {"upvotes": 42, "comments": 7},
    "sentiment": "positive",
    "sentiment_reason": "praises support responsiveness",
    "themes": ["support"]
  }
]
```

## Output C — Both

Deliver the dataset (B) as the evidence layer and the digest (A) built on top, with
the digest's quotes linking back to rows in the dataset.
