import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createTestHost } from "@typespec/compiler/testing";
import { buildRemitIR } from "../ir/remit-builder.ts";
import type { TableDef } from "../ir/types.ts";

const STUB_DECORATORS = `
using TypeSpec.Reflection;

model AccessPattern {
  index?: string;
  collection?: string;
  pk?: ModelProperty[];
  sk?: ModelProperty[];
}

extern dec entity(target: Model, entity: string, service: string);
extern dec index(target: Model, name: string, accessPattern: AccessPattern);
extern dec label(target: ModelProperty, label: string);
extern dec createdAt(target: ModelProperty, label?: string);
extern dec updatedAt(target: ModelProperty, label?: string);
`;

const MODELS = `
import "./electrodb.tsp";

enum Color {
  None: "none",
  Red: "red",
}

enum SystemFlag {
  Seen: "\\\\Seen",
  Answered: "\\\\Answered",
}

union FlagValue {
  system: SystemFlag,
  custom: string,
}

model Meta {
  score: int32;
}

@entity("threadMessage", "remit")
@index("ThreadMessage", { pk: [ThreadMessage.accountConfigId], sk: [ThreadMessage.threadMessageId] })
@index("byDate", { index: "lsi1", pk: [ThreadMessage.accountConfigId], sk: [ThreadMessage.sentDate] })
model ThreadMessage {
  accountConfigId: string;
  threadMessageId: string;
  sentDate: int64;
  star: Color;
  flag: FlagValue;
  meta?: Meta;
  subject?: string;
  @createdAt createdAt: int64;
  @updatedAt updatedAt: int64;
}

@entity("message", "remit")
@index("Message", { pk: [Message.messageId] })
@index("byMsg", { index: "gsi1", collection: "messageData", pk: [Message.messageId] })
model Message {
  messageId: string;
  subject?: string;
}

@entity("bodyPart", "remit")
@index("BodyPart", { pk: [BodyPart.bodyPartId] })
@index("byMsgPart", { index: "gsi1", collection: "messageData", pk: [BodyPart.messageId] })
model BodyPart {
  bodyPartId: string;
  messageId: string;
  content: string;
}

@entity("mailboxLock", "remit")
@index("MailboxLock", { pk: [MailboxLock.mailboxId], sk: [MailboxLock.eventName] })
model MailboxLock {
  mailboxId: string;
  eventName: string;
  lockId: string;
}
`;

