import type {
  DecoratorApplication,
  Model,
  ModelProperty,
  Program,
  Scalar,
  Tuple,
  Type,
  Union,
} from "@typespec/compiler";
import { navigateProgram } from "@typespec/compiler";
import { toSnakeCase } from "../generators/naming.js";
import type {
  EnumDef,
  FieldDef,
  FieldType,
  IndexDef,
  ReferentialAction,
  TableDef,
} from "./types.js";

/**
 * Remit front-end for the Drizzle emitter.
 *
 * Reads the ElectroDB TypeSpec vocabulary emitted by `typespec-electrodb-emitter`
 * (`@entity`, `@index`, `@createdAt`, `@updatedAt`, `@label`) and produces the same
 * IR the `@table`-based front-end produces, so the back-end (schema/relations/
 * describe/types generators) is reused unchanged.
 *
 * Decorators are read by name off `Type.decorators` (`DecoratorApplication.definition.name`)
 * rather than by importing the electrodb emitter's private state-key symbols — the
 * decorator surface is the stable contract; the state keys are an implementation detail.
 *
 * Relations are derived from ElectroDB collections: a `collection` shared by ≥2 entities
 * on indexes that share the same pk-attribute NAME means that named attribute is the
 * foreign key. The member whose PRIMARY index pk is exactly that attribute is the owner;
 * every other member's same-named column references it.
 */

interface AccessPattern {
  name: string;
  index?: string;
  collection?: string;
  pk: string[];
  sk: string[];
}

interface CollectionMember {
  table: string;
  pkAttr: string;
}

export interface RemitBuildOptions {
  foreignKeys?: boolean;
  idDefault?: boolean;
}

export function buildRemitIR(
  program: Program,
  options: RemitBuildOptions = {},
): {
  tables: TableDef[];
  enums: EnumDef[];
} {
  const foreignKeys = options.foreignKeys ?? true;
  const idDefault = options.idDefault ?? false;
  const tables: TableDef[] = [];
  const enums: EnumDef[] = [];

  const models: Model[] = [];
  navigateProgram(program, {
    model(model) {
      if (firstDecorator(model, "@entity")) models.push(model);
    },
  });

  const collections = new Map<string, CollectionMember[]>();

  for (const model of models) {
    const entityDec = firstDecorator(model, "@entity");
    if (!entityDec) continue;

    const entityName = stringArg(entityDec, 0) ?? lowerFirst(model.name);
    const service = stringArg(entityDec, 1) ?? "remit";
    const sqlTableName = toSnakeCase(entityName);

    const patterns = decoratorsByName(model, "@index").map(readIndexDecorator);
    const primary = patterns.find((p) => !p.index);
    const primaryColumns = primary ? [...primary.pk, ...primary.sk] : [];

    // The primary key is the entity's own identity field (`<entity>Id`) as a
    // single column when it exists. The ElectroDB primary index is a DynamoDB
    // access pattern (a pk/sk composite), not the entity's identity — it becomes
    // an ordinary secondary index. Entities with no `<entity>Id` field (a lock
    // keyed by mailbox + event) keep the composite primary as their key.
    const idField = `${entityName}Id`;
    const pkColumns = model.properties.has(idField) ? [idField] : primaryColumns;
    const singlePkColumn = pkColumns.length === 1 ? pkColumns[0] : undefined;

    const fields: FieldDef[] = [];
    for (const [propName, prop] of model.properties) {
      const resolved = resolveFieldType(prop);
      const columnName = readLabel(prop) ?? toSnakeCase(propName);
      const field: FieldDef = {
        name: propName,
        columnName,
        type: resolved.type,
        nullable: prop.optional,
        createdAt: false,
        updatedAt: false,
      };

      if (idDefault && propName === singlePkColumn && resolved.type.kind === "text") {
        field.autoGenerateId = true;
      }

      const defaultValue = extractDefaultValue(prop);
      if (defaultValue !== undefined) field.defaultValue = defaultValue;

      fields.push(field);
    }

    const sameColumns = (cols: string[]): boolean =>
      cols.length === pkColumns.length && cols.every((c, i) => c === pkColumns[i]);

    const indexes: IndexDef[] = patterns
      .filter((p) => p.pk.length + p.sk.length > 0)
      .map((p) => ({
        name: p.index ? `${sqlTableName}_${toSnakeCase(p.name)}` : `${sqlTableName}_primary`,
        columns: [...p.pk, ...p.sk],
        unique: false,
      }))
      .filter((idx) => !sameColumns(idx.columns));

    for (const pattern of patterns) {
      if (!pattern.collection) continue;
      const pkAttr = pattern.pk[0];
      if (!pkAttr) continue;
      const members = collections.get(pattern.collection) ?? [];
      members.push({ table: model.name, pkAttr });
      collections.set(pattern.collection, members);
    }

    tables.push({
      name: model.name,
      service,
      tableName: sqlTableName,
      primaryKey: {
        tableName: sqlTableName,
        columns: pkColumns,
        isComposite: pkColumns.length > 1,
      },
      fields,
      foreignKeys: [],
      isJunction: false,
      indexes,
      uniqueConstraints: [],
    });
  }

  if (foreignKeys) applyCollectionForeignKeys(tables, collections);

  return { tables, enums };
}

