// canonicalize is the pre-judge normalizer: an instruction hidden behind invisible
// characters must not survive into the text the screening judge reads, and the SAME
// normalizer runs on the judge's quote so grounding stays symmetric. These fixtures
// are the invisible-instruction channels; the tag-block and variation-selector cases
// are the ones the old hand-rolled class missed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, quoteIsGrounded } from './screen';

test('strips zero-width, bidi, joiner, soft-hyphen, BOM (the original class)', () => {
  assert.equal(canonicalize('ig​no­re﻿ all'), 'ignore all');
  assert.equal(canonicalize('a‮b‬c'), 'abc');
});

test('strips Unicode tag characters (ASCII smuggling)', () => {
  // "delete" spelled in the tag block U+E0000-E007F, invisible to a human reviewer.
  const tagged = 'safe tool \u{e0064}\u{e0065}\u{e006c}\u{e0065}\u{e0074}\u{e0065}\u{e007f}';
  assert.equal(canonicalize(tagged), 'safe tool');
});

test('strips variation selectors and Mongolian FVS', () => {
  assert.equal(canonicalize('a️\u{e0100}᠋b'), 'ab');
});

test('NFKC folds compatibility forms before stripping', () => {
  assert.equal(canonicalize('Ｉｇｎｏｒｅ'), 'Ignore');
});

test('collapses whitespace and trims, leaving visible text intact', () => {
  assert.equal(canonicalize('  read\tthe   docs\n'), 'read the docs');
});

test('grounding stays symmetric: a quote hidden the same way still matches', () => {
  const screened = canonicalize('please \u{e0065}\u{e0076}\u{e0069}\u{e006c} now');
  // The judge points at the visible remainder; a tag-obscured quote canonicalizes
  // to the same bytes, so a real pointer grounds and a hidden-only payload cannot.
  assert.ok(quoteIsGrounded(screened, 'please now'));
  assert.equal(canonicalize('\u{e0065}\u{e0076}\u{e0069}\u{e006c}'), '');
  assert.equal(quoteIsGrounded(screened, '\u{e0065}\u{e0076}\u{e0069}\u{e006c}'), false);
});
