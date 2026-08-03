/**
 * A bare arrival — the address carries nothing this app owns, so the table opens on the defaults.
 * It is a fresh start rather than a first visit: view state lives in the URL and nowhere else, so a
 * runner who filtered last week and returns to the bare address gets the default table again
 * (docs/app.md §View and URL ownership).
 *
 * **A token this app does not own is not "something sent".** A link forwarded through a newsletter
 * or a chat app arrives wearing `utm_source`, `fbclid` and friends; none of them says anything
 * about the fleet, and a runner who followed one must get the arrival they would have got from the
 * bare address — the same table and the same strip. Init scrubs them out of the address bar in the
 * same breath (docs/app.md §View and URL ownership).
 *
 * Two things key off this and they have to answer alike: the setup strip opens on it
 * (docs/app.md §The setup strip), and the loading placeholder reserves the strip's height for it
 * (docs/app.md §Decisions). Written once here rather than in each caller, because a placeholder
 * reserving a strip the page then did not draw would be the very jump it exists to prevent.
 */

/**
 * Every query key this app can emit, so a key outside it cannot survive parsing whatever its value.
 * `r.`, `c.` and `gen.` are prefixes; the rest are whole names. `open` is here too — it is not view
 * state, but a link that names a shoe to read carried an intention and is not a fresh start
 * (docs/app.md §URL encoding).
 *
 * This is the URL grammar's second home, and it has to be added to in the same breath as
 * `serializeView`: a token the app emits but does not list here makes its own links read as bare
 * arrivals, which opens the setup strip on a link that plainly sent something.
 */
const OWNED = /^(?:r\.|c\.|gen\.)|^(?:plate|after|brands|q|disc|missing|stab|sort|rows|cols|open|zone|story)$/;

/**
 * `address` is a query string with no leading `?`. `Page.svelte` passes the **canonical** one it has
 * just composed, where this reduces exactly to "is it empty"; `App.svelte` has no dataset yet and
 * passes the raw one, where it is the same question asked of what the address *carries*. One rule,
 * two addresses.
 *
 * The residue between the two is exactly an owned key whose value parsing then drops — `?plate=xyz`,
 * say. The placeholder reserves no strip there and the page draws one, which is one layout shift on
 * a hand-mangled link; making it exact would need the catalogue, which is the thing the placeholder
 * is waiting for.
 */
export function isBareArrival(address = location.search.replace(/^\?/, '')): boolean {
  return [...new URLSearchParams(address).keys()].every((k) => !OWNED.test(k));
}
