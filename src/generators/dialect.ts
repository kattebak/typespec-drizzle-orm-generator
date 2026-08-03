import type { ChainMethod } from "../codegen/index.js";
import { arrayLiteral, fnCall, objectLiteral, quoted } from "../codegen/index.js";
import type { FieldDef, FieldType, UuidEncoding } from "../ir/types.js";

export type Dialect = "pg" | "sqlite";

export interface NullableWrapperDef {
  name: string;
  dataType: string;
  jsType: string;
  driverType?: string;
  fromDriver?: string;
}

/** One emitted `customType` backing a `@uuid` column of a given encoding */
export interface UuidTypeDef {
  name: string;
  dataType: string;
  driverType: string;
  doc: string;
  toDriver?: string;
  fromDriver?: string;
}

export interface DialectConfig {
  dialect: Dialect;
  coreModule: string;
  tableFn: string;
  enumFn: string | null;
  uuidTypes: readonly UuidTypeDef[];
  nullableWrappers: readonly NullableWrapperDef[];
  mapFieldType(field: FieldDef): string;
  mapNullableFieldType(field: FieldDef): string;
  nullableWrapperName(kind: FieldType["kind"]): string | null;
  mapTimestampDefault(): ChainMethod;
}

const uuidTypeNames: Readonly<Record<UuidEncoding, string>> = {
  base36: "base36Uuid",
  canonical: "canonicalUuid",
  raw: "rawUuid",
};

/** Name of the emitted custom type a column of this encoding is built from */
export function uuidTypeName(encoding: UuidEncoding): string {
  return uuidTypeNames[encoding];
}

const canonicalDrivers = {
  toDriver: "(value: string): string => bytesToUuid(base36ToBytes(value))",
  fromDriver: "(value: string): string => bytesToBase36(uuidToBytes(value))",
} as const;

export function resolveDialect(dialect: Dialect): DialectConfig {
  switch (dialect) {
    case "pg":
      return pgDialect();
    case "sqlite":
      return sqliteDialect();
  }
}

const pgNullableWrappers: readonly NullableWrapperDef[] = [
  { name: "nullableText", dataType: "text", jsType: "string" },
  { name: "nullableInteger", dataType: "integer", jsType: "number" },
  { name: "nullableReal", dataType: "real", jsType: "number" },
  {
    name: "nullableBigint",
    dataType: "bigint",
    jsType: "number",
    driverType: "number | string",
    fromDriver: "(v) => (v == null ? undefined : Number(v))",
  },
  { name: "nullableDoublePrecision", dataType: "double precision", jsType: "number" },
  { name: "nullableBoolean", dataType: "boolean", jsType: "boolean" },
  { name: "nullableTimestamp", dataType: "timestamp with time zone", jsType: "Date" },
];

const pgNullableWrapperMap = new Map<string, string>([
  ["text", "nullableText"],
  ["integer", "nullableInteger"],
  ["real", "nullableReal"],
  ["bigint", "nullableBigint"],
  ["doublePrecision", "nullableDoublePrecision"],
  ["boolean", "nullableBoolean"],
  ["timestamp", "nullableTimestamp"],
]);

function textEnumColumn(col: string, values: string[]): string {
  const union = values.map((v) => quoted(v)).join(" | ");
  return `${fnCall("text", [col])}.$type<${union}>()`;
}

const pgUuidTypes: readonly UuidTypeDef[] = [
  {
    name: "canonicalUuid",
    dataType: "uuid",
    driverType: "string",
    doc: "UUID column stored as native pg uuid, reads/writes as base36",
    ...canonicalDrivers,
  },
  {
    name: "base36Uuid",
    dataType: "text",
    driverType: "string",
    doc: "UUID column stored as the 25-character base36 string, reads/writes as base36",
  },
  {
    name: "rawUuid",
    dataType: "uuid",
    driverType: "string",
    doc: "UUID column stored as native pg uuid — 16 bytes on disk — reads/writes as base36",
    ...canonicalDrivers,
  },
];

