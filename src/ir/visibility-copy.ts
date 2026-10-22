import type { Model } from "@typespec/compiler";

/** A `Create<T>`/`Update<T>` clone (compiler >= 1.13 re-runs its decorators), or a model `is` one. */
export function isVisibilityCopy(model: Model): boolean {
  if (model.sourceModel && isVisibilityCopy(model.sourceModel)) return true;
  const node = model.node;
  return Boolean(node && "id" in node && node.id && node.id.sv !== model.name);
}
