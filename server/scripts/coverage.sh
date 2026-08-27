#!/bin/bash
#
# Copyright (c) 2026 Kevin Chen.
#
# Released under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version. See <http://www.gnu.org/licenses/> for
# details.
#
# Both suites run in their own processes, and a single c8 invocation only
# reports the first. So the raw V8 data is collected from every process and
# merged in one report afterwards.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

rm -rf coverage
mkdir -p coverage/tmp

# a failing test should still leave a report behind, so the status is carried
# to the end instead of aborting here
status=0
# the integration suite boots the whole server, which takes over the shared
# socket singleton, so it gets its own process
NODE_V8_COVERAGE=coverage/tmp npm run test-local || status=$?
NODE_V8_COVERAGE=coverage/tmp npm run test-integration || status=$?
NODE_V8_COVERAGE=coverage/tmp npm run test-dom || status=$?

# The floor sits a little under where coverage currently is, so a real regression
# fails the build while a refactor that removes a covered line does not. Coverage
# on new code is the gate that matters, and scripts/new-code-coverage.js does that.
#
# Only macOS is held to it. This is a macOS app, and it is the only platform where
# the whole suite runs: elsewhere fsevents is a stub, the directory watcher specs
# cannot pass, and the total lands around 46%, which would fail a threshold for
# reasons that have nothing to do with the change being tested.
gate=""
if [ "$(uname -s)" = "Darwin" ]; then
  gate="--check-coverage --statements=98 --branches=90 --functions=97 --lines=98"
else
  echo "not macOS: reporting coverage without holding it to a threshold" >&2
fi

npx c8 report \
  --temp-directory=coverage/tmp \
  $gate \
  --all \
  --include='src/**' \
  --include='client.ts' \
  --include='server.ts' \
  --exclude='src/vendor/**' \
  --reporter=text \
  --reporter=lcov \
  "$@"

exit $status
