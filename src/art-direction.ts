/** Ship this compact instruction with an agent's tool context; the guide is available separately. */
export const artDirectionResourceUri = 'rtistree://guides/art-direction';
export const rtistreeAgentInstructions = [
  'Rtistree renders deterministic graphics; successful rendering, verification, replay or export does not establish artistic quality.',
  `Before creating or substantially revising artwork, read studioHelp or the ${artDirectionResourceUri} resource (CLI: graphics art-guide; SDK: artDirectionGuide).`,
  'Start with a representative sample before expanding an asset family. Explore distinct silhouettes, establish named connected landmarks and shared perspective guides, then inspect grayscale construction before adding detail.',
  'Define subject-specific checks: trace shoulder–elbow–wrist attachments and equipment ownership; construct prop surfaces and fittings in one perspective; inspect animation in playback against ground contact, including travel direction, joint bend and foot lift.',
  'Inspect actual rendered images at intended display size and full size. A contact sheet or unique frame hashes cannot establish correct motion. If vision or playback is unavailable, state that the corresponding visual review is incomplete.',
  'Fix structural defects before adding texture. Preserve the parent, state the correction hypothesis, compare images and retain failed reviews. User rejection overrides an earlier favourable agent assessment; partial praise approves only the stated aspect.',
  'Use production plan/capture/review/select/advance for enforced review gates. Report technical correctness, functional checks and visual acceptance separately. Do not infer a human review or require a new human approval unless the user or agreed plan requires one.',
  'These instructions support judgment; they cannot certify taste, truthful observation or natural motion. Low-level rendering remains usable without a production session.',
].join('\n');

