// Ranking-shape tests for lib/search.ts.
//
// This module had NO suite, which is how O4 (below) shipped: prefix matching is
// one-directional, so every plural query token silently missed the servers named
// in the singular. `?q=pdfs` on production returned pdfspark and pdfslim but not
// io.pdfbroker/pdf or mcp-pdf - the two servers a person typing "read PDFs"
// actually wants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, searchableName } from './search';
import type { IndexedServer } from './types';

function server(over: Partial<IndexedServer> & { name: string }): IndexedServer {
  return {
    source: 'registry',
    slug: over.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    baseSlug: '',
    title: over.name,
    description: '',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    status: 'active',
    hasRemote: false,
    hasPackage: true,
    primaryTransport: null,
    envVars: [],
    ...over,
  } as IndexedServer;
}

const names = (hits: ReturnType<typeof search>) => hits.map((h) => h.server.name);

// ---------------------------------------------------------------- O4 regression

test('a plural query token reaches a singular-named server', () => {
  const corpus = [
    server({ name: 'io.pdfbroker/pdf', title: 'PDF' }),
    server({ name: 'io.github.kmalakoff/mcp-pdf', title: 'MCP PDF' }),
    server({ name: 'io.github.dpozimski/pdfspark-mcp', title: 'PDFSpark' }),
  ];
  // The production defect: only pdfspark came back, because `\bpdfs` cannot
  // reach the word "pdf".
  assert.deepEqual(names(search(corpus, 'pdfs')).sort(), [
    'io.github.dpozimski/pdfspark-mcp',
    'io.github.kmalakoff/mcp-pdf',
    'io.pdfbroker/pdf',
  ]);
});

test('the singular query still reaches the plural-named server (O2’ unbroken)', () => {
  const corpus = [server({ name: 'com.google/sheets', title: 'Google Sheets' })];
  assert.deepEqual(names(search(corpus, 'sheet')), ['com.google/sheets']);
});

test('the plural reaches a singular name across a word boundary, not just standalone', () => {
  const corpus = [server({ name: 'org.acme/invoice-generator', title: 'Invoice Generator' })];
  assert.deepEqual(names(search(corpus, 'invoices')), ['org.acme/invoice-generator']);
});

// ---------------------------------------------------------------- precision guards

test('the singular stem matches as a WHOLE WORD, never as a prefix', () => {
  // If "docs" folded to a bare `\bdoc` prefix, docker would match. It must not:
  // recall bought with precision is not a fix.
  const corpus = [
    server({ name: 'io.docker/docker', title: 'Docker' }),
    server({ name: 'org.acme/doc', title: 'Doc' }),
  ];
  assert.deepEqual(names(search(corpus, 'docs')), ['org.acme/doc']);
});

test('a non-plural trailing s is left alone (ss / us / is)', () => {
  const corpus = [
    server({ name: 'org.acme/acces', title: 'Acce' }),
    server({ name: 'org.acme/statu', title: 'Statu' }),
    server({ name: 'org.acme/analysi', title: 'Analysi' }),
  ];
  // Stripping the s off access/status/analysis would match these nonsense stems.
  for (const q of ['access', 'status', 'analysis']) {
    assert.deepEqual(names(search(corpus, q)), [], `"${q}" must not be stemmed`);
  }
});

test('short tokens are never stemmed (aws must not become aw)', () => {
  const corpus = [server({ name: 'org.acme/aw', title: 'Aw' })];
  assert.deepEqual(names(search(corpus, 'aws')), []);
});

test('two-char tokens stay whole-word (s3 is not a prefix of s3cret)', () => {
  const corpus = [
    server({ name: 'com.pulsemcp/s3', title: 'S3' }),
    server({ name: 'org.acme/s3cret', title: 'S3cret' }),
  ];
  assert.deepEqual(names(search(corpus, 's3')), ['com.pulsemcp/s3']);
});

// ---------------------------------------------------------------- existing behavior

test('matchedTerms reports the QUERY token, not the internal stem', () => {
  // buildReasoning() prints these back to the agent verbatim; leaking "pdf" for a
  // "pdfs" query would describe a match the user never typed.
  const hits = search([server({ name: 'io.pdfbroker/pdf', title: 'PDF' })], 'pdfs');
  assert.deepEqual(hits[0].matchedTerms, ['pdfs']);
});

test('O1: the reverse-DNS hosting prefix is not searchable', () => {
  assert.equal(searchableName('io.github.owner/repo'), 'repo');
  assert.equal(searchableName('com.vendor.product'), 'product');
});

test('a query of only stopwords returns nothing rather than everything', () => {
  const corpus = [server({ name: 'org.acme/thing', title: 'Thing' })];
  assert.deepEqual(names(search(corpus, 'the mcp server for it')), []);
});
