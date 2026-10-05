// Checks before an insert that depend on the machine and the project (spec 6.1 step 2, 8.1 «Шрифты»).
import { error, messages, warning, type Problem } from './problems';
import type { AeColor, FontStatus, Item } from './types';

// "Version 1.002;hotconv", "1.002" -> "1.002". FontObject.version in AE and the name table in Premiere
// both carry the build this way.
export function fontBuild(v: string | null | undefined): string | null {
  const m = /(\d+\.\d{3})/.exec(String(v ?? ''));
  return m ? m[1] : null;
}

// No font: refuse with a link to the instructions; another build: warn, do not block (spec 8.1).
export function fontProblems(item: Item, fonts: Record<string, FontStatus>): Problem[] {
  const out: Problem[] = [];
  for (const f of item.requiredFonts ?? []) {
    const s = fonts[f.postScriptName];
    if (!s || !s.found) {
      out.push(error('NO_FONT', messages.noFont(f.postScriptName), { font: f.postScriptName }));
    } else if (s.substitute) {
      out.push(error('NO_FONT', messages.substituteFont(f.postScriptName), { font: f.postScriptName }));
    } else if (f.build) {
      const have = fontBuild(s.version);
      if (have && have !== f.build) {
        out.push(warning('FONT_BUILD', messages.fontBuild(f.postScriptName, have, f.build), { font: f.postScriptName, have, want: f.build }));
      }
    }
  }
  return out;
}

// The colour settings the masters are built with (masters/README.md): no working space or Rec.709 Gamma 2.4,
// no linearization, Adobe colour management. AE switches them only through a modal dialog, so the panel
// warns and never changes them (spec 6.1 AE step 2). S3: a linearized project keeps the brand green but
// shifts photos in the slots.
export const AE_COLOR_REFERENCE = {
  workingSpaces: ['', 'None', 'Rec.709 Gamma 2.4'],
  linearize: false,
  colorManagement: ['', 'adobe'],
};

export function colorProblems(color: AeColor | undefined): Problem[] {
  if (!color) return [];
  const what: string[] = [];
  if (!AE_COLOR_REFERENCE.workingSpaces.includes(color.workingSpace)) what.push(`рабочее пространство ${color.workingSpace}`);
  if (color.linearize !== AE_COLOR_REFERENCE.linearize) what.push('линеаризация');
  if (color.bpc === 32) what.push('32 бита');
  const cm = String(color.colorManagement ?? '').toLowerCase();
  if (!AE_COLOR_REFERENCE.colorManagement.includes(cm)) what.push(`управление цветом ${color.colorManagement}`);
  return what.length ? [warning('COLOR_SETTINGS', messages.color(what.join(', ')), color)] : [];
}
