#!/bin/bash

set -e

IMPORTS_TUI="index.ts style/shiki.ts nodes/image.ts"
IMPORTS="sharp"

hyperfine --warmup 3 --runs 10 "bun -e ' '"
for i in $IMPORTS; do
  hyperfine --warmup 3 --runs 10 "bun -e 'import \"$i\"'"
done
for i in $IMPORTS_TUI; do
  hyperfine --warmup 3 --runs 10 "bun -e 'import \"./src/$i\"'"
done
