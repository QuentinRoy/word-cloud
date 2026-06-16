---
"@quentinroy/word-cloud": patch
---

Stop words from freezing mid-rotation when the cloud settles after moving.

Words drift back to horizontal under a damped angular spring, but Matter.js puts
a body to sleep purely from its motion (linear plus angular speed), independent
of how far it still is from level. A word rotating slowly back — especially a
narrow one, whose restoring torque is scaled down — could dip below the motion
threshold and sleep while still visibly tilted, and the restoring torque skips
sleeping bodies, so it stayed stuck. Horizontal alignment is now a precondition
for sleeping: a word that is off-level is kept awake until the restoring torque
brings it back to horizontal, then it is free to settle.
