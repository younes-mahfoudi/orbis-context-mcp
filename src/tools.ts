import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config, RepoConfig } from './config.js';
import type { GitHubClient } from './github-client.js';

function matchesQuery(repo: RepoConfig, query: string): boolean {
    const q = query.toLowerCase();
    return (
        repo.id.toLowerCase().includes(q) ||
        repo.description.toLowerCase().includes(q) ||
        repo.tags.some((t) => t.toLowerCase().includes(q))
    );
}

export function registerTools(server: McpServer, config: Config, github: GitHubClient): void {
    // ── resolve_library_id ─────────────────────────────────────────────
    server.tool(
        'resolve_library_id',
        'Search and list available Orbis repositories by name, description, or tag. Use this first to discover repository IDs before fetching docs.',
        {
            query: z.string().describe('Search term to match against repository id, description, or tags'),
        },
        async ({ query }) => {
            const matches = config.repositories.filter((r) => matchesQuery(r, query));

            if (matches.length === 0) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `No repositories matched "${query}". Available repositories:\n${config.repositories.map((r) => `- ${r.id}: ${r.description} [${r.tags.join(', ')}]`).join('\n')}`,
                        },
                    ],
                };
            }

            const text = matches
                .map((r) => `- **${r.id}** (${r.owner}/${r.repo}): ${r.description}\n  Tags: ${r.tags.join(', ')}`)
                .join('\n\n');

            return {
                content: [{ type: 'text' as const, text: `Found ${matches.length} matching repository(ies):\n\n${text}` }],
            };
        },
    );

    // ── get_library_docs ───────────────────────────────────────────────
    server.tool(
        'get_library_docs',
        'Fetch the full LLM context documentation for a specific Orbis repository. Use resolve_library_id first to find the correct libraryId.',
        {
            libraryId: z.string().describe('Repository ID from the registry (e.g., "orbis-4u")'),
            topic: z
                .string()
                .optional()
                .describe('Optional: filter to a specific section by heading keyword (e.g., "API", "architecture")'),
        },
        async ({ libraryId, topic }) => {
            const repo = config.repositories.find((r) => r.id === libraryId);
            if (!repo) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Unknown repository "${libraryId}". Use resolve_library_id to find valid IDs.`,
                        },
                    ],
                };
            }

            const content = await github.fetchLlmTxt(repo);
            if (!content) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `No llm.txt found for "${libraryId}" (${repo.owner}/${repo.repo}). The repository may not have generated its documentation yet.`,
                        },
                    ],
                };
            }

            if (topic) {
                const filtered = filterByTopic(content, topic);
                if (filtered) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `# ${repo.id} — "${topic}" sections\n\n${filtered}`,
                            },
                        ],
                    };
                }
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `No sections matching "${topic}" found in ${repo.id}. Returning full documentation.\n\n${content}`,
                        },
                    ],
                };
            }

            return {
                content: [{ type: 'text' as const, text: content }],
            };
        },
    );

    // ── search_across_repos ────────────────────────────────────────────
    server.tool(
        'search_across_repos',
        'Full-text search across all Orbis repositories LLM context docs. Returns matching excerpts with surrounding context.',
        {
            query: z.string().describe('Search term to find across all repository documentation'),
            repos: z
                .array(z.string())
                .optional()
                .describe('Optional: limit search to specific repository IDs'),
        },
        async ({ query, repos: repoFilter }) => {
            const targetRepos = repoFilter
                ? config.repositories.filter((r) => repoFilter.includes(r.id))
                : config.repositories;

            const allDocs = await github.fetchAllLlmTxt(targetRepos);

            if (allDocs.size === 0) {
                return {
                    content: [{ type: 'text' as const, text: 'No documentation available from any repository.' }],
                };
            }

            const queryLower = query.toLowerCase();
            const results: string[] = [];

            for (const [repoId, content] of allDocs) {
                const lines = content.split('\n');
                const matches: string[] = [];

                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(queryLower)) {
                        const start = Math.max(0, i - 2);
                        const end = Math.min(lines.length - 1, i + 2);
                        matches.push(lines.slice(start, end + 1).join('\n'));
                    }
                }

                if (matches.length > 0) {
                    results.push(`## ${repoId}\n\n${matches.slice(0, 10).join('\n\n---\n\n')}`);
                }
            }

            if (results.length === 0) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `No matches found for "${query}" across ${allDocs.size} repositories.`,
                        },
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Search results for "${query}":\n\n${results.join('\n\n')}`,
                    },
                ],
            };
        },
    );

    // ── get_solution_overview ──────────────────────────────────────────
    server.tool(
        'get_solution_overview',
        'Returns a combined high-level overview of the entire Orbis solution, aggregating context from all repositories.',
        {},
        async () => {
            const allDocs = await github.fetchAllLlmTxt(config.repositories);

            const parts: string[] = [
                '# Orbis Solution Overview\n',
                `Total repositories configured: ${config.repositories.length}`,
                `Documentation available: ${allDocs.size}\n`,
            ];

            for (const repo of config.repositories) {
                const content = allDocs.get(repo.id);
                parts.push(`## ${repo.id}\n`);
                parts.push(`**Description**: ${repo.description}`);
                parts.push(`**Repository**: ${repo.owner}/${repo.repo}`);
                parts.push(`**Tags**: ${repo.tags.join(', ')}\n`);

                if (content) {
                    // Extract the first section (up to the second H2) as summary
                    const summary = extractSummary(content);
                    parts.push(summary);
                } else {
                    parts.push('_Documentation not yet available._');
                }
                parts.push('');
            }

            return {
                content: [{ type: 'text' as const, text: parts.join('\n') }],
            };
        },
    );
}

// ── Helpers ────────────────────────────────────────────────────────────

function filterByTopic(content: string, topic: string): string | null {
    const topicLower = topic.toLowerCase();
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const sections: { heading: string; level: number; start: number; end: number }[] = [];

    let match;
    while ((match = headingRegex.exec(content)) !== null) {
        if (sections.length > 0) {
            sections[sections.length - 1].end = match.index;
        }
        sections.push({
            heading: match[2],
            level: match[1].length,
            start: match.index,
            end: content.length,
        });
    }

    const matching = sections.filter((s) => s.heading.toLowerCase().includes(topicLower));
    if (matching.length === 0) return null;

    return matching.map((s) => content.slice(s.start, s.end).trim()).join('\n\n');
}

function extractSummary(content: string): string {
    const lines = content.split('\n');
    const secondH2 = lines.findIndex((line, i) => i > 0 && /^##\s+/.test(line));
    if (secondH2 > 0) {
        return lines.slice(0, secondH2).join('\n').trim();
    }
    // If no second heading, return first 30 lines
    return lines.slice(0, 30).join('\n').trim();
}
