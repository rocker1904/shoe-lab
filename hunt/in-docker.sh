#!/bin/sh
# Runs a hunt probe inside the Playwright image — the only place WebKit can launch on this host.
# Arch has no libicu74/libxml2/libflite1, the same wall the e2e run hits
# (docs/operations.md §The e2e run needs three browsers), and this mirrors the
# `npm -w app run e2e:docker` pattern rather than inventing a second one.
#
#   sh hunt/in-docker.sh hunt/fit-boundary.mjs      # or any probe path
#
# The repo is mounted at /work, so node_modules and data/ come along; the server and the browser
# both run inside the container, so no port needs publishing. Build OUTSIDE first — probes should
# call start({ build: false }) so the container never writes to dist/.
set -e
exec docker run --rm \
  -v "$(pwd)":/work -w /work \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  --ipc=host \
  "mcr.microsoft.com/playwright:v$(node -p "require('@playwright/test/package.json').version")-noble" \
  node "$@"
