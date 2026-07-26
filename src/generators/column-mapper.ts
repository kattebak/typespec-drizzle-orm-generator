import { type ChainMethod, chainCall, objectLiteral, quoted } from "../codegen/index.js";
import type { DefaultValue, FieldDef, TableDef } from "../ir/types.js";
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

  if (field.uuid?.autoGenerate || field.autoGenerateId) {
    calls.push({ method: "$defaultFn", args: ["() => generateBase36Id()"] });
  }

  if (!field.nullable && !isPrimaryKey(field, table)) {
    calls.push({ method: "notNull" });
  }

  if (field.references) {
    const targetVar = toTableVariableName(field.references.tableName, shouldPluralize);
    const targetField = field.references.fieldName;
    const refArgs = [`() => ${targetVar}.${targetField}`];
    if (field.references.onDelete) {
      refArgs.push(
        objectLiteral([["onDelete", quoted(field.references.onDelete)]], { concise: true }),
      );
    }
    calls.push({ method: "references", args: refArgs });
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

function mapDefault(value: DefaultValue): string {
  if (typeof value === "string") {
    return quoted(value);
  }
  // Drizzle takes a JSON column's default as the JS value it serializes, so an
  // array default has to survive as a literal. `String([])` renders the empty
  // string, which is not valid JS in that position.
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}