describe("remit entity front-end (buildRemitIR)", () => {
  let tables: TableDef[];
  let byName: Map<string, TableDef>;
  let program: Awaited<ReturnType<typeof createTestHost>>["program"];

  before(async () => {
    const host = await createTestHost();
    host.addJsFile("electrodb.js", {
      $entity: () => {},
      $index: () => {},
      $label: () => {},
      $createdAt: () => {},
      $updatedAt: () => {},
    });
    host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${STUB_DECORATORS}`);
    host.addTypeSpecFile("main.tsp", MODELS);
    await host.compile("main.tsp");
    program = host.program;
    ({ tables } = buildRemitIR(program));
    byName = new Map(tables.map((t) => [t.name, t]));
  });

  it("snake-cases the entity name into the SQL table name", () => {
    assert.equal(byName.get("ThreadMessage")?.tableName, "thread_message");
  });

  it("uses the single-column identity field as the primary key", () => {
    const pk = byName.get("ThreadMessage")?.primaryKey;
    assert.deepEqual(pk?.columns, ["threadMessageId"]);
    assert.equal(pk?.isComposite, false);
  });

  it("demotes the electrodb primary composite to a secondary index", () => {
    const names = byName.get("ThreadMessage")?.indexes.map((i) => i.name);
    assert.ok(names?.includes("thread_message_primary"));
  });

  it("keeps a composite primary key for an entity with no identity field", () => {
    const pk = byName.get("MailboxLock")?.primaryKey;
    assert.deepEqual(pk?.columns, ["mailboxId", "eventName"]);
    assert.equal(pk?.isComposite, true);
  });

  it("names secondary indexes <table>_<accessPattern>", () => {
    const names = byName.get("ThreadMessage")?.indexes.map((i) => i.name);
    assert.ok(names?.includes("thread_message_by_date"));
  });

  it("resolves enums to text-backed union columns and emits no pgEnum defs", () => {
    const star = byName.get("ThreadMessage")?.fields.find((f) => f.name === "star");
    assert.equal(star?.type.kind, "textEnum");
    assert.equal(
      tables.every((t) => t.fields.every((f) => f.type.kind !== "enum")),
      true,
    );
  });

  it("attaches a generated id default to single-column text PKs when idDefault is set", () => {
    const result = buildRemitIR(program, { idDefault: true });
    const pkField = result.tables
      .find((t) => t.name === "ThreadMessage")
      ?.fields.find((f) => f.name === "threadMessageId");
    assert.equal(pkField?.autoGenerateId, true);
  });

  it("resolves a string-valued union to a text column", () => {
    const flag = byName.get("ThreadMessage")?.fields.find((f) => f.name === "flag");
    assert.equal(flag?.type.kind, "text");
  });

  it("resolves a nested model property to jsonb and marks it nullable", () => {
    const meta = byName.get("ThreadMessage")?.fields.find((f) => f.name === "meta");
    assert.equal(meta?.type.kind, "jsonb");
    assert.equal(meta?.nullable, true);
  });

  it("derives a cascade foreign key from a shared collection", () => {
    const messageId = byName.get("BodyPart")?.fields.find((f) => f.name === "messageId");
    assert.equal(messageId?.references?.tableName, "Message");
    assert.equal(messageId?.references?.onDelete, "cascade");
  });

  it("does not add a foreign key on the collection owner", () => {
    const owner = byName.get("Message");
    assert.ok(owner?.fields.every((f) => !f.references));
  });

  it("omits all foreign keys when foreignKeys is false", () => {
    const result = buildRemitIR(program, { foreignKeys: false });
    const anyRef = result.tables.some((t) => t.fields.some((f) => f.references));
    assert.equal(anyRef, false);
  });
});

const OPTIONAL_STUB = `
using TypeSpec.Reflection;

model AccessPattern {
  index?: string;
  collection?: string;
  pk?: ModelProperty[];
  sk?: ModelProperty[];
}

extern dec entity(target: Model, entity?: valueof string, service?: valueof string);
extern dec index(target: Model, name: valueof string, accessPattern: AccessPattern);
extern dec label(target: ModelProperty, label: valueof string);
`;

const EXTRA_MODELS = `
import "./electrodb.tsp";

enum Priority {
  Low: 1,
  High: 3,
}

enum Bare {
  A,
  B,
}

union Mixed {
  a: string,
  b: int32,
}

scalar Email extends string;

union AllStrings {
  plain: string,
  custom: Email,
}

@entity
@index("Gadget", { pk: [Gadget.gadgetId] })
model Gadget {
  gadgetId: string;
  @label("custom_col") renamed: string;
  count: int32;
  ratio: float32;
  precise: float64;
  active: boolean;
  when: utcDateTime;
  big: int64;
  priority: Priority;
  bare: Bare;
  mixed: Mixed;
  contact: AllStrings;
  status: string = "new";
}

@entity("alpha", "svc")
@index("Alpha", { pk: [Alpha.alphaId] })
@index("byShared", { index: "gsi1", collection: "shared", pk: [Alpha.sharedKey] })
@index("byMixed", { index: "gsi2", collection: "mixedcol", pk: [Alpha.alphaId] })
model Alpha {
  alphaId: string;
  sharedKey: string;
}

@entity("beta", "svc")
@index("Beta", { pk: [Beta.betaId] })
@index("byShared", { index: "gsi1", collection: "shared", pk: [Beta.sharedKey] })
@index("byMixed", { index: "gsi2", collection: "mixedcol", pk: [Beta.betaId] })
model Beta {
  betaId: string;
  sharedKey: string;
}
`;

describe("remit entity front-end (extra vocabulary)", () => {
  let byName: Map<string, TableDef>;

  before(async () => {
    const host = await createTestHost();
    host.addJsFile("electrodb.js", {
      $entity: () => {},
      $index: () => {},
      $label: () => {},
    });
    host.addTypeSpecFile("electrodb.tsp", `import "./electrodb.js";\n${OPTIONAL_STUB}`);
    host.addTypeSpecFile("main.tsp", EXTRA_MODELS);
    await host.compile("main.tsp");
    const { tables } = buildRemitIR(host.program);
    byName = new Map(tables.map((t) => [t.name, t]));
  });

  it("falls back to the lower-cased model name when @entity omits the name", () => {
    assert.equal(byName.get("Gadget")?.tableName, "gadget");
  });

  it("honours a @label as the column name", () => {
    const renamed = byName.get("Gadget")?.fields.find((f) => f.name === "renamed");
    assert.equal(renamed?.columnName, "custom_col");
  });

  it("resolves every primitive scalar to its column type", () => {
    const fields = new Map(byName.get("Gadget")?.fields.map((f) => [f.name, f.type.kind]));
    assert.equal(fields.get("count"), "integer");
    assert.equal(fields.get("ratio"), "real");
    assert.equal(fields.get("precise"), "doublePrecision");
    assert.equal(fields.get("active"), "boolean");
    assert.equal(fields.get("when"), "timestamp");
    assert.equal(fields.get("big"), "bigint");
  });

  it("maps a numeric-valued enum and a valueless enum to textEnum", () => {
    const priority = byName.get("Gadget")?.fields.find((f) => f.name === "priority");
    assert.equal(priority?.type.kind, "textEnum");
    assert.deepEqual(priority?.type.kind === "textEnum" ? priority.type.values : null, ["1", "3"]);
    const bare = byName.get("Gadget")?.fields.find((f) => f.name === "bare");
    assert.deepEqual(bare?.type.kind === "textEnum" ? bare.type.values : null, ["A", "B"]);
  });

  it("stores a union with a non-string variant as jsonb", () => {
    const mixed = byName.get("Gadget")?.fields.find((f) => f.name === "mixed");
    assert.equal(mixed?.type.kind, "jsonb");
  });

  it("treats a union of string and a string-derived scalar as text", () => {
    const contact = byName.get("Gadget")?.fields.find((f) => f.name === "contact");
    assert.equal(contact?.type.kind, "text");
  });

  it("extracts a scalar default value", () => {
    const status = byName.get("Gadget")?.fields.find((f) => f.name === "status");
    assert.equal(status?.defaultValue, "new");
  });

  it("adds no foreign key when no member owns the shared collection attribute", () => {
    const alpha = byName.get("Alpha");
    const beta = byName.get("Beta");
    assert.ok(alpha?.fields.every((f) => !f.references));
    assert.ok(beta?.fields.every((f) => !f.references));
  });
});
