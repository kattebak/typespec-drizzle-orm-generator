import type { Model, ModelProperty, Scalar } from "@typespec/compiler";
import { toSnakeCase } from "../generators/naming.js";
import { StateKeys } from "../lib.js";
import type {
  EnumDef,
  FieldDef,
  FieldType,
  ForeignKeyDef,
  IndexDef,
  TableDef,
  UniqueConstraintDef,
  UuidEncoding,
} from "./types.js";

interface TableMeta {
  name: string;
  service: string;
}

interface PrimaryKeyMeta {
  tableName: string;
}

interface UuidMeta {
  encoding: string;
  autoGenerate: boolean;
}

interface CompositeUniqueMeta {
  name: string;
  columns: ModelProperty[];
}

interface IndexMeta {
  name: string;
  columns: ModelProperty[];
  unique: boolean;
}

interface ForeignKeyMeta {
  name: string;
  columns: ModelProperty[];
  foreignColumns: ModelProperty[];
}

/**
 * Minimal Program-like interface for state access.
 * Allows testing without importing the full @typespec/compiler Program.
 */
export interface ProgramStateAccess {
  stateMap(key: symbol): Map<unknown, unknown>;
  stateSet(key: symbol): Set<unknown>;
}

/**
 * Builds IR from TypeSpec program state populated by decorators.
 *
 * Reads:
 * - @table state -> table name, service
 * - @primaryKey state -> SQL table name
 * - @pk state -> PK columns
 * - @references state -> FK references
 * - @junction state -> junction marker
 * - @uuid state -> UUID encoding + auto-generation
 * - @createdAt / @updatedAt state -> timestamp markers
 * - @unique state -> single-column unique constraints
 * - @compositeUnique state -> composite unique constraints
 * - @check state -> check constraint expressions
 * - @indexDef state -> index definitions
 * - @foreignKeyDef state -> composite foreign key definitions
 * - @minValue / @maxValue state -> range constraints
 * - @visibility state -> field visibility
 */
