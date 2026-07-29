/**
 * Id of the element `Page.svelte` wraps the table in. It carries `tabindex="-1"`, because
 * `.focus()` on a plain container is a silent no-op — the skip link needs somewhere to land
 * (docs/app.md §Columns and sorting).
 */
export const TABLE_ANCHOR_ID = 'shoe-table';
