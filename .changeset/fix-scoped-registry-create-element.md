---
"@quentinroy/word-cloud": patch
---

Fix words failing to appear ("animateEntry is not a function") in browsers that support scoped custom element registries. The word element is now created against the scoped registry so it upgrades correctly, instead of relying on `document.createElement` and the global registry.
