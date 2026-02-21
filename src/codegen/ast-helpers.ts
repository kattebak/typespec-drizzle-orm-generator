import { generate } from "@babel/generator";
import { parse, parseExpression } from "@babel/parser";
import type { ObjectExpression } from "@babel/types";
import { RawCode } from "./stringify.js";

function isObjectExpression(node: unknown): node is ObjectExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: string }).type === "ObjectExpression"
  );
}

export function quoted(value: string): string {
  return `"${value}"`;
}

export function fnCall(name: string, args: string[]): string {
  const inner = args.join(", ");
  return `${name}(${inner})`;
}

export interface ChainMethod {
  method: string;
  args?: string[];
}

export function chainCall(base: string, calls: ChainMethod[]): string {
  let result = base;
  for (const call of calls) {
    const args = call.args ? call.args.join(", ") : "";
    result = `${result}.${call.method}(${args})`;
  }
  return result;
}

export function objectLiteral(
  entries: [string, string | RawCode][],
  options?: { concise?: boolean },
): string {
  const ast = parseExpression("{}");

  if (!isObjectExpression(ast)) {
    throw new Error("Failed to parse empty object expression");
  }

  for (const [key, value] of entries) {
    const raw = value instanceof RawCode ? value.code : value;
    const kvAst = parseExpression(`{ ${key}: ${raw} }`, {
      plugins: ["typescript"],
    });
    if (!isObjectExpression(kvAst)) {
      throw new Error(`Expected ObjectExpression for key "${key}"`);
    }
    ast.properties.push(...kvAst.properties);
  }

  return generate(ast, { concise: options?.concise }).code;
}

export function importDecl(
  specifiers: string[],
  source: string,
  options?: { type?: boolean; namespace?: string },
): string {
  if (options?.namespace) {
    const prefix = options.type ? "import type" : "import";
    return `${prefix} * as ${options.namespace} from ${quoted(source)};`;
  }

  const prefix = options?.type ? "import type" : "import";
  const specs = specifiers.join(", ");
  return `${prefix} { ${specs} } from ${quoted(source)};`;
}

export function exportConst(name: string, value: string): string {
  return `export const ${name} = ${value};`;
}

export function arrayLiteral(items: string[]): string {
  return `[${items.join(", ")}]`;
}

export function arrowFn(params: string[], body: string): string {
  const paramList = params.join(", ");
  return `(${paramList}) => ${body}`;
}

export function formatCode(code: string): string {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  return generate(ast).code;
}
