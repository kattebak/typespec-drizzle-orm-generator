import { type ChainMethod, chainCall, fnCall, objectLiteral, quoted } from "../codegen/index.ts";
import type { FieldDef, TableDef } from "../ir/types.ts";
import { toTableVariableName } from "./naming.ts";

export function mapFieldToColumn(field: FieldDef, table: TableDef): string {
  const calls: ChainMethod[] = [];

  if (isPrimaryKey(field, table)) {
    calls.push({ method: "primaryKey" });
  }

  if (field.uuid?.autoGenerate) {
    calls.push({ method: "defaultRandom" });
  }

  if (!field.nullable && !isPrimaryKey(field, table)) {
    calls.push({ method: "notNull" });
  }

  if (field.references) {
    const targetVar = toTableVariableName(field.references.tableName);
    const targetField = field.references.fieldName;
    calls.push({ method: "references", args: [`() => ${targetVar}.${targetField}`] });
  }

  if (field.createdAt || field.updatedAt) {
    calls.push({ method: "defaultNow" });
  }

  if (field.constraints?.unique) {
    calls.push({ method: "unique" });
  }

  if (field.defaultValue !== undefined && !field.createdAt && !field.updatedAt) {
    calls.push({ method: "default", args: [mapDefault(field.defaultValue)] });
  }

  return chainCall(mapBaseType(field), calls);
}

function mapBaseType(field: FieldDef): string {
  const col = quoted(field.columnName);

  if (field.uuid) {
    return fnCall("base36Uuid", [col]);
  }

  switch (field.type.kind) {
    case "text":
      return fnCall("text", [col]);
    case "varchar":
      return fnCall("varchar", [
        col,
        objectLiteral([["length", String(field.type.length)]], { concise: true }),
      ]);
    case "integer":
      return fnCall("integer", [col]);
    case "bigint":
      return fnCall("bigint", [
        col,
        objectLiteral([["mode", quoted("number")]], { concise: true }),
      ]);
    case "real":
      return fnCall("real", [col]);
    case "doublePrecision":
      return fnCall("doublePrecision", [col]);
    case "boolean":
      return fnCall("boolean", [col]);
    case "timestamp":
      return fnCall("timestamp", [
        col,
        objectLiteral([["withTimezone", "true"]], { concise: true }),
      ]);
    case "uuid":
      return fnCall("base36Uuid", [col]);
    case "enum":
      return fnCall(field.type.enumName, [col]);
  }
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
