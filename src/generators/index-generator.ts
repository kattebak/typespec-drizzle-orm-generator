import { quoted } from "../codegen/index.js";

export function generateIndex(): string {
  const lines: string[] = [
    `export * from ${quoted("./types.js")};`,
    `export * from ${quoted("./schema.js")};`,
    `export { relations } from ${quoted("./relations.js")};`,
    `export * from ${quoted("./describe.js")};`,
    "",
  ];

  return lines.join("\n");
}
