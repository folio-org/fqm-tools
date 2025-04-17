import { DataType, DataTypeValue } from '@/types';
import { describe, expect, it } from 'bun:test';
import { getValues } from './values';

describe('getValues', () => {
  it('gives enum values, if available', () => {
    expect(getValues({} as DataType, { enum: ['a complex value', 'b_is_cool'] })).toEqual({
      values: [
        { value: 'a complex value', label: 'A complex value' },
        { value: 'b_is_cool', label: 'B is cool' },
      ],
    });
  });

  it('uses hardcoded boolean values when applicable', () => {
    expect(getValues({ dataType: DataTypeValue.booleanType }, {})).toEqual({
      values: [
        { value: 'true', label: 'True' },
        { value: 'false', label: 'False' },
      ],
    });
  });

  it('returns no values when none are available', () => {
    expect(getValues({ dataType: DataTypeValue.stringType }, {})).toEqual({});
  });
});
