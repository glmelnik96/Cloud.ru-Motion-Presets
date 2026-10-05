// Shared types of the panel: the catalog (tools/library/schema/library.schema.json, schemaVersion 1), the host
// context and the adapter contract (CRBK.call in panel/host/*.jsx). Plan:
// docs/superpowers/plans/2026-10-05-phase3-panel-slice1.md, section «Интерфейсы».

export type HostKey = 'ae' | 'pr';

export interface Stored {
  file: string;
  sha256: string;
  bytes: number;
}

export interface FieldOption {
  index: number; // 1-based, as in the library and AE
  label_ru: string;
}

export interface Field {
  key: string;
  label_ru: string;
  type: 'text' | 'dropdown' | 'checkbox' | 'slider' | 'media';
  egpName?: string;
  egpIndex?: number;
  default?: string | number | boolean;
  maxLen?: number;
  options?: FieldOption[];
  min?: number;
  max?: number;
  drivesDuration?: boolean;
  unitSec?: number;
  enabledBy?: string;
  service?: boolean;
  editable?: boolean;
  hosts?: HostKey[];
}

export interface Variant {
  key: string;
  aspect?: string;
  w?: number;
  h?: number;
  fps?: number;
  minHostVersion: Partial<Record<HostKey, string>>;
  options?: Record<string, number | boolean>;
  file?: string;
  sha256?: string;
  bytes?: number;
  aeComp?: string;
}

export interface Item {
  id: string;
  title_ru: string;
  category: string;
  tier: 'T1' | 'T2' | 'T3';
  hosts: HostKey[];
  version: number;
  fit?: 'rdt' | 'trim';
  duration?: { introSec: number; holdSec: number; outroSec: number };
  fields?: Field[];
  requiredFonts?: { postScriptName: string; build: string }[];
  variants: Variant[];
  aep?: Stored;
  preview?: Stored;
  poster?: Stored;
}

export interface Library {
  schemaVersion: 1;
  libraryVersion: string;
  minPluginVersion: string;
  generatedAt?: string;
  items: Item[];
}

export interface HostContext {
  host: HostKey;
  hostVersion: string; // '26.5x89' (AE) | '26.5.2' (Premiere)
  project: { path: string | null; saved: boolean };
  target: null | {
    kind: 'comp' | 'sequence';
    id: string;
    name: string;
    w: number;
    h: number;
    fps: number;
    timeSec: number;
    ticks?: string; // Premiere playhead in ticks
  };
  colour?: { workingSpace: string; linearize: boolean; bpc: number }; // AE
  expressionEngine?: string; // AE
}

export type FieldValue = string | number | boolean;

// A field value already converted to the host's base (Premiere dropdowns 0-based, checkboxes 1/0).
export interface FieldWrite {
  egpName: string;
  type: Field['type'];
  value: FieldValue;
}

export interface PrInsertArgs {
  seqId: string;
  mogrtPath: string;
  startTicks: string;
  lenFrames: number;
  defaultLenFrames: number;
  expectName: string;
  fields: FieldWrite[];
  label: string;
}

export interface AeInsertArgs {
  compId: string;
  aepPath: string;
  itemKey: string; // '<id>@<version>'
  aeComp: string;
  timeSec: number;
  lenSec: number;
  durSec: number;
  inSec: number;
  outSec: number;
  fields: FieldWrite[];
  label: string;
}

export interface FieldResult {
  egpName: string;
  written: FieldValue;
  back: FieldValue | null;
  ok: boolean;
}

export interface Placed {
  kind: 'clip' | 'layer';
  id: string;
  name: string;
  track?: number;
  startSec: number;
  endSec: number;
}

export interface InsertResult {
  placed: Placed;
  fields: FieldResult[];
  tracksAdded?: number;
  remapKeys?: [number, number][];
  warnings: string[];
}

export interface FontStatus {
  postScriptName: string;
  found: boolean;
  build: string | null;
  substitute: boolean;
}

export type HostError = { code: string; message?: string; line?: number };
export type HostReply<T> = { ok: true; data: T } | { ok: false; error: HostError };

export interface PlacedProbe {
  kind: 'clip' | 'layer';
  targetId: string;
  startSec: number;
  name: string;
}

export interface HostApi {
  getContext(): Promise<HostReply<HostContext>>;
  insertItem(args: PrInsertArgs | AeInsertArgs): Promise<HostReply<InsertResult>>; // mutating
  findPlaced(probe: PlacedProbe): Promise<HostReply<Placed | null>>;
  checkFonts(psNames: string[]): Promise<HostReply<FontStatus[]>>; // AE; Premiere uses the Node font service
  diag(): Promise<HostReply<Record<string, unknown>>>;
}

export interface Issue {
  code: string;
  level: 'error' | 'warning';
  params?: Record<string, string | number>;
}

export interface InsertPlan {
  item: Item;
  variant: Variant;
  lenSec: number;
  lenFrames: number;
  fieldWrites: FieldWrite[];
  issues: Issue[];
}
