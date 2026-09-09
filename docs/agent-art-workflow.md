# Art direction for agents

Read this before creating illustration, painting or procedural assets. The versioned
protocol is returned by `graphics art-guide`, included in `graphics studio-help`
and MCP `studioHelp`, and exported as `artDirectionGuide` by the SDK.

MCP connections receive the core rules in the server's initialization
`instructions`. The full guide is also a discoverable JSON resource at
`rtistree://guides/art-direction`. Authoring tool descriptions point agents to it.
All of these surfaces share `src/art-direction.ts`; consumers do not need access
to this repository or its example files. SDK hosts should put the exported
`rtistreeAgentInstructions` in their agent context and expose the full guide.
CLI hosts should read `graphics art-guide` before authoring. A client decides how
to present instructions to its model; shipping guidance cannot force every client
or agent to read it, follow it, or exercise good visual judgment.

This is a repeatable process for detecting and correcting failures. It cannot guarantee better art on every attempt. The agent must be capable of drawing, observing and revising; the software cannot certify taste, anatomical understanding or the truth of a review.

## Establish the standard before producing detail

Write the brief, intended medium, audience and quality expectation in plain language. Separate **prompt compliance** from **artistic success**. A recognisable dragon may still have poor construction; a technically valid PDF may still have poor composition.

Study relevant references. Record each source, an actual observation and how it changes the drawing. Open images before making visual claims; search-result descriptions are not visual inspection. Use references for structure, gesture, lighting and quality calibration. Do not substitute tracing, imported pixels or image-generation output when the brief prohibits them. Distinguish real anatomy from invented anatomy.

For an unfamiliar subject, include both a structural reference and an example of the intended quality. A diagram can explain a joint without demonstrating good composition or expressive drawing. Sources may be URLs or project-local notes; source claims are recorded, not automatically verified by Rtistree.

## Follow the dependency of artistic decisions

For an asset family, begin with a representative sample: one character and one
prop that exercise the difficult construction. Establish their quality before
multiplying variants. The guide's `starter_plan` is a valid production plan
template with exploration, sample review and family review stages. Replace its
brief and adapt criteria before submitting it to `production`. Reference studies
can be supplied with the plan or appended through `study`. The template uses
the existing gates; it does not create an automatic visual critic.

1. **Gesture and composition.** Produce at least three substantially different proposals. Change action, balance, overlap and negative space. Scaling or translating the same drawing does not explore a new pose.
2. **Silhouette.** Inspect the subject at thumbnail size. Identify the focal contour, negative spaces and accidental mergers. A head merging into a wing is a drawing failure even if shading might reveal it later.
3. **Construction.** Name landmarks and connect them through guide curves. Establish coherent mass, joints, perspective and overlap. Attach contours to shared landmarks so corrections propagate. In a creature, distinguish the skeleton, muscle masses and surface; in lettering, establish stroke proportions and spacing; in a product illustration, establish axes, proportions and perspective.
4. **Values.** Use a plain background and grayscale. Group large light and shadow masses under a stated light direction. Inspect at full size and thumbnail size, then mirror the view. Examine both structure and rendering artifacts. Smooth gradients can expose form, but a set of shaded tubes is not automatically convincing anatomy.
5. **Targeted revision.** Name the defect, predict a correction and capture the parent. Make the structural edit, capture the revision, then compare the actual images. Record improved, unchanged or worse, with visible evidence. A local fix is not proof that the whole drawing is good.
6. **Foundation checkpoint.** Keep all blocking defects active. Seek human or independent review when required by the plan. Do not proceed to colour, textures, scenery or effects while construction remains inadequate.
7. **Materials and finish.** Only after the foundation passes, develop surface, edge hierarchy and detail. Recheck the earlier decisions after significant edits. Complexity, brush count and time spent are not quality metrics.

If two structural revisions do not improve the drawing, revisit the construction model or the pose. Further detail is unlikely to rescue it. If there are local improvements but the overall result is still weak, say so explicitly and retain the failed gate.

## Subject-specific checks learned from the asset trial

**Figures:** name and trace each shoulder–elbow–wrist and hip–knee–ankle chain,
including hidden portions. State which hand holds each object. In the Verdigris
Watch trial, the sword elbow crossed the torso beneath the shield arm. Moving
the elbow outside and above the body fixed that relationship. A valid landmark
graph can encode a bad pose; inspect balance, joint angles and negative spaces.
Helmet dome, eye slit, visor and jaw must read as connected forms.

**Props:** use one shared perspective grid for the body, lid, planks and fittings.
The first chest used unrelated angles. A reconstruction also briefly showed the
hidden backs of its hoops over the near lid, where they looked like handles.
Both shared geometry and correct occlusion matter. Distinct shaded faces and a
common palette are insufficient evidence of sound construction.

**Animation:** declare facing, travel direction, ground plane, stride distance,
cycle duration and contact/recovery phases. Play a full loop against ground
markers and inspect contact, passing and recovery frames at the intended size.
For ordinary forward walking, planted feet move backward relative to the body;
their relative velocity plus body velocity should approximately cancel in world
space. Recovering feet move forward while lifted. Check reachability, segment
lengths, knee flexion, lift, pivots, frame order and the loop boundary. Bind those
checks to the actual rig source used to draw the frames.

The original trial produced eight different PNGs but walked backward. Correcting
direction still left excessive knee bend, an odd helmet and crossed guard arms.
The user eventually called revision 4 “much better.” Record that as relative
improvement, without extrapolating it into approval of every asset. The distilled
lessons are embedded in the shipped guide; the full trial history lives in
`examples/warden-asset-trial` in the source repository and is not required by the
installed package.

