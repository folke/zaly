#!/bin/bash

for pkg in agent ai shared tui cli; do
  count=$(bunx tsx -e "
      import * as m from './packages/$pkg/src/index.ts'
      console.log(Object.keys(m).length)
    " 2>/dev/null)
  echo "@zaly/$pkg: $count exports"
done
