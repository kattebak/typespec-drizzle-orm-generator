import type { Model } from "@typespec/compiler";

/**
 * True for a model derived from a declared model by a visibility transform
 * (`Create<T>`, `Update<T>`, `Read<T>`), or one that copies such a model with `is`.
 *
 * Since `@typespec/compiler` 1.13 those transforms clone the source model and
 * re-run its decorators on the clone, so the clone carries the source's `@table`,
 * `@entity` and `@indexDef` state. A front-end that takes that state as a table
 * declaration emits a second table under the same SQL name.
 *
 * The clone keeps the source's syntax node and properties owned by the source; a
 * declared model owns every property it has and is named after its own node.
 */
export function isVisibilityCopy(model: Model): boolean {
  if (model.sourceModel && isVisibilityCopy(model.sourceModel)) return true;
  const node = model.node;
  if (node && "id" in node && node.id && node.id.sv !== model.name) return true;
  for (const prop of model.properties.values()) {
    if (prop.model !== model) return true;
  }
  return false;
}
