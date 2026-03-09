import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RepoConfig {
    id: string;
    owner: string;
    repo: string;
    description: string;
    tags: string[];
}

export interface Config {
    repositories: RepoConfig[];
}

export function loadConfig(configPath?: string): Config {
    const path = configPath ?? resolve(import.meta.dirname, '../repos.json');
    const raw = readFileSync(path, 'utf-8');
    const config: Config = JSON.parse(raw);

    if (!config.repositories || !Array.isArray(config.repositories)) {
        throw new Error(`Invalid config: "repositories" must be an array`);
    }

    return config;
}
