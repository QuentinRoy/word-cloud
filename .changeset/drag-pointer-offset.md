---
"@quentinroy/word-cloud": patch
---

Fix a pointer offset that misaligned dragging when the host element had a border or padding (#39). The mouse is now anchored to the container — the same coordinate frame as the word bodies and their rendered DOM — so the grab cursor and drag hit-testing line up regardless of host styling. The drag scale is also derived from the container's border box to avoid a rounding/scrollbar mismatch.
