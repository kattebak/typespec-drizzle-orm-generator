import { importDecl, objectLiteral } from "../codegen/index.js";
import type { Relation, RelationGraph } from "../ir/relation-graph.js";
import type { TableDef } from "../ir/types.js";
import { toTableVariableName } from "./naming.js";

export function generateDescribe(
  tables: TableDef[],
  graph: RelationGraph,
  shouldPluralize = true,
): string {
  const lines: string[] = [];

  lines.push(importDecl(["DrizzleClient"], "./types.js", { type: true }));
  lines.push(importDecl([], "./schema.js", { namespace: "schema" }));

  for (const table of tables) {
    if (table.isJunction) continue;

    const rels = graph.get(table.name) || [];
    lines.push("");
    lines.push(...generateDescribeBlock(table, rels, shouldPluralize));
  }

  lines.push("");

  return lines.join("\n");
}

function generateDescribeBlock(
  table: TableDef,
  relations: Relation[],
  shouldPluralize: boolean,
): string[] {
  const lines: string[] = [];
  const tableVar = toTableVariableName(table.name, shouldPluralize);
  const pkField = table.primaryKey.columns[0];
  const funcName = `describe${table.name}`;
  const typeName = `${table.name}Description`;

  lines.push(...generateDescriptionType(table, relations, typeName, tableVar, shouldPluralize));

  lines.push(
    `export const ${funcName} = (`,
    `  db: DrizzleClient,`,
    `  ${pkField}: string,`,
    `): Promise<${typeName} | undefined> =>`,
  );

  if (relations.length > 0) {
    const withObj = objectLiteral(
      relations.map((rel) => [rel.name, "true"]),
      { concise: true },
    );
    lines.push(
      `  db.query.${tableVar}.findFirst({`,
      `    where: { ${pkField} },`,
      `    with: ${withObj},`,
      "  });",
    );
  } else {
    lines.push(`  db.query.${tableVar}.findFirst({`, `    where: { ${pkField} },`, "  });");
  }

  return lines;
}

function generateDescriptionType(
  _table: TableDef,
  relations: Relation[],
  typeName: string,
  tableVar: string,
  shouldPluralize: boolean,
): string[] {
  const lines: string[] = [];

  lines.push(`export type ${typeName} = typeof schema.${tableVar}.$inferSelect & {`);

  for (const rel of relations) {
    lines.push(`  ${rel.name}: ${getRelationTypeExpression(rel, shouldPluralize)};`);
  }

  lines.push("};");
  lines.push("");

  return lines;
}

function getRelationTypeExpression(rel: Relation, shouldPluralize: boolean): string {
  switch (rel.kind) {
    case "one": {
      const targetTableVar = toTableVariableName(rel.toTable, shouldPluralize);
      const base = `typeof schema.${targetTableVar}.$inferSelect`;
      return rel.optional ? `${base} | null` : base;
    }
    case "many": {
      const manyTableVar = toTableVariableName(rel.table, shouldPluralize);
      return `(typeof schema.${manyTableVar}.$inferSelect)[]`;
    }
    case "many-through": {
      const targetTableVar = toTableVariableName(rel.toTable, shouldPluralize);
      return `(typeof schema.${targetTableVar}.$inferSelect)[]`;
    }
  }
}
