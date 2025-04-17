import { EntityTypeField } from '@/types';
import { JSONSchema7 } from 'json-schema';

export const START_PAGE = -1;
export const END_PAGE = -2;

export interface State {
  page: number;
  source: string;
  schemaRaw: string;
  schema?: JSONSchema7 & { properties: NonNullable<JSONSchema7['properties']> };
  columns: EntityTypeField[];
  translations: Record<string, string>;
  warnings: string[];
}
