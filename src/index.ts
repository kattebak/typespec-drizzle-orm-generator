import type { EmitContext } from "@typespec/compiler";
import { emitFile, resolvePath } from "@typespec/compiler";
import { assemblePackage } from "./assembler.js";
import type { Dialect } from "./generators/dialect.js";
import { buildIR } from "./ir/builder.js";

export {
  $check,
  $columnVisibility,
  $compositeUnique,
  $createdAt,
  $foreignKeyDef,
  $indexDef,
  $junction,
  $maxValue,
  $minValue,
  $pk,
  $primaryKey,
  $references,
  $table,
  $unique,
  $updatedAt,
  $uuid,
} from "./decorators.js";
export { $lib } from "./lib.js";

export interface EmitterOptions {
  "package-name"?: string;
  "package-version"?: string;
  dialect?: Dialect;
  pluralize?: boolean;
}

export async function $onEmit(context: EmitContext<EmitterOptions>): Promise<void> {
  if (context.program.compilerOptions.noEmit) return;

  const { tables, enums } = buildIR(context.program);

  const config = {
    packageName: context.options["package-name"] ?? "drizzle-schema",
    packageVersion: context.options["package-version"] ?? "0.0.1",
    dialect: context.options.dialect ?? "pg",
    pluralize: context.options.pluralize ?? true,
  };

  const files = assemblePackage(tables, enums, config);

  for (const [filename, content] of files) {
    await emitFile(context.program, {
      path: resolvePath(context.emitterOutputDir, filename),
      content,
    });
  }
}
