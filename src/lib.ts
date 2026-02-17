import { createTypeSpecLibrary } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@kattebak/typespec-drizzle-orm-generator",
  diagnostics: {},
  state: {
    entity: { description: "State for @entity decorator" },
    primaryKey: { description: "State for @primaryKey decorator" },
    pk: { description: "State for @pk decorator (marks PK columns)" },
    references: { description: "State for @references decorator" },
    junction: { description: "State for @junction decorator" },
    uuid: { description: "State for @uuid decorator" },
    createdAt: { description: "State for @createdAt decorator" },
    updatedAt: { description: "State for @updatedAt decorator" },
    unique: { description: "State for @unique decorator (single column)" },
    compositeUnique: { description: "State for @unique({ name, columns }) (model-level)" },
    check: { description: "State for @check decorator" },
    indexDef: { description: "State for @index decorator" },
    foreignKeyDef: { description: "State for @foreignKey decorator" },
    minValue: { description: "State for @minValue decorator" },
    maxValue: { description: "State for @maxValue decorator" },
    visibility: { description: "State for @visibility decorator" },
  },
} as const);

export const StateKeys = $lib.stateKeys;
