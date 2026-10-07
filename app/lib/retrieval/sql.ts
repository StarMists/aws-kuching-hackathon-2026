/** Bounded lexical candidate SQL; values are always bound, never interpolated. */
export function lexicalCandidateSql(terms: string[]): { predicate: string; values: string[] } {
  const boundedTerms = terms.slice(0, 40);
  if (!boundedTerms.length) return { predicate: '1=1', values: [] };
  const values: string[] = [];
  for (const term of boundedTerms) {
    const value = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    values.push(value, value);
  }
  return {
    predicate: `(${boundedTerms.map(() => "(lower(c.text) LIKE ? ESCAPE '\\' OR lower(d.title||' '||d.filename) LIKE ? ESCAPE '\\')").join(' OR ')})`,
    values,
  };
}
