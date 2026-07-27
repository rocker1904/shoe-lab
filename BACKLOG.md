# Backlog

Ordered roughly by priority. Items marked *(final review)* came out of the pre-merge whole-branch review; *(spec §11)* are the roadmap items deferred from the original design.

1. **Refine the filter presets.** Tune the built-in presets against real usage: revisit the easy-day-cruiser thresholds, reconsider tempo-plated and wide-toebox, and likely add more stories (e.g. race day, trail crossover, budget rotation). Cheap to do — see docs/app.md §Presets for where the thresholds live and how a preset behaves.
2. **Fix non-carbon plate detection.** *(final review)* Extract the per-shoe "Plate" fact — it is in each shoe page's payload — in `extract-details.ts` during the details crawl and feed it into `derivePlate`, so nylon/PEBA shoes stop reading as `none` (docs/scraping.md §Data quirks). Needs a `--force-all` re-crawl to backfill, one-off.
3. **CSV date-precision column.** *(final review)* `shoes.csv` and the in-app export emit year-derived dates with nothing marking them imprecise; add a `preciseReleaseDate` column (schema addition — semantics in docs/scraping.md §Release-year supplement).
4. **Back/forward navigation.** `popstate` is unhandled, so Back doesn't restore the previous view. Must be worked through against docs/app.md §View and URL ownership rather than around it.
5. **Svelte component linting.** `.svelte` files are typechecked (svelte-check) but outside eslint's scope. Decide whether `eslint-plugin-svelte` is worth the extra dependency (docs/decisions.md §Fewer dependencies).
6. **Accessibility polish.** Mobile filter drawer has no focus trap/Escape handling; range inputs all announce as "min"/"max" without their metric name; expanded rows lack `aria-controls`.
7. **Claude digest.** *(spec §11)* Build-time pass over each shoe's pros/cons + lab commentary producing a one-line verdict and tags ("easy-day cruiser", "tempo workhorse") to make the table scannable. Adds an API key + cost to the refresh pipeline.
8. **Head-to-head compare view.** *(spec §11)* Select 2–4 shoes for a side-by-side metric comparison.
9. **Other categories.** *(spec §11)* Trail/hiking/sneakers — the pipeline is parameterised by seed shoe already; needs a category switcher in the UI and per-category datasets.
10. **Price/deal tracking.** *(spec §11)* MSRP history is implicit in git history of `data/`; surface it.
11. **Public refresh trigger.** *(spec §11)* Currently refresh buttons need repo access; an issue-ops trigger would let friends request one.
