#!/usr/bin/env node
// generate-llm-txt.mjs — Calls GitHub Models API to generate llm.txt from collected sources
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import ModelClient from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';

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
const sources = readFileSync(SOURCES_FILE, 'utf-8');
const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');

console.log(`Source content size: ${sources.length} chars`);
console.log(`Using model: ${MODEL}`);

// Call GitHub Models API
const endpoint = 'https://models.github.ai';
const client = ModelClient(endpoint, new AzureKeyCredential(GITHUB_TOKEN));

console.log('Calling GitHub Models API...');

const response = await client.path('/chat/completions').post({
    body: {
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
    },
});

if (response.status !== '200') {
    console.error('API call failed:', response.status, response.body);
    process.exit(1);
}

const content = response.body.choices[0]?.message?.content;
if (!content) {
    console.error('No content in API response');
    process.exit(1);
}

// Write output
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, content, 'utf-8');

console.log(`Generated llm.txt (${content.length} chars) at ${OUTPUT_PATH}`);
