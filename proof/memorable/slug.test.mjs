import { test } from 'node:test';
import assert from 'node:assert';
import { slugify, truncateSlug } from './slug.mjs';

test('basic conversion', () => {
  assert.strictEqual(slugify('Hello World'), 'hello-world');
});

test('handles multiple special characters', () => {
  assert.strictEqual(slugify('Hello---World!!!'), 'hello-world');
});

test('trims leading and trailing dashes', () => {
  assert.strictEqual(slugify('---hello-world---'), 'hello-world');
});

test('truncateSlug: returns full slug when under limit', () => {
  assert.strictEqual(truncateSlug('Hello World', 20), 'hello-world');
});

test('truncateSlug: truncates to n chars', () => {
  assert.strictEqual(truncateSlug('Hello World Test', 10), 'hello-worl');
});

test('truncateSlug: removes trailing dash after truncation', () => {
  assert.strictEqual(truncateSlug('Hello World Test', 11), 'hello-world');
});

test('truncateSlug: handles multiple dashes at truncation point', () => {
  assert.strictEqual(truncateSlug('Hello World Test Long', 12), 'hello-world');
});

test('truncateSlug: works with special characters', () => {
  assert.strictEqual(truncateSlug('Hello!!! World!!!', 12), 'hello-world');
});
