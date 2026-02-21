import { generate } from "@babel/generator";
import { parseExpression } from "@babel/parser";
import type { ObjectExpression } from "@babel/types";

export class RawCode {
  readonly code: string;
  constructor(code: string) {
    this.code = code;
  }
}

function isObjectExpression(node: unknown): node is ObjectExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: string }).type === "ObjectExpression"
  );
}

function stringifyValue(value: unknown): string {
  switch (typeof value) {
    case "undefined":
      return "undefined";
    case "string":
      return `"${value}"`;
    case "number":
    case "boolean":
      return String(value);
    case "function":
      return value.toString();
    case "object": {
      if (value === null) return "null";
      if (value instanceof RawCode) return value.code;
      if (Array.isArray(value)) return stringifyArray(value);
      return stringifyObject(value as Record<string, unknown>);
    }
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

function stringifyArray(items: unknown[]): string {
  const inner = items.map((item) => stringifyValue(item)).join(", ");
  return `[${inner}]`;
}

function stringifyKeyValue(key: string, value: unknown): ObjectExpression {
  const ast = parseExpression(`{ ${key}: ${stringifyValue(value)} }`, {
    plugins: ["typescript"],
  });

  if (!isObjectExpression(ast)) {
    throw new Error(
      `Expected ObjectExpression for key "${key}", got ${(ast as { type: string }).type}`,
    );
  }

  return ast;
}

export function stringifyObject(object: Record<string, unknown>): string {
  const ast = parseExpression("{}");

  if (!isObjectExpression(ast)) {
    throw new Error("Failed to parse empty object expression");
  }

  for (const [key, value] of Object.entries(object)) {
    const kvAst = stringifyKeyValue(key, value);
    ast.properties.push(...kvAst.properties);
  }

  return generate(ast).code;
}
