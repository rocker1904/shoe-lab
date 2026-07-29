<script lang="ts">
  import type { Side } from '../lib/lineage';
  import HelpPopover from './HelpPopover.svelte';

  let { counts, strike, selected, onstrike, onstory }: {
    counts: Map<string, number>; strike: Side;
    /** Derived in `Page.svelte`, never stored (docs/app.md §Presets). */
    selected: string | null;
    onstrike: (s: Side) => void; onstory: (id: string) => void;
  } = $props();

  const SIDES: { v: Side; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
  /**
   * Deliberately cheap one-liners, and deliberately not `Preset.describe`: these are read once, at
   * a glance, against each other, where `describe` is a sentence about a kind of run. BACKLOG.md
   * item 1 may change what the stories are, and rewriting four short lines is the cheap half.
   */
  const STORIES = [
    { id: 'all', label: 'All', desc: 'Everything in the catalogue' },
    { id: 'easy', label: 'Easy', desc: 'Cushioned, no carbon, affordable' },
    { id: 'tempo', label: 'Tempo', desc: 'Light, fast, affordable' },
    { id: 'race', label: 'Race', desc: 'Lightest, fastest, price no object' },
  ];

  const STRIKE_LABEL = 'Use measurements from the';
  const STORY_LABEL = 'Built for';
  // Verbatim from the design, and two things it deliberately does not do: it never says "session",
  // which is our word rather than a runner's, and it does not contrast these against the labels
  // the data ships with — the reader has no idea those exist, so denying it plants the question.
  const STRIKE_HELP = 'Stack, energy return, shock absorption and midsole width are each measured '
    + 'twice — once at the heel, once at the forefoot. Pick the end you want the table and filters '
    + 'to use. Usually that is the end you land on, but either is fine.';
  const STORY_HELP = 'Easy, Tempo and Race each set the filters, columns and sorting to suit that '
    + 'kind of run. All clears them again, and you can change anything at any point.';
</script>

<section class="strip" aria-label="Set up your table" data-testid="setup-strip">
  <div class="grid">
    <h2 class="label strike-label">{STRIKE_LABEL} <HelpPopover label={STRIKE_LABEL} body={STRIKE_HELP} /></h2>
    {#each SIDES as s (s.v)}
      <button type="button" class="card side" aria-pressed={strike === s.v} class:on={strike === s.v}
              onclick={() => onstrike(s.v)}>
        <span class="name">{s.label}</span>
        <!-- Reserved, not removed: strike does not change how many shoes exist, and a card that
             drops the slot is a different height from its neighbours. -->
        <span class="count" aria-hidden="true"></span>
      </button>
    {/each}
    <span class="divider" aria-hidden="true"></span>
    <h2 class="label story-label">{STORY_LABEL} <HelpPopover label={STORY_LABEL} body={STORY_HELP} /></h2>
    {#each STORIES as s (s.id)}
      <button type="button" class="card story" aria-pressed={selected === s.id} class:on={selected === s.id}
              onclick={() => onstory(s.id)}>
        <span class="name">{s.label}</span>
        <span class="count">{counts.get(s.id) ?? ''}</span>
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
  .strike-label { grid-column: 1 / 3; }
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
  .name { font-size: var(--t-lg); font-weight: 700; }
  /* Both lines keep their height whether or not they carry text, which is what puts every card's
     description on the same baseline — bottom-aligning them leaves them ragged, because they wrap
     to different line counts. */
  .count { min-height: 1em; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; }
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
