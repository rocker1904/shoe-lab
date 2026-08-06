# Backlog

Ordered roughly by priority. Items marked *(UX polish, 2026-07-28)* were ruled out of scope by the UX polish and accessibility design and are recorded here with its reasoning; *(spec §11)* are the roadmap items deferred from the original design.

1. **Fail retired-method catalogue drift before the metrics crawl.** *(method era, 2026-08-06)* `scrape:metrics` has both the extracted catalogue and the previous catalogue before it requests any per-test readings, but the complete method-status gate currently runs only after that crawl (docs/scraping.md §Validation gates). Run its catalogue-only checks before the request loop and prove that stale, redundant or lost retirement status makes zero lab-list requests; retain the final values-against-catalogue gate before write.
2. **Open Graph tags.** *(UX polish, 2026-07-28)* The page has a title and a favicon, so a shared link previews as *something* (docs/app.md §Sharing is copying the address bar), but there are no `og:`/`twitter:` tags and therefore no card. Deferred rather than done because it needs an image, and an image needs a decision about what this tool looks like — a screenshot dates, and there is no logo.
3. **Head-to-head compare view.** *(spec §11)* Select 2–4 shoes for a side-by-side metric comparison.
