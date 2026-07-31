<script lang="ts">
  import type { Zone } from '../lib/lineage';
  import HelpPopover from './HelpPopover.svelte';

  let { zone, selected, onzone, onstory }: {
    /** Derived in `Page.svelte`, never stored (docs/app.md §Presets). */
    zone: Zone | null;
    /** Derived in `Page.svelte`, never stored (docs/app.md §Presets). */
    selected: string | null;
    onzone: (s: Zone) => void; onstory: (id: string) => void;
  } = $props();

  const ZONES: { v: Zone; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
  /**
   * The only story copy a runner reads, and the reason `Preset` carries no description of its own:
   * these are read once, at a glance, against each other. They name what each score ranks on, so
   * they go stale the moment a story's terms change — which is why they are four short lines.
   */
  const STORIES = [
    { id: 'all', label: 'All', desc: 'Everything in the catalogue' },
    { id: 'easy', label: 'Easy', desc: 'Cushioned, durable, no carbon' },
    { id: 'tempo', label: 'Tempo', desc: 'Lively, light, lasts the season' },
    { id: 'race', label: 'Race', desc: 'Fastest, lightest, one day only' },
  ];

  // Describes where the reading was taken, not how the runner lands: naming a strike would claim
  // a self-diagnosis the tool cannot check (docs/app.md §The zone is a preset too).
  const ZONE_LABEL = 'Measured at';
  const STORY_LABEL = 'Built for';
  // Verbatim from the design, and two things it deliberately does not do: it never says "session",
  // which is our word rather than a runner's, and it does not contrast these against the labels
  // the data ships with — the reader has no idea those exist, so denying it plants the question.
  const ZONE_HELP = 'Stack, energy return, shock absorption and midsole width are each measured '
    + 'twice — once at the heel, once at the forefoot. Pick the end you want the table and filters '
    + 'to use. Usually that is the end you land on, but either is fine.';
  const STORY_HELP = 'Easy, Tempo and Race each rank the shoes on measurements chosen for that '
    + 'kind of run, and set the columns to match. All clears them again, and you can change '
    + 'anything at any point.';
</script>

<section class="strip" aria-label="Set up your table" data-testid="setup-strip">
  <div class="grid">
    <h2 class="label zone-label">{ZONE_LABEL} <HelpPopover label={ZONE_LABEL} body={ZONE_HELP} /></h2>
    {#each ZONES as s (s.v)}
      <button type="button" class="card zone" aria-pressed={zone === s.v} class:on={zone === s.v}
              onclick={() => onzone(s.v)}>
        <span class="name">{s.label}</span>
      </button>
    {/each}
    <span class="divider" aria-hidden="true"></span>
    <h2 class="label story-label">{STORY_LABEL} <HelpPopover label={STORY_LABEL} body={STORY_HELP} /></h2>
    {#each STORIES as s (s.id)}
      <button type="button" class="card story" aria-pressed={selected === s.id} class:on={selected === s.id}
              onclick={() => onstory(s.id)}>
        <span class="name">{s.label}</span>
        <span class="desc">{s.desc}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .strip { padding: var(--s4) var(--s5) var(--s5); background: var(--chrome); border-bottom: 1px solid var(--border); }
  /* Six equal `1fr` cards with the group divider in a track of its own, so the line lands in the
     gutter without any card being resized to make room for it. */
  .grid {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) 1px repeat(4, minmax(0, 1fr));
    grid-template-rows: auto auto; gap: var(--s2) var(--s3); align-items: stretch;
  }
  .label { grid-row: 1; margin: 0; display: flex; align-items: center; gap: var(--s2);
           font-size: var(--t-xs); font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
           color: var(--text-dim); }
  .zone-label { grid-column: 1 / 3; }
  .story-label { grid-column: 4 / -1; }
  /* `--divider`, not `--border`: a border-coloured hairline is invisible against `--chrome`. */
  .divider { grid-column: 3; grid-row: 1 / 3; background: var(--divider); }
  .card {
    grid-row: 2; display: flex; flex-direction: column; gap: var(--s1); cursor: pointer;
    padding: var(--s3); border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface); color: var(--text); font: inherit; text-align: left;
  }
  /* Border only. Filling on hover made a hovered card identical to the chosen one. */
  .card:hover { border-color: var(--accent); }
  /* Tinted with a hairline border rather than filled, and not colour alone — the chosen card is
     also the only one carrying aria-pressed. Two cards are lit at once here, a zone and a story,
     and a filled pair would put two loud blocks on the one screen the strip owns, even though the
     toolbar it hands over to does fill its selected pill. `app.css` owns the focus ring.
     The name keeps `--text` and the border carries "chosen": `--accent` on `--accent-dim` is
     4.19:1 in light and 3.28:1 in dark, and a 700-weight 16.8px name is not large text. The
     description keeps `--text-dim`, which is held to 4.5:1 against this tint in wash.test.ts —
     that is the reason the token was retuned rather than this rule given a colour of its own. */
  .card.on { border-color: var(--accent); background: var(--accent-dim); }
  /* The name line keeps its height whether or not the card carries a description, which is what
     puts every description on the same baseline — bottom-aligning them leaves them ragged, because
     they wrap to different line counts. */
  .name { min-height: 1em; font-size: var(--t-lg); font-weight: 700; }
  .desc { font-size: var(--t-xs); color: var(--text-dim); line-height: 1.35; }
  /* The zone cards carry no description, so their name centres in a box the story cards size. The
     alignment is inherited by the name rather than restated on it: `.zone` and `.card` are the same
     specificity and this rule is the later one, so it wins outright. */
  .zone { text-align: center; justify-content: center; }
  /* Six in a row is a desktop layout; on a phone each group becomes two columns at full card size.
     It costs the first screen, which is affordable exactly because the strip appears once. */
  @media (max-width: 699px) {
    .strip { padding: var(--s3); }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: none; }
    .label, .card, .divider { grid-row: auto; }
    .label, .divider { grid-column: 1 / -1; }
    .divider { height: 1px; }
  }
</style>
