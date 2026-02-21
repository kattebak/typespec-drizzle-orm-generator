import type { DecoratorContext, Model, ModelProperty } from "@typespec/compiler";
import { StateKeys } from "./lib.js";

export function $table(
  context: DecoratorContext,
  target: Model,
  name: string,
  service: string,
): void {
  context.program.stateMap(StateKeys.table).set(target, { name, service });
}

export function $primaryKey(context: DecoratorContext, target: Model, tableName: string): void {
  context.program.stateMap(StateKeys.primaryKey).set(target, { tableName });
}

export function $pk(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateSet(StateKeys.pk).add(target);
}

export function $references(
  context: DecoratorContext,
  target: ModelProperty,
  ref: ModelProperty,
): void {
  context.program.stateMap(StateKeys.references).set(target, ref);
}

export function $junction(context: DecoratorContext, target: Model): void {
  context.program.stateSet(StateKeys.junction).add(target);
}

export function $uuid(
  context: DecoratorContext,
  target: ModelProperty,
  encoding: string,
  autoGenerate?: boolean,
): void {
  context.program.stateMap(StateKeys.uuid).set(target, {
    encoding,
    autoGenerate: autoGenerate ?? false,
  });
}

export function $createdAt(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateSet(StateKeys.createdAt).add(target);
}

export function $updatedAt(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateSet(StateKeys.updatedAt).add(target);
}

export function $unique(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateSet(StateKeys.unique).add(target);
}

export function $compositeUnique(
  context: DecoratorContext,
  target: Model,
  name: string,
  columns: ModelProperty[],
): void {
  const existing = (context.program.stateMap(StateKeys.compositeUnique).get(target) ??
    []) as Array<{
    name: string;
    columns: ModelProperty[];
  }>;
  existing.push({ name, columns });
  context.program.stateMap(StateKeys.compositeUnique).set(target, existing);
}

export function $check(context: DecoratorContext, target: ModelProperty, expression: string): void {
  context.program.stateMap(StateKeys.check).set(target, expression);
}

export function $indexDef(
  context: DecoratorContext,
  target: Model,
  name: string,
  columns: ModelProperty[],
  unique?: boolean,
): void {
  const existing = (context.program.stateMap(StateKeys.indexDef).get(target) ?? []) as Array<{
    name: string;
    columns: ModelProperty[];
    unique: boolean;
  }>;
  existing.push({ name, columns, unique: unique ?? false });
  context.program.stateMap(StateKeys.indexDef).set(target, existing);
}

export function $foreignKeyDef(
  context: DecoratorContext,
  target: Model,
  name: string,
  columns: ModelProperty[],
  foreignColumns: ModelProperty[],
): void {
  const existing = (context.program.stateMap(StateKeys.foreignKeyDef).get(target) ?? []) as Array<{
    name: string;
    columns: ModelProperty[];
    foreignColumns: ModelProperty[];
  }>;
  existing.push({ name, columns, foreignColumns });
  context.program.stateMap(StateKeys.foreignKeyDef).set(target, existing);
}

export function $minValue(context: DecoratorContext, target: ModelProperty, value: number): void {
  context.program.stateMap(StateKeys.minValue).set(target, value);
}

export function $maxValue(context: DecoratorContext, target: ModelProperty, value: number): void {
  context.program.stateMap(StateKeys.maxValue).set(target, value);
}

export function $visibility(context: DecoratorContext, target: ModelProperty, value: string): void {
  context.program.stateMap(StateKeys.visibility).set(target, value);
}
