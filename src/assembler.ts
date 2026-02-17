import { generateDescribe } from "./generators/describe-generator.ts";
import { generateIndex } from "./generators/index-generator.ts";
import { generateRelations } from "./generators/relations-generator.ts";
import { generateSchema } from "./generators/schema-generator.ts";
import { generateTypes } from "./generators/types-generator.ts";
import { buildRelationGraph } from "./ir/relation-graph.ts";
import type { EnumDef, TableDef } from "./ir/types.ts";

export interface EmitterConfig {
  packageName: string;
  packageVersion: string;
}

/**
 * Assembles the complete output package from IR.
 *
 * Returns a Map<filename, content> for all 6 output files:
 *   package.json, types.ts, schema.ts, relations.ts, describe.ts, index.ts
 */
export function assemblePackage(
  tables: TableDef[],
  enums: EnumDef[],
  config: EmitterConfig,
): Map<string, string> {
  const graph = buildRelationGraph(tables);

  return new Map([
    ["package.json", generatePackageJson(config)],
    ["types.ts", generateTypes()],
    ["schema.ts", generateSchema(tables, enums)],
    ["relations.ts", generateRelations(tables, graph)],
    ["describe.ts", generateDescribe(tables, graph)],
    ["index.ts", generateIndex()],
  ]);
}

function generatePackageJson(config: EmitterConfig): string {
  const pkg = {
    name: config.packageName,
    version: config.packageVersion,
    type: "module",
    main: "index.js",
    types: "index.d.ts",
    exports: {
      ".": {
        types: "./index.d.ts",
        import: "./index.js",
      },
    },
    dependencies: {
      "drizzle-orm": "^1.0.0",
      "short-uuid": "^5.2.0",
    },
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}
