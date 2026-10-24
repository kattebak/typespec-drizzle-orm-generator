import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { EmitContext } from "@typespec/compiler";
import { createTestHost } from "@typespec/compiler/testing";
import type { Dialect } from "../generators/dialect.ts";
import { $onEmit, type EmitterOptions } from "../index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputRoot = join(repoRoot, ".tmp", "array-default");
const tsgo = join(repoRoot, "node_modules", ".bin", "tsgo");

type Frontend = "drizzle" | "remit";

const ACCOUNT_FIELDS = `
  syncedServices: AccountService[] = #[AccountService.Mail];
  labels: string[] = #["inbox", "starred"];
  limits: int32[] = #[10, 20];
  empty: string[] = #[];
  plain: string[];
`;

const DRIZZLE_SOURCE = `
import "./drizzle.tsp";

enum AccountService { Mail, Calendar }

@table("Account", "test")
@primaryKey("accounts")
model Account {
  @pk accountId: string;
  ${ACCOUNT_FIELDS}
}
`;

const REMIT_SOURCE = `
import "./electrodb.tsp";

enum AccountService { Mail, Calendar }

@entity("account", "remit")
@index("Account", { pk: [Account.accountId] })
model Account {
  accountId: string;
  ${ACCOUNT_FIELDS}
}
`;

const DRIZZLE_DECORATORS = `
using TypeSpec.Reflection;

extern dec table(target: Model, name: valueof string, service: valueof string);
extern dec primaryKey(target: Model, tableName: valueof string);
extern dec pk(target: ModelProperty);
`;

const REMIT_DECORATORS = `
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

async function compile(frontend: Frontend, source: string): Promise<TestHost> {
  const host = await createTestHost();
  if (frontend === "drizzle") {
    const { $pk, $primaryKey, $table } = await import("../decorators.ts");
    host.addJsFile("drizzle.js", { $table, $primaryKey, $pk });
    host.addTypeSpecFile("drizzle.tsp", `import "./drizzle.js";\n${DRIZZLE_DECORATORS}`);
  } else {
    host.addJsFile("electrodb.js", { $entity: () => {}, $index: () => {} });
    host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${REMIT_DECORATORS}`);
  }
  host.addTypeSpecFile("main.tsp", source);
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

interface Column {
  default: unknown;
  hasDefault: boolean;
}

function isColumn(value: unknown): value is Column {
  return typeof value === "object" && value !== null && "hasDefault" in value;
}

async function loadAccountColumns(outputDir: string): Promise<Map<string, Column>> {
  const schema: Record<string, unknown> = await import(
    pathToFileURL(join(outputDir, "schema.ts")).href
  );
  const table = Object.values(schema).find(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && "syncedServices" in value,
  );
  assert.ok(table, "account table not exported");
  const columns = new Map<string, Column>();
  for (const name of ["syncedServices", "labels", "limits", "empty", "plain"]) {
    const column = table[name];
    assert.ok(isColumn(column), `${name} is not a column`);
    columns.set(name, column);
  }
  return columns;
}

after(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

for (const frontend of ["drizzle", "remit"] as const) {
  for (const dialect of ["pg", "sqlite"] as const) {
    describe(`array defaults: ${frontend} front-end on ${dialect}`, () => {
      it("emits a non-empty array default that type-checks against drizzle", async () => {
        const host = await compile(
          frontend,
          frontend === "drizzle" ? DRIZZLE_SOURCE : REMIT_SOURCE,
        );
        assert.deepEqual(host.program.diagnostics, []);
        const outputDir = await emit(host, frontend, dialect);

        execFileSync(tsgo, ["--project", join(outputDir, "tsconfig.json")], { stdio: "pipe" });

        const columns = await loadAccountColumns(outputDir);
        assert.deepEqual(columns.get("syncedServices")?.default, ["Mail"]);
        assert.deepEqual(columns.get("labels")?.default, ["inbox", "starred"]);
        assert.deepEqual(columns.get("limits")?.default, [10, 20]);
        assert.deepEqual(columns.get("empty")?.default, []);
        assert.equal(columns.get("plain")?.hasDefault, false);
      });
    });
  }
}

describe("array defaults no column can hold", () => {
  for (const frontend of ["drizzle", "remit"] as const) {
    it(`reports an error on the ${frontend} front-end instead of dropping the default`, async () => {
      const source = (frontend === "drizzle" ? DRIZZLE_SOURCE : REMIT_SOURCE).replace(
        "plain: string[];",
        "plain: string[];\n  huge: int64[] = #[9007199254740993];",
      );
      const host = await compile(frontend, source);
      await emit(host, frontend, "sqlite");

      assert.deepEqual(
        host.program.diagnostics.map((d) => [d.code, d.severity]),
        [["@kattebak/typespec-drizzle-orm-generator/unrepresentable-default", "error"]],
      );
    });
  }
});