export function buildIR(program: ProgramStateAccess): {
  tables: TableDef[];
  enums: EnumDef[];
} {
  const tables: TableDef[] = [];
  const enums: EnumDef[] = [];
  const seenEnums = new Set<string>();

  const tableState = program.stateMap(StateKeys.table);
  const pkTableState = program.stateMap(StateKeys.primaryKey);
  const pkFieldState = program.stateSet(StateKeys.pk);
  const referencesState = program.stateMap(StateKeys.references);
  const junctionState = program.stateSet(StateKeys.junction);
  const uuidState = program.stateMap(StateKeys.uuid);
  const createdAtState = program.stateSet(StateKeys.createdAt);
  const updatedAtState = program.stateSet(StateKeys.updatedAt);
  const uniqueState = program.stateSet(StateKeys.unique);
  const compositeUniqueState = program.stateMap(StateKeys.compositeUnique);
  const checkState = program.stateMap(StateKeys.check);
  const indexDefState = program.stateMap(StateKeys.indexDef);
  const foreignKeyDefState = program.stateMap(StateKeys.foreignKeyDef);
  const minValueState = program.stateMap(StateKeys.minValue);
  const maxValueState = program.stateMap(StateKeys.maxValue);
  const visibilityState = program.stateMap(StateKeys.columnVisibility);

  for (const [target, meta] of tableState) {
    const model = target as Model;
    if (model.kind !== "Model") continue;

    const tableMeta = meta as TableMeta;
    const pkMeta = pkTableState.get(model) as PrimaryKeyMeta | undefined;
    if (!pkMeta) continue;

    const tableName = pkMeta.tableName;
    const isJunction = junctionState.has(model);

    const fields: FieldDef[] = [];
    const pkColumns: string[] = [];

    for (const [propName, prop] of model.properties) {
      const modelProp = prop as ModelProperty;
      const isPk = pkFieldState.has(modelProp);
      if (isPk) pkColumns.push(propName);

      const refTarget = referencesState.get(modelProp) as ModelProperty | undefined;
      const uuidMeta = uuidState.get(modelProp) as UuidMeta | undefined;
      const isCreatedAt = createdAtState.has(modelProp);
      const isUpdatedAt = updatedAtState.has(modelProp);
      const isUnique = uniqueState.has(modelProp);
      const checkExpr = checkState.get(modelProp) as string | undefined;
      const minVal = minValueState.get(modelProp) as number | undefined;
      const maxVal = maxValueState.get(modelProp) as number | undefined;
      const vis = visibilityState.get(modelProp) as string | undefined;

      const fieldType = resolveFieldType(modelProp, uuidMeta);
      const columnName = toSnakeCase(propName);

      // Collect enum definitions
      if (fieldType.kind === "enum" && !seenEnums.has(fieldType.enumName)) {
        seenEnums.add(fieldType.enumName);
        enums.push({
          name: fieldType.enumName,
          sqlName: toSnakeCase(fieldType.enumName.replace(/Enum$/, "")),
          values: fieldType.values,
        });
      }

      const field: FieldDef = {
        name: propName,
        columnName,
        type: fieldType,
        nullable: modelProp.optional,
        createdAt: isCreatedAt,
        updatedAt: isUpdatedAt,
      };

      if (uuidMeta) {
        field.uuid = {
          encoding: uuidMeta.encoding as UuidEncoding,
          autoGenerate: uuidMeta.autoGenerate,
        };
      }

      if (refTarget) {
        const refModel = refTarget.model;
        if (refModel) {
          const refTableMeta = tableState.get(refModel) as TableMeta | undefined;
          if (refTableMeta) {
            field.references = {
              tableName: refTableMeta.name,
              fieldName: refTarget.name,
            };
          }
        }
      }

      // Constraints
      if (isUnique || checkExpr || minVal !== undefined || maxVal !== undefined) {
        field.constraints = {};
        if (isUnique) field.constraints.unique = true;
        if (checkExpr) field.constraints.check = checkExpr;
        if (minVal !== undefined) field.constraints.minValue = minVal;
        if (maxVal !== undefined) field.constraints.maxValue = maxVal;
      }

      // Visibility
      if (vis) {
        field.visibility = vis as "read";
      }

      // Default value from TypeSpec (prop.default)
      if ("default" in modelProp && modelProp.default !== undefined) {
        const defaultVal = extractDefaultValue(modelProp.default as unknown);
        if (defaultVal !== undefined) {
          field.defaultValue = defaultVal;
        }
      }

      fields.push(field);
    }

    const isComposite = pkColumns.length > 1;

    // Composite unique constraints
    const compositeUniques = compositeUniqueState.get(model) as CompositeUniqueMeta[] | undefined;
    const uniqueConstraints: UniqueConstraintDef[] = (compositeUniques ?? []).map((cu) => ({
      name: cu.name,
      columns: cu.columns.map((c) => c.name),
    }));

    // Indexes
    const indexDefs = indexDefState.get(model) as IndexMeta[] | undefined;
    const indexes: IndexDef[] = (indexDefs ?? []).map((idx) => ({
      name: idx.name,
      columns: idx.columns.map((c) => c.name),
      unique: idx.unique,
    }));

    // Composite foreign keys
    const fkDefs = foreignKeyDefState.get(model) as ForeignKeyMeta[] | undefined;
    const foreignKeys: ForeignKeyDef[] = (fkDefs ?? []).map((fk) => {
      const foreignModel = fk.foreignColumns[0]?.model;
      const foreignTableMeta = foreignModel
        ? (tableState.get(foreignModel) as TableMeta | undefined)
        : undefined;

      return {
        name: fk.name,
        columns: fk.columns.map((c) => c.name),
        foreignTable: foreignTableMeta?.name ?? "",
        foreignColumns: fk.foreignColumns.map((c) => c.name),
      };
    });

    tables.push({
      name: tableMeta.name,
      service: tableMeta.service,
      tableName,
      primaryKey: { tableName, columns: pkColumns, isComposite },
      fields,
      foreignKeys,
      isJunction,
      indexes,
      uniqueConstraints,
    });
  }

  return { tables, enums };
}

function resolveFieldType(prop: ModelProperty, uuidMeta: UuidMeta | undefined): FieldType {
  if (uuidMeta) {
    return { kind: "uuid", encoding: uuidMeta.encoding as UuidEncoding };
  }

  const type = prop.type;
  if (type.kind === "Scalar") {
    return resolveScalarType(type as Scalar);
  }

  // Enum types — TypeSpec Enum kind
  if (type.kind === "Enum") {
    const enumType = type as {
      kind: "Enum";
      name: string;
      members: Map<string, { name: string; value?: unknown }>;
    };
    const values = [...enumType.members.values()].map((m) =>
      m.value !== undefined ? String(m.value) : m.name,
    );
    const enumName = `${enumType.name.charAt(0).toLowerCase() + enumType.name.slice(1)}Enum`;
    const _sqlName = toSnakeCase(enumType.name);
    return { kind: "enum", enumName, values };
  }

  return { kind: "text" };
}

function resolveScalarType(scalar: Scalar): FieldType {
  switch (scalar.name) {
    case "string":
      return { kind: "text" };
    case "int32":
      return { kind: "integer" };
    case "int64":
      return { kind: "bigint" };
    case "float32":
      return { kind: "real" };
    case "float64":
      return { kind: "doublePrecision" };
    case "boolean":
      return { kind: "boolean" };
    case "utcDateTime":
      return { kind: "timestamp" };
  }

  if (scalar.baseScalar) {
    return resolveScalarType(scalar.baseScalar);
  }

  return { kind: "text" };
}

function extractDefaultValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  // TypeSpec numeric/string/boolean literal values
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as { value: unknown }).value;
  }

  // Enum member default — extract the value or name
  if (typeof value === "object" && value !== null && "kind" in value) {
    const typed = value as { kind: string; value?: unknown; name?: string };
    if (typed.kind === "EnumMember") {
      return typed.value !== undefined ? typed.value : typed.name;
    }
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
}
