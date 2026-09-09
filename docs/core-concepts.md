# Core concepts: an agent is the interface

Rtistree is designed to be operated through an agent. You describe what you want,
set constraints and give feedback. The agent uses Rtistree to construct artwork,
inspect renders and make focused revisions.

The CLI, MCP server and TypeScript SDK are the agent's controls. They are also
available for direct human use, but learning every command is not the intended
starting point for someone who wants to make art.

## Three roles

| Role      | Responsibility                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------- |
| You       | Set the brief, references, constraints and intended use; judge whether the result meets your needs |
| The agent | Plan the work, call tools, inspect images, identify defects and revise the artwork                 |
| Rtistree  | Store the editable scene, render it, apply typed edits, track history and export files             |

Rtistree does not contain a model. Your agent host supplies the model, its context,
image-viewing capability and tool access. An agent that cannot inspect images can
still operate the tools, but cannot credibly judge their visual quality.

You can connect an MCP-capable host, give an agent access to the CLI, or integrate
the SDK into your own application. [Agent setup](agent-setup.md) explains each path.
The host decides which tools require confirmation and what files the agent can access.

## A conversation becomes an editable scene

A useful starting brief might be:

> Create a square event poster with a bold title, a quiet landscape and room for
> a date. Keep the title and illustration independently editable. Show me a
> composition before adding detail.

The agent creates a scene with named layers rather than treating the final PNG as
its only state. Text, geometry, image assets, masks and adjustments can retain
separate identities. For painted detail, trusted JavaScript programs can produce
baked raster assets with saved source, parameters and seeds.

After inspecting the render, you might say:

> The title works. Reduce the contrast behind it and move the sun farther right.

The agent can inspect the relevant layers, change those parts and render again.
It should preserve the parts you approved and check that the requested revision
actually helps. Scoped raster edits have an enforced pixel-locality check;
arbitrary structural edits do not automatically promise that every other pixel
will remain unchanged.

A painted image is only as editable as its construction. If an agent bakes every
part into one asset, Rtistree cannot recover meaningful objects from those pixels.
Ask for independent layers or program parameters for the parts you expect to revise.

## The working loop

1. **Direct:** establish the brief, references, intended size and acceptance criteria.
2. **Construct:** make a representative composition or asset with useful editable structure.
3. **Inspect:** open the actual render, including silhouettes, crops or animation frames as relevant.
4. **Refine:** identify a specific defect, make a focused change and compare the result.
5. **Deliver:** export the accepted state and keep the source needed for future edits.

This loop is deliberate. A successful command, valid file or reproducible image
is not proof that the artwork is good. The agent brings drawing and observation
skills; Rtistree provides tools and records. A stronger agent may use the same
toolkit better, but the toolkit does not guarantee artistic success.

## Guidance travels with the tool

The package includes art-direction guidance based on recorded trials: connected
construction, coherent prop perspective, ground contact, representative samples,
and separate technical, functional and visual assessment.

- MCP supplies compact instructions during connection and exposes the full guide
  through `studioHelp` and the `rtistree://guides/art-direction` resource.
- CLI agents can read it with `rtistree art-guide`.
- SDK hosts can provide `rtistreeAgentInstructions` and `artDirectionGuide` to their agent.

Availability is not automatic compliance: some hosts do not pass server instructions
to their model. Ask the agent to read the guide before authoring. The
[art-direction workflow](agent-art-workflow.md) explains the process and optional
production gates in detail.

## Local work and explicit execution

Ordinary scene loading and rendering use local assets and do not execute painting
recipes. Program execution, pipeline builds and recipe replay are explicit actions
for trusted code; the JavaScript VM is not a security sandbox. The agent host's
model calls may use a remote service even though Rtistree renders locally.

Edits are journaled and can be undone. Portable export saves the current artwork,
assets and recipes as a new baseline; it does not copy the complete edit history
or production reviews. Keep the original project when those records matter.

Start by [connecting your agent](agent-setup.md). To understand the mechanics
first, [make your first image](getting-started.md) with the small CLI walkthrough.
