<!-- The script block takes no props and exists only so `svelte-check` types this module: without a
     `lang="ts"` script, every importer is told the component implicitly has type `any`. -->
<script lang="ts"></script>

<!-- Neutral, not red: red is error semantics and this is metadata. Dimming or alarming the row would
     argue against the `discontinued=only` filter, which exists because those shoes are worth finding
     (docs/app.md §Table presentation).
     One component rather than a copy per table, and that is the whole point: the two renderings had
     drifted into a bordered chip on the desktop and a bare `· discontinued` on the phone, under a
     comment claiming they matched. A shared component cannot say one thing and do another. -->
<span class="disc-tag">discontinued</span>

<style>
  .disc-tag { margin-left: var(--s2); font-size: var(--t-xs); letter-spacing: 0.06em;
              text-transform: uppercase; color: var(--text-dim); border: 1px solid var(--border);
              border-radius: var(--r-sm); padding: 0 var(--s1); white-space: nowrap; }
</style>
