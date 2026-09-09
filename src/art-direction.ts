/** Machine-readable practice guide, returned by CLI/MCP studioHelp as well as the SDK. */
export const artDirectionGuide = {
  version: 'foundation-first/1',
  purpose:
    'Improve decisions through observable revision. This process cannot guarantee artistic excellence and does not supply an automatic critic.',
  sequence: [
    {
      step: 'study',
      deliverable:
        'Reference log with source, observation and intended application. Separate anatomical facts from invented design.',
      stop: 'If you cannot describe the relevant structure, study it before drawing.',
    },
    {
      step: 'explore',
      deliverable:
        'At least three materially different gesture/silhouette candidates. Vary action, balance, overlap and negative space, not just scale or position.',
      stop: 'Do not mistake shared prompt elements for equivalent artistic quality.',
    },
    {
      step: 'construct',
      deliverable:
        'Named landmarks, connected guide curves, overlapping masses and a single stated view/pose.',
      stop: 'Block disconnected joints, unreadable appendages, accidental tangencies and contradictory perspective.',
    },
    {
      step: 'value',
      deliverable:
        'Plain-background grayscale study: large light/shadow masses, one light direction, controlled edges. Inspect at thumbnail size, full size and mirrored.',
      stop: 'Do not add texture, scenery or effects to distract from a weak drawing.',
    },
    {
      step: 'revise',
      deliverable:
        'Name the defect, predict a structural correction, save the parent, make the edit, compare the actual images and record improved/unchanged/worse with visible evidence.',
      stop: 'If two structural revisions do not improve the drawing, change the construction or pose; do not accumulate detail.',
    },
    {
      step: 'review',
      deliverable:
        'Criterion-specific verdicts and blocking issues. Seek independent or human judgment at the foundation checkpoint.',
      stop: 'Do not self-certify professional quality. Reviewer identity is declared, not authenticated by this local tool.',
    },
  ],
  review_order: [
    'gesture and balance',
    'silhouette and negative space',
    'construction and anatomy',
    'perspective and overlap',
    'value grouping and lighting',
    'edge hierarchy',
    'only then materials and marks',
  ],
  calibration: {
    fail: 'Recognizable subject but stiff, inconsistent, flat, or structurally implausible. Prompt compliance does not rescue it.',
    revise:
      'A promising construction with identifiable problems; retain as a work in progress, not a finished success.',
    ready:
      'Foundation remains convincing without colour, texture, scenery or effects; no structural blockers remain, and the intended quality standard has been met by the required reviewer.',
  },
  protocol:
    'production plans can require reference observations, minimum alternatives and human review per stage. Capture revisions with parent and hypothesis; reviews must compare against that parent. Blocking issues always prevent selection and advance, regardless of numerical scores. Reviews are retained in review_history; changes to ratings do not erase prior criticism.',
  instructions:
    'Use named 2D construction guides through art.guides({points,paths}) to make structural changes propagate to connected paths. Define subject-specific anatomy in the artwork, not in engine commands. Open every candidate image before reviewing it. Returned paths and hashes do not establish that a reviewer actually looked at it.',
};
