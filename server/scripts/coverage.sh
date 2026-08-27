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
NODE_V8_COVERAGE=coverage/tmp npm run test-local || status=$?
NODE_V8_COVERAGE=coverage/tmp npm run test-dom || status=$?

npx c8 report \
  --temp-directory=coverage/tmp \
  --all \
  --include='src/**' \
  --include='client.ts' \
  --include='server.ts' \
  --exclude='src/vendor/**' \
  --reporter=text \
  --reporter=lcov \
  "$@"

exit $status
