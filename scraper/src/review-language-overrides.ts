export interface ReviewLanguageOverride { language: string; note: string }

/**
 * Reviews RunRepeat published in a language other than the page's own en-GB. There is no other
 * page to fetch — the canonical URL, the `lang` attribute and the section headings are all
 * English, only the prose is not — so the language is recorded and the app labels it rather than
 * anything being hidden or translated (docs/scraping.md §Review language). Hand-maintained.
 */
export const REVIEW_LANGUAGE_OVERRIDES: Record<string, ReviewLanguageOverride> = {
  'brooks-ghost-16': {
    language: 'es',
    note: 'Intro, pros and cons are Spanish: "Las Brooks Ghost 16 representan una evolución sutil pero positiva en la serie".',
  },
  'new-balance-fuel-cell-super-comp-pacer-v-2': {
    language: 'es',
    note: 'Intro, pros and cons are Spanish: "En nuestra opinión, las New Balance FuelCell SuperComp Pacer v2 ofrecen una pisada divertida".',
  },
};
