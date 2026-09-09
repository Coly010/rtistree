# Agent onboarding and procedural asset lessons

## Context

The foundation-first guide was available through `studioHelp` and the SDK, but
new agents had to discover and request it. The Verdigris Watch trial also exposed
gaps in the guide: technically valid assets could have reversed walking motion,
contradictory prop perspective, excessive joint bend and crossed limb chains.
These failures needed subject-specific observation, not additional surface detail.

## Decision

Keep compact instructions, structured guidance, calibration cases and a starter
production plan in `src/art-direction.ts`. Ship these through the existing npm
`dist` and `docs` entries without requiring source examples or a provider-specific
skill installation.

- MCP includes the compact rules in initialization instructions, a discoverable
  JSON resource and pointers in authoring tool descriptions. `studioHelp` returns
  the same complete guide.
- CLI exposes `art-guide` without requiring a project, and advertises it in help.
- SDK exports the guide and compact instructions. The host supplies them to its
  agent; importing a graphics library does not itself change an LLM's context.
- A starter plan uses existing alternative, reference, criterion and review gates.
  It does not implicitly require human approval for every task.

The guide distinguishes technical correctness, functional behaviour and visual
acceptance. It requires representative samples, actual image/loop inspection,
shared construction, parent-linked revisions and faithful retention of feedback.
General lessons are embedded; a particular knight pose or colour palette is not
prescribed for unrelated tasks.

## Limits

Instructions are context, not model training or enforcement. Clients can omit
them and agents can ignore them. The existing production API enforces declared
review gates, hashes and blocking issues only for callers using that workflow.
Low-level rendering remains available. Neither transport nor workflow can prove
that a reviewer looked at an image or judged it well. Motion formulas are examples
for ordinary forward walking, not universal criteria for all animation.

## Verification

Interface tests connect a fresh MCP client, read initialization instructions,
discover and read the resource, and compare it with `studioHelp`, CLI output and
the SDK guide. The starter plan is exercised through the production API and cannot
select an unreviewed candidate. A package check verifies that compiled guidance
and documentation are present in the distributable.
