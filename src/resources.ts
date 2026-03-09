import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import type { GitHubClient } from './github-client.js';

export function registerResources(server: McpServer, config: Config, github: GitHubClient): void {
    // ── Static: repository list ────────────────────────────────────────
    server.resource(
        'repository-list',
        'orbis://repos',
        { description: 'JSON list of all configured Orbis repositories with metadata' },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(
                        config.repositories.map((r) => ({
                            id: r.id,
                            owner: r.owner,
                            repo: r.repo,
                            description: r.description,
                            tags: r.tags,
                        })),
                        null,
                        2,
                    ),
                },
            ],
        }),
    );

    // ── Dynamic: per-repo llm.txt context ──────────────────────────────
    server.resource(
        'repo-context',
        new ResourceTemplate('orbis://repos/{repoId}/context', { list: undefined }),
        { description: 'Full LLM context documentation (llm.txt) for a specific Orbis repository' },
        async (uri, params) => {
            const repoId = params.repoId as string;
            const repo = config.repositories.find((r) => r.id === repoId);

            if (!repo) {
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: 'text/plain',
                            text: `Unknown repository: ${repoId}`,
                        },
                    ],
                };
            }

            const content = await github.fetchLlmTxt(repo);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'text/markdown',
                        text: content ?? `No llm.txt found for ${repoId}. The repository may not have generated its documentation yet.`,
                    },
                ],
            };
        },
    );

    // ── Static: solution overview ──────────────────────────────────────
    server.resource(
        'solution-overview',
        'orbis://solution/overview',
        { description: 'Combined high-level overview of the entire Orbis solution' },
        async (uri) => {
            const allDocs = await github.fetchAllLlmTxt(config.repositories);

            const parts: string[] = [
                '# Orbis Solution Overview\n',
                `Repositories: ${config.repositories.length} | With docs: ${allDocs.size}\n`,
            ];

            for (const repo of config.repositories) {
                const content = allDocs.get(repo.id);
                parts.push(`## ${repo.id}`);
                parts.push(`${repo.description}`);

                if (content) {
                    // First paragraph as summary
                    const firstParagraph = content
                        .split('\n\n')
                        .find((p) => p.trim() && !p.startsWith('#'));
                    if (firstParagraph) {
                        parts.push(firstParagraph.trim());
                    }
                } else {
                    parts.push('_Documentation pending._');
                }
                parts.push('');
            }

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'text/markdown',
                        text: parts.join('\n'),
                    },
                ],
            };
        },
    );
}
