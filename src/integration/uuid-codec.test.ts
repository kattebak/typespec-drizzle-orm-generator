import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import short from "short-uuid";
import { resolveDialect } from "../generators/dialect.ts";
import { generateTypes } from "../generators/types-generator.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputDir = join(repoRoot, ".tmp", "uuid-codec");
const translator = short(short.constants.uuid25Base36);

interface Codec {
  base36ToBytes(id: string): Uint8Array;
  bytesToBase36(bytes: Uint8Array): string;
  uuidToBytes(uuid: string): Uint8Array;
  bytesToUuid(bytes: Uint8Array): string;
  generateBase36Id(): string;
}

function isCodec(value: unknown): value is Codec {
  if (typeof value !== "object" || value === null) return false;
  const module = value as Record<string, unknown>;
  return (
    typeof module.base36ToBytes === "function" &&
    typeof module.bytesToBase36 === "function" &&
    typeof module.uuidToBytes === "function" &&
    typeof module.bytesToUuid === "function" &&
    typeof module.generateBase36Id === "function"
  );
}

/** The 5.0.0 hex conversion, kept as the reference the emitted codec must agree with */
function referenceBytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function randomBytes(leadingZeros: number): Uint8Array {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes.fill(0, 0, leadingZeros);
  return bytes;
}

let codec: Codec;

before(async () => {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const source = `${generateTypes(resolveDialect("sqlite"), true)}
export { base36ToBytes, bytesToBase36, uuidToBytes, bytesToUuid };
`;
  const modulePath = join(outputDir, "types.ts");
  await writeFile(modulePath, source);
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  assert.ok(isCodec(loaded));
  codec = loaded;
});

after(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe("emitted uuid codec", () => {
  it("agrees with short-uuid on a random corpus, both directions", () => {
    for (let i = 0; i < 20000; i += 1) {
      const bytes = randomBytes(0);
      const canonical = referenceBytesToUuid(bytes);
      const id = translator.fromUUID(canonical);

      assert.equal(codec.bytesToBase36(bytes), id);
      assert.deepEqual(codec.base36ToBytes(id), bytes);
      assert.equal(codec.bytesToUuid(bytes), canonical);
      assert.deepEqual(codec.uuidToBytes(canonical), bytes);
      assert.equal(codec.bytesToUuid(codec.base36ToBytes(id)), translator.toUUID(id));
      assert.equal(codec.bytesToBase36(codec.uuidToBytes(canonical)), id);
    }
  });

  it("pads ids whose canonical form has leading zero bytes to 25 characters", () => {
    for (let leadingZeros = 1; leadingZeros <= 8; leadingZeros += 1) {
      for (let i = 0; i < 500; i += 1) {
        const bytes = randomBytes(leadingZeros);
        const id = translator.fromUUID(referenceBytesToUuid(bytes));

        assert.equal(codec.bytesToBase36(bytes), id);
        assert.equal(id.length, 25);
        assert.equal(id[0], "0");
        assert.deepEqual(codec.base36ToBytes(id), bytes);
      }
    }
  });

  it("round-trips the smallest and largest 128-bit values", () => {
    for (const bytes of [new Uint8Array(16), new Uint8Array(16).fill(0xff)]) {
      const id = translator.fromUUID(referenceBytesToUuid(bytes));
      assert.equal(codec.bytesToBase36(bytes), id);
      assert.deepEqual(codec.base36ToBytes(id), bytes);
    }
  });

  it("reads a base36 string shorter than 25 characters as short-uuid does", () => {
    for (const id of ["0", "1", "zzzz", "0000000000000000000000001"]) {
      assert.equal(codec.bytesToUuid(codec.base36ToBytes(id)), translator.toUUID(id));
    }
  });

  it("reads an uppercase canonical uuid as short-uuid does", () => {
    const id = translator.new();
    const canonical = translator.toUUID(id);
    assert.equal(codec.bytesToBase36(codec.uuidToBytes(canonical.toUpperCase())), id);
  });

  it("rejects values that are not ids", () => {
    assert.throws(() => codec.base36ToBytes("not-a-base36-id"), /Not a base36 uuid/);
    assert.throws(() => codec.base36ToBytes(""), /Not a base36 uuid/);
    assert.throws(() => codec.base36ToBytes("A".repeat(26)), /Not a base36 uuid/);
    assert.throws(() => codec.base36ToBytes("z".repeat(25)), /does not fit in 128 bits/);
    assert.throws(() => codec.bytesToBase36(new Uint8Array(15)), /Not a 16-byte uuid/);
    assert.throws(() => codec.uuidToBytes("nope"), /Not a uuid/);
    assert.throws(
      () => codec.uuidToBytes(`${translator.toUUID(translator.new())}00`),
      /Not a uuid/,
    );
  });

  it("mints ids that short-uuid validates as v4 uuids", () => {
    for (let i = 0; i < 2000; i += 1) {
      const id = codec.generateBase36Id();
      assert.equal(id.length, 25);
      assert.ok(translator.validate(id, true), id);
    }
  });
});
