import { type ChainMethod, chainCall, quoted } from "../codegen/index.js";
import type { FieldDef, TableDef } from "../ir/types.js";
import type { DialectConfig } from "./dialect.js";
import { toTableVariableName } from "./naming.js";

export function mapFieldToColumn(
  field: FieldDef,
  table: TableDef,
  dialect: DialectConfig,
  shouldPluralize = true,
): string {
  const calls: ChainMethod[] = [];

  if (isPrimaryKey(field, table)) {
    calls.push({ method: "primaryKey" });
  }

  if (field.uuid?.autoGenerate) {
    calls.push({ method: "$defaultFn", args: ["() => generateBase36Id()"] });
  }

  if (!field.nullable && !isPrimaryKey(field, table)) {
    calls.push({ method: "notNull" });
  }

  if (field.references) {
    const targetVar = toTableVariableName(field.references.tableName, shouldPluralize);
    const targetField = field.references.fieldName;
    calls.push({ method: "references", args: [`() => ${targetVar}.${targetField}`] });
  }

  if (field.createdAt || field.updatedAt) {
    calls.push(dialect.mapTimestampDefault());
  }

  if (field.constraints?.unique) {
    calls.push({ method: "unique" });
  }

  if (field.defaultValue !== undefined && !field.createdAt && !field.updatedAt) {
    calls.push({ method: "default", args: [mapDefault(field.defaultValue)] });
  }

  const base = field.nullable ? dialect.mapNullableFieldType(field) : dialect.mapFieldType(field);
  return chainCall(base, calls);
}

function isPrimaryKey(field: FieldDef, table: TableDef): boolean {
  return !table.primaryKey.isComposite && table.primaryKey.columns.includes(field.name);
}

function mapDefault(value: unknown): string {
  if (typeof value === "string") {
    return quoted(value);
  }
  return String(value);
}
