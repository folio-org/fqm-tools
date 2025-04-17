import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import { getIsIdColumn } from './extra-properties';

describe('getIsIdColumn', () => {
  it.each([
    ['id', {}],
    ['id', { 'x-fqm-is-id-column': true }],
    ['something_else', { 'x-fqm-is-id-column': true }],
  ] as [string, JSONSchema7][])('detects %s,%o as an ID column', (name, schema) => {
    expect(getIsIdColumn(name, schema).isIdColumn).toBeTrue();
  });

  it.each([
    ['id', { 'x-fqm-is-id-column': false }],
    ['something_else', {}],
    ['something_else', { 'x-fqm-is-id-column': false }],
  ] as [string, JSONSchema7][])('detects %s,%o as a non-ID column', (name, schema) => {
    expect(getIsIdColumn(name, schema).isIdColumn).toBeFalsy();
  });
});
