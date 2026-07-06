import { quoted } from "../codegen/index.js";

export function generateIndex(schemaOnly = false): string {
  const lines: string[] = [
    `export * from ${quoted("./types.js")};`,
    `export * from ${quoted("./schema.js")};`,
  ];

  if (!schemaOnly) {
    lines.push(`export { relations } from ${quoted("./relations.js")};`);
    lines.push(`export * from ${quoted("./describe.js")};`);
  }

  lines.push("");

  return lines.join("\n");
}
