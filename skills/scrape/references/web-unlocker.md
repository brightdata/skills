# Web Unlocker inside scrape - the fall-through

Answers the question "every gate said no, so how do I get records without a scraper".

## How you got here

Only one row of the gate table lands here: a one-time job, no ready scraper, and pages that share no layout. This is `fetch`'s engine borrowed for a records job, so the raw page comes back and the user owns the parser. Nobody at Bright Data maintains it, and a user who wants the page itself goes to `fetch` by name instead.

## The request

Two ways in, one engine underneath. Reach for the CLI first, because it needs no zone name and no body.

**The CLI.**

```
bdata scrape <url> -f html -o <file>
```

`-f html` asks for the raw page and `-o` writes it to a file. The command is spelled `scrape`, but it has nothing to do with this scrape skill. It is the `fetch` skill's engine, borrowed here because the fall-through needs raw pages.

**The REST call.** One POST. Verified live against a real zone.

```
POST https://api.brightdata.com/request
     Authorization: Bearer $BRIGHTDATA_API_KEY
     Content-Type: application/json

     {"zone":"<unlocker zone>","url":"https://example.com/listing/1","format":"raw"}
```

| Field | Value |
|---|---|
| `zone` | The account's Web Unlocker zone name. List zones with `bdata zones`. |
| `url` | The page to unlock. |
| `format` | `raw` for the unmodified response. `json` wraps it in an envelope. |

For volume, async mode is an opt-in zone setting (Advanced settings, "Asynchronous requests"). Callbacks usually land within 5 minutes but can take up to 8 hours at peak, and responses are stored for 48 hours. Billing is per successful request, not per record.

## What it handles for you

| Handled | What the docs say |
|---|---|
| IP rotation | "Selects the most effective proxy network for the target site" |
| Fingerprinting | "Sets request headers and fingerprints to match real-user browser traffic" |
| CAPTCHA solving | On by default as part of the unblocking flow, and it can be turned off |
| Retries | "Retries failed attempts with alternative configurations until the request succeeds" |
| JavaScript rendering | Off by default. Add the `render` parameter to force a browser. |
| Cookies | Custom cookies can be sent. Login and authentication cookies are not allowed. |
| Geo targeting | Country targeting, plus `x-unblock-city` and `x-unblock-zipcode` on supported targets |

What it does not do is give you fields. There is no schema, no field list, and no metadata endpoint. Everything after the response body is the user's code.

One trap to carry into that parser: on listing pages the visible link text is often cut short with an ellipsis, while the full value sits in an attribute such as `title`. Check the attributes before trusting what the page displays.

## KYC

Most targets need none. Scraping APIs are not the proxy products. Only four error codes refuse.

| Error code | HTTP | Meaning |
|---|---|---|
| `ub_bad_endpoint_robots` | 400 | The endpoint is disallowed by the target's own robots.txt and the account is in immediate access mode. Reddit is the common case. |
| `policy_20051` | 403 | The target is a government site and needs special permission. The match is not limited to `.gov` domains. |
| `policy_20000` | 403 | The target sits in a category Bright Data blocks. |
| `policy_20050` | 403 | The target is not permitted by Bright Data's compliance policy. |

All four clear the same way: the account completes KYC and describes the intended use to the compliance team.

Read the error first. Send the user to brightdata.com/cp/kyc only after a call has actually been refused for one of these reasons, never up front. Details in the `agent-onboarding` skill.

## The warning that matters most

If this path is being used more than once against the same layout, stop and go back to gate 2.

Repeated Unlocker calls against one site means somebody is now maintaining a parser by hand. That is exactly the job Scraper Studio exists to remove. Studio builds the scraper from a description, heals it when the site changes, and schedules it. A hand-written parser does none of that, and it breaks silently the next time the site ships a redesign.

| Signal | What to do |
|---|---|
| Second run against the same site | Build it in Studio. See [scraper-studio.md](scraper-studio.md). |
| The user says "recurring" | Studio, because only Studio has a scheduler. |
| Many URLs, one layout | Studio, even for a single run. |
| Many URLs, all different layouts, once | Stay here. This is the case the path is for. |

## Do not reach here early

Web Unlocker is the last resort inside `scrape`, not the default. A ready scraper covering the fields always wins, even when the ask is a single URL. Check the top-25 table in [web-scraper-api.md](web-scraper-api.md) before writing a single `api.brightdata.com/request` call.
