/**
 * Generates the index.ts barrel file content.
 *
 * Re-exports all public symbols from the generated package.
 */
export function generateIndex(): string {
  return `export * from "./types.js";
export * from "./schema.js";
export { relations } from "./relations.js";
export * from "./describe.js";
`;
}