/** Machine-readable practice guide, returned by CLI/MCP studioHelp as well as the SDK. */
export const artDirectionGuide = {
  version: 'foundation-first/2',
  agent_instructions: rtistreeAgentInstructions,
  purpose:
    'Improve decisions through observable revision. This process cannot guarantee artistic excellence and does not supply an automatic critic.',
  sequence: [
    {
      step: 'scope',
      deliverable:
        'A brief naming the medium, target display size, reference standard and representative sample. For an asset family, establish one character and one representative prop before producing variants or a full animation set.',
      stop: 'Do not multiply an unproven construction across many assets.',
    },
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
        'Criterion-specific verdicts and blocking issues, supported by observed images and functional checks. Use independent or human judgment when required by the user or agreed plan; do not invent an approval requirement.',
      stop: 'Do not self-certify professional quality. Reviewer identity is declared, not authenticated by this local tool.',
    },
  ],
  subject_checks: {
    articulated_figures: {
      construction:
        'Name shoulder, elbow, wrist, hip, knee and ankle landmarks; connect contours and equipment to those landmarks. State which hand holds each object and the intended front-to-back order.',
      inspect:
        'Trace each complete limb, including hidden portions, and check balance, silhouette, joint bend and equipment clearance at full and target size. A shared landmark graph can still encode a bad pose.',
      blocking_examples: [
        'A sword elbow crosses the torso beneath the shield arm to reach an overhead weapon.',
        'Disconnected helmet planes make its dome, visor and jaw impossible to read as one form.',
      ],
    },
    constructed_props: {
      construction:
        'Use a shared perspective grid or projection for adjoining faces, lid curves, planks, bands, hinges and latch. Draw visible portions according to surface overlap.',
      inspect:
        'Check shared corners, edge convergence or parallel directions, surface attachment and occlusion before grain, scratches or rivets. Distinct shaded faces are insufficient evidence of consistent perspective.',
      blocking_examples: [
        'Chest lid and body follow unrelated angles.',
        'The far side of a metal hoop is drawn over the near lid surface and reads as a floating handle.',
      ],
    },
    locomotion: {
      construction:
        'Declare facing, travel direction, ground plane, cycle duration, stance/recovery phases and intended stride distance. Derive drawings and functional checks from the same rig definition.',
      inspect:
        'Watch a complete loop against ground markers, then step through contact, passing and recovery frames. Check feet, knees, body rise, arm overlap and loop continuity; also inspect at intended game size.',
      functional_checks: [
        'During planted stance, foot velocity relative to the body plus body velocity should be approximately zero in world space.',
        'For ordinary forward walking, the recovering foot travels forward relative to the body while lifted; planted feet remain on the declared ground.',
        'Check reachability, segment lengths, joint angles and foot clearance across the cycle, not just the exported frames. Declare any intentional stretch or stylisation.',
        'Bind checks to the actual rendered rig or frozen source. Verify frame order, duration, pivots and loop closure; uniqueness of PNG hashes is only a file property.',
      ],
      limitation:
        'Correct contact direction and fixed bone lengths do not establish natural movement. Excessive knee flexion and foot lift still need visual correction. Other gaits require their own criteria.',
    },
  },
  acceptance: {
    technical:
      'Schema validity, reproducible bytes, alpha margins and correct export/atlas coordinates.',
    functional:
      'Subject-specific geometry or behaviour checks, such as contact direction and rig continuity.',
    visual:
      'Observed construction, gesture, perspective, readability, materials and motion against the brief.',
    reporting:
      'Report each axis with its evidence and unresolved issues. A pass on one axis never implies the others. Preserve user feedback verbatim or faithfully summarised, tied to the candidate and aspect reviewed.',
    partial_feedback:
      'Walking forward confirms direction; much better confirms relative improvement. Neither implies approval of every asset or production readiness.',
    unavailable_observation:
      'Mark unobserved images or motion as unreviewed. Do not fabricate viewing evidence or substitute mechanical test results.',
  },
  trial_lessons: [
    {
      case: 'Verdigris Watch: reversed walk despite eight distinct frames',
      missed: 'Lifted feet moved backward and planted feet moved forward relative to the body.',
      correction:
        'Separate contact and recovery, inspect ground-relative motion, and test the same function baked into the sprites.',
      remaining:
        'Direction improved before knee bend, helmet and arm construction were satisfactory.',
    },
    {
      case: 'Verdigris Watch: chest and guard construction',
      missed:
        'A common palette and successful renders concealed contradictory prop perspective and crossed limb chains.',
      correction:
        'Rebuild the chest on one guide grid; hide occluded hoop sections; move the sword elbow outside the torso; simplify connected helmet shells.',
      remaining:
        'The user described revision 4 as much better; this establishes improvement, not blanket professional-quality certification.',
    },
  ],
  // A valid production plan template. Replace the brief and adapt criteria to the actual subject.
  starter_plan: {
    id: 'representative-asset-study',
    brief:
      'Replace with the requested subject, medium, reference standard and target display size before starting this plan.',
    stages: [
      {
        id: 'exploration',
        goal: 'Compare materially different constructions of one representative sample.',
        minimum_alternatives: 3,
        require_references: true,
        criteria: [
          {
            id: 'silhouette',
            description: 'Action, negative spaces and subject are readable at target size.',
          },
          {
            id: 'construction',
            description: 'Landmarks, attachments, balance and perspective are coherent.',
          },
        ],
      },
      {
        id: 'sample-review',
        goal: 'Resolve construction and applicable functional defects before expanding the asset family.',
        criteria: [
          {
            id: 'structure',
            description:
              'Grayscale and full-size inspection find no unresolved structural blockers.',
          },
          {
            id: 'function',
            description:
              'Subject-specific behaviour and geometry were checked; for static art, name the applicable static checks.',
          },
          {
            id: 'appearance',
            description:
              'The actual images and any animation were observed at intended size against the brief.',
          },
        ],
      },
      {
        id: 'family-review',
        goal: 'Review expanded assets and exports without substituting mechanical success for visual acceptance.',
        criteria: [
          {
            id: 'consistency',
            description:
              'Variants preserve the approved construction, style, scale and attachments.',
          },
          {
            id: 'function',
            description:
              'Variants and any full animation loop retain the applicable functional checks.',
          },
          {
            id: 'visual',
            description:
              'Each delivered asset has been visually inspected; remaining failures are explicit.',
          },
          {
            id: 'technical',
            description: 'Replay, alpha, frame metadata and applicable exports have been checked.',
          },
        ],
      },
    ],
  },
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
