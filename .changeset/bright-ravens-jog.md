---
"@quentinroy/word-cloud": minor
---

Rename the has-input/hasInput API to word-input/wordInput, and rename event classes:
WordCheckedChangeEvent -> WordCheckEvent,
WordValueChangeEvent -> WordChangeEvent,
WordCloudWordActionChangeEvent -> WordActionChangeEvent,
WordCloudWordInputChangeEvent -> WordInputToggleEvent,
WordCloudPhysicsPausedChangeEvent -> PhysicsPauseEvent.

Update event type strings accordingly:
word-checked-change -> word-check,
word-value-change -> word-change,
word-input-change -> word-input-toggle,
physics-paused-change -> physics-pause.