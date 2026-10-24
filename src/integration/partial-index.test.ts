import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { EmitContext } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import type { SQL } from "drizzle-orm";
import { PgDialect, type PgTable, getTableConfig as pgTableConfig } from "drizzle-orm/pg-core";
import {
  SQLiteSyncDialect,
  type SQLiteTable,
  getTableConfig as sqliteTableConfig,
} from "drizzle-orm/sqlite-core";
import type { Dialect } from "../generators/dialect.ts";
import * as library from "../index.ts";
import { $onEmit, type EmitterOptions } from "../index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputRoot = join(repoRoot, ".tmp", "partial-index");
const tsgo = join(repoRoot, "node_modules", ".bin", "tsgo");

type Frontend = "drizzle" | "remit";

const ACTIVE = "deleted_at IS NULL";
const ESCAPED = `handle <> '\${x}' AND handle NOT LIKE '%\`%'`;

const ROW_FIELDS = `
  accountId: string;
  handle: string;
  deletedAt?: int64;
`;

const INDEXES = `
@Drizzle.indexDef("row_by_account", [Row.accountId])
@Drizzle.indexDef("row_active_by_account", [Row.accountId], false, "${ACTIVE}")
@Drizzle.indexDef("row_active_by_handle", [Row.handle], true, "${ACTIVE}")
@Drizzle.indexDef("row_by_odd_handle", [Row.handle], false, "${ESCAPED.replace("$", "\\$")}")
`;

const DRIZZLE_SOURCE = `
import "./drizzle.tsp";
namespace Test;

@Drizzle.table("Row", "test")
@Drizzle.primaryKey("rows")
${INDEXES}
model Row {
  @Drizzle.pk rowId: string;
  ${ROW_FIELDS}
}
`;

const REMIT_SOURCE = `
import "./drizzle.tsp";
import "./electrodb.tsp";
namespace Test;

@entity("row", "remit")
@index("Row", { pk: [Row.rowId] })
${INDEXES}
model Row {
  rowId: string;
  ${ROW_FIELDS}
}
`;

const ELECTRODB = `
using TypeSpec.Reflection;

model AccessPattern {
  index?: string;
  collection?: string;
  pk?: ModelProperty[];
  sk?: ModelProperty[];
}

extern dec entity(target: Model, entity: string, service: string);
extern dec index(target: Model, name: string, accessPattern: AccessPattern);
`;

type TestHost = Awaited<ReturnType<typeof createTestHost>>;

async function compile(frontend: Frontend): Promise<TestHost> {
  const host = await createTestHost();
  const mainTsp = await readFile(resolve(repoRoot, "tsp/main.tsp"), "utf8");
  host.addJsFile("drizzle.js", { ...library });
  host.addTypeSpecFile(
    "drizzle.tsp",
    mainTsp.replace('import "../dist/index.js";', 'import "./drizzle.js";'),
  );
  host.addJsFile("electrodb.js", { $entity: () => {}, $index: () => {} });
  host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${ELECTRODB}`);
  host.addTypeSpecFile("main.tsp", frontend === "drizzle" ? DRIZZLE_SOURCE : REMIT_SOURCE);
  await host.compile("main.tsp");
  return host;
}

async function emit(host: TestHost, frontend: Frontend, dialect: Dialect): Promise<string> {
  const emitterOutputDir = `/emit-${frontend}-${dialect}`;
  const options: EmitterOptions = { frontend, dialect, "schema-only": true };
  await $onEmit({
    program: host.program,
    emitterOutputDir,
    options,
  } as unknown as EmitContext<EmitterOptions>);

  const outputDir = join(outputRoot, `${frontend}-${dialect}`);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  for (const [path, content] of host.fs) {
    if (path.startsWith(`${emitterOutputDir}/`) && path.endsWith(".ts")) {
      await writeFile(join(outputDir, path.slice(emitterOutputDir.length + 1)), content);
    }
  }
  await writeFile(join(outputDir, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    join(outputDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["*.ts"],
    }),
  );
  return outputDir;
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && "accountId" in value && "handle" in value;
}

async function indexPredicates(
  outputDir: string,
  dialect: Dialect,
): Promise<Map<string, string | undefined>> {
  const schema: Record<string, unknown> = await import(
    pathToFileURL(join(outputDir, "schema.ts")).href
  );
  const table = Object.values(schema).find(isTable);
  assert.ok(table, "row table not exported");

  const render =
    dialect === "pg"
      ? (where: SQL) => new PgDialect().sqlToQuery(where).sql
      : (where: SQL) => new SQLiteSyncDialect().sqlToQuery(where).sql;
  const indexes =
    dialect === "pg"
      ? pgTableConfig(table as unknown as PgTable).indexes
      : sqliteTableConfig(table as unknown as SQLiteTable).indexes;

  return new Map(
    indexes.map((idx) => [
      idx.config.name,
      idx.config.where === undefined ? undefined : render(idx.config.where),
    ]),
  );
}

after(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

for (const frontend of ["drizzle", "remit"] as const) {
  for (const dialect of ["pg", "sqlite"] as const) {
    describe(`partial indexes: ${frontend} front-end on ${dialect}`, () => {
      it("emits the predicate as a where clause that type-checks against drizzle", async () => {
        const host = await compile(frontend);
        assert.deepEqual(host.program.diagnostics, []);
        const outputDir = await emit(host, frontend, dialect);

        execFileSync(tsgo, ["--project", join(outputDir, "tsconfig.json")], { stdio: "pipe" });

        const predicates = await indexPredicates(outputDir, dialect);
        assert.equal(predicates.get("row_active_by_account"), ACTIVE);
        assert.equal(predicates.get("row_active_by_handle"), ACTIVE);
        assert.equal(predicates.get("row_by_odd_handle"), ESCAPED);
      });

      it("emits an index without a predicate exactly as before", async () => {
        const host = await compile(frontend);
        const outputDir = await emit(host, frontend, dialect);

        const schema = await readFile(join(outputDir, "schema.ts"), "utf8");
        assert.match(schema, /^ {4}index\("row_by_account"\)\.on\(table\.accountId\),?$/m);

        const predicates = await indexPredicates(outputDir, dialect);
        assert.ok(predicates.has("row_by_account"));
        assert.equal(predicates.get("row_by_account"), undefined);
      });
    });
  }
}
