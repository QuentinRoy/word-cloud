---
"@quentinroy/word-cloud": patch
---

Replace the O(n²) word repulsion with matter-js sensor zones. Each word now carries an oversized sensor body, and the short-range soft repulsion is driven from matter-js's own broadphase and SAT penetration depth instead of a duplicate broadphase and hand-rolled closest-point geometry. The soft spacing effect and the independently tunable `wordRepulsion` / `edgeRepulsion` / `inputRepulsion` margins are unchanged; settled clouds now also sleep, lowering idle cost.
