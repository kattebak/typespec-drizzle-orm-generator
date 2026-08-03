import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@kattebak/typespec-drizzle-orm-generator",
  diagnostics: {
    "index-def-dropped": {
      severity: "error",
      messages: {
        default: paramMessage`@indexDef "${"index"}" is declared on model ${"model"}, which this front-end generates no table for. Mark the model with @table (drizzle front-end) or @entity (remit front-end), or remove the index.`,
      },
    },
    "unknown-uuid-encoding": {
      severity: "error",
      messages: {
        default: paramMessage`@uuid encoding "${"encoding"}" is not one of "base36", "canonical" or "raw". The column falls back to "canonical".`,
      },
    },
    "index-def-unknown-column": {
      severity: "error",
      messages: {
        default: paramMessage`@indexDef "${"index"}" references column "${"column"}", which is not a property of model ${"model"}.`,
      },
    },
  },
  state: {
    table: { description: "State for @table decorator" },
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
    indexDef: { description: "State for @indexDef decorator" },
    foreignKeyDef: { description: "State for @foreignKeyDef decorator" },
    minValue: { description: "State for @minValue decorator" },
    maxValue: { description: "State for @maxValue decorator" },
    columnVisibility: { description: "State for @columnVisibility decorator" },
  },
} as const);

export const StateKeys = $lib.stateKeys;
