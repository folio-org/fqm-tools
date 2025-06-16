import { EntityTypeGenerationConfig } from '@/types';
import { afterEach, beforeEach, describe, expect, it, Mock, mock } from 'bun:test';
import type { Error as SchemaError } from './error';

// @ts-expect-error TS doesn't know how to type this, but we require the query param until https://github.com/oven-sh/bun/issues/7823
import { error, warn } from './error?DO_NOT_LOAD_MOCKED';

describe('error', () => {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  let consoleLogMock: Mock<typeof console.log>;
  let consoleWarnMock: Mock<typeof console.warn>;
  let consoleErrorMock: Mock<typeof console.error>;

  beforeEach(() => {
    consoleLogMock = mock();
    consoleWarnMock = mock();
    consoleErrorMock = mock();
    console.log = consoleLogMock;
    console.warn = consoleWarnMock;
    console.error = consoleErrorMock;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  const metadata: EntityTypeGenerationConfig['metadata'] = {
    domain: 'circulation',
    module: 'mod-test',
    team: 'cool people',
  };

  it('logs warning and serialized output for translations error', () => {
    const err: SchemaError = {
      type: 'translations',
      missingTranslations: { key1: 'value1', key2: 'value2' },
    };
    warn(metadata, 'EntityType', err);

    expect(consoleErrorMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('[circulation->mod-test (team cool people)] Missing translations'),
    );
    expect(consoleWarnMock).toHaveBeenCalledWith(expect.stringContaining('The following translations are missing'));
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      entityTypeName: 'EntityType',
      metadata: {
        domain: 'circulation',
        module: 'mod-test',
        team: 'cool people',
      },
      missingTranslations: {
        key1: 'value1',
        key2: 'value2',
      },
      severity: 'warning',
      type: 'translations',
    });
  });

  it('logs warning and serialized output for unused translations error', () => {
    const err: SchemaError = {
      type: 'translations-extra',
      extraTranslations: ['foo', 'bar'],
    };
    warn(metadata, 'EntityType', err);

    expect(consoleErrorMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('[circulation->mod-test (team cool people)] Extra translations'),
    );
    expect(consoleWarnMock).toHaveBeenCalledWith(expect.stringContaining('The following translations are unused'));
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      entityTypeName: 'EntityType',
      metadata: {
        domain: 'circulation',
        module: 'mod-test',
        team: 'cool people',
      },
      extraTranslations: ['foo', 'bar'],
      severity: 'warning',
      type: 'translations-extra',
    });
  });

  it('logs error and serialized output for join error', () => {
    const err: SchemaError = {
      type: 'join',
      fieldName: 'fieldA',
      targetModule: 'modB',
      targetEntity: 'EntityB',
      targetField: 'fieldB',
      missing: 'entity',
    };
    error(undefined, 'EntityType', err);

    expect(consoleWarnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining('Join issue'));
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('is trying to join to `modB` (`EntityB`) but the entity does not exist'),
    );
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      entityTypeName: 'EntityType',
      fieldName: 'fieldA',
      missing: 'entity',
      severity: 'error',
      targetEntity: 'EntityB',
      targetField: 'fieldB',
      targetModule: 'modB',
      type: 'join',
    });
  });

  it('logs error and serialized output for schema error', () => {
    const err: SchemaError = {
      type: 'schema',
      message: 'Invalid schema',
    };
    error(metadata, undefined, err);

    expect(consoleWarnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining('Invalid schema'));
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      message: 'Invalid schema',
      metadata: {
        domain: 'circulation',
        module: 'mod-test',
        team: 'cool people',
      },
      severity: 'error',
      type: 'schema',
    });
  });

  it('logs error and serialized output for config-does-not-exist error', () => {
    const err: SchemaError = {
      type: 'config-does-not-exist',
      file: 'config.json',
    };
    error(undefined, undefined, err);

    expect(consoleWarnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining('Configuration file does not exist'));
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      file: 'config.json',
      severity: 'error',
      type: 'config-does-not-exist',
    });
  });

  it('logs error and serialized output for config-schema error', () => {
    const err: SchemaError = {
      type: 'config-schema',
      file: 'config.json',
      error: 'Invalid property',
    };
    error(metadata, 'EntityType', err);

    expect(consoleWarnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('Configuration schema error in `config.json`: Invalid property'),
    );
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      entityTypeName: 'EntityType',
      error: 'Invalid property',
      file: 'config.json',
      metadata: {
        domain: 'circulation',
        module: 'mod-test',
        team: 'cool people',
      },
      severity: 'error',
      type: 'config-schema',
    });
  });

  it('logs error and serialized output for unknown-team error', () => {
    error(undefined, undefined, {
      type: 'unknown-team',
      teamName: 'unknown',
    });

    expect(consoleWarnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining('The team `unknown` is not known'));
    expect(JSON.parse(consoleLogMock.mock.lastCall![0])).toEqual({
      severity: 'error',
      type: 'unknown-team',
      teamName: 'unknown',
    });
  });
});
