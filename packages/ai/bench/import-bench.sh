#!/bin/bash

set -e

IMPORTS_AI="index.ts"
IMPORTS=""

hyperfine --warmup 3 --runs 10 "bun -e ' '"
hyperfine --warmup 3 --runs 10 "bun -e 'import {listModels} from \"./src/index.ts\"; listModels()'"
for i in $IMPORTS; do
  hyperfine --warmup 3 --runs 10 "bun -e 'import \"$i\"'"
done
for i in $IMPORTS_AI; do
  hyperfine --warmup 3 --runs 10 "bun -e 'import \"./src/$i\"'"
done
