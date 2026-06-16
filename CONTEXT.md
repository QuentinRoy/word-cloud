# Word Cloud

An interactive word-cloud custom element backed by a Matter.js physics
simulation. Words are draggable text chips that softly repel each other, the
container edges, and the text input, while a restoring torque keeps them upright.

## Language

**Word**:
The core unit — a text chip the user sees, backed by a single physics body and
its DOM element, drag state, and public handle. The proximity sensor that drives
repulsion is *not* part of a word; it belongs to spacing (see _Sensor_).
_Avoid_: entry, chip, item, label

**Word cloud**:
The container element that owns the simulation and hosts the words.

**Grab**:
The start and held contact of a drag: the pointer has taken hold of a word at a
specific point inside its rendered box. The grab point or grab offset is local
to the word and is useful for DOM presentation details such as scaling from the
contact point. A grab does not name the whole gesture; it is one phase of a
_drag_.

**Drag**:
Holding a word and moving it with the pointer. A dragged word follows the
pointer exactly and is otherwise inert — it passes over other words without
colliding with them, repelling them, or being repelled, and the simulation does
not move it. It rejoins the simulation only on _release_.
Use _grab_ for the start/held contact and its local anchor; use _drag_ for the
full gesture.
_Avoid_: pin

**Release**:
The end of a _drag_, when the word rejoins the simulation. A release while the
simulation is running imparts a _throw_; a release while it is paused places the
word with no momentum.
_Avoid_: drop, let go

**Throw**:
The velocity a word carries away on _release_, reflecting the pointer's recent
motion so the word keeps moving in the direction and speed it was flicked — not
the word's own motion while dragged, which is none. A paused _release_ imparts
no throw.
_Avoid_: fling, momentum (that's the result, not the act)

**Spacing**:
The configured soft-repulsion distance, in pixels, that keeps a word clear of
something else: _word spacing_ (other words), _edge spacing_ (the frame), and
_input spacing_ (the input volume). The user-facing concept.
_Avoid_: repulsion (that's the mechanism, not the setting), margin

**Repulsion**:
The short-range separating force that *enforces* spacing. Distinct from spacing:
spacing is the target distance, repulsion is the force that achieves it.

**Sensor**:
An oversized, non-resolving body that tracks a word's body; its broadphase
overlaps are what detect a neighbour within spacing range. A pure
spacing-detection concern — words are unaware of it.
_Avoid_: proximity body, sensor body (in prose)

**Reach**:
How far a sensor extends past its word on every side, in pixels. Derived from the
largest active spacing so detection always covers the widest margin; the per-pair
spacing then gates whether a force is actually applied.

**Gap**:
The true distance between two word boundaries, recovered from the SAT penetration
depth of their overlapping sensors. Repulsion applies only while gap < spacing.

**Frame**:
The four static boundary bodies that bound the container so words stay inside.
_edge spacing_ is the spacing kept from the frame.
_Avoid_: walls, edges, bounds

**Input volume**:
A static body matching the text input box, so words are repelled away from where
the user is typing. _input spacing_ is the spacing kept from it.

**Input grace**:
The period during which a freshly-spawned word ignores the input volume — it
neither collides with nor is repelled by it — lasting until the word has left the
input volume once. Lets a word created at the input escape outward instead of
being shoved back through the area being typed in.
_Avoid_: ignore-input flag, input cooldown