Report three separate axes: **technical** (valid files and reproducibility),
**functional** (subject-specific behaviour/geometry), and **visual** (observed
appearance against the brief). An unobserved image or loop is unreviewed. A user
rejection supersedes an earlier favourable agent review. Keep failed candidates
and parent-linked corrections. Technical checks cannot override visual failures.

## Enforced gates and their limits

Production plans support these stage fields:

```json
{
  "minimum_alternatives": 3,
  "require_references": true,
  "required_reviewer": "human"
}
```

Use minimum alternatives on the exploration stage. Use the human checkpoint when
the user or agreed plan requires human acceptance; do not invent an approval
requirement for every task. Set concrete `criteria` and appropriate numerical
thresholds as well. Do not lower thresholds after seeing a weak result merely to advance.

- `minimum_alternatives` counts initial candidates with distinct PNG hashes. Revisions do not count as independent alternatives. The software can verify pixel differences; the reviewer must verify meaningful compositional differences.
- `require_references` requires a reference log. The software does not know whether the agent actually studied it.
- `required_reviewer: "human"` prevents a review declared as `vision-agent` from approving the stage. Reviewer identities and methods are declarations in a trusted local project, not authenticated identities. An agent must never mark its own opinion as human feedback.
- Blocking review issues prevent selection and advancement regardless of high overall scores. A criterion cannot simultaneously pass and have a blocking issue.
- Revision reviews must compare against the declared parent. A revision judged unchanged or worse cannot be selected.
- Re-reviewing a candidate appends to `review_history`. Earlier criticism is retained.
- `status` reports candidate readiness and `compare` reports gate reasons. Existing technical, stale-hash, candidate-restoration and undo checks continue to apply.

The engine cannot stop an observer from writing an inaccurate review. These gates expose decisions and prevent common shortcuts; they do not replace artistic judgment. A completed workflow means its declared checks passed, not that excellent art has been objectively established.

## Requests an agent should use

Reference study can be supplied in the initial plan's `references` array, or appended during work:

```json
{
  "action": "study",
  "session": "creature",
  "reference": {
    "id": "wing-construction",
    "source": "<reference URL or project-local study>",
    "observation": "The elbow precedes the wrist; the long fingers radiate from the wrist.",
    "application": "Move the wrist independently from the shoulder and attach membrane contours to the finger ends."
  }
}
```

Reference IDs are unique. Appending a study does not rewrite criteria or earlier reviews.

Capture a revision after making the edit:

```json
{
  "action": "capture",
  "session": "creature",
  "candidate": "separated-jaw",
  "expected_hash": "<current scene hash>",
  "revision": {
    "parent": "first-values",
    "hypothesis": "Lowering the far wing will open a clear gap beneath the jaw."
  }
}
```

A review includes the normal candidate hashes, reviewer, method, strengths, weaknesses, scores and complete criterion verdicts. Add explicit issues and a comparison for revisions:

```json
{
  "issues": [
    {
      "criterion": "construction",
      "severity": "blocking",
      "observation": "The wing and foreleg terminate at one unexplained joint.",
      "correction": "Design separate attachments and the intervening torso mass before adding detail."
    }
  ],
  "comparison": {
    "parent": "first-values",
    "verdict": "improved",
    "evidence": "The jaw is now separated from the far wing, but the shared shoulder joint is still unresolved."
  }
}
```

The construction criterion must be `pass: false` in this example. A comparison can truthfully say improved while the candidate remains blocked.

## Named 2D construction guides

```js
const drawing = art.guides({
  points: {
    shoulder: [200, 300],
    elbow: { anchor: 'shoulder', offset: [-70, -20] },
    wrist: { anchor: 'elbow', offset: [-40, -90] },
    tip: { anchor: 'wrist', offset: [-120, -40] },
  },
  paths: {
    leadingEdge: [
      { op: 'M', to: 'shoulder' },
      { op: 'Q', control: 'elbow', to: 'wrist' },
      { op: 'L', to: 'tip' },
    ],
  },
});
ctx.stroke(art.path(drawing.paths.leadingEdge));
```

Points can be coordinates, aliases or anchored offsets. Paths support M/L/Q/C/Z segments with shared point references. Moving the shoulder above moves its dependent elbow, wrist and tip. Use absolute points where independent articulation is intended. Cycles, unknown points, invalid coordinates and malformed paths fail validation.

This is a general construction graph, not inverse kinematics or anatomical knowledge. It is useful for creatures, botanical forms, lettering, diagrams and other drawings whose contours share control points. Programs still have native Canvas and raw pixels for anything the abstraction cannot express.

## The dragon trials are calibration evidence

The original oil-style dragon met the requested subject beats and reproduced deterministically, but the user rejected its artistic quality. Its earlier favourable scores were false positives. Do not use that result as a passing quality reference.

The follow-up in `examples/dragon-foundation` studies anatomy references, rejects two silhouettes for losing the head in a wing, then makes two structural/value revisions to the remaining pose. It preserves failed reviews and stops at the foundation checkpoint. The image remains a weak construction study; improved separation and reproducibility do not make it excellent art.

Read `examples/dragon-foundation/README.md` for the actual observations, limitations and replay evidence. Treat the process as a way to learn from visible failures rather than manufacture a successful score.

The narrower experiment in `examples/dragon-head-study` draws a head illuminated by green fire. Replacing regular scale rows with irregular cells and a glowing line with turbulent fire improved those specific defects. The result still falls short in anatomy, light interaction and purposeful painting. A brush treatment over a weak drawing remains a weak drawing. This was a single-composition lighting experiment, not a successful run of the full foundation protocol; its assessment keeps the artistic failures explicit.
