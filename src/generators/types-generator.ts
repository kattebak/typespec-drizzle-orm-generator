import { exportConst, fnCall, importDecl, quoted } from "../codegen/index.ts";

export function generateTypes(): string {
  const sections: string[] = [];

  sections.push(importDecl(["customType"], "drizzle-orm/pg-core"));
  sections.push(`import short from ${quoted("short-uuid")};`);
  sections.push(importDecl(["relations"], "./relations.js", { type: true }));
  sections.push("");

  sections.push(`const translator = ${fnCall("short", ["short.constants.uuid25Base36"])};`);
  sections.push("");

  sections.push("/** UUID column that stores as native pg uuid, reads/writes as base36 */");
  const typeParam = "<{\n  data: string;\n  driverData: string;\n}>";
  const configObj = [
    "{",
    '  dataType: () => "uuid",',
    "  toDriver: (value: string): string => translator.toUUID(value),",
    "  fromDriver: (value: string): string => translator.fromUUID(value),",
    "}",
  ].join("\n");
  sections.push(exportConst("base36Uuid", `customType${typeParam}(${configObj})`));
  sections.push("");

  sections.push("/** Drizzle client type for use in describe function signatures */");
  sections.push("export type DrizzleClient = Parameters<typeof relations.applyTo>[0];");
  sections.push("");

  return sections.join("\n");
}
