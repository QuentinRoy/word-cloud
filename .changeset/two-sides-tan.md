---
"@quentinroy/word-cloud": minor
---

Split mode attribute into two new attributes: has-input (boolean) and word-action ("none", "drag", "check"). This allows for more flexible combinations of input and word interaction modes. The old "mode" attribute is no longer supported and should be replaced with the new attributes in any code that references it.
