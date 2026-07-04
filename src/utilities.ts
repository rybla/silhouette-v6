export function do_<A>(k: () => A): A {
  return k();
}

export function switchDiscriminatedUnion<
  K extends PropertyKey,
  U extends Record<K, PropertyKey>,
  C extends { [V in U[K]]: (variant: Extract<U, Record<K, V>>) => unknown },
>(key: K, obj: U, cases: C): ReturnType<C[U[K]]> {
  const discriminantValue = obj[key];
  const handler = cases[discriminantValue];
  // @ts-expect-error -- TypeScript is insufficient to express this.
  return handler(obj);
}

export function switchEnum<
  E extends string,
  C extends { [V in E]: () => unknown },
>(e: E, c: C): C[E] {
  // @ts-expect-error -- TypeScript is insufficient to express this.
  return c[e]();
}

/**
 * Converts a string into a URL-friendly slug.
 * * @param text - The raw string to slugify
 * @returns A lowercase, dash-separated slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFD") // Split accented characters into baseline characters and diacritical marks
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars (except -)
    .replace(/--+/g, "-"); // Replace multiple - with single -
}
