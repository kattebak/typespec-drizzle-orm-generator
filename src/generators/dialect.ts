import type { ChainMethod } from "../codegen/index.js";
import { arrayLiteral, fnCall, objectLiteral, quoted } from "../codegen/index.js";
import type { FieldDef, FieldType } from "../ir/types.js";

export type Dialect = "pg" | "sqlite";

export interface NullableWrapperDef {
  name: string;
  dataType: string;
  jsType: string;
}

export interface DialectConfig {
  dialect: Dialect;
  coreModule: string;
  tableFn: string;
  enumFn: string | null;
  uuidDataType: string;
  nullableWrappers: readonly NullableWrapperDef[];
  mapFieldType(field: FieldDef): string;
  mapNullableFieldType(field: FieldDef): string;
  nullableWrapperName(kind: FieldType["kind"]): string | null;
  mapTimestampDefault(): ChainMethod;
}

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
  { name: "nullableBigint", dataType: "bigint", jsType: "number" },
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

function pgDialect(): DialectConfig {
  return {
    dialect: "pg",
    coreModule: "drizzle-orm/pg-core",
    tableFn: "pgTable",
    enumFn: "pgEnum",
    uuidDataType: "uuid",
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
        case "uuid":
          return fnCall("base36Uuid", [col]);
        case "enum":
          return fnCall(field.type.enumName, [col]);
      }
    },
  };
}

const sqliteNullableWrappers: readonly NullableWrapperDef[] = [
  { name: "nullableText", dataType: "text", jsType: "string" },
  { name: "nullableInteger", dataType: "integer", jsType: "number" },
  { name: "nullableReal", dataType: "real", jsType: "number" },
];

const sqliteNullableWrapperMap = new Map<string, string>([
  ["text", "nullableText"],
  ["varchar", "nullableText"],
  ["integer", "nullableInteger"],
  ["real", "nullableReal"],
  ["doublePrecision", "nullableReal"],
]);

function sqliteDialect(): DialectConfig {
  return {
    dialect: "sqlite",
    coreModule: "drizzle-orm/sqlite-core",
    tableFn: "sqliteTable",
    enumFn: null,
    uuidDataType: "text",
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
        case "uuid":
          return fnCall("base36Uuid", [col]);
        case "enum":
          return fnCall("text", [
            col,
            objectLiteral([["enum", arrayLiteral(field.type.values.map((v) => quoted(v)))]], {
              concise: true,
            }),
          ]);
      }
    },
  };
}
