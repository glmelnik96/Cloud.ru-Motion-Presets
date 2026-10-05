// Panel colours from the brand tokens (spec 6: «CSS из генератора бренд-токенов»): brand/tokens.json is
// the one source, the panel turns its base palette into CSS custom properties at start-up.
import { color } from '../../../brand/tokens.json';

export function brandVars(): Record<string, string> {
  const base = color.base as Record<string, { hex: string }>;
  const out: Record<string, string> = {};
  for (const [name, c] of Object.entries(base)) out[`--cr-${name}`] = c.hex;
  out['--cr-carrot'] = color.extended.carrot.hex;
  return out;
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(brandVars())) root.style.setProperty(k, v);
}
