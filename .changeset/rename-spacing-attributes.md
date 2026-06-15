---
"@quentinroy/word-cloud": minor
---

Rename the word-spacing attributes so their names convey that the values are distances in pixels:

- `word-repulsion` → `word-spacing`
- `edge-repulsion` → `edge-spacing`
- `input-repulsion` → `input-spacing`

The matching camelCase properties are renamed too (`wordRepulsion` → `wordSpacing`, `edgeRepulsion` → `edgeSpacing`, `inputRepulsion` → `inputSpacing`). Behaviour and default (`5`) are unchanged.
