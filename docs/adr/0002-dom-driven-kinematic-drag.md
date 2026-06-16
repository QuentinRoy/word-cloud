# DOM-driven kinematic drag, replacing Matter's MouseConstraint

Dragging no longer goes through Matter's `Mouse`/`MouseConstraint`. The grab is
initiated from a DOM `pointerdown` on the word element, the dragged body is
kinematically pinned to the pointer (`Body.setPosition`, no spring), and on
release the word is thrown with a velocity sampled from the pointer's recent
motion. A new element-owned, sim-agnostic `DragController` recognises the
gesture; the DOM-free `WordCloudSimulation` exposes `grabWord` / `moveWord` /
`releaseWord` and owns no input device. This fixes #39 and #66 and makes drag
motion node-testable.

This revisits the drag mechanism in
[ADR-0001](0001-dom-free-simulation-seam.md): the element's `Mouse` and the
sim's `MouseConstraint` are gone. The DOM-free seam itself is unchanged and in
fact tightens — the last Matter DOM-bound object leaves the simulation.

## Why

- **#39 (grab offset).** `MouseConstraint` runs its own geometric hit-test on
  the pointer, independent of the DOM `grab` cursor; the two can disagree.
  Initiating the grab from `pointerdown` on the `x-word` host — which retargets
  through the closed shadow roots to exactly the element the cursor is on —
  makes the grab hit-test *identical* to the cursor by construction. There is no
  second test left to disagree.
- **#66 (backward throw).** With the spring (`stiffness: 0.3`) the body lagged
  the pointer, and release kept that lagged physics velocity. The kinematic pin
  carries no velocity of its own; the throw is the pointer's velocity over a
  short trailing window, applied explicitly on release.

## Considered options

- **Keep `MouseConstraint`, stiffen the spring and sample velocity on release.**
  Narrows #66 but does not remove the lag, and leaves #39 untouched — the
  geometric hit-test still disagrees with the cursor. Rejected.
- **Keep Matter's geometric hit-test for the grab, add DOM only for the throw.**
  #39 is fundamentally two independent hit-tests; keeping Matter's keeps the
  disagreement. Rejected.
- **Remove the body from the world while dragged.** Matches "removed from the
  simulation" literally, but pulls the body's paired sensor into the change and
  forces position/inertia/mask reconciliation on release. Pinning an in-world,
  inert (drag-locked) body is observably identical with far less surgery.
  Rejected.

## Consequences

- Intent crosses the seam as kinematic verbs plus a px/ms throw; the sim owns
  the Matter-unit conversion (`· 1000/60`) and gates the throw on its own
  `#isRunning`, so "release while paused = place, no throw" lives with the
  runner state rather than leaking into the controller or element.
- Dragging while `physics-paused` becomes defined behaviour (the word follows
  the pointer; release places it with no momentum) where it was previously an
  effective no-op.
- `onWordGrab` / `onWordRelease` are removed: the element initiates the grab, so
  it mirrors DOM state directly instead of being notified back by the sim.
- Single active drag. Multi-touch is a purely additive follow-up — the per-id
  API already supports it.
- A grabbed word must be woken, fitting the sleeping-body interplay the sim
  already manages.
