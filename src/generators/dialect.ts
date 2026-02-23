import type { ChainMethod } from "../codegen/index.js";
import { arrayLiteral, fnCall, objectLiteral, quoted } from "../codegen/index.js";
import type { FieldDef } from "../ir/types.js";

export type Dialect = "pg" | "sqlite";

export interface DialectConfig {
  dialect: Dialect;
  coreModule: string;
  tableFn: string;
  enumFn: string | null;
  uuidDataType: string;
  mapFieldType(field: FieldDef): string;
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

function pgDialect(): DialectConfig {
  return {
    dialect: "pg",
    coreModule: "drizzle-orm/pg-core",
    tableFn: "pgTable",
    enumFn: "pgEnum",
    uuidDataType: "uuid",
    mapTimestampDefault: () => ({ method: "defaultNow" }),
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

function sqliteDialect(): DialectConfig {
  return {
    dialect: "sqlite",
    coreModule: "drizzle-orm/sqlite-core",
    tableFn: "sqliteTable",
    enumFn: null,
    uuidDataType: "text",
    mapTimestampDefault: () => ({ method: "$defaultFn", args: ["() => new Date()"] }),
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
