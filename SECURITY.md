# Security

Rtistree is an experimental local graphics engine. Only the latest published release
receives fixes; there is no long-term support or response-time commitment yet.

## Trusted code boundary

JavaScript painting programs, dependency pipelines and replayed recipes execute code.
The program VM is not a security sandbox. Only execute code and recipes you trust.
Normal scene rendering reads baked assets and does not execute referenced recipes.
MCP hosts should control the project directories and tools they expose to agents.
Do not expose arbitrary program execution as an unauthenticated network service.

## Reporting

Report a suspected vulnerability privately through GitHub's **Report a vulnerability**
option at https://github.com/Coly010/rtistree/security/advisories/new.
If private reporting is unavailable, contact Colum Ferry at cferry09@gmail.com.
Please include the version, runtime/platform, minimal reproduction and impact.
Do not post working exploits or credentials in public issues.
