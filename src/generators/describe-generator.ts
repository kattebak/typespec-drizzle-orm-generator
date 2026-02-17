import type { Relation, RelationGraph } from "../ir/relation-graph.ts";
import type { TableDef } from "../ir/types.ts";
import { toTableVariableName } from "./naming.ts";

/**
 * Generates the complete describe.ts file content from IR + relation graph.
 *
 * For each non-junction table:
 *   1. Generate the Description type alias
 *   2. Generate the describe function using findFirst + with
 *   3. Include all relations from the relation graph
 *
 * Junction tables (isJunction === true) are skipped.
 */
export function generateDescribe(tables: TableDef[], graph: RelationGraph): string {
  const lines: string[] = [];

  lines.push('import type { DrizzleClient } from "./types.js";');
  lines.push('import * as schema from "./schema.js";');

  for (const table of tables) {
    if (table.isJunction) continue;

    const rels = graph.get(table.name) || [];
    lines.push("");
    lines.push(...generateDescribeBlock(table, rels));
  }

  lines.push("");

  return lines.join("\n");
}

function generateDescribeBlock(table: TableDef, relations: Relation[]): string[] {
  const lines: string[] = [];
  const tableVar = toTableVariableName(table.name);
  const pkField = table.primaryKey.columns[0];
  const funcName = `describe${table.name}`;
  const typeName = `${table.name}Description`;

  // Type alias
  lines.push(...generateDescriptionType(table, relations, typeName, tableVar));

  // Function
  lines.push(
    `export const ${funcName} = (`,
    `  db: DrizzleClient,`,
    `  ${pkField}: string,`,
    `): Promise<${typeName} | undefined> =>`,
    `  db.query.${tableVar}.findFirst({`,
    `    where: { ${pkField} },`,
  );

  if (relations.length > 0) {
    lines.push("    with: {");
    for (const rel of relations) {
      lines.push(`      ${rel.name}: true,`);
    }
    lines.push("    },");
  }

  lines.push("  });");

  return lines;
}

function generateDescriptionType(
  _table: TableDef,
  relations: Relation[],
  typeName: string,
  tableVar: string,
): string[] {
  const lines: string[] = [];

  lines.push(`export type ${typeName} = typeof schema.${tableVar}.$inferSelect & {`);

  for (const rel of relations) {
    lines.push(`  ${rel.name}: ${getRelationTypeExpression(rel)};`);
  }

  lines.push("};");
  lines.push("");

  return lines;
}

function getRelationTypeExpression(rel: Relation): string {
  switch (rel.kind) {
    case "one": {
      const targetTableVar = toTableVariableName(rel.toTable);
      const base = `typeof schema.${targetTableVar}.$inferSelect`;
      return rel.optional ? `${base} | null` : base;
    }
    case "many": {
      const manyTableVar = toTableVariableName(rel.table);
      return `(typeof schema.${manyTableVar}.$inferSelect)[]`;
    }
    case "many-through": {
      const targetTableVar = toTableVariableName(rel.toTable);
      return `(typeof schema.${targetTableVar}.$inferSelect)[]`;
    }
  }
}
