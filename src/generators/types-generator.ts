/**
 * Generates the types.ts file content.
 *
 * Contains:
 * - base36Uuid custom type (native pg uuid, marshaled to/from base36)
 * - DrizzleClient type alias for describe function signatures
 */
export function generateTypes(): string {
  return `import { customType } from "drizzle-orm/pg-core";
import short from "short-uuid";
import type { relations } from "./relations.js";

const translator = short(short.constants.uuid25Base36);

/** UUID column that stores as native pg uuid, reads/writes as base36 */
export const base36Uuid = customType<{
  data: string;
  driverData: string;
}>({
  dataType: () => "uuid",
  toDriver: (value: string): string => translator.toUUID(value),
  fromDriver: (value: string): string => translator.fromUUID(value),
});

/** Drizzle client type for use in describe function signatures */
export type DrizzleClient = Parameters<typeof relations.applyTo>[0];
`;
}
