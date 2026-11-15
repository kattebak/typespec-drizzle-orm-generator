import type { ModelProperty } from "@typespec/compiler";
import { $lib, StateKeys } from "../lib.js";
import type { FieldDef, FieldType, ProgramStateAccess, UuidEncoding } from "./types.js";
import { DEFAULT_UUID_ENCODING, isNativeUuidEncoding, isUuidEncoding } from "./types.js";

interface UuidMeta {
  encoding?: string;
  autoGenerate: boolean;
}

export interface UuidField {
  type: FieldType;
  uuid?: FieldDef["uuid"];
}

/**
 * Reads the `@uuid` state for one property.
 *
 * Both front-ends read it from here, so a `@uuid` column means the same thing
 * whichever vocabulary declared the model. `rfc4122` resolves to a native uuid
 * column that carries no codec and no generated default; the other encodings
 * carry the base36 codec the generated `types.ts` exports.
 */
export function readUuidField(
  program: ProgramStateAccess,
  prop: ModelProperty,
): UuidField | undefined {
  const meta = program.stateMap(StateKeys.uuid).get(prop) as UuidMeta | undefined;
  if (!meta) return undefined;

  if (isNativeUuidEncoding(meta.encoding)) {
    if (meta.autoGenerate) {
      program.reportDiagnostic(
        $lib.createDiagnostic({ code: "native-uuid-auto-generate", target: prop }),
      );
    }
    return { type: { kind: "nativeUuid" } };
  }

  const encoding = resolveUuidEncoding(meta, prop, program);
  return {
    type: { kind: "uuid", encoding },
    uuid: { encoding, autoGenerate: meta.autoGenerate },
  };
}

function resolveUuidEncoding(
  meta: UuidMeta,
  prop: ModelProperty,
  program: ProgramStateAccess,
): UuidEncoding {
  if (meta.encoding === undefined) return DEFAULT_UUID_ENCODING;
  if (isUuidEncoding(meta.encoding)) return meta.encoding;

  program.reportDiagnostic(
    $lib.createDiagnostic({
      code: "unknown-uuid-encoding",
      target: prop,
      format: { encoding: meta.encoding },
    }),
  );
  return DEFAULT_UUID_ENCODING;
}
