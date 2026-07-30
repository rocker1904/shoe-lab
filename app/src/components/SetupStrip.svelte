<script lang="ts">
  import type { Side } from '../lib/lineage';
  import HelpPopover from './HelpPopover.svelte';

  let { side, selected, onside, onstory }: {
    /** Derived in `Page.svelte`, never stored (docs/app.md §Presets). */
    side: Side | null;
    /** Derived in `Page.svelte`, never stored (docs/app.md §Presets). */
    selected: string | null;
    onside: (s: Side) => void; onstory: (id: string) => void;
  } = $props();

  const SIDES: { v: Side; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
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

  const SIDE_LABEL = 'Use measurements from the';
  const STORY_LABEL = 'Built for';
  // Verbatim from the design, and two things it deliberately does not do: it never says "session",
  // which is our word rather than a runner's, and it does not contrast these against the labels
  // the data ships with — the reader has no idea those exist, so denying it plants the question.
  const SIDE_HELP = 'Stack, energy return, shock absorption and midsole width are each measured '
    + 'twice — once at the heel, once at the forefoot. Pick the end you want the table and filters '
    + 'to use. Usually that is the end you land on, but either is fine.';
  const STORY_HELP = 'Easy, Tempo and Race each rank the shoes on measurements chosen for that '
    + 'kind of run, and set the columns to match. All clears them again, and you can change '
    + 'anything at any point.';
</script>

<section class="strip" aria-label="Set up your table" data-testid="setup-strip">
  <div class="grid">
    <h2 class="label side-label">{SIDE_LABEL} <HelpPopover label={SIDE_LABEL} body={SIDE_HELP} /></h2>
    {#each SIDES as s (s.v)}
      <button type="button" class="card side" aria-pressed={side === s.v} class:on={side === s.v}
              onclick={() => onside(s.v)}>
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
           font-size: var(--t-sm); font-weight: 600; color: var(--text-dim); }
  .side-label { grid-column: 1 / 3; }
  .story-label { grid-column: 4 / -1; }
  /* `--divider`, not `--border`: a border-coloured hairline is invisible against `--chrome`. */
  .divider { grid-column: 3; grid-row: 1 / 3; background: var(--divider); }
  .card {
    grid-row: 2; display: flex; flex-direction: column; gap: var(--s1); cursor: pointer;
    padding: var(--s3); border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface); color: var(--text); font: inherit; text-align: left;
  }
  .card:hover { border-color: var(--accent); background: var(--accent-dim); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  /* Not colour alone: the chosen card is also the only one carrying aria-pressed. */
  .card.on { border-color: var(--accent); border-width: 2px; padding: calc(var(--s3) - 1px); background: var(--accent-dim); }
  /* The name line keeps its height whether or not the card carries a description, which is what
     puts every description on the same baseline — bottom-aligning them leaves them ragged, because
     they wrap to different line counts. */
  .name { min-height: 1em; font-size: var(--t-lg); font-weight: 700; }
  .desc { font-size: var(--t-xs); color: var(--text-dim); line-height: 1.35; }
  .side { text-align: center; }
  .side .name { text-align: center; }
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