/**
 * Turn ElectroDB collections into foreign-key references on the IR.
 *
 * For each collection with ≥2 distinct member entities, the shared pk-attribute name is
 * the join column. The member whose primary key is exactly that single attribute is the
 * owner; every other member's same-named column gets a hard reference to it. Remit
 * collections model parent-owns-children partitions, so the policy is ON DELETE CASCADE.
 */
function applyCollectionForeignKeys(
  tables: TableDef[],
  collections: Map<string, CollectionMember[]>,
): void {
  const byName = new Map(tables.map((t) => [t.name, t]));

  for (const members of collections.values()) {
    const distinctTables = new Set(members.map((m) => m.table));
    if (distinctTables.size < 2) continue;

    const sharedAttr = members[0].pkAttr;
    if (!members.every((m) => m.pkAttr === sharedAttr)) continue;

    const owner = tables.find(
      (t) => t.primaryKey.columns.length === 1 && t.primaryKey.columns[0] === sharedAttr,
    );
    if (!owner) continue;

    const onDelete: ReferentialAction = "cascade";
    for (const tableName of distinctTables) {
      if (tableName === owner.name) continue;
      const table = byName.get(tableName);
      const field = table?.fields.find((f) => f.name === sharedAttr);
      if (!field) continue;
      field.references = { tableName: owner.name, fieldName: sharedAttr, onDelete };
    }
  }
}

function decoratorsByName(type: Model | ModelProperty, name: string): DecoratorApplication[] {
  return type.decorators.filter((d) => d.definition?.name === name);
}

function firstDecorator(
  type: Model | ModelProperty,
  name: string,
): DecoratorApplication | undefined {
  return decoratorsByName(type, name)[0];
}

function stringArg(dec: DecoratorApplication, index: number): string | undefined {
  const arg = dec.args[index];
  if (!arg) return undefined;
  if (typeof arg.jsValue === "string") return arg.jsValue;
  // The electrodb decorators declare their string params as TYPE constraints
  // (`name: string`, not `valueof string`), so the argument arrives as a String
  // literal type rather than a marshalled JS string.
  const value = arg.value as { kind?: string; value?: unknown };
  if (value?.kind === "String" && typeof value.value === "string") return value.value;
  return undefined;
}

function readLabel(prop: ModelProperty): string | undefined {
  const dec = firstDecorator(prop, "@label");
  return dec ? stringArg(dec, 0) : undefined;
}

function readIndexDecorator(dec: DecoratorApplication): AccessPattern {
  const name = stringArg(dec, 0) ?? "";
  const patternArg = dec.args[1];
  const pattern = patternArg && isModel(patternArg.value) ? (patternArg.value as Model) : undefined;

  return {
    name,
    index: pattern ? readStringProp(pattern, "index") : undefined,
    collection: pattern ? readStringProp(pattern, "collection") : undefined,
    pk: pattern ? readKeyComposite(pattern, "pk") : [],
    sk: pattern ? readKeyComposite(pattern, "sk") : [],
  };
}

