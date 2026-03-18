import { Octokit } from '@octokit/rest';
import { TtlCache } from './cache.js';
import type { RepoConfig } from './config.js';

export class GitHubClient {
    private octokit: Octokit;
    private token: string;
    private cache: TtlCache;
    private llmTxtPath: string;

    constructor(token: string, cache: TtlCache, llmTxtPath = 'docs/llm.txt') {
        this.octokit = new Octokit({ auth: token });
        this.token = token;
        this.cache = cache;
        this.llmTxtPath = llmTxtPath;
    }

    async fetchLlmTxt(repo: RepoConfig): Promise<string | null> {
        const cacheKey = `llm-txt:${repo.owner}/${repo.repo}`;
        const cached = this.cache.get<string>(cacheKey);
        if (cached !== undefined) return cached;

        try {
            // Use raw media type to support files > 1 MB (up to ~100 MB)
            const response = await this.octokit.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                {
                    owner: repo.owner,
                    repo: repo.repo,
                    path: this.llmTxtPath,
                    headers: { Accept: 'application/vnd.github.raw+json' },
                },
            );

            const content = response.data as unknown as string;
            this.cache.set(cacheKey, content);
            return content;
        } catch (err: unknown) {
            const status =
                err instanceof Error && 'status' in err
                    ? (err as { status: number }).status
                    : 0;

            // For 403 (file too large) or 404, try raw.githubusercontent.com fallback
            if (status === 403 || status === 404) {
                try {
                    const content = await this.fetchRawFallback(repo);
                    if (content !== null) {
                        this.cache.set(cacheKey, content);
                        return content;
                    }
                } catch {
                    // fall through to cache miss
                }
                this.cache.set(cacheKey, null, 300_000); // 5 min for misses
                return null;
            }
            throw err;
        }
    }

    private async fetchRawFallback(repo: RepoConfig): Promise<string | null> {
        const url = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/HEAD/${this.llmTxtPath}`;
        const resp = await fetch(url, {
            headers: { Authorization: `token ${this.token}` },
        });
        if (resp.ok) {
            return resp.text();
        }
        return null;
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
