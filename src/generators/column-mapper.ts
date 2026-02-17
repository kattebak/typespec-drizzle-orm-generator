import type { EntityDef, FieldDef } from "../ir/types.ts";
import { toTableVariableName } from "./naming.ts";

/**
 * Maps a FieldDef to a Drizzle column code string.
 *
 * Examples:
 *   base36Uuid("author_id").primaryKey().defaultRandom()
 *   text("name").notNull()
 *   integer("birth_year")
 *   timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
 */
export function mapFieldToColumn(field: FieldDef, entity: EntityDef): string {
  const parts: string[] = [];

  // Base column type
  parts.push(mapBaseType(field));

  // Primary key (only for single-column PKs)
  if (isPrimaryKey(field, entity)) {
    parts.push(".primaryKey()");
  }

  // Auto-generate UUID
  if (field.uuid?.autoGenerate) {
    parts.push(".defaultRandom()");
  }

  // Not null (skip for PK fields — they're implicitly not null)
  if (!field.nullable && !isPrimaryKey(field, entity)) {
    parts.push(".notNull()");
  }

  // Foreign key reference
  if (field.references) {
    parts.push(mapReference(field, entity));
  }

  // Timestamp defaults
  if (field.createdAt || field.updatedAt) {
    parts.push(".defaultNow()");
  }

  // Single-column unique constraint
  if (field.constraints?.unique) {
    parts.push(".unique()");
  }

  // Default value (non-timestamp)
  if (field.defaultValue !== undefined && !field.createdAt && !field.updatedAt) {
    parts.push(mapDefault(field.defaultValue));
  }

  return parts.join("");
}

function mapBaseType(field: FieldDef): string {
  const col = field.columnName;

  // UUID fields use the custom base36Uuid type
  if (field.uuid) {
    return `base36Uuid("${col}")`;
  }

  switch (field.type.kind) {
    case "text":
      return `text("${col}")`;
    case "varchar":
      return `varchar("${col}", { length: ${field.type.length} })`;
    case "integer":
      return `integer("${col}")`;
    case "bigint":
      return `bigint("${col}", { mode: "number" })`;
    case "real":
      return `real("${col}")`;
    case "doublePrecision":
      return `doublePrecision("${col}")`;
    case "boolean":
      return `boolean("${col}")`;
    case "timestamp":
      return `timestamp("${col}", { withTimezone: true })`;
    case "uuid":
      return `base36Uuid("${col}")`;
    case "enum":
      return `${field.type.enumName}("${col}")`;
  }
}

function isPrimaryKey(field: FieldDef, entity: EntityDef): boolean {
  return !entity.primaryKey.isComposite && entity.primaryKey.columns.includes(field.name);
}

function mapReference(field: FieldDef, _entity: EntityDef): string {
  if (!field.references) return "";

  const targetVar = toTableVariableName(field.references.entityName);
  const targetField = field.references.fieldName;
  return `.references(() => ${targetVar}.${targetField})`;
}

function mapDefault(value: unknown): string {
  if (typeof value === "string") {
    return `.default("${value}")`;
  }
  return `.default(${String(value)})`;
}
