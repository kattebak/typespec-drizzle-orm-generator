import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

type Dialect = "pg" | "sqlite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = resolve(repoRoot, "src/fixtures/edge-cases.tsp");
const emitterName = "@kattebak/typespec-drizzle-orm-generator";
let buildReady = false;

function ensureBuild(): void {
  if (buildReady) return;
  execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "pipe" });
  buildReady = true;
}

async function compileAndInstall(dialect: Dialect): Promise<void> {
  const outputDir = resolve(repoRoot, ".smoke-output", dialect);
  const outputDirOption = `{cwd}/.smoke-output/${dialect}`;
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  ensureBuild();

  execFileSync(
    "npx",
    [
      "tsp",
      "compile",
      fixturePath,
      "--emit",
      emitterName,
      "--option",
      `${emitterName}.emitter-output-dir=${outputDirOption}`,
      "--option",
      `${emitterName}.package-name=@smoke/${dialect}`,
      "--option",
      `${emitterName}.package-version=0.0.0`,
      "--option",
      `${emitterName}.dialect=${dialect}`,
      "--option",
      `${emitterName}.pluralize=true`,
    ],
    {
      cwd: repoRoot,
      stdio: "pipe",
    },
  );

  const expectedFiles = [
    "package.json",
    "tsconfig.json",
    "types.ts",
    "schema.ts",
    "relations.ts",
    "describe.ts",
    "index.ts",
  ];

  for (const name of expectedFiles) {
    assert.ok(existsSync(join(outputDir, name)), `Missing ${name} for ${dialect}`);
  }

  const schema = await readFile(join(outputDir, "schema.ts"), "utf8");
  if (dialect === "pg") {
    assert.ok(schema.includes('from "drizzle-orm/pg-core"'));
  } else {
    assert.ok(schema.includes('from "drizzle-orm/sqlite-core"'));
  }

  execFileSync("npm", ["install", "--ignore-scripts"], {
    cwd: outputDir,
    stdio: "pipe",
  });
}

describe("emitter package smoke (TypeSpec)", () => {
  it("generates installable packages for each dialect", async () => {
    await compileAndInstall("pg");
    await compileAndInstall("sqlite");
  });
});
