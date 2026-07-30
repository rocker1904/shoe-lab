# Project-wide decisions

Only decisions that shape the whole project live here. Subsystem decisions
live in the owning doc's `## Decisions` section — enumerate them all with
`grep -rn '^## Decisions' docs/`.

## Decisions

### Git is the database
Datasets are committed JSON/CSV under `data/`, canonically serialised
(sorted keys, stable ordering) so refreshes diff meaningfully and history is
free. Refresh = scrape → validate → commit → deploy; a failed validation
means a red workflow and untouched data, never a partial write. Agents must
not hand-edit `data/` — fix the pipeline and re-run it.

### Linear history, no merge commits (2026-07-27)
`main` is a straight line: branches rebase onto it and land by fast-forward,
never `git merge` producing a merge commit. The reason is the same one that
makes `data/` a database — history is the audit trail. A data commit is only
legible as "these shoes changed" if it sits in a sequence where every commit
has one parent; merge commits fold two dataset states together and
`git log -- data/` stops answering when a value changed. It also keeps
`git bisect` meaningful across a refresh. Rebase the branch, resolve conflicts
there, run `npm run verify` on the rebased tip, then fast-forward. Do not
"preserve context" with a merge commit — the branch's own commits carry it.

### Be a good citizen toward RunRepeat (2026-07-26)
This project exists on top of RunRepeat's affiliate-funded lab work, so the
posture is: minimum requests, honest identification, visible attribution.
All live traffic goes through one throttled client with a contact URL in the
User-Agent (docs/scraping.md §Politeness). `api.runrepeat.com` robots.txt is
`Disallow: /`; the user decided to use the API anyway, on the reasoning that
it is the same public unauthenticated endpoint the site's own frontend calls
for every visitor, `Disallow: /` on an API subdomain conventionally means
index-hygiene rather than access policy, and the robots-literal alternative
(page scraping) is ~7x more load on them. The main site's robots.txt IS
honoured and re-checked before every crawl. Agents must not raise request
rates, add concurrency, or widen scraping scope without a user decision.

### Frozen scores and live thresholds (2026-07-30)
The market-relative convention above is right for a **bound** and wrong for a
**score**. "As much stack as most of the fleet" is a claim about the fleet, so it
must move with the fleet; "how well does this shoe tolerate repetition" is a claim
about the shoe, and a number that drifts because the catalogue grew is a bug.
So every constant in a scoring function — references, caps, spread divisors and
display anchors alike — is **derived once and frozen**, and a score is comparable
across refreshes and may read above 100 as shoes improve
(docs/app.md §The Easy score). Agents must not "fix" a frozen constant by
recomputing it from the loaded fleet, and must not renormalise a score's scale so
its top is always 100: both reintroduce exactly the drift freezing removes.
Rederiving the set is a deliberate act — edit the constants, say so in the commit,
and expect every published score to move.

### Testing bar: adversarial, no live network
Every module has tests that attack its failure modes (hostile URL states,
sanitiser breakouts, boundary-exact gates), not just happy paths. Coverage
thresholds (lines ≥90, branches ≥85 on scraper src and app lib) are enforced
by `test:coverage` in CI. No test may touch the live site — fixtures were
captured once and are committed; the monthly contract-drift workflow is the
only sanctioned recurring live check besides refreshes.

### Fewer dependencies
Scraper has zero runtime dependencies (devalue decoder and robots parser are
vendored); the app ships Svelte only. Adding a dependency is a decision, not
a convenience — record it here or in the owning doc's Decisions section.

### eslint-plugin-svelte is adopted, tuned rather than wholesale (2026-07-27)
`.svelte` files are linted as well as typechecked. The plugin was weighed
against §Fewer dependencies and adopted on cost, not on findings: it caught no
existing bug, but it costs 12 dev-only packages, ships nothing to users, and
its steady-state noise is zero once tuned. It contributes nothing to
accessibility — the recommended set has no a11y rules and Svelte's own compiler
already emits those through svelte-check — so do not reach for it there.
`svelte/prefer-svelte-reactivity` is off: it cannot see that a `Map` built and
consumed inside one `$derived.by` is never mutated afterwards.
`svelte/no-at-html-tags` is on with two inline disables at the sanctioned sinks,
which is deliberate — it makes a binding invariant machine-checked and puts
docs/app.md §Sanitised-HTML boundary at the code site.

### Free tools only (2026-07-27)
Every moving part runs on a free tier: GitHub Actions, GitHub Pages, and
RunRepeat's public endpoints. The project holds no API keys, has no runtime
cost, and nothing about it should ever need a card. Claude Code is the one
paid tool involved, and it belongs to the author, not the pipeline — an agent
may use it to *author* a change, never to *run* one. So a proposal that adds
per-run cost — an LLM pass over the dataset, hosted storage, a paid data
source — is out of scope by default. If one is ever worth it, that is a user
decision recorded here first.

### Doc system (2026-07-27)
Docs follow an agent-first contract (docs/README.md), deliberately small: no
separate live-state doc because `main` deploys continuously (merged == live,
deploy lag ~1 min); aspiration consolidated in BACKLOG.md. The build-time
spec and plan under `docs/superpowers/` are frozen artifacts — docs/ wins on
any disagreement.

Four domain docs, not the original three. docs/shoe-stories.md earns its own
file because the reasoning behind a preset threshold is neither a frontend
contract nor a scraping fact — it is what a runner means by an easy or a tempo
session. It took real effort to articulate, every threshold in the app descends
from it, and folding it into docs/app.md would put training physiology inside a
document about view state. A fifth doc needs the same test: a body of knowledge
that is expensive to reconstruct and that no existing doc can own without
distorting its own subject.
