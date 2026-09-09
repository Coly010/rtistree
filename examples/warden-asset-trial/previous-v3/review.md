# Revised trial — no visual pass

The user rejected the original: the walk ran backward, the chest was unacceptable,
and the poses were weak. That verdict supersedes my earlier favourable observations.
The full original source, assets, recipes and review are in `rejected-v1/`.

## What the previous review missed

I checked distinct PNG frames without checking the direction of ground contact.
The old near foot used x = 119 - 16 sin(t) with lift proportional to positive
cos(t): it moved backward while airborne and forward while planted. That is the
opposite of rightward walking. Describing it as merely stiff was incorrect.

The chest combined unrelated lid curves, front edges, side edges and band paths.
My statement that its planes were distinct did not establish consistent perspective.
The poses shared too much of one static arrangement, with poorly explained weight
and equipment placement. The technical pass never established visual acceptance;
my presentation gave the result more credit than it deserved.

## Revision 3

- Walking now uses a 60% contact phase: the planted foot travels left relative to
  a body moving right. During recovery it lifts and travels right. A two-segment
  leg construction preserves segment length; arms and cloak respond to phase.
- Watch carries the sword down; stride shifts both support legs and equipment;
  guard crouches behind a forward shield with the sword drawn back. The helmet
  was redrawn to establish a clearer right-facing profile.
- The chest body, lid, wood strips, metal hoops and latch share one parallel 2D
  guide grid. Far portions of the hoops are hidden by the lid, after a first
  redraw exposed those hidden portions as incorrect raised loops.
- The viewer can switch between the rejected original and current revision.
  Ground markers expose contact direction in both versions.

Inspected the silhouette/grayscale foundation, colour sheets, chest at full asset
size, and playback/comparison controls in the browser. These changes address
specific observed defects. The character still uses schematic armour, simple
hands, limited torso articulation and an exaggerated stepping action. I have not
established that the poses or chest now meet the user's artistic standard.

## Validation status

**Original: failed user review. Revision: not visually approved.**
No human approval has been inferred or entered. No overall quality pass exists.

`output/audit.json` separates technical checks from `visual_pass: false`.
The motion check samples the same function that is embedded in the drawing recipe:
1,200 contact samples cancel forward body velocity within numerical precision;
800 recovery samples travel forward with positive lift; both leg segment lengths
remain constant. This tests direction and geometry, not natural-looking animation.
Every asset also replays identically, has transparent margins and matches its
atlas pixels. Those facts cannot override the failed visual review.
