/** Convert camelCase to snake_case: "authorId" → "author_id" */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Convert snake_case to camelCase: "author_id" → "authorId" */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Convert PascalCase table name to camelCase table variable name.
 * "BookGenre" → "bookGenres" (pluralized for table variables)
 */
export function toTableVariableName(name: string): string {
  const camel = name[0].toLowerCase() + name.slice(1);
  return pluralize(camel);
}

/**
 * Naive pluralization sufficient for the bookstore domain.
 * Handles: consonant+y → ies, s/sh/ch/x/z → es, default → s
 */
export function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (/(?:s|sh|ch|x|z)$/.test(word)) {
    return `${word}es`;
  }
  return `${word}s`;
}
