import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createTestHost } from "@typespec/compiler/testing";
import { buildRemitIR } from "../../src/ir/remit-builder.ts";
import type { TableDef } from "../../src/ir/types.ts";

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
`;

describe("remit entity front-end (buildRemitIR)", () => {
  let tables: TableDef[];
  let byName: Map<string, TableDef>;

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
    ({ tables } = buildRemitIR(host.program));
    byName = new Map(tables.map((t) => [t.name, t]));
  });

  it("snake-cases the entity name into the SQL table name", () => {
    assert.equal(byName.get("ThreadMessage")?.tableName, "thread_message");
  });

  it("builds a composite primary key from the primary index pk+sk", () => {
    const pk = byName.get("ThreadMessage")?.primaryKey;
    assert.deepEqual(pk?.columns, ["accountConfigId", "threadMessageId"]);
    assert.equal(pk?.isComposite, true);
  });

  it("names secondary indexes <table>_<accessPattern>", () => {
    const names = byName.get("ThreadMessage")?.indexes.map((i) => i.name);
    assert.ok(names?.includes("thread_message_by_date"));
  });

  it("resolves a string-valued enum property to an enum column", () => {
    const star = byName.get("ThreadMessage")?.fields.find((f) => f.name === "star");
    assert.equal(star?.type.kind, "enum");
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
});
