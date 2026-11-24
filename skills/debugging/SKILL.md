---
name: Debugging
description: Use when a bug, flaky test, or unexplained behaviour needs diagnosis. Runs the repository's scientific debugging loop instead of guess-and-patch.
source: AGENT-INSTRUCTIONS/BUILDING/DEBUGGING.md
---

Follow the loop below: predict, observe, resolve, narrow, fix, verify. Temporary instrumentation
comes out again and is never committed. A fix you cannot explain is not a fix; report the
unexplained behaviour with its evidence instead of shipping a workaround.
