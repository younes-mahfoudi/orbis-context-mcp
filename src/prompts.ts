import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import type { GitHubClient } from './github-client.js';

export function registerPrompts(server: McpServer, config: Config, github: GitHubClient): void {
    // ── analyze-cross-repo-impact ──────────────────────────────────────
    server.prompt(
        'analyze-cross-repo-impact',
        'Analyze how a change in one Orbis repository might affect other repositories in the solution',
        {
            repo: z.string().describe('The repository where the change is being made (e.g., "orbis-4u")'),
            change_description: z.string().describe('Description of the change being made'),
        },
        async ({ repo, change_description }) => {
            const allDocs = await github.fetchAllLlmTxt(config.repositories);

            const contextParts: string[] = [];
            for (const [repoId, content] of allDocs) {
                contextParts.push(`=== ${repoId} ===\n${content}\n`);
            }

            return {
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `You are an expert on the Orbis healthcare solution ecosystem. Analyze the cross-repository impact of a proposed change.

**Repository being changed**: ${repo}
**Proposed change**: ${change_description}

Below is the full documentation context for all Orbis repositories:

${contextParts.join('\n')}

Please analyze:
1. **Direct impact**: What components in ${repo} are affected?
2. **Cross-repo impact**: Which other repositories might be affected and how?
3. **API/contract changes**: Are there any API, SPI, event, or message contract changes that other repos depend on?
4. **Migration steps**: What steps would consumers of this repo need to take?
5. **Risk assessment**: Rate the overall risk (low/medium/high) with justification.`,
                        },
                    },
                ],
            };
        },
    );

    // ── explain-data-flow ──────────────────────────────────────────────
    server.prompt(
        'explain-data-flow',
        'Trace a data flow across the Orbis ecosystem from origin to destination',
        {
            starting_point: z.string().describe('Where the data flow begins (e.g., "REST API call to orbis-4u", "Orbis Event")'),
            data_type: z.string().describe('Type of data being traced (e.g., "patient order", "clinical event", "security token")'),
        },
        async ({ starting_point, data_type }) => {
            const allDocs = await github.fetchAllLlmTxt(config.repositories);

            const contextParts: string[] = [];
            for (const [repoId, content] of allDocs) {
                contextParts.push(`=== ${repoId} ===\n${content}\n`);
            }

            return {
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `You are an expert on the Orbis healthcare solution ecosystem. Trace the data flow described below across the system.

**Starting point**: ${starting_point}
**Data type**: ${data_type}

Below is the full documentation context for all Orbis repositories:

${contextParts.join('\n')}

Please provide:
1. **Flow diagram**: A step-by-step trace of the data flow, including which repositories and components are involved at each step.
2. **Transformations**: Any data mapping or transformation that happens along the way.
3. **Integration points**: Where repos hand off data to each other (REST calls, Kafka topics, Orbis Events, database access).
4. **Error scenarios**: What happens if the flow fails at each integration point.
5. **Configuration**: Any relevant configuration that controls this flow.`,
                        },
                    },
                ],
            };
        },
    );
}
