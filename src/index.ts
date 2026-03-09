import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';
import { randomUUID } from 'node:crypto';

import { loadConfig, type Config } from './config.js';
import { TtlCache } from './cache.js';
import { GitHubClient } from './github-client.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

// ─── Configuration ───────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PORT = parseInt(process.env.PORT ?? '3200', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const TRANSPORT = process.env.TRANSPORT ?? 'stdio';
const CONFIG_PATH = process.env.REPOS_CONFIG;

if (!GITHUB_TOKEN) {
    console.error('[orbis-context] GITHUB_TOKEN environment variable is required.');
    process.exit(1);
}

// ─── Bootstrap ───────────────────────────────────────────────────────
const config: Config = loadConfig(CONFIG_PATH);
const cache = new TtlCache();
const github = new GitHubClient(GITHUB_TOKEN, cache);

console.error(`[orbis-context] Loaded ${config.repositories.length} repositories: ${config.repositories.map((r) => r.id).join(', ')}`);

function createServer(): McpServer {
    return new McpServer(
        {
            name: 'orbis-context',
            version: '1.0.0',
        },
        {
            capabilities: {
                resources: {},
                tools: {},
                prompts: {},
            },
        },
    );
}

function setupServer(server: McpServer): void {
    registerResources(server, config, github);
    registerTools(server, config, github);
    registerPrompts(server, config, github);
}

// ─── HTTP Transport (Streamable HTTP) ────────────────────────────────
async function startHttpServer(): Promise<void> {
    const app = express();
    app.use(express.json());

    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.all('/mcp', async (req, res) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (req.method === 'GET' || req.method === 'DELETE') {
            if (!sessionId || !transports.has(sessionId)) {
                res.status(400).json({ error: 'No valid session. Send a POST with an initialize request first.' });
                return;
            }
            const transport = transports.get(sessionId)!;

            if (req.method === 'DELETE') {
                await transport.close();
                transports.delete(sessionId);
                res.status(200).end();
                return;
            }

            await transport.handleRequest(req, res);
            return;
        }

        if (req.method === 'POST') {
            const body = req.body;
            const isInitialize =
                body &&
                ((body as Record<string, unknown>).method === 'initialize' ||
                    (Array.isArray(body) && body.some((m: Record<string, unknown>) => m.method === 'initialize')));

            if (isInitialize) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                });

                const server = createServer();
                setupServer(server);
                await server.connect(transport);

                const origSessionId = transport.sessionId;
                if (origSessionId) {
                    transports.set(origSessionId, transport);
                }

                transport.onclose = () => {
                    if (transport.sessionId) {
                        transports.delete(transport.sessionId);
                    }
                };

                await transport.handleRequest(req, res, body);

                if (transport.sessionId && transport.sessionId !== origSessionId) {
                    if (origSessionId) transports.delete(origSessionId);
                    transports.set(transport.sessionId, transport);
                }
            } else if (sessionId && transports.has(sessionId)) {
                const transport = transports.get(sessionId)!;
                await transport.handleRequest(req, res, body);
            } else {
                res.status(400).json({ error: 'No valid session. Send an initialize request first.' });
            }

            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    });

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            server: 'orbis-context',
            version: '1.0.0',
            transport: 'streamable-http',
            repositories: config.repositories.length,
            cacheSize: cache.size,
        });
    });

    app.listen(PORT, HOST, () => {
        console.log(`[orbis-context] MCP server listening on http://${HOST}:${PORT}/mcp`);
        console.log(`[orbis-context] Health check at http://${HOST}:${PORT}/health`);
        console.log(`[orbis-context] ${config.repositories.length} repositories configured`);
    });
}

// ─── Stdio Transport ─────────────────────────────────────────────────
async function startStdioServer(): Promise<void> {
    const server = createServer();
    setupServer(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`[orbis-context] MCP server running on stdio (${config.repositories.length} repositories configured)`);
}

// ─── Main ────────────────────────────────────────────────────────────
if (TRANSPORT === 'stdio') {
    startStdioServer().catch((err) => {
        console.error('[orbis-context] Fatal error:', err);
        process.exit(1);
    });
} else {
    startHttpServer().catch((err) => {
        console.error('[orbis-context] Fatal error:', err);
        process.exit(1);
    });
}
