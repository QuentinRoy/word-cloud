# Plan: Extract a DOM-free WordCloudSimulation

> **Status:** in progress — Step 0 done ([#58](https://github.com/QuentinRoy/word-cloud/pull/58)). Live progress tracked in [#59](https://github.com/QuentinRoy/word-cloud/issues/59).
> **See also:** [`docs/adr/0001-dom-free-simulation-seam.md`](../../adr/0001-dom-free-simulation-seam.md) (the decision + rejected alternatives), [`CONTEXT.md`](../../../CONTEXT.md) (glossary).

## Goal

Extract the Matter.js world out of the ~1,300-line [`lib/word-cloud-element.ts`](../../../lib/word-cloud-element.ts) into a **DOM-free `WordCloudSimulation`**, leaving the element as a thin DOM adapter. Every step is **behavior-preserving** — the public `HTMLWordCloudElement` API does not change, so each lands as an internal-only PR with **no changeset**.

The payoff is testability: a DOM-free simulation runs in node against a real Matter engine, so the subtle physics (repulsion, sleeping interplay, drag-lock) can be tested headlessly instead of only through a full browser element. Today, every behavior is reachable only through the element, which forces each test to pay for a browser DOM.

## Steps

The work is split into four ordered steps. **Step 3 is the destination** — Steps 1 and 2 are the safe, self-contained cuts that lead to it, and each is shaped DOM-free so it composes into the Step 3 seam rather than being thrown away.

| Step | Module | What | Status |
|------|--------|------|--------|
| 0 | — | node vitest project (real engine, no DOM) + tests for the untested `physics-utils` helpers | ✅ [#58](https://github.com/QuentinRoy/word-cloud/pull/58) |
| 1 | `SpacingModel` | extract sensors + reach + pairs + the repulsion force out of the element | ☐ |
| 2 | `Word` | extract the body + element + handle + `dragLock` unit; collapse the lookup maps into one registry | ☐ |
| 3 | `WordCloudSimulation` | extract the DOM-free seam; the element becomes the adapter | ☐ |

## Decisions

- **The destination is the full split (Step 3).** Steps 1 and 2 are worthwhile on their own (locality + a headless test surface), but they're designed so the eventual simulation/element seam absorbs them.
- **Test substrate: node + a real Matter engine** (a second vitest project), *not* fake/mock bodies and *not* browser-only. The bugs live in the real broadphase / SAT / sleeping path, so a mock of Matter's contract would just drift from it. Recorded in ADR-0001.
- **`SpacingModel` owns the sensor** — its bodies, reach, pairs, and force. A `Word` is unaware a sensor exists. The sensor's sizing and sync could plausibly belong to either the spacing logic or the word unit, but it goes with spacing because the sensor exists *only* to detect proximity and its size derives from `reach` (a spacing parameter) — so a `Word` never needs to know about it.
- **The uprightness torque stays a separate pure helper** (`applyAngularRestoringTorque`). It keeps a word upright, which is *not* spacing — so `physics-utils.ts` survives, and only `getRepulsionStrength` eventually folds into `SpacingModel`.
- **Mouse stays element-side; drag-lock lives in the sim.** The element creates the Matter `Mouse` (DOM) and hands it over via `attachMouse`; the sim owns the engine, the `MouseConstraint`, and the drag-lock state machine. `Word` owns its `dragLock` field. This keeps the sim DOM-free *and* makes grab/follow/release node-testable in Step 3.
- **The template module is already gone** (removed in [#56](https://github.com/QuentinRoy/word-cloud/pull/56)), so it's not part of this work.

## Shared constants & collision filters

The four collision **categories** (`WORD`, `INPUT_VOLUME`, `SENSOR`, `FRAME`) and their masks are interdependent (each mask references the others) and used by the element (word / frame / input bodies) *and* by `SpacingModel` (the sensor). Move them into **one shared module** both import (e.g. `lib/collision.ts`) rather than duplicating. `SpacingModel` additionally takes ownership of the spacing-specific physics constants that move with it: `REPULSION_FORCE` and `REPULSION_MARGIN` (the default spacing). The angular/uprightness constants stay with the element/sim, next to `applyAngularRestoringTorque`.

## Target interfaces

### `SpacingModel` (Step 1)

```ts
new SpacingModel(engine, { inputVolumeBody })        // self-subscribes collisionStart/End
addWord(body, { width, height, isRepellable, ignoresInputVolume })
                                                     // creates the sensor, adds it to the world, tracks it
setWordSize(body.id, { width, height })              // rescales the sensor
removeWord(body.id)                                  // removes the sensor from the world, drops its pairs
setSpacing({ word, edge, input })                    // stores all three; recomputes reach; resizes sensors if reach changed
applyForces()                                        // called once per beforeUpdate by the tick owner
dispose()                                            // Events.off
```

- **Keyed by `body.id`** (Matter assigns it). `addWord` takes the body; the others take its id.
- **Owns the sensor body end-to-end:** creates it at the word body's position/angle with `isSensor: true`, `sleepThreshold: Infinity`, and the sensor collision filter (category `SENSOR`, mask `SENSOR | FRAME | INPUT_VOLUME`); `Composite.add`s it to the engine world on `addWord`, `Composite.remove`s it on `removeWord`.
- **`addWord` needs the initial size** to size the sensor — a Matter body doesn't carry the laid-out width/height (it's measured from the DOM and tracked separately, today as `entry.bodySize`).
- **Retains all three spacings** (`word` / `edge` / `input`); `applyForces` picks the margin per pair: word↔word → `word`, word↔frame → `edge`, word↔input → `input`.
- **`collisionStart` / `collisionEnd`:** track only pairs where `pair.isSensor`; `applyForces` skips pairs where `!pair.isActive`. `removeWord` also proactively drops any tracked pair referencing the removed sensor (in case `collisionEnd` hasn't fired).
- Reads the two word-level flags only through the accessors passed at `addWord` — it never reaches into a `Word`'s internals.
- The element (for now) drives it from the existing lifecycle points: `#addWord`, `#updateWordBodySize`, `#removeWordBody`, the spacing-attribute changes, and `#handleBeforeUpdate` — which still runs the uprightness torque, then calls `applyForces()`.

### `Word` (Step 2)

Owns the full per-word unit: `id` (= `body.id`), `body`, `bodySize` (the measured w/h), `element`, `publicHandle`, `dragLock`, and `ignoreInputVolumeUntilExit`. Builds its own `WordHandle` (x/y/angle from the body; word/checked from the element).

- **Element-event wiring:** the word element emits delete / checked-change / value-change. Recommend `Word` is constructed with callbacks the cloud supplies (`onDelete`, `onCheckedChange`, `onValueChange`) and attaches/detaches the listeners itself — keeping the cloud's `dispatchEvent` out of `Word` and the unit self-contained/testable.
- **Registry / lookups:** today there are two *word*-keyed maps — by `body.id` (`#wordEntries`) and by element (`#wordEntriesByElement`, used by the `ResizeObserver` to find a word from its target element). "One registry" must still answer **both** lookups: keep a `Map<id, Word>` plus an element→Word index (e.g. a `WeakMap<element, Word>`). The sensor-keyed map (`#entriesBySensorId`) is gone — it moved into `SpacingModel` in Step 1.

### `WordCloudSimulation` (Step 3)

DOM-free. Owns the engine, runner, the four frame bodies, the input-volume body, the `MouseConstraint`, and the drag-lock state, and runs the per-tick passes (uprightness torque, then `SpacingModel.applyForces()`). The element drives it and reads positions back to write CSS transforms.

Element → sim:
- `setWordSize(id, size)` (from the word `ResizeObserver`), `setFrameSize({ width, height })` (from the container `ResizeObserver`, replacing `#updateFrameBodies`), `setInputVolume(rect | null)` (enable/disable + size, replacing `#updateInputVolumeBody` / `#updateInputVolumeFromInput`), `setSpacing(...)`.
- `attachMouse(mouse)` / detach: the element creates `Mouse.create(container)` and computes the pointer scale from DOM metrics (`#updateMouseScale`), passing the scale in. `lockDrag(id)` / `unlockDrag(id)` / `unlockAll` from the `startdrag` / `enddrag` handlers.
- `start()` / `stop()` for the runner (driven by the `physics-paused` attribute and connect/disconnect).

Stays element-side (DOM): size measurement (`#measureWordSize`), CSS-transform writing (`#getWordTransform` + its precision constants), the framerate display, the debug `Render`, and all shadow-DOM / attribute / event plumbing.

**Caveat to preserve:** disabling the input volume must still clear `ignoreInputVolumeUntilExit` on the affected words (today in `#updateInputVolumeFromInput`).

## Invariants to preserve

These are the subtle behaviors currently spread across `word-cloud-element.ts` that the extraction must not break — they double as acceptance criteria:

- **Sensor size** = body + `2·reach` on every side; `reach = max(wordSpacing, edgeSpacing, inputSpacing, 0)`. Resize sensors on a size *or* reach change.
- **Sleeping interplay.** `#syncSensorBodies` skips sleeping word bodies, but sensors never sleep (`sleepThreshold: Infinity`). Repulsion is still applied to a sleeping body so a still-overlapping neighbour *wakes and separates* it, rather than freezing the overlap. (Words far from everything settle and sleep — that's where the broadphase savings come from.)
- **SAT depth → real gap.** `gap = inflation − collision.depth`, where `inflation = 2·reach` (word↔word) or `reach` (word↔frame / input).
- **Normal orientation.** Flip the collision normal to point from body A to body B before applying the separating push at each centre (`±REPULSION_FORCE · strength`).
- **Repellability.** `isRepellable = !body.isStatic && dragLock == null` — dragged or static words neither push nor are pushed. Sleeping words are **not** excluded (see above).
- **`ignoreInputVolumeUntilExit`.** Skip the input-side pair while a freshly-spawned word still overlaps the input volume; clear the flag once it has left.

## Testing approach

- **node project** (`tests/**/*.node.test.ts`, `environment: "node"`): builds a real `Engine`, adds bodies, steps via `Engine.update()`, asserts positions/forces. Covers `SpacingModel`, `Word`, and the simulation.
- **browser project** (`tests/**/*.browser.test.ts`, Playwright/Chromium): keeps verifying the element and its DOM/measurement integration. Visual-regression baselines are committed for `chromium-linux` (CI) only.

## Follow-up (not blocking)

Drag **motion** (the word follows the pointer) is currently untested — the browser test only covers grab/release, via synthetic `MouseEvent`s, because a real Playwright pointer never reliably reaches Matter's element-bound listeners through the test iframe. Cleanest to add as a node test once Step 3 makes drag-lock headless-testable.
