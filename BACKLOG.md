# Backlog

Ordered roughly by priority. Items marked *(final review)* came out of the pre-merge whole-branch review; *(spec §11)* are the roadmap items deferred from the original design.

1. **Refine the filter presets.** The three stories to get right are **Easy, Tempo and Race** — each should produce a shortlist a runner would recognise. Wide-toebox is not a story in itself: drop it as a preset and let people set their own toebox ranges on top of whichever preset they pick. Remaining to define: what each story means in thresholds (e.g. is Race carbon-only; does Tempo admit race shoes; how hard Easy filters softness vs stack). See docs/app.md §Presets for where thresholds live and how a preset behaves. Note `midsole-softness-22` covers only 50 % of the fleet, so a preset bounding it silently halves the candidate set.
2. **CSV date-precision column.** *(final review)* `shoes.csv` and the in-app export emit year-derived dates with nothing marking them imprecise; add a `preciseReleaseDate` column (schema addition — semantics in docs/scraping.md §Release-year supplement).
3. **Back/forward navigation.** `popstate` is unhandled, so Back doesn't restore the previous view. Must be worked through against docs/app.md §View and URL ownership rather than around it.
4. **Svelte component linting.** `.svelte` files are typechecked (svelte-check) but outside eslint's scope. Decide whether `eslint-plugin-svelte` is worth the extra dependency (docs/decisions.md §Fewer dependencies).
5. **Accessibility polish.** Mobile filter drawer has no focus trap/Escape handling; range inputs all announce as "min"/"max" without their metric name; expanded rows lack `aria-controls`.
6. **Head-to-head compare view.** *(spec §11)* Select 2–4 shoes for a side-by-side metric comparison.
7. **Other categories.** *(spec §11)* Trail/hiking/sneakers — the pipeline is parameterised by seed shoe already; needs a category switcher in the UI and per-category datasets. Each details record already carries the per-shoe `categorySlug` this would key on (docs/scraping.md §Non-running shoes), which currently only ever excludes.
8. **Price/deal tracking.** *(spec §11)* MSRP history is implicit in git history of `data/`; surface it.
9. **Public refresh trigger.** *(spec §11)* Currently refresh buttons need repo access; an issue-ops trigger would let friends request one.
