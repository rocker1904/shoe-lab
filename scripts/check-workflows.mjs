#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (name) => readFileSync(`.github/workflows/${name}`, 'utf8');
const errors = [];
const requireText = (file, text, reason) => {
  if (!read(file).includes(text)) errors.push(`${file}: ${reason}`);
};
const count = (text, pattern) => [...text.matchAll(pattern)].length;
const indentOf = (line) => /^ */.exec(line)[0].length;
const block = (text, key, indent) => {
  const lines = text.split('\n');
  const header = `${' '.repeat(indent)}${key}:`;
  const start = lines.findIndex((line) => line === header || line.startsWith(`${header} `));
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() && !line.trimStart().startsWith('#') && indentOf(line) <= indent) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
};
const keysAt = (text, indent) => {
  const key = new RegExp(`^ {${indent}}([A-Za-z0-9_-]+):(?:\\s.*)?$`);
  return text.split('\n').flatMap((line) => key.exec(line)?.[1] ?? []);
};
const sameMembers = (actual, expected) => (
  actual.length === expected.length && actual.every((value) => expected.includes(value))
);
const requireIn = (file, scope, text, reason) => {
  if (!scope.includes(text)) errors.push(`${file}: ${reason}`);
};

const ci = read('ci.yml');
const ciJobs = keysAt(block(ci, 'jobs', 0), 2);
const dispatch = block(ci, 'dispatch-deploy', 2);
const needs = /^ {4}needs:\s*\[([^\]]*)\]\s*$/m.exec(dispatch)?.[1]
  .split(',').map((name) => name.trim()).filter(Boolean) ?? [];

requireText('ci.yml', '  workflow_dispatch:', 'CI must be dispatchable by token-authored refreshes');
if (!ciJobs.includes('dispatch-deploy')
    || !sameMembers(needs, ciJobs.filter((name) => name !== 'dispatch-deploy'))) {
  errors.push('ci.yml: deploy dispatch must wait for every other CI job');
}
requireIn('ci.yml', dispatch, [
  "      github.ref == 'refs/heads/main' &&",
  "      (github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
].join('\n'), 'only eligible main CI runs may dispatch deploy');
requireIn('ci.yml', dispatch, [
  '    permissions:',
  '      actions: write',
].join('\n'), 'only the dispatch job may receive Actions write access');
requireIn('ci.yml', dispatch, [
  '          SOURCE_RUN_ID: ${{ github.run_id }}',
  '        run: gh workflow run deploy.yml --ref main -f source_run_id="$SOURCE_RUN_ID"',
].join('\n'), 'successful main CI must dispatch deploy with its own run ID');
if (count(ci, /gh workflow run deploy\.yml/g) !== 1) {
  errors.push('ci.yml: CI must have exactly one Deploy dispatch path');
}
if (count(ci, /^\s+actions: write$/gm) !== 1 || /^(?:\s+)?(?:pages|id-token): write$/m.test(ci)) {
  errors.push('ci.yml: CI permissions must be limited to the one Actions dispatch grant');
}
for (const file of ['refresh-metrics.yml', 'refresh-details.yml']) {
  requireText(file, 'gh workflow run ci.yml --ref main', 'a changed refresh must dispatch CI');
  if (read(file).includes('gh workflow run deploy.yml')) {
    errors.push(`${file}: refreshes must not bypass CI by dispatching deploy directly`);
  }
}

const deployWorkflow = read('deploy.yml');
const deployTriggers = keysAt(block(deployWorkflow, 'on', 0), 2);
const deployInputs = keysAt(block(deployWorkflow, 'inputs', 4), 6);
const deployJobs = keysAt(block(deployWorkflow, 'jobs', 0), 2);
const validate = block(deployWorkflow, 'validate', 2);
const deploy = block(deployWorkflow, 'deploy', 2);

