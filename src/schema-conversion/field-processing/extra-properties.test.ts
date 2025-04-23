import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import { getExtraProperties, getIsIdColumn } from './extra-properties';

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

describe('getExtraProperties', () => {
  it('should return valueSourceApi when x-fqm-value-source-api is present', () => {
    const schema = { 'x-fqm-value-source-api': 'api-source' } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties.valueSourceApi as unknown).toBe('api-source');
  });

  it.each([
    ['all', { queryable: true, queryOnly: false, hidden: false }],
    ['query-only', { queryable: true, queryOnly: true, hidden: false }],
    ['results-only', { queryable: false, queryOnly: false, hidden: false }],
    ['hidden', { hidden: true }],
  ])('should handle x-fqm-visibility=%s correctly', (visibility, expected) => {
    const schema = { 'x-fqm-visibility': visibility } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties).toMatchObject(expected);
    expect(result.issues).toBeEmpty();
  });

  it('should throw an error for invalid x-fqm-visibility value', () => {
    const schema = { 'x-fqm-visibility': 'invalid' } as JSONSchema7;
    expect(() => getExtraProperties(schema)).toThrow('Invalid value for x-fqm-visibility: invalid');
  });

  it('should set visibleByDefault when x-fqm-visibility-by-default is present', () => {
    const schema = { 'x-fqm-visibility-by-default': true } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties.visibleByDefault).toBe(true);
    expect(result.issues).toBeEmpty();
  });

  it('should set essential when x-fqm-essential is present', () => {
    const schema = { 'x-fqm-essential': true } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties.essential).toBe(true);
    expect(result.issues).toBeEmpty();
  });

  it('should set name when x-fqm-name is present', () => {
    const schema = { 'x-fqm-name': 'customName' } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties.name).toBe('customName');
    expect(result.issues).toBeEmpty();
  });

  it('should pass intermediate join information', () => {
    const schema = {
      'x-fqm-joins-to': [{ targetModule: 'mod-target', targetEntity: 'entity', targetField: 'field1' }],
    } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties.joinsToIntermediate).toEqual((schema as Record<string, never>)['x-fqm-joins-to']);
    expect(result.issues).toBeEmpty();
  });

  it('fails on invalid joins', () => {
    const schema = {
      'x-fqm-joins-to': [{ targetModule: 'mod-target', targetEntity: 'entity', targetField: 'field1', type: 'bad' }],
    } as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties.joinsToIntermediate).toBeEmpty();
    expect(result.issues).toContain(
      "Error parsing x-fqm-joins-to: Invalid discriminator value. Expected  | 'equality-simple' | 'equality-cast-uuid' | 'custom'",
    );
  });

  it('should return an empty object when no relevant properties are present', () => {
    const schema = {} as JSONSchema7;
    const result = getExtraProperties(schema);
    expect(result.extraProperties).toEqual({});
    expect(result.issues).toBeEmpty();
  });
});
