import type { EnumMember, ModelProperty, Value } from "@typespec/compiler";
import type { DefaultValue } from "./types.js";

/**
 * Reads a model property's TypeSpec default into the literal the column default
 * is emitted from.
 *
 * Three shapes reach here. Compiled TypeSpec sets `defaultValue` to a checked
 * `Value` from the compiler's discriminated union. Older compilers set `default`
 * instead. Direct decorator invocation (unit tests over mock models) supplies a
 * bare JS primitive, a raw `EnumMember`, or a `{ value }` literal wrapper.
 */
export function readDefaultValue(prop: ModelProperty): DefaultValue | undefined {
  const legacy = (prop as ModelProperty & { default?: unknown }).default;
  const raw = prop.defaultValue ?? legacy;
  if (raw === undefined || raw === null) return undefined;
  if (isPrimitive(raw)) return raw;
  if (isValue(raw)) return fromValue(raw);
  if (isEnumMember(raw)) return fromEnumMember(raw);
  if (isLiteralWrapper(raw)) return raw.value;
  return undefined;
}

function fromValue(value: Value): DefaultValue | undefined {
  switch (value.valueKind) {
    case "StringValue":
    case "BooleanValue":
      return value.value;
    case "NumericValue":
      return value.value.asNumber() ?? value.value.asBigInt() ?? undefined;
    case "EnumValue":
      return fromEnumMember(value.value);
    // Only an empty array default is expressible as a column default. A JSON
    // column declared `= #[]` otherwise emits notNull with no default, so a row
    // written without the field fails at insert time instead of getting the
    // default the schema promises.
    case "ArrayValue":
      return value.values.length === 0 ? [] : undefined;
    default:
      return undefined;
  }
}

function fromEnumMember(member: EnumMember): DefaultValue {
  return member.value ?? member.name;
}

function isPrimitive(value: unknown): value is string | number | bigint | boolean {
  const kind = typeof value;
  return kind === "string" || kind === "number" || kind === "bigint" || kind === "boolean";
}

function isValue(value: unknown): value is Value {
  return isRecord(value) && value.entityKind === "Value";
}

function isEnumMember(value: unknown): value is EnumMember {
  return isRecord(value) && value.kind === "EnumMember";
}

function isLiteralWrapper(value: unknown): value is { value: string | number | bigint | boolean } {
  return isRecord(value) && isPrimitive(value.value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
