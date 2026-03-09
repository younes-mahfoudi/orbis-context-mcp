import { Octokit } from '@octokit/rest';
import { TtlCache } from './cache.js';
import type { RepoConfig } from './config.js';

export class GitHubClient {
    private octokit: Octokit;
    private cache: TtlCache;
    private llmTxtPath: string;

    constructor(token: string, cache: TtlCache, llmTxtPath = 'docs/llm.txt') {
        this.octokit = new Octokit({ auth: token });
        this.cache = cache;
        this.llmTxtPath = llmTxtPath;
    }

    async fetchLlmTxt(repo: RepoConfig): Promise<string | null> {
        const cacheKey = `llm-txt:${repo.owner}/${repo.repo}`;
        const cached = this.cache.get<string>(cacheKey);
        if (cached !== undefined) return cached;

        try {
            const response = await this.octokit.repos.getContent({
                owner: repo.owner,
                repo: repo.repo,
                path: this.llmTxtPath,
            });

            if ('content' in response.data && response.data.type === 'file') {
                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
                this.cache.set(cacheKey, content);
                return content;
            }

            return null;
        } catch (err: unknown) {
            if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
                // Cache the miss to avoid repeated 404 calls (shorter TTL)
                this.cache.set(cacheKey, null, 300_000); // 5 min for misses
                return null;
            }
            throw err;
        }
    }

    async fetchAllLlmTxt(repos: RepoConfig[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        const fetches = repos.map(async (repo) => {
            const content = await this.fetchLlmTxt(repo);
            if (content) {
                results.set(repo.id, content);
            }
        });
        await Promise.all(fetches);
        return results;
    }

    invalidateRepo(repoId: string, owner: string, repo: string): void {
        this.cache.invalidate(`llm-txt:${owner}/${repo}`);
    }

    invalidateAll(): void {
        this.cache.invalidateAll();
    }
}
