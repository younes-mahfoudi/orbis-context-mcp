#!/usr/bin/env node
// generate-llm-txt.mjs — Calls GitHub Models API to generate llm.txt from collected sources
// Uses native fetch (Node 22+) — zero npm dependencies
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODEL = process.env.MODEL || 'gpt-4o';
const OUTPUT_PATH = process.env.OUTPUT_PATH || 'docs/llm.txt';
const SOURCES_FILE = process.env.SOURCES_FILE;
const SYSTEM_PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH;

if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN is required');
    process.exit(1);
}

if (!SOURCES_FILE) {
    console.error('Error: SOURCES_FILE is required');
    process.exit(1);
}

// Read inputs
let sources = readFileSync(SOURCES_FILE, 'utf-8');
const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');

// Truncate if too large (keep under ~30K tokens)
const MAX_SOURCE_CHARS = 120000;
if (sources.length > MAX_SOURCE_CHARS) {
  console.log(`Truncating sources from ${sources.length} to ${MAX_SOURCE_CHARS} chars`);
  sources = sources.slice(0, MAX_SOURCE_CHARS) + '\n... [truncated]';
}

console.log(`Source content size: ${sources.length} chars`);
console.log(`Using model: ${MODEL}`);
console.log('Calling GitHub Models API...');

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min timeout

const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
  signal: controller.signal,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
        model: MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Generate the llm.txt documentation for the following repository. Here is the collected source material:\n\n${sources}`,
            },
        ],
        temperature: 0.3,
        max_tokens: 16000,
    }),
});

clearTimeout(timeout);

if (!response.ok) {
    const errorBody = await response.text();
    console.error(`API call failed: ${response.status} ${response.statusText}`);
    console.error(errorBody);
    process.exit(1);
}

const data = await response.json();
const content = data.choices?.[0]?.message?.content;
if (!content) {
    console.error('No content in API response');
    process.exit(1);
}

// Write output
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, content, 'utf-8');

console.log(`Generated llm.txt (${content.length} chars) at ${OUTPUT_PATH}`);
