#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(`.github/workflows/${name}`, 'utf8');
const errors = [];
const requireText = (file, text, reason) => {
  if (!read(file).includes(text)) errors.push(`${file}: ${reason}`);
};

requireText('ci.yml', '  workflow_dispatch:', 'CI must be dispatchable by token-authored refreshes');
for (const file of ['refresh-metrics.yml', 'refresh-details.yml']) {
  requireText(file, 'gh workflow run ci.yml --ref main', 'a changed refresh must dispatch CI');
  if (read(file).includes('gh workflow run deploy.yml')) {
    errors.push(`${file}: refreshes must not bypass CI by dispatching deploy directly`);
  }
}
if (/^  workflow_dispatch:/m.test(read('deploy.yml'))) {
  errors.push('deploy.yml: deploy must only follow a successful CI workflow_run');
}
requireText('deploy.yml', "if: github.event.workflow_run.conclusion == 'success'",
  'deploy must require a successful CI conclusion');

if (errors.length) {
  console.error(`check:workflows failed (${errors.length}):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.error('check:workflows ok');
