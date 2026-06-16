# Plan: DOM-driven kinematic drag (fix #66 and #39)

> **Status:** complete
> **See also:** [`docs/adr/0002-dom-driven-kinematic-drag.md`](../../adr/0002-dom-driven-kinematic-drag.md)
> (the decision + rejected alternatives),
> [`docs/adr/0001-dom-free-simulation-seam.md`](../../adr/0001-dom-free-simulation-seam.md)
> (the seam this builds on), [`CONTEXT.md`](../../../CONTEXT.md) (glossary — adds
> _Grab_, _Drag_, _Release_, _Throw_),
> [`docs/plans/active/2026-06-16-grab-anchored-word-scaling.md`](./2026-06-16-grab-anchored-word-scaling.md)
> (DOM visual follow-up for scaling from the local grab point). Fixes
> [#66](https://github.com/QuentinRoy/word-cloud/issues/66) and
> [#39](https://github.com/QuentinRoy/word-cloud/issues/39).

## Goal

Replace Matter's `Mouse`/`MouseConstraint` drag with our own DOM-driven drag: a
new element-owned `DragController` recognises the gesture from pointer events and
drives the DOM-free [`WordCloudSimulation`](../../../lib/word-cloud-simulation.ts)
through kinematic verbs. This fixes the two long-standing drag bugs at their root
and makes drag motion node-testable.

Unlike the behaviour-preserving extraction/seam refactors that enabled it, this
change is **consumer-facing** — it fixes #39 and #66 and defines drag-while-paused
— so it ships **with a changeset**.

## Progress snapshot

All steps shipped:

- `CONTEXT.md` now distinguishes _Grab_ (local contact/anchor) from _Drag_ (full
  gesture), matching this plan's language.
- Element-facing visual state was aligned from `dragged` to `grabbed`
  (`HTMLWordElement` attribute + CSS selectors/variables).
- This plan now links the DOM-only visual follow-up
  (`2026-06-16-grab-anchored-word-scaling.md`) that builds on the same grab
  semantics.
- **Step 1 (9997673):** `WordCloudSimulation` gained `grabWord`/`moveWord`/`releaseWord`;
  node tests cover all three verbs plus drag-lock invariants.
- **Step 2 (a76afc4):** `DragController` added; element rewired through it; `Mouse`/
  `MouseConstraint`/`attachMouse`/`setMouseEnabled`/`onWordGrab`/`onWordRelease` deleted;
  browser gesture tests added. Changeset included.
- **Fix (8291f79 + current):** `resolveWord` switched from `event.target` to
  `elementFromPoint(clientX, clientY)` — the event-target approach silently failed
  when pointer events are dispatched on the container (synthetic tests and real
  bubbling). Hit-testing by coordinates is robust in both cases.

### The two bugs, and why this fixes them

- **#39 — grab offset.** `MouseConstraint` runs its own geometric hit-test on the
  pointer, independent of the DOM `grab` cursor; they can disagree. Initiating the
  grab from `pointerdown` on the `x-word` host (which retargets through the closed
  shadow roots to exactly the element the cursor is on) makes the grab hit-test
  *identical* to the cursor by construction — no second test to disagree.
- **#66 — backward throw.** The spring (`stiffness: 0.3`) let the body lag the
  pointer, and release kept that lagged velocity. The kinematic pin carries no
  velocity of its own; the throw is sampled from the pointer's recent motion and
  applied explicitly on release.

## Steps

| Step | What | Changeset | Status |
|------|------|-----------|--------|
| 1 | Sim gains the kinematic drag API (`grabWord`/`moveWord`/`releaseWord`) with node tests; the `MouseConstraint` path stays in place | no | ✓ done (9997673) |
| 2 | Add `DragController`; rewire the element to drive the sim through it; delete `Mouse`/`MouseConstraint`/`attachMouse`/`setMouseEnabled`/`onWordGrab`/`onWordRelease`; browser gesture tests | yes | ✓ done (a76afc4) |

## Decisions

- **A dragged word is pinned to the pointer and inert** — drag-lock + `Body.setPosition`,
  **never leaving the world**. Its paired sensor keeps tracking it harmlessly and
  release needs no reconciliation. "Removed from the simulation" means *inert*,
  not literally removed.
- **Grab is DOM-initiated** via `elementFromPoint(clientX, clientY)` on `pointerdown`,
  pointer-captured, with the **grab offset preserved** so the word does not lurch to
  the pointer. (`event.target` was discarded — it equals the container when pointer
  events are dispatched on the container, which breaks both synthetic tests and real
  bubbling. Coordinate hit-test is robust in all cases.)
- **The throw crosses the seam as px/ms**; the sim converts (`· 1000/60`) and gates
  it on `#isRunning`. The body carries **zero velocity during a drag** (`grabWord`
  zeroes the linear velocity so the pin can't drift), so the release velocity is
  entirely the injected sample (running) or zero (paused).
- **The `DragController` is sim-agnostic** and port-wired, matching the
  `Word`-callback / `SpacingModel`-accessor style. **No `physics-paused` branch
  lives outside the sim** — `onMove` always paints, and `releaseWord` owns the gate.
- **Single active drag**; the per-id sim API leaves multi-touch additive.
- **`toContainerPoint` reuses the `#updateMouseScale` derivation** (computed-style
  layout size vs. `getBoundingClientRect`), which stops feeding the deleted Matter
  `Mouse` and now feeds the controller — preserving the #39 mouse-origin/scale fix.

## Target interfaces

### `WordCloudSimulation` — kinematic drag API

```ts
grabWord(id)               // lockDrag + Body.setVelocity(0): the pin can't drift
moveWord(id, { x, y })     // Body.setPosition (no updateVelocity)
releaseWord(id, vPxPerMs)  // unlock; #isRunning ? setVelocity(v · 1000/60) : setVelocity(0)
```

Removed: `attachMouse`, `setMouseEnabled`, the `MouseConstraint`, the `Mouse`
import, and the `onWordGrab` / `onWordRelease` callbacks. `onTick` stays (position
read-back + framerate); `engine` stays (debug `Render`).

### `DragController` — element-owned, sim-agnostic

```ts
new DragController(container, {
  resolveWord(clientX, clientY): WordRef | null, // hit-test x-word → registry
  toContainerPoint(clientX, clientY): Point,  // rect + scale (today's #updateMouseScale math)
  onGrab(word, point),
  onMove(word, point),
  onRelease(word, velocityPxPerMs),
})
controller.enabled = (wordAction === "drag")  // disabling cancels any active drag
```

Owns: the single-drag state machine, the ~50 ms pointer-sample buffer + velocity
estimate (computed in container space), `setPointerCapture`, and
`pointercancel`/cancel handling. Knows nothing of the sim or Matter.

Element-side port handlers:

- `onGrab` — record `offset = body.position − point`; `sim.grabWord(id)`;
  `element.grabbed = true`; host `active` state. The same grab point can later
  feed DOM-only visual state such as local transform origin without crossing the
  simulation seam. (Replaces today's `#handleWordGrab`.)
- `onMove` — `sim.moveWord(id, point + offset)` **and** paint that word — always,
  so paused-drag works; the tick's redraw agrees when running.
- `onRelease` — `sim.releaseWord(id, velocityPxPerMs)`; clear `grabbed` + `active`.
  (Replaces today's `#handleWordRelease`.)

## Invariants to preserve

- **Drag-lock:** mask `0` + frozen rotation on grab; restored on release; a resize
  mid-drag keeps it frozen; double-lock is a no-op; removal unlocks first.
- **A grabbed word must be woken** — grabbing a settled/sleeping word.
- **A dragged word neither repels nor is repelled** (`isRepellable` stays false
  while drag-locked) — unchanged.
- **Teardown:** `wordAction ≠ drag`, disconnect, or the dragged word being removed
  cancels the active gesture and releases capture (the deepen-seam "teardown race"
  invariant; replaces `unlockAllDrags`'s "all released" broadcast for the single drag).
- **The #39 mouse-origin/scale fix** (container binding + computed-style scale) is
  preserved inside `toContainerPoint`.

## Testing approach

- **node** (`tests/word-cloud-simulation.node.test.ts`): `grabWord` zeroes linear
  velocity and freezes rotation; `moveWord` pins position without adding velocity;
  `releaseWord` throws (`· 1000/60`) while running and zeroes while stopped; the
  existing drag-lock tests stay green. This finally makes drag **motion**
  node-testable.
- **browser** (`tests/word-cloud.browser.test.ts`): pointer-event gesture on the
  `x-word` — grab at the visual centre with a host border/padding (port the
  existing #39 test from synthetic `MouseEvent`s to pointer events); pointer capture
  surviving the pointer leaving the word; throw direction matches drag direction
  (#66); drag-while-paused places the word without a throw.

## Follow-up

- **Multi-touch** — simultaneous one-finger-per-word drags; additive, the per-id
  API already supports it.
- **Max-throw-speed cap** — only if fast flicks feel too fast in practice.
