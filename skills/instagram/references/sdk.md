# Instagram via the Python SDK: every call, complete

`pip install brightdata-sdk`, token in `BRIGHTDATA_API_TOKEN` or a prior
`bdata login`. Each snippet is self-contained. Verified 2026-09-11 on
`brightdata-sdk` 2.5.2.

## Two accounts, one job

A list of URLs is one job, not one per account.

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    result = client.search.instagram.posts(
        ["https://www.instagram.com/nasa/", "https://www.instagram.com/natgeo/"], num_of_posts=1
    )
    for post in result.data:
        print(post["user_posted"], post["url"])
```

## Trigger now, fetch later

For anything bigger than a few accounts, do not block a process for an hour.

```python
import time

from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    job = client.scrape.instagram.posts_trigger("https://www.instagram.com/p/Dc1W1uFj-CW/")
    print("snapshot:", job.snapshot_id)
    while (status := client.scrape.instagram.posts_status(job.snapshot_id)) not in ("ready", "failed"):
        time.sleep(5)
    record = client.scrape.instagram.posts_fetch(job.snapshot_id)[0]
    print("fetched:", record["url"], "likes:", record["likes"])
```

## A date window

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    result = client.search.instagram.posts(
        "https://www.instagram.com/nasa/",
        num_of_posts=3,
        start_date="08-01-2026",   # MM-DD-YYYY
        end_date="09-07-2026",
        post_type="Reels",         # or "Post"; "Reel" returns an error row
    )
    for post in result.data:
        print(post["date_posted"], post["content_type"], post["url"])
```

## A profile, by username, no URL

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    profile = client.search.instagram.profiles("nasa").data[0]
    print(profile["account"], "followers:", profile["followers"], "posts:", profile["posts_count"])
```

## Comments on a post

One credit per comment, so check `num_comments` on the post first.

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    comments = client.scrape.instagram.comments("https://www.instagram.com/p/Dc1W1uFj-CW/").data
    print(len(comments), "comments; first:", repr(comments[0]["comment"][:60]))
```

## Recent reels

Reels discovery is slower. The default 180-second timeout expires; 420 does not.

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    reels = client.search.instagram.reels("https://www.instagram.com/nasa/", num_of_posts=2, timeout=420)
    for reel in reels.data:
        print(reel["date_posted"], reel["url"])
```

## The schema, live

```python
from brightdata import SyncBrightDataClient

with SyncBrightDataClient(auto_create_zones=False) as client:
    fields = client.datasets.instagram_posts.get_metadata().fields
    print(len(fields), "fields;", ", ".join(sorted(fields)[:8]), "...")
```

The fields most people want: `url`, `date_posted`, `description`, `hashtags`,
`likes`, `num_comments`, `user_posted`.
