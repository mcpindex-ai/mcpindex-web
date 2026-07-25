import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categorize } from './categorize';

test('categorizes an explicit time service as time', () => {
  assert.equal(categorize('clock', 'Get the current time and date.'), 'time');
});

test('does not treat the French word batiment as time', () => {
  assert.equal(categorize('fr.example/service', 'Le batiment en France.'), 'other');
});

test('categorizes a French discovery service as search', () => {
  assert.equal(
    categorize(
      'fr.renoolab/mcp',
      'Trouver et contacter des artisans du batiment en France. Gratuit, sans commission.',
    ),
    'search',
  );
});