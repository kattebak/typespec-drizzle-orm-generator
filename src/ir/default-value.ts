import type { ArrayValue, EnumMember, ModelProperty, Value } from "@typespec/compiler";
import { $lib } from "../lib.js";
import type { DefaultValue, ProgramStateAccess } from "./types.js";

export type DefaultRead =
  | { kind: "none" }
  | { kind: "value"; value: DefaultValue }
  | { kind: "unrepresentable"; element: string };

const none: DefaultRead = { kind: "none" };

/**
 * Reads a model property's default for its column. A default no column can hold
 * is reported as an error rather than dropped, since a dropped default turns a
 * NOT NULL column without one into a failed migration on a table with rows.
 */
export function readColumnDefault(
  program: ProgramStateAccess,
  prop: ModelProperty,
): DefaultValue | undefined {
  const read = readDefaultValue(prop);
  if (read.kind === "value") return read.value;
  if (read.kind === "unrepresentable") {
    program.reportDiagnostic(
      $lib.createDiagnostic({
        code: "unrepresentable-default",
        target: prop,
        format: { property: prop.name, element: read.element },
      }),
    );
  }
  return undefined;
}

/**
 * Reads a model property's TypeSpec default into the literal the column default
 * is emitted from.
 *
 * Three shapes reach here. Compiled TypeSpec sets `defaultValue` to a checked
 * `Value` from the compiler's discriminated union. Older compilers set `default`
 * instead. Direct decorator invocation (unit tests over mock models) supplies a
 * bare JS primitive, a raw `EnumMember`, or a `{ value }` literal wrapper.
 */
export function readDefaultValue(prop: ModelProperty): DefaultRead {
  const legacy = (prop as ModelProperty & { default?: unknown }).default;
  const raw = prop.defaultValue ?? legacy;
  if (raw === undefined || raw === null) return none;
  if (isPrimitive(raw)) return { kind: "value", value: raw };
  if (isValue(raw)) return fromValue(raw);
  if (isEnumMember(raw)) return { kind: "value", value: fromEnumMember(raw) };
  if (isLiteralWrapper(raw)) return { kind: "value", value: raw.value };
  return none;
}

function fromValue(value: Value): DefaultRead {
  switch (value.valueKind) {
    case "StringValue":
    case "BooleanValue":
      return { kind: "value", value: value.value };
    case "NumericValue": {
      const numeric = value.value.asNumber() ?? value.value.asBigInt();
      return numeric === null ? none : { kind: "value", value: numeric };
    }
    case "EnumValue":
      return { kind: "value", value: fromEnumMember(value.value) };
    case "ArrayValue":
      return fromArrayValue(value);
    default:
      return none;
  }
}

// Drizzle takes a JSON column's default as the JS value it serializes, so every
// element has to survive JSON.stringify: a bigint throws there, and an object,
// null or scalar constructor has no DefaultValue form.
function fromArrayValue(array: ArrayValue): DefaultRead {
  const values: DefaultValue[] = [];
  for (const element of array.values) {
    const read = fromArrayElement(element);
    if (read.kind !== "value") return read;
    values.push(read.value);
  }
  return { kind: "value", value: values };
}

function fromArrayElement(element: Value): DefaultRead {
  switch (element.valueKind) {
    case "StringValue":
    case "BooleanValue":
    case "EnumValue":
    case "ArrayValue":
      return fromValue(element);
    case "NumericValue": {
      const numeric = element.value.asNumber();
      if (numeric !== null) return { kind: "value", value: numeric };
      return {
        kind: "unrepresentable",
        element: `the integer ${element.value.toString()}, which JSON cannot hold exactly`,
      };
    }
    default:
      return { kind: "unrepresentable", element: describeElement(element) };
  }
}

function describeElement(element: Value): string {
  switch (element.valueKind) {
    case "ObjectValue":
      return "an object";
    case "NullValue":
      return "null";
    default:
      return `a ${element.valueKind}`;
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
