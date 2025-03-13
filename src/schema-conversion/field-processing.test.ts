import { expect, test } from 'bun:test';
import { getSimpleTypeOf } from './field-processing';
import { Schema } from 'genson-js/dist';

test.each([[{ type: 'string' }, 'string']] as [Schema, ReturnType<typeof getSimpleTypeOf>][])(
  `getSimpleTypeOf(%j)`,
  (schema, expected) => {
    expect(getSimpleTypeOf(schema)).toEqual(expected);
  },
);
