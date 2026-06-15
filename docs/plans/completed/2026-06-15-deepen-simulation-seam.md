# Plan: Deepen the simulation seam and extract InputVolume

> **Status:** done — all three steps implemented and verified, landed together in one PR
> (behavior-preserving, no changeset).
> **See also:** [`docs/adr/0001-dom-free-simulation-seam.md`](../../adr/0001-dom-free-simulation-seam.md),
> [`2026-06-15-simulation-extraction.md`](2026-06-15-simulation-extraction.md)
> (the extraction this builds on), [`CONTEXT.md`](../../../CONTEXT.md) (glossary — adds _Input grace_).

## Goal

The [`WordCloudSimulation`](../../../lib/word-cloud-simulation.ts) extraction (#59) landed a DOM-free seam, but
left the sim as the new orchestrator with a **shallow interface** and two sub-concerns still inline. This plan
deepens that seam and gives the _Input volume_ a real module. Every step is **behavior-preserving** — the public
`HTMLWordCloudElement` API does not change, so each lands as an internal-only PR with **no changeset**.

## Steps

Ordered so each lands independently. Step 1 is a dependency-enabler for Step 2; Step 3 is independent.

| Step | Module | What | Status |
|------|--------|------|--------|
| 1 | `wordCollisionMask` | a pure mask deriver in `collision.ts`; the sim becomes its single writer | ✅ |
| 2 | `InputVolume` | extract the body + the _Input grace_ state machine out of the sim/element/spacing | ✅ |
| 3 | seam callbacks | self-drive drag-lock; replace raw Matter getters with intent callbacks | ✅ |

## Decisions

- **The sim is the single writer of a word's collision mask** (Step 1). Two independent state machines
  (drag-lock, _Input grace_) feed one `body.collisionFilter.mask`; today it is re-synced imperatively and every
  flag flip must remember to re-run `#updateWordCollisionMask`. A pure, total `wordCollisionMask(state)` makes the
  precedence (**drag-lock wins → mask `0`**) a truth table, tested in node.
- **`InputVolume` owns the _Input grace_ set** (Step 2), and both readers — the mask deriver and
  `SpacingModel` — query it through `ignores(id)`. The grace flag leaves `WordEntry` entirely. This is why Step 1
  comes first: the mask deriver reads `inputVolume.ignores(id)`.
- **`InputVolume` mirrors `SpacingModel`**: it tracks the word bodies handed to `beginGrace` (a small transient
  set) and runs its own per-tick overlap test. It signals "these words left grace" by **return value**
  (`releaseExitedWords(): number[]`, `setRect(null): number[]`), not a callback — the sim re-masks the returned
  ids. No new cross-module callback.
- **`SpacingModel` is unchanged.** It is still constructed with the input body (now `inputVolume.body`) to
  classify word↔input pairs, and still reads `() => inputVolume.ignores(id)`.
- **The sim self-drives drag-lock** (Step 3). It owns the `MouseConstraint`, so it locks/unlocks on its own
  `startdrag`/`enddrag` and the callbacks become pure DOM-mirror notifications. `unlockAllDrags()` fires
  `onWordRelease(null)`. **`lockDrag`/`unlockDrag` stay public** — they are the headless test seam for the
  drag-lock state machine (no real pointer in node), so tests cross the interface there. The interface still
  shrinks: `runner`/`mouseConstraint`/`mouseEnabled` getters are gone, replaced by the three callbacks.
- **Explicit wire/unwire.** The element sets `onTick`/`onWordGrab`/`onWordRelease` in `connectedCallback` and
  nulls them in `disconnectedCallback`. The sim's own subscriptions to `runner`/`mouseConstraint` live for the
  sim's lifetime.
- **`engine` stays exposed** as the one documented escape hatch for the dev-flagged debug `Render`. `runner`,
  `mouseConstraint`, and `mouseEnabled` getters are removed.

## Target interfaces

### `wordCollisionMask` (Step 1) — `lib/collision.ts`

```ts
interface WordCollisionState { dragLocked: boolean; ignoresInput: boolean }
// drag-locked → 0 (collides with nothing); else drop INPUT_VOLUME while in grace.
function wordCollisionMask(state: WordCollisionState): number
```

The sim replaces `#updateWordCollisionMask(entry)` with `#applyWordMask(id)`, which calls this with
`{ dragLocked: entry.dragLock != null, ignoresInput: this.#inputVolume.ignores(id) }`.

### `InputVolume` (Step 2) — `lib/input-volume.ts`

```ts
new InputVolume(engine)
get body(): Body                  // SpacingModel identifies the input side by this
get enabled(): boolean
setRect(rect: Rect | null): number[]   // enable/resize/reposition, or disable (clears grace) → freed ids
beginGrace(body: Body): void           // a freshly-spawned word enters Input grace
ignores(id: number): boolean           // still in grace? — asked by spacing AND the mask deriver
releaseExitedWords(): number[]         // per-tick: drop grace for words that left → their ids
forget(id: number): void               // word removed from the sim
```

Owns the input body end-to-end (`#setupInputVolumeBody`, the min-size clamp, scale/position math, the AABB
overlap test). The sim wires it: `addWord` → `beginGrace` + `#applyWordMask`; `removeWord` → `forget`;
`setInputVolume` → `setRect` then re-mask freed ids; `#handleBeforeUpdate` → re-mask `releaseExitedWords()`.

### Simulation seam (Step 3) — `lib/word-cloud-simulation.ts`

```ts
onTick:        ((frameDelta: number) => void) | null
onWordGrab:    ((id: number) => void) | null
onWordRelease: ((id: number | null) => void) | null   // null = all released
get engine(): Engine                                  // debug Render only
lockDrag(id) / unlockDrag(id) / unlockAllDrags()       // public — the headless drag-lock test seam
// removed getters: runner, mouseConstraint, mouseEnabled (replaced by the three callbacks)
```

The element keeps its own `#mouse` (it created it) and scales that in `#updateMouseScale`; it stops naming any
Matter event or reading `event.source.body`.

## Invariants to preserve

- **Mask precedence:** drag-locked ⇒ mask `0`; else `DEFAULT_WORD_COLLISION_MASK`, minus
  `INPUT_VOLUME_COLLISION_CATEGORY` while in _Input grace_.
- **Input grace lifecycle:** set on form-spawned words; cleared once the body no longer overlaps the input
  volume, or immediately when the input volume is disabled.
- **Drag-lock:** freeze inertia + mask `0` on grab; restore on release; resize keeps it frozen; double-lock is a
  no-op; removal unlocks first. Self-driving must keep all of these.
- **Teardown race:** grab/release handlers must stay inert while the mouse is disabled (gated inside the sim now).

## Testing approach

- `tests/collision.node.test.ts` — the four-combination truth table for `wordCollisionMask`.
- `tests/input-volume.node.test.ts` — grace begins/clears on exit and on disable; overlap test; `forget`.
- Existing `word-cloud-simulation.node.test.ts` covers the integration (grace, drag-lock, mouse) and must stay
  green unchanged. `word-cloud.browser.test.ts` keeps verifying the element + DOM mirroring.
