<script lang="ts">
  import type { ShoesFile } from '../../shared/types.js';

  let { data }: { data: ShoesFile } = $props();
</script>

<main>
  <h1>Shoe Lab</h1>
  <p>{data.shoes.length} shoes loaded.</p>
</main>
