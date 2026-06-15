# DOM-free simulation seam, tested in node with a real Matter engine

We are extracting the Matter.js world out of `HTMLWordCloudElement` into a
`WordCloudSimulation` that touches no DOM: the element stays the adapter that
measures word sizes (`getComputedStyle`), writes positions back as CSS
transforms, and owns the `Mouse`, while the simulation owns the engine, bodies,
forces, sensors, and the drag-lock state. The simulation and its sub-modules
(spacing, words) are exercised in a second vitest project that runs in **node
with a real Matter engine** — build an engine, add bodies, `Engine.update()`,
assert positions/forces — because the subtle bugs live in the real broadphase /
SAT / sleeping-body path.

## Considered options

- **Fake/mock bodies:** feed hand-built `Pair` and body objects to the modules.
  Faster and more isolated, but it asserts against a mock of Matter's contract,
  which drifts from real Matter behavior. Rejected — the value is in testing the
  real engine path.
- **Browser-only (status quo):** keep exercising all physics through the element
  in Playwright/Chromium. Rejected — slow, DOM-bound, and it gives the
  extractions no faster test surface, abandoning the main reason to do them.

## Consequences

- The DOM-free constraint is load-bearing: nothing in the simulation or its
  sub-modules may read the DOM. `Mouse`/`MouseConstraint` wiring is fed in from
  the element (`attachMouse(mouse)`); drag-lock behaviour is driven by
  `lockDrag`/`unlockDrag` so it stays node-testable without a pointer.
- A `node` vitest project (`*.node.test.ts`) sits alongside the existing
  `browser` project (`*.browser.test.ts`), which keeps verifying the element and
  its DOM/measurement integration.
