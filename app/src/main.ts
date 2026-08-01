import { mount } from 'svelte';
import App from './App.svelte';
import { applyDisplay, readDisplay } from './lib/display';
import { applySavedTheme } from './lib/theme';
import './app.css';

applySavedTheme();
// Before the dataset fetch, exactly as the theme is: the ramp a runner tuned must be on the
// document by the time the first row paints, not one frame after it
// (docs/app.md §The display preferences).
applyDisplay(readDisplay());

// Storage holds preferences; the view moved to the URL for good, so this key is dead data in every
// browser that ever ran an older build. Removed here rather than left to rot, and only this one:
// keys older than it stopped being written long enough ago that enumerating them would outlive the
// sessions carrying them (docs/app.md §View and URL ownership).
try {
  localStorage.removeItem('shoe-lab.view.v4');
} catch {
  // Storage that throws has nothing to clear, and boot must not depend on it.
}

export default mount(App, { target: document.getElementById('app')! });
