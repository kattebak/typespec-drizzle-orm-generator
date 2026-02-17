import type { Relation, RelationGraph } from "../ir/relation-graph.ts";
import type { EntityDef } from "../ir/types.ts";
import { toTableVariableName } from "./naming.ts";

/**
 * Generates the complete describe.ts file content from IR + relation graph.
 *
 * For each non-junction entity:
 *   1. Generate the Description type alias
 *   2. Generate the describe function using findFirst + with
 *   3. Include all relations from the relation graph
 *
 * Junction entities (isJunction === true) are skipped.
 */
export function generateDescribe(entities: EntityDef[], graph: RelationGraph): string {
  const lines: string[] = [];

  lines.push('import type { DrizzleClient } from "./types.js";');
  lines.push('import * as schema from "./schema.js";');

  for (const entity of entities) {
    if (entity.isJunction) continue;

    const rels = graph.get(entity.name) || [];
    lines.push("");
    lines.push(...generateDescribeBlock(entity, rels));
  }

  lines.push("");

  return lines.join("\n");
}

function generateDescribeBlock(entity: EntityDef, relations: Relation[]): string[] {
  const lines: string[] = [];
  const tableVar = toTableVariableName(entity.name);
  const pkField = entity.primaryKey.columns[0];
  const funcName = `describe${entity.name}`;
  const typeName = `${entity.name}Description`;

  // Type alias
  lines.push(...generateDescriptionType(entity, relations, typeName, tableVar));

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
  _entity: EntityDef,
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
      const targetTableVar = toTableVariableName(rel.toEntity);
      const base = `typeof schema.${targetTableVar}.$inferSelect`;
      return rel.optional ? `${base} | null` : base;
    }
    case "many": {
      const manyTableVar = toTableVariableName(rel.entity);
      return `(typeof schema.${manyTableVar}.$inferSelect)[]`;
    }
    case "many-through": {
      const targetTableVar = toTableVariableName(rel.toEntity);
      return `(typeof schema.${targetTableVar}.$inferSelect)[]`;
    }
  }
}
