# Orbis Context MCP

MCP server that aggregates LLM context documentation from all Orbis solution repositories, providing AI coding assistants with full solution-wide context — similar to how Context7 works for open-source libraries.

## Architecture

Two deliverables in this repository:

### 1. MCP Server (`src/`)

A TypeScript MCP server that:
- Fetches `docs/llm.txt` files from configured GitHub repositories via the GitHub API
- Caches content in-memory with configurable TTL (default: 1 hour)
- Exposes 4 tools, 3 resources, and 2 prompts following the Model Context Protocol
- Supports both stdio (IDE) and HTTP (shared deployment) transports

### 2. GitHub Action (`action/`)

A reusable composite GitHub Action that:
- Collects repository sources (README, copilot-instructions, pom.xml, OpenAPI specs, key source files)
- Calls GitHub Models API to generate a comprehensive `docs/llm.txt`
- Auto-commits the file to the repository

## MCP Tools

| Tool | Description |
|------|-------------|
| `resolve_library_id` | Search available Orbis repos by name, description, or tag |
| `get_library_docs` | Fetch full llm.txt context for a specific repo |
| `search_across_repos` | Full-text search across all repos' documentation |
| `get_solution_overview` | Combined overview of the entire Orbis solution |

## MCP Resources

| URI | Description |
|-----|-------------|
| `orbis://repos` | JSON list of all configured repositories |
| `orbis://repos/{repoId}/context` | Full llm.txt for a specific repo |
| `orbis://solution/overview` | Combined solution overview |

## MCP Prompts

| Prompt | Description |
|--------|-------------|
| `analyze-cross-repo-impact` | Analyze cross-repository impact of a change |
| `explain-data-flow` | Trace data flow across the Orbis ecosystem |

## Quick Start

### MCP Server

```bash
# Install dependencies
npm install

# Build
npm run build

# Run (stdio mode — for IDE integration)
GITHUB_TOKEN=ghp_xxx npm start

# Run (HTTP mode — for shared deployment)
GITHUB_TOKEN=ghp_xxx TRANSPORT=http npm start
```

### VS Code Integration

The `.vscode/mcp.json` is preconfigured. Set `GITHUB_TOKEN` in your environment:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

### GitHub Action

Add to your release workflow:

```yaml
- name: 📝 Generate LLM.txt
  uses: dedalus-cis4u/generate-llm-txt@main
  with:
    github-token: ${{ secrets.PAT_TOKEN }}
```

### Docker

```bash
docker build -t orbis-context-mcp .
docker run -e GITHUB_TOKEN=ghp_xxx -p 3200:3200 orbis-context-mcp
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | (required) | GitHub token with repo read access |
| `TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | `3200` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `CACHE_TTL_MS` | `3600000` | Cache TTL in milliseconds (default: 1h) |
| `REPOS_CONFIG` | `repos.json` | Path to repository registry file |

### Repository Registry (`repos.json`)

```json
{
  "repositories": [
    {
      "id": "orbis-4u",
      "owner": "dedalus-cis4u",
      "repo": "orbis-4u",
      "description": "ORBIS 4U application",
      "tags": ["backend", "java", "rest-api"]
    }
  ]
}
```

## GitHub Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | — | Token with repo + models access |
| `model` | No | `gpt-4o` | GitHub Models model |
| `output-path` | No | `docs/llm.txt` | Output file path |
| `extra-context-paths` | No | — | Extra file globs (comma-separated) |
| `commit-changes` | No | `true` | Auto-commit generated file |
