import { exportConst, fnCall, importDecl, quoted } from "../codegen/index.js";
import type { DialectConfig, NullableWrapperDef, UuidTypeDef } from "./dialect.js";

export function generateTypes(dialect: DialectConfig, schemaOnly = false): string {
  const sections: string[] = [];

  sections.push(importDecl(["customType"], dialect.coreModule));
  sections.push(`import short from ${quoted("short-uuid")};`);
  if (!schemaOnly) sections.push(...drizzleClientImports(dialect));
  sections.push("");

  sections.push(`const translator = ${fnCall("short", ["short.constants.uuid25Base36"])};`);
  sections.push("");

  for (const helper of dialect.uuidHelpers) {
    sections.push(helper);
    sections.push("");
  }

  for (const uuidType of dialect.uuidTypes) {
    sections.push(generateUuidType(uuidType));
    sections.push("");
  }

  sections.push("export function generateBase36Id(): string {");
  sections.push("  return translator.new();");
  sections.push("}");
  sections.push("");

  for (const wrapper of dialect.nullableWrappers) {
    sections.push(generateNullableWrapper(wrapper));
    sections.push("");
  }

  if (!schemaOnly) {
    sections.push("/** Drizzle client type for use in describe function signatures */");
    sections.push(drizzleClientType(dialect));
    sections.push("");
  }

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

function generateUuidType(uuidType: UuidTypeDef): string {
  const typeParam = `<{\n  data: string;\n  driverData: ${uuidType.driverType};\n}>`;
  const config = ["{", `  dataType: () => ${quoted(uuidType.dataType)},`];
  if (uuidType.toDriver) config.push(`  toDriver: ${uuidType.toDriver},`);
  if (uuidType.fromDriver) config.push(`  fromDriver: ${uuidType.fromDriver},`);
  config.push("}");
  const declaration = exportConst(uuidType.name, `customType${typeParam}(${config.join("\n")})`);
  return `/** ${uuidType.doc} */\n${declaration}`;
}

function generateNullableWrapper(wrapper: NullableWrapperDef): string {
  const driverType = wrapper.driverType ?? wrapper.jsType;
  const fromDriver = wrapper.fromDriver ?? "(v) => v ?? undefined";
  const typeParam = `<{\n  data: ${wrapper.jsType} | undefined;\n  driverData: ${driverType} | null;\n}>`;
  const configObj = [
    "{",
    `  dataType: () => ${quoted(wrapper.dataType)},`,
    `  fromDriver: ${fromDriver},`,
    "}",
  ].join("\n");
  return exportConst(wrapper.name, `customType${typeParam}(${configObj})`);
}

function drizzleClientType(dialect: DialectConfig): string {
  if (dialect.dialect === "sqlite") {
    return 'export type DrizzleClient = BaseSQLiteDatabase<"sync" | "async", unknown, Record<string, unknown>, typeof relations>;';
  }
  return "export type DrizzleClient = PgAsyncDatabase<PgQueryResultHKT, Record<string, unknown>, typeof relations>;";
}