if (/^  workflow_run:/m.test(deployWorkflow)) {
  errors.push('deploy.yml: token-dispatched CI cannot hand off through workflow_run');
}
if (!sameMembers(deployTriggers, ['workflow_dispatch'])) {
  errors.push('deploy.yml: Deploy must expose only the proved workflow dispatch trigger');
}
if (!sameMembers(deployInputs, ['source_run_id'])) {
  errors.push('deploy.yml: source_run_id must be the only caller input');
}
if (!sameMembers(deployJobs, ['validate', 'deploy'])) {
  errors.push('deploy.yml: Deploy must contain only validation and publication jobs');
}
requireIn('deploy.yml', block(deployWorkflow, 'source_run_id', 6), [
  '        required: true',
  '        type: string',
].join('\n'), 'the source CI run ID must be a required string');
requireText('deploy.yml', 'permissions: {}',
  'deploy must grant permissions per job only');
requireIn('deploy.yml', validate, [
  '    permissions:',
  '      actions: read',
  '    outputs:',
  '      sha: ${{ steps.source.outputs.sha }}',
].join('\n'), 'source validation must expose the proved SHA with read-only Actions access');
requireIn('deploy.yml', validate, [
  '          SOURCE_RUN_ID: ${{ inputs.source_run_id }}',
  '        run: |',
  '          if [[ ! "$SOURCE_RUN_ID" =~ ^[0-9]+$ ]]; then',
].join('\n'), 'deploy must reject a malformed source run ID before querying Actions');
requireIn('deploy.yml', validate,
  'run_json="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID")"',
  'deploy must read its source from this repository Actions API');
requireIn('deploy.yml', validate, [
  '            .path == ".github/workflows/ci.yml" and',
  '            .head_branch == "main" and',
  '            .head_repository.full_name == $repo and',
  '            (.event == "push" or .event == "workflow_dispatch")',
].join('\n'), 'deploy must admit only push/dispatch CI runs from main in this repository');
requireIn('deploy.yml', validate, [
  '            .status == "completed" and',
  '            .conclusion == "success"',
].join('\n'), 'deploy must require its source CI run to succeed');
requireIn('deploy.yml', validate,
  'gh run watch "$SOURCE_RUN_ID" --repo "$GITHUB_REPOSITORY" --exit-status',
  'deploy must observe the source CI run completing successfully');
requireIn('deploy.yml', validate, [
  '          sha="$(jq -r \'.head_sha\' <<< "$run_json")"',
  '          if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then',
].join('\n'), 'deploy must derive and validate the source run head SHA');
requireIn('deploy.yml', deploy, '    needs: validate',
  'the Pages-privileged job must wait for source validation');
requireIn('deploy.yml', deploy, [
  '    permissions:',
  '      contents: read',
  '      pages: write',
  '      id-token: write',
].join('\n'), 'only the deployment job may receive Pages permissions');
requireIn('deploy.yml', deploy, '          ref: ${{ needs.validate.outputs.sha }}',
  'deploy must check out only the SHA derived from the validated CI run');
requireIn('deploy.yml', deploy, 'name: github-pages-${{ github.run_attempt }}',
  'each deployment attempt must upload a uniquely named Pages artifact');
requireIn('deploy.yml', deploy, 'artifact_name: github-pages-${{ github.run_attempt }}',
  'deploy must select the artifact uploaded by its own attempt');
if (count(deployWorkflow, /uses:\s+actions\/checkout@/g) !== 1
    || count(deployWorkflow, /^\s+ref:/gm) !== 1) {
  errors.push('deploy.yml: Deploy must have exactly one verified checkout path');
}
if (count(deployWorkflow, /^\s+pages: write$/gm) !== 1
    || count(deployWorkflow, /^\s+id-token: write$/gm) !== 1
    || validate.includes('pages: write') || validate.includes('id-token: write')) {
  errors.push('deploy.yml: Pages permissions must exist only in the validated publication job');
}
if (count(deployWorkflow, /uses:\s+actions\/upload-pages-artifact@/g) !== 1
    || count(deployWorkflow, /uses:\s+actions\/deploy-pages@/g) !== 1
    || !deploy.includes('uses: actions/upload-pages-artifact@')
    || !deploy.includes('uses: actions/deploy-pages@')) {
  errors.push('deploy.yml: the validated job must own the only Pages publication path');
}

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