function pgDialect(): DialectConfig {
  return {
    dialect: "pg",
    coreModule: "drizzle-orm/pg-core",
    tableFn: "pgTable",
    enumFn: "pgEnum",
    uuidTypes: pgUuidTypes,
    nullableWrappers: pgNullableWrappers,
    mapTimestampDefault: () => ({ method: "defaultNow" }),
    nullableWrapperName(kind: FieldType["kind"]): string | null {
      return pgNullableWrapperMap.get(kind) ?? null;
    },
    mapNullableFieldType(field: FieldDef): string {
      const wrapperName = this.nullableWrapperName(field.type.kind);
      if (wrapperName) {
        return fnCall(wrapperName, [quoted(field.columnName)]);
      }
      return this.mapFieldType(field);
    },
    mapFieldType(field: FieldDef): string {
      const col = quoted(field.columnName);
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
        case "jsonb":
          return fnCall("jsonb", [col]);
        case "blob":
          return fnCall("bytea", [col]);
        case "uuid":
          return fnCall(uuidTypeName(field.type.encoding), [col]);
        case "enum":
          return fnCall(field.type.enumName, [col]);
        case "textEnum":
          return textEnumColumn(col, field.type.values);
      }
    },
  };
}

const sqliteNullableWrappers: readonly NullableWrapperDef[] = [
  { name: "nullableText", dataType: "text", jsType: "string" },
  { name: "nullableInteger", dataType: "integer", jsType: "number" },
  { name: "nullableReal", dataType: "real", jsType: "number" },
  { name: "nullableBlob", dataType: "blob", jsType: "Uint8Array" },
];

const sqliteNullableWrapperMap = new Map<string, string>([
  ["text", "nullableText"],
  ["varchar", "nullableText"],
  ["integer", "nullableInteger"],
  ["real", "nullableReal"],
  ["doublePrecision", "nullableReal"],
  ["blob", "nullableBlob"],
]);

const sqliteUuidTypes: readonly UuidTypeDef[] = [
  {
    name: "canonicalUuid",
    dataType: "text",
    driverType: "string",
    doc: "UUID column stored as text in the 36-character hyphenated form, reads/writes as base36",
    ...canonicalDrivers,
  },
  {
    name: "base36Uuid",
    dataType: "text",
    driverType: "string",
    doc: "UUID column stored as text in the 25-character base36 form, reads/writes as base36",
  },
  {
    name: "rawUuid",
    dataType: "blob",
    driverType: "Uint8Array",
    doc: "UUID column stored as a 16-byte blob, reads/writes as base36",
    toDriver: "(value: string): Uint8Array => base36ToBytes(value)",
    fromDriver: "(value: Uint8Array): string => bytesToBase36(value)",
  },
];

function sqliteDialect(): DialectConfig {
  return {
    dialect: "sqlite",
    coreModule: "drizzle-orm/sqlite-core",
    tableFn: "sqliteTable",
    enumFn: null,
    uuidTypes: sqliteUuidTypes,
    nullableWrappers: sqliteNullableWrappers,
    mapTimestampDefault: () => ({ method: "$defaultFn", args: ["() => new Date()"] }),
    nullableWrapperName(kind: FieldType["kind"]): string | null {
      return sqliteNullableWrapperMap.get(kind) ?? null;
    },
    mapNullableFieldType(field: FieldDef): string {
      const wrapperName = this.nullableWrapperName(field.type.kind);
      if (wrapperName) {
        return fnCall(wrapperName, [quoted(field.columnName)]);
      }
      return this.mapFieldType(field);
    },
    mapFieldType(field: FieldDef): string {
      const col = quoted(field.columnName);
      switch (field.type.kind) {
        case "text":
          return fnCall("text", [col]);
        case "varchar":
          return fnCall("text", [
            col,
            objectLiteral([["length", String(field.type.length)]], { concise: true }),
          ]);
        case "integer":
          return fnCall("integer", [col]);
        case "bigint":
          return fnCall("integer", [
            col,
            objectLiteral([["mode", quoted("number")]], { concise: true }),
          ]);
        case "real":
          return fnCall("real", [col]);
        case "doublePrecision":
          return fnCall("real", [col]);
        case "boolean":
          return fnCall("integer", [
            col,
            objectLiteral([["mode", quoted("boolean")]], { concise: true }),
          ]);
        case "timestamp":
          return fnCall("integer", [
            col,
            objectLiteral([["mode", quoted("timestamp")]], { concise: true }),
          ]);
        case "jsonb":
          return fnCall("text", [
            col,
            objectLiteral([["mode", quoted("json")]], { concise: true }),
          ]);
        case "blob":
          return fnCall("blob", [
            col,
            objectLiteral([["mode", quoted("buffer")]], { concise: true }),
          ]);
        case "uuid":
          return fnCall(uuidTypeName(field.type.encoding), [col]);
        case "enum":
          return fnCall("text", [
            col,
            objectLiteral([["enum", arrayLiteral(field.type.values.map((v) => quoted(v)))]], {
              concise: true,
            }),
          ]);
        case "textEnum":
          return textEnumColumn(col, field.type.values);
      }
    },
  };
}
