// «Скопировать диагностику»: the Clipboard API where it works, else a hidden textarea and execCommand('copy').
// A CEP panel often has no clipboard permission or focus for the API, so the fallback is the usual path there.
export interface ClipboardDeps {
  clipboard?: { writeText(text: string): Promise<void> };
  legacy?: (text: string) => boolean;
}

// true when the text reached the clipboard. Never throws.
export async function copyText(text: string, deps: ClipboardDeps): Promise<boolean> {
  try {
    if (deps.clipboard) {
      await deps.clipboard.writeText(text);
      return true;
    }
  } catch {
    // refused or unavailable: try the legacy way
  }
  try {
    return deps.legacy ? deps.legacy(text) === true : false;
  } catch {
    return false;
  }
}

// The legacy way on a document: a textarea out of sight, selected, copied, removed.
export function legacyCopy(doc: Document): (text: string) => boolean {
  return (text) => {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    doc.body.appendChild(area);
    try {
      area.select();
      return doc.execCommand('copy');
    } finally {
      doc.body.removeChild(area);
    }
  };
}

export function browserClipboard(win: Window): ClipboardDeps {
  const clipboard = win.navigator.clipboard;
  return {
    ...(clipboard ? { clipboard: { writeText: (t: string) => clipboard.writeText(t) } } : {}),
    legacy: legacyCopy(win.document),
  };
}
