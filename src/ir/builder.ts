import type { Model, ModelProperty, Program, Scalar } from "@typespec/compiler";
import { getMaxLength } from "@typespec/compiler";
import { toSnakeCase } from "../generators/naming.js";
import { $lib, StateKeys } from "../lib.js";
import { readColumnDefault } from "./default-value.js";
import { readIndexDefs, reportUnclaimedIndexDefs, toModelProperties } from "./index-def.js";
import type {
  EnumDef,
  FieldDef,
  FieldType,
  ForeignKeyDef,
  IndexDef,
  ProgramStateAccess,
  TableDef,
  UniqueConstraintDef,
  UuidEncoding,
} from "./types.js";
import { DEFAULT_UUID_ENCODING, isUuidEncoding } from "./types.js";
import { isVisibilityCopy } from "./visibility-copy.js";

export type { ProgramStateAccess } from "./types.js";

interface TableMeta {
  name: string;
  service: string;
}

interface PrimaryKeyMeta {
  tableName: string;
}

interface UuidMeta {
  encoding?: string;
  autoGenerate: boolean;
}

function resolveUuidEncoding(
  meta: UuidMeta,
  prop: ModelProperty,
  program: ProgramStateAccess,
): UuidEncoding {
  if (meta.encoding === undefined) return DEFAULT_UUID_ENCODING;
  if (isUuidEncoding(meta.encoding)) return meta.encoding;

  program.reportDiagnostic(
    $lib.createDiagnostic({
      code: "unknown-uuid-encoding",
      target: prop,
      format: { encoding: meta.encoding },
    }),
  );
  return DEFAULT_UUID_ENCODING;
}

interface CompositeUniqueMeta {
  name: string;
  columns: ModelProperty[];
}

interface ForeignKeyMeta {
  name: string;
  columns: ModelProperty[];
  foreignColumns: ModelProperty[];
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
  const claimed = new Set<Model>();

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
  const foreignKeyDefState = program.stateMap(StateKeys.foreignKeyDef);
  const minValueState = program.stateMap(StateKeys.minValue);
  const maxValueState = program.stateMap(StateKeys.maxValue);
  const visibilityState = program.stateMap(StateKeys.columnVisibility);

  for (const [target, meta] of tableState) {
    const model = target as Model;
    if (model.kind !== "Model") continue;
    if (isVisibilityCopy(model)) continue;
    claimed.add(model);

    const tableMeta = meta as TableMeta;
    const pkMeta = pkTableState.get(model) as PrimaryKeyMeta | undefined;
    const tableName = pkMeta?.tableName ?? tableMeta.name;
    const isJunction = junctionState.has(model);

    const fields: FieldDef[] = [];
    const pkColumns: string[] = [];

    for (const [propName, prop] of model.properties) {
      const modelProp = prop as ModelProperty;
      const isPk = pkFieldState.has(modelProp);
      if (isPk) pkColumns.push(propName);

      const refEntry = referencesState.get(modelProp) as
        | { ref: ModelProperty; onDelete?: "CASCADE" | "RESTRICT" }
        | undefined;
      const refTarget = refEntry?.ref;
      const uuidMeta = uuidState.get(modelProp) as UuidMeta | undefined;
      const isCreatedAt = createdAtState.has(modelProp);
      const isUpdatedAt = updatedAtState.has(modelProp);
      const isUnique = uniqueState.has(modelProp);
      const checkExpr = checkState.get(modelProp) as string | undefined;
      const minVal = minValueState.get(modelProp) as number | undefined;
      const maxVal = maxValueState.get(modelProp) as number | undefined;
      const vis = visibilityState.get(modelProp) as string | undefined;

      const fieldType = resolveFieldType(modelProp, uuidMeta, program);
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

      if (uuidMeta && fieldType.kind === "uuid") {
        field.uuid = {
          encoding: fieldType.encoding,
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
            if (refEntry?.onDelete) {
              field.references.onDelete = refEntry.onDelete === "CASCADE" ? "cascade" : "restrict";
            }
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

      const defaultVal = readColumnDefault(program, modelProp);
      if (defaultVal !== undefined) {
        field.defaultValue = defaultVal;
      }

      fields.push(field);
    }

    const isComposite = pkColumns.length > 1;

    // Composite unique constraints
    const compositeUniques = compositeUniqueState.get(model) as CompositeUniqueMeta[] | undefined;
    const uniqueConstraints: UniqueConstraintDef[] = (compositeUniques ?? []).map((cu) => ({
      name: cu.name,
      columns: toModelProperties(cu.columns).map((c) => c.name),
    }));

    const indexes: IndexDef[] = readIndexDefs(program, model);

    // Composite foreign keys
    const fkDefs = foreignKeyDefState.get(model) as ForeignKeyMeta[] | undefined;
    const foreignKeys: ForeignKeyDef[] = (fkDefs ?? []).map((fk) => {
      const localColumns = toModelProperties(fk.columns);
      const foreignColumns = toModelProperties(fk.foreignColumns);
      const foreignModel = foreignColumns[0]?.model;
      const foreignTableMeta = foreignModel
        ? (tableState.get(foreignModel) as TableMeta | undefined)
        : undefined;

      return {
        name: fk.name,
        columns: localColumns.map((c) => c.name),
        foreignTable: foreignTableMeta?.name ?? "",
        foreignColumns: foreignColumns.map((c) => c.name),
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

  reportUnclaimedIndexDefs(program, claimed);

  return { tables, enums };
}

function resolveFieldType(
  prop: ModelProperty,
  uuidMeta: UuidMeta | undefined,
  program: ProgramStateAccess,
): FieldType {
  if (uuidMeta) {
    return { kind: "uuid", encoding: resolveUuidEncoding(uuidMeta, prop, program) };
  }

  const type = prop.type;
  if (type.kind === "Scalar") {
    return resolveScalarType(type as Scalar, program);
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

  if (type.kind === "Model") {
    return { kind: "jsonb" };
  }

  return { kind: "text" };
}

function resolveScalarType(scalar: Scalar, program: ProgramStateAccess): FieldType {
  const maxLength = getMaxLength(program as unknown as Program, scalar as unknown as Scalar);

  switch (scalar.name) {
    case "string":
      return maxLength !== undefined ? { kind: "varchar", length: maxLength } : { kind: "text" };
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
    case "bytes":
      return { kind: "blob" };
  }

  if (maxLength !== undefined) {
    return { kind: "varchar", length: maxLength };
  }

  if (scalar.baseScalar) {
    return resolveScalarType(scalar.baseScalar, program);
  }

  return { kind: "text" };
}
