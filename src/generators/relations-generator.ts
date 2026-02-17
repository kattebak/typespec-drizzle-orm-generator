import type { Relation, RelationGraph } from "../ir/relation-graph.ts";
import type { EntityDef } from "../ir/types.ts";
import { toTableVariableName } from "./naming.ts";

/**
 * Generates the complete relations.ts file content from IR + relation graph.
 *
 * Produces:
 * - import { defineRelations } from "drizzle-orm"
 * - import * as schema from "./schema.js"
 * - export const relations = defineRelations(schema, (r) => ({ ... }))
 */
export function generateRelations(entities: EntityDef[], graph: RelationGraph): string {
  const lines: string[] = [];

  lines.push('import { defineRelations } from "drizzle-orm";');
  lines.push('import * as schema from "./schema.js";');
  lines.push("");
  lines.push("export const relations = defineRelations(schema, (r) => ({");

  for (const entity of entities) {
    const tableVar = toTableVariableName(entity.name);
    const rels = graph.get(entity.name) || [];

    lines.push(`  ${tableVar}: {`);

    for (const rel of rels) {
      lines.push(...generateRelationEntry(rel, tableVar));
    }

    lines.push("  },");
  }

  lines.push("}));");
  lines.push("");

  return lines.join("\n");
}

function generateRelationEntry(rel: Relation, tableVar: string): string[] {
  switch (rel.kind) {
    case "one": {
      const targetTableVar = toTableVariableName(rel.toEntity);
      return [
        `    ${rel.name}: r.one.${targetTableVar}({`,
        `      from: r.${tableVar}.${rel.fromField},`,
        `      to: r.${targetTableVar}.${rel.toField},`,
        "    }),",
      ];
    }
    case "many": {
      const manyTableVar = toTableVariableName(rel.entity);
      return [`    ${rel.name}: r.many.${manyTableVar}(),`];
    }
    case "many-through": {
      const targetTableVar = toTableVariableName(rel.toEntity);
      const junctionTableVar = toTableVariableName(rel.junction.entity);
      return [
        `    ${rel.name}: r.many.${targetTableVar}({`,
        `      from: r.${tableVar}.${rel.fromField}.through(r.${junctionTableVar}.${rel.junction.fromField}),`,
        `      to: r.${targetTableVar}.${rel.toField}.through(r.${junctionTableVar}.${rel.junction.toField}),`,
        "    }),",
      ];
    }
  }
}
