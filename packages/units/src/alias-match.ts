/**
 * Short aliases that must not match inside a longer compound name.
 * Exact "pepper" is fine; "pepper" ⊂ "black pepper" is not (bell vs spice).
 */
const EXACT_ONLY_ALIASES = new Set(["pepper", "peppers"]);

/**
 * Score how well an ingredient name matches an alias.
 * Prefer exact matches, then whole-word containment of the alias in the name.
 * Never match merely because a longer alias contains the short name (egg ↛ egg omelet).
 */
export function aliasMatchScore(name: string, alias: string): number {
  if (!name || !alias) return 0;
  if (name === alias) return 10_000 + alias.length;

  // Whole-word: alias appears inside name ("all-purpose flour" ⊃ "flour")
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRe = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
  if (wordRe.test(name)) {
    if (EXACT_ONLY_ALIASES.has(alias) && name !== alias) return 0;
    return 1_000 + alias.length;
  }

  return 0;
}

export function bestAliasScore(name: string, aliases: string[]): number {
  let best = 0;
  for (const alias of aliases) {
    best = Math.max(best, aliasMatchScore(name, alias));
  }
  return best;
}
