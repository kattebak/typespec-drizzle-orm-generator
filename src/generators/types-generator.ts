import { exportConst, fnCall, importDecl, quoted } from "../codegen/index.js";
import type { DialectConfig } from "./dialect.js";

export function generateTypes(dialect: DialectConfig): string {
  const sections: string[] = [];

  sections.push(importDecl(["customType"], dialect.coreModule));
  sections.push(`import short from ${quoted("short-uuid")};`);
  sections.push(...drizzleClientImports(dialect));
  sections.push("");

  sections.push(`const translator = ${fnCall("short", ["short.constants.uuid25Base36"])};`);
  sections.push("");

  const comment =
    dialect.dialect === "sqlite"
      ? "/** UUID column stored as text, reads/writes as base36 */"
      : "/** UUID column that stores as native pg uuid, reads/writes as base36 */";
  sections.push(comment);
  const typeParam = "<{\n  data: string;\n  driverData: string;\n}>";
  const configObj = [
    "{",
    `  dataType: () => ${quoted(dialect.uuidDataType)},`,
    "  toDriver: (value: string): string => translator.toUUID(value),",
    "  fromDriver: (value: string): string => translator.fromUUID(value),",
    "}",
  ].join("\n");
  sections.push(exportConst("base36Uuid", `customType${typeParam}(${configObj})`));
  sections.push("");

  sections.push("export function generateBase36Id(): string {");
  sections.push("  return translator.new();");
  sections.push("}");
  sections.push("");

  sections.push("/** Drizzle client type for use in describe function signatures */");
  sections.push(drizzleClientType(dialect));
  sections.push("");

  return sections.join("\n");
}

function drizzleClientImports(dialect: DialectConfig): string[] {
  if (dialect.dialect === "sqlite") {
    return [
      importDecl(["BaseSQLiteDatabase"], "drizzle-orm/sqlite-core", { type: true }),
      importDecl(["relations"], "./relations.js", { type: true }),
    ];
  }
  return [
    importDecl(["PgAsyncDatabase", "PgQueryResultHKT"], "drizzle-orm/pg-core", { type: true }),
    importDecl(["relations"], "./relations.js", { type: true }),
  ];
}

function drizzleClientType(dialect: DialectConfig): string {
  if (dialect.dialect === "sqlite") {
    return 'export type DrizzleClient = BaseSQLiteDatabase<"sync" | "async", unknown, Record<string, unknown>, typeof relations>;';
  }
  return "export type DrizzleClient = PgAsyncDatabase<PgQueryResultHKT, Record<string, unknown>, typeof relations>;";
}
