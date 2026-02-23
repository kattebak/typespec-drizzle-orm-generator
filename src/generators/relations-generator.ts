import { importDecl, objectLiteral, RawCode } from "../codegen/index.js";
import type { Relation, RelationGraph } from "../ir/relation-graph.js";
import type { TableDef } from "../ir/types.js";
import { toTableVariableName } from "./naming.js";

export function generateRelations(
  tables: TableDef[],
  graph: RelationGraph,
  shouldPluralize = true,
): string {
  const lines: string[] = [];

  lines.push(importDecl(["defineRelations"], "drizzle-orm"));
  lines.push(importDecl([], "./schema.js", { namespace: "schema" }));
  lines.push("");
  lines.push("export const relations = defineRelations(schema, (r) => ({");

  for (const table of tables) {
    const tableVar = toTableVariableName(table.name, shouldPluralize);
    const rels = graph.get(table.name) || [];

    lines.push(`  ${tableVar}: {`);

    for (const rel of rels) {
      lines.push(`    ${generateRelationEntry(rel, tableVar, shouldPluralize)}`);
    }

    lines.push("  },");
  }

  lines.push("}));");
  lines.push("");

  return lines.join("\n");
}

function generateRelationEntry(rel: Relation, tableVar: string, shouldPluralize: boolean): string {
  switch (rel.kind) {
    case "one": {
      const targetTableVar = toTableVariableName(rel.toTable, shouldPluralize);
      const config = objectLiteral(
        [
          ["from", new RawCode(`r.${tableVar}.${rel.fromField}`)],
          ["to", new RawCode(`r.${targetTableVar}.${rel.toField}`)],
        ],
        { concise: true },
      );
      return `${rel.name}: r.one.${targetTableVar}(${config}),`;
    }
    case "many": {
      const manyTableVar = toTableVariableName(rel.table, shouldPluralize);
      return `${rel.name}: r.many.${manyTableVar}(),`;
    }
    case "many-through": {
      const targetTableVar = toTableVariableName(rel.toTable, shouldPluralize);
      const junctionTableVar = toTableVariableName(rel.junction.table, shouldPluralize);
      const config = objectLiteral(
        [
          [
            "from",
            new RawCode(
              `r.${tableVar}.${rel.fromField}.through(r.${junctionTableVar}.${rel.junction.fromField})`,
            ),
          ],
          [
            "to",
            new RawCode(
              `r.${targetTableVar}.${rel.toField}.through(r.${junctionTableVar}.${rel.junction.toField})`,
            ),
          ],
        ],
        { concise: true },
      );
      return `${rel.name}: r.many.${targetTableVar}(${config}),`;
    }
  }
}
