#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (name) => readFileSync(`.github/workflows/${name}`, 'utf8');
const errors = [];
const requireText = (file, text, reason) => {
  if (!read(file).includes(text)) errors.push(`${file}: ${reason}`);
};

requireText('ci.yml', '  workflow_dispatch:', 'CI must be dispatchable by token-authored refreshes');
requireText('ci.yml', '    needs: [full-suite, classic-scrollbars]',
  'deploy dispatch must wait for every CI job');
requireText('ci.yml', [
  "      github.ref == 'refs/heads/main' &&",
  "      (github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
].join('\n'), 'only eligible main CI runs may dispatch deploy');
requireText('ci.yml', [
  '          SOURCE_RUN_ID: ${{ github.run_id }}',
  '        run: gh workflow run deploy.yml --ref main -f source_run_id="$SOURCE_RUN_ID"',
].join('\n'), 'successful main CI must dispatch deploy with its own run ID');
for (const file of ['refresh-metrics.yml', 'refresh-details.yml']) {
  requireText(file, 'gh workflow run ci.yml --ref main', 'a changed refresh must dispatch CI');
  if (read(file).includes('gh workflow run deploy.yml')) {
    errors.push(`${file}: refreshes must not bypass CI by dispatching deploy directly`);
  }
}
if (/^  workflow_run:/m.test(read('deploy.yml'))) {
  errors.push('deploy.yml: token-dispatched CI cannot hand off through workflow_run');
}
requireText('deploy.yml', [
  '  workflow_dispatch:',
  '    inputs:',
  '      source_run_id:',
].join('\n'), 'deploy must require a source CI run ID');
requireText('deploy.yml', [
  '        required: true',
  '        type: string',
].join('\n'), 'the source CI run ID must be a required string');
requireText('deploy.yml', 'permissions: {}',
  'deploy must grant permissions per job only');
requireText('deploy.yml', [
  '    permissions:',
  '      actions: read',
  '    outputs:',
  '      sha: ${{ steps.source.outputs.sha }}',
].join('\n'), 'source validation must expose the proved SHA with read-only Actions access');
requireText('deploy.yml', [
  '          SOURCE_RUN_ID: ${{ inputs.source_run_id }}',
  '        run: |',
  '          if [[ ! "$SOURCE_RUN_ID" =~ ^[0-9]+$ ]]; then',
].join('\n'), 'deploy must reject a malformed source run ID before querying Actions');
requireText('deploy.yml',
  'run_json="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID")"',
  'deploy must read its source from this repository Actions API');
requireText('deploy.yml', [
  '            .path == ".github/workflows/ci.yml" and',
  '            .head_branch == "main" and',
  '            .head_repository.full_name == $repo and',
  '            (.event == "push" or .event == "workflow_dispatch")',
].join('\n'), 'deploy must admit only push/dispatch CI runs from main in this repository');
requireText('deploy.yml', [
  '            .status == "completed" and',
  '            .conclusion == "success"',
].join('\n'), 'deploy must require its source CI run to succeed');
requireText('deploy.yml',
  'gh run watch "$SOURCE_RUN_ID" --repo "$GITHUB_REPOSITORY" --exit-status',
  'deploy must observe the source CI run completing successfully');
requireText('deploy.yml', [
  '          sha="$(jq -r \'.head_sha\' <<< "$run_json")"',
  '          if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then',
].join('\n'), 'deploy must derive and validate the source run head SHA');
requireText('deploy.yml', '    needs: validate',
  'the Pages-privileged job must wait for source validation');
requireText('deploy.yml', [
  '    permissions:',
  '      contents: read',
  '      pages: write',
  '      id-token: write',
].join('\n'), 'only the deployment job may receive Pages permissions');
requireText('deploy.yml', '          ref: ${{ needs.validate.outputs.sha }}',
  'deploy must check out only the SHA derived from the validated CI run');
requireText('deploy.yml', 'name: github-pages-${{ github.run_attempt }}',
  'each deployment attempt must upload a uniquely named Pages artifact');
requireText('deploy.yml', 'artifact_name: github-pages-${{ github.run_attempt }}',
  'deploy must select the artifact uploaded by its own attempt');

for (const file of readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name))) {
  for (const [i, line] of read(file).split('\n').entries()) {
    if (!line.includes('uses: actions/')) continue;
    const use = /uses:\s+(actions\/[^@\s]+)@([^\s#]+)/.exec(line);
    if (!use || !/^[0-9a-f]{40}$/.test(use[2]) || !/# v\d+(?:\.\d+\.\d+)?\s*$/.test(line)) {
      errors.push(`${file}:${i + 1}: GitHub-owned actions must use a full commit SHA with a version comment`);
    }
  }
}

const dependabot = '.github/dependabot.yml';
if (!existsSync(dependabot)
    || !readFileSync(dependabot, 'utf8').includes('package-ecosystem: github-actions')) {
  errors.push('dependabot.yml: pinned GitHub Actions must have an automated update path');
}

if (errors.length) {
  console.error(`check:workflows failed (${errors.length}):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.error('check:workflows ok');
