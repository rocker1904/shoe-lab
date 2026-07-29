<script lang="ts">
  import { TABLE_ANCHOR_ID } from '../lib/anchor';

  /**
   * Focus is moved here rather than left to the fragment navigation the `href` would otherwise do:
   * the query string is the view and nothing else may write to the address bar
   * (docs/app.md §View and URL ownership), so a `#shoe-table` left behind would ride along in every
   * copied link. The `href` stays because it is what makes this a link to a screen reader.
   */
  function jump(e: MouseEvent) {
    e.preventDefault();
    const target = document.getElementById(TABLE_ANCHOR_ID);
    target?.focus();
    // jsdom implements no layout and defines no `scrollIntoView`, hence the optional call.
    target?.scrollIntoView?.({ block: 'start' });
  }
</script>

<a class="skip" href="#{TABLE_ANCHOR_ID}" onclick={jump}>Skip to results</a>

<style>
  /* Off screen by transform rather than by `display: none` or a negative `left`: it has to stay
     focusable to be reachable at all, and it has to come back into view when it takes focus. */
  .skip {
    position: fixed; top: var(--s2); left: var(--s2); z-index: 40;
    padding: var(--s2) var(--s3); border: 1px solid var(--accent); border-radius: var(--r-sm);
    background: var(--surface); color: var(--text); font-size: var(--t-sm); text-decoration: none;
    transform: translateY(-250%);
  }
  .skip:focus { transform: none; }
  @media (prefers-reduced-motion: no-preference) {
    .skip { transition: transform 120ms ease-out; }
  }
</style>
