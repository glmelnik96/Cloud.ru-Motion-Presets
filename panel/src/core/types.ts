// Types of the library catalog (library.json) as tools/library/schema/library.schema.json fixes them, and of
// what the host adapters report. The panel reads the catalog; it never writes it (spec 4.4).

export type Host = 'ae' | 'pr';
export type Tier = 'T1' | 'T2' | 'T3';
export type Fit = 'rdt' | 'trim';
export type Category =
  | 'logo' | 'titles' | 'webinars' | 'courses' | 'smm' | 'podcast'
  | 'transitions' | 'backgrounds' | 'effects' | 'sounds' | 'export';
export type FieldType = 'text' | 'dropdown' | 'checkbox' | 'slider' | 'media';
export type FieldValue = string | number | boolean | null;
export type Values = Record<string, FieldValue>;

export interface Option {
  index: number;
  label_ru: string;
}

export interface Field {
  key: string;
  label_ru: string;
  type: FieldType;
  egpName?: string;
  egpIndex?: number;
  default?: FieldValue;
  maxLen?: number;
  options?: Option[];
  min?: number;
  max?: number;
  accepts?: Array<'photo' | 'qr' | 'video'>;
  drivesDuration?: boolean;
  unitSec?: number;
  enabledBy?: string;
  service?: boolean;
  editable?: boolean;
  hosts?: Host[];
}

export interface Stored {
  file: string;
  sha256: string;
  bytes: number;
}

export interface Part extends Stored {
  frames: number;
}

export interface Variant {
  key: string;
  aspect?: '16x9' | '9x16' | '1x1' | '4x5' | '4x3';
  w?: number;
  h?: number;
  fps?: number;
  options?: Record<string, number | boolean>;
  file?: string;
  sha256?: string;
  bytes?: number;
  parts?: { intro?: Part; loop?: Part; outro?: Part };
  aeComp?: string;
  minHostVersion: Partial<Record<Host, string>>;
}

export interface Duration {
  introSec: number;
  holdSec: number;
  outroSec: number;
  maxSec?: number;
}

export interface Rect {
  variant: string;
  when?: Record<string, number | boolean>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Companion {
  ref: string;
  kind: 'music' | 'sfx' | 'video';
  placement: 'in' | 'out' | 'under';
  default: boolean;
}

export interface Item {
  id: string;
  title_ru: string;
  category: Category;
  tier: Tier;
  hosts: Host[];
  version: number;
  fit?: Fit;
  cutFrame?: number;
  windows?: Array<{ key: string; label_ru: string; rects: Rect[] }>;
  duration?: Duration;
  loop?: { periodFrames: number };
  // T2/T3 video on a transparent background: the panel offers the #222222 backdrop under it (spec 4.4).
  alpha?: boolean;
  fields?: Field[];
  companions?: Companion[];
  requiredFonts?: Array<{ postScriptName: string; build?: string }>;
  variants: Variant[];
  aep?: Stored;
  preview?: Stored;
  poster?: Stored;
  // Previews per format and look (tools/masters/preview.mjs): the form shows the one that matches.
  previews?: PreviewEntry[];
}

export interface PreviewEntry {
  variant: string;
  when?: Record<string, number | boolean>;
  video: Stored;
  poster: Stored;
}

export interface Catalog {
  schemaVersion: 1;
  libraryVersion: string;
  minPluginVersion: string;
  generatedAt?: string;
  items: Item[];
}

// What getContext of a host adapter returns (panel/host/*.jsx).
export interface HostTarget {
  kind: 'comp' | 'sequence';
  id: string;
  name: string;
  w: number;
  h: number;
  fps: number;
  timeSec: number;
  durationSec: number;
  // End of the work area (AE) or of the sequence in/out range (Premiere): loops run up to it (spec 6.1).
  rangeEndSec?: number | null;
}

export interface AeColor {
  workingSpace: string;
  linearize: boolean;
  bpc: number;
  colorManagement?: string;
  engine?: string;
}

export interface FontStatus {
  found: boolean;
  version?: string | null;
  substitute?: boolean;
}

export interface HostContext {
  host: Host;
  version: string;
  project: { saved: boolean; path: string | null };
  target: HostTarget | null;
  // AE: layers selected in the active comp (effects need them).
  selection?: number;
  color?: AeColor;
}
