import type { EmitContext } from "@typespec/compiler";
import { emitFile, resolvePath } from "@typespec/compiler";
import { assemblePackage } from "./assembler.js";
import { buildIR } from "./ir/builder.js";

export {
  $check,
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
  $visibility,
} from "./decorators.js";
export { $lib } from "./lib.js";

export interface EmitterOptions {
  "package-name"?: string;
  "package-version"?: string;
}

export async function $onEmit(context: EmitContext<EmitterOptions>): Promise<void> {
  if (context.program.compilerOptions.noEmit) return;

  const { tables, enums } = buildIR(context.program);

  const config = {
    packageName: context.options["package-name"] ?? "drizzle-schema",
    packageVersion: context.options["package-version"] ?? "0.0.1",
  };

  const files = assemblePackage(tables, enums, config);

  for (const [filename, content] of files) {
    await emitFile(context.program, {
      path: resolvePath(context.emitterOutputDir, filename),
      content,
    });
  }
}
