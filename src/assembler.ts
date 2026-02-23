import { generateDescribe } from "./generators/describe-generator.js";
import type { Dialect } from "./generators/dialect.js";
import { resolveDialect } from "./generators/dialect.js";
import { generateIndex } from "./generators/index-generator.js";
import { generateRelations } from "./generators/relations-generator.js";
import { generateSchema } from "./generators/schema-generator.js";
import { generateTypes } from "./generators/types-generator.js";
import { buildRelationGraph } from "./ir/relation-graph.js";
import type { EnumDef, TableDef } from "./ir/types.js";

export interface EmitterConfig {
  packageName: string;
  packageVersion: string;
  dialect: Dialect;
  pluralize: boolean;
}

/**
 * Assembles the complete output package from IR.
 *
 * Returns a Map<filename, content> for all 7 output files:
 *   package.json, tsconfig.json, types.ts, schema.ts, relations.ts, describe.ts, index.ts
 */
export function assemblePackage(
  tables: TableDef[],
  enums: EnumDef[],
  config: EmitterConfig,
): Map<string, string> {
  const graph = buildRelationGraph(tables, config.pluralize);
  const dialect = resolveDialect(config.dialect);

  return new Map([
    ["package.json", generatePackageJson(config)],
    ["tsconfig.json", generateTsConfig()],
    ["types.ts", generateTypes(dialect)],
    ["schema.ts", generateSchema(tables, enums, dialect, config.pluralize)],
    ["relations.ts", generateRelations(tables, graph, config.pluralize)],
    ["describe.ts", generateDescribe(tables, graph, config.pluralize)],
    ["index.ts", generateIndex()],
  ]);
}

function generatePackageJson(config: EmitterConfig): string {
  const pkg = {
    name: config.packageName,
    version: config.packageVersion,
    type: "module",
    main: "dist/index.js",
    types: "dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    scripts: {
      build: "tsc",
      prepare: "tsc",
    },
    dependencies: {
      "short-uuid": "^5.2.0",
    },
    peerDependencies: {
      "drizzle-orm": ">=1.0.0-beta.1",
      typescript: ">=5.0.0",
    },
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function generateTsConfig(): string {
  const tsconfig = {
    compilerOptions: {
      target: "ESNext",
      module: "NodeNext",
      declaration: true,
      skipLibCheck: true,
      outDir: "dist",
    },
    include: ["*.ts"],
  };

  return `${JSON.stringify(tsconfig, null, 2)}\n`;
}
