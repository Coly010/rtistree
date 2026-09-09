import { Project, rtistreeAgentInstructions, artDirectionGuide } from 'rtistree';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const project = await Project.open(fileURLToPath(new URL('./scene.json', import.meta.url)));
const result = await project.render();
await writeFile(new URL('./sdk-output.png', import.meta.url), result.png);
console.log({ width: result.width, height: result.height, guide: artDirectionGuide.version });
// Include this string in your agent's instructions when integrating the SDK.
console.log(rtistreeAgentInstructions);