function readStringProp(pattern: Model, key: string): string | undefined {
  const prop = pattern.properties.get(key);
  if (prop && prop.type.kind === "String") return prop.type.value;
  return undefined;
}

function readKeyComposite(pattern: Model, key: string): string[] {
  const prop = pattern.properties.get(key);
  if (!prop) return [];
  const type = prop.type;
  if (type.kind === "Tuple") return tupleNames(type);
  if (type.kind === "Model") {
    const composite = type.properties.get("composite");
    if (composite && composite.type.kind === "Tuple") return tupleNames(composite.type);
  }
  return [];
}

function tupleNames(tuple: Tuple): string[] {
  return tuple.values
    .filter((v): v is ModelProperty => v.kind === "ModelProperty")
    .map((v) => v.name);
}

interface ResolvedField {
  type: FieldType;
}

function resolveFieldType(prop: ModelProperty): ResolvedField {
  const type = prop.type;

  if (type.kind === "Scalar") return { type: resolveScalarType(type) };
  // Remit stores enums as strings (parity with the DynamoDB single-table port),
  // so an enum becomes a text column narrowed by a `$type` union rather than a
  // pgEnum — pgEnum would need an `ALTER TYPE` for every new value.
  if (type.kind === "Enum") {
    const values = [...type.members.values()].map((m) =>
      m.value !== undefined ? String(m.value) : m.name,
    );
    return { type: { kind: "textEnum", values } };
  }
  if (type.kind === "Model") return { type: { kind: "jsonb" } };
  if (type.kind === "Union") {
    return isStringUnion(type) ? { type: { kind: "text" } } : { type: { kind: "jsonb" } };
  }

  return { type: { kind: "text" } };
}

/**
 * A union whose every variant is a string (a string scalar, a string-valued enum,
 * or a string literal) is a constrained string, not a structured value — it maps to
 * a text column. `MessageFlagValue` (system flag | keyword flag | free string) is the
 * canonical case. A union with any non-string variant is stored as jsonb.
 */
function isStringUnion(union: Union): boolean {
  const variants = [...union.variants.values()];
  if (variants.length === 0) return false;
  return variants.every((variant) => isStringLike(variant.type));
}

function isStringLike(type: Type): boolean {
  if (type.kind === "String") return true;
  if (type.kind === "Scalar") return scalarIsString(type);
  if (type.kind === "Enum") {
    return [...type.members.values()].every(
      (m) => m.value === undefined || typeof m.value === "string",
    );
  }
  return false;
}

function scalarIsString(scalar: Scalar): boolean {
  if (scalar.name === "string") return true;
  return scalar.baseScalar ? scalarIsString(scalar.baseScalar) : false;
}

function resolveScalarType(scalar: Scalar): FieldType {
  switch (scalar.name) {
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
    case "string":
      return { kind: "text" };
  }

  if (scalar.baseScalar) return resolveScalarType(scalar.baseScalar);

  return { kind: "text" };
}

function extractDefaultValue(prop: ModelProperty): unknown {
  const value =
    (prop as { defaultValue?: unknown }).defaultValue ?? (prop as { default?: unknown }).default;
  if (value === null || value === undefined) return undefined;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    const typed = value as { valueKind?: string; value?: unknown; kind?: string; name?: string };
    if ("value" in typed && typed.value !== undefined) {
      const inner = typed.value;
      if (typeof inner === "string" || typeof inner === "number" || typeof inner === "boolean") {
        return inner;
      }
    }
    if (typed.kind === "EnumMember") {
      return typed.value !== undefined ? typed.value : typed.name;
    }
  }

  return undefined;
}

function isModel(value: unknown): value is Model {
  return !!value && typeof value === "object" && (value as { kind?: string }).kind === "Model";
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}
