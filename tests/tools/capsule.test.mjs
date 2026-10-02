import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  readCapsuleId, readDefinition, patchCapsuleId, newCapsuleId, mogrtReady,
} from '../../tools/mogrt/capsule.mjs';

const OLD = '0b1e5a7e-1111-4c4c-9d9d-000000000001';
// definition.json the way AE writes it ("key": value with spaces), with a BOM as some writers add one,
// and the ID a second time in a nested field to prove that every occurrence is replaced.
const DEF_TEXT = '\uFEFF{"apiVersion": "1.4", "authorApp": "aefx", "capsuleID": "' + OLD + '", '
  + '"capsuleName": "CRT_LowerThird_v1", "sourceInfoLocalized": {"en_US": {"capsule": "' + OLD + '"}}, '
  + '"clientControls": [{"id": "c1", "type": 6, "uiName": {"strDB": [{"localeString": "ru_RU", "str": "Имя"}]}}]}';

function makeMogrt(defText = DEF_TEXT) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-cap-'));
  const zip = new AdmZip();
  if (defText !== null) zip.addFile('definition.json', Buffer.from(defText, 'utf8'));
  zip.addFile('project.aegraphic', Buffer.from([80, 75, 3, 4, 1, 2, 3, 250, 251]));
  zip.addFile('thumb.png', Buffer.from('png-bytes'));
  const file = path.join(dir, 'src.mogrt');
  zip.writeZip(file);
  return { dir, file };
}

describe('capsule', () => {
  it('reads capsuleID and the definition', () => {
    const { file } = makeMogrt();
    expect(readCapsuleId(file)).toBe(OLD);
    expect(readDefinition(file).clientControls[0].uiName.strDB[0].str).toBe('Имя');
  });

  it('writes a copy with a new capsuleID everywhere in definition.json and keeps everything else', () => {
    const { dir, file } = makeMogrt();
    const before = readFileSync(file);
    const dst = path.join(dir, 'dst.mogrt');
    expect(patchCapsuleId(file, dst, 'new-id-1')).toEqual({ oldId: OLD, newId: 'new-id-1', occurrences: 2 });
    expect(readCapsuleId(dst)).toBe('new-id-1');
    expect(readFileSync(file).equals(before)).toBe(true);
    const z = new AdmZip(dst);
    expect(z.readFile('definition.json').toString('utf8')).toBe(DEF_TEXT.split(OLD).join('new-id-1'));
    expect([...z.readFile('project.aegraphic')]).toEqual([80, 75, 3, 4, 1, 2, 3, 250, 251]);
    expect(z.readFile('thumb.png').toString()).toBe('png-bytes');
  });

  it('accepts the same ID (a no-op copy)', () => {
    const { dir, file } = makeMogrt();
    const dst = path.join(dir, 'same.mogrt');
    expect(patchCapsuleId(file, dst, OLD).newId).toBe(OLD);
    expect(readCapsuleId(dst)).toBe(OLD);
  });

  it('fails loudly without definition.json or without capsuleID', () => {
    expect(() => readCapsuleId(makeMogrt(null).file)).toThrow(/definition\.json not found/);
    const { dir, file } = makeMogrt('{"capsuleName": "x"}');
    expect(() => readCapsuleId(file)).toThrow(/capsuleID not found/);
    expect(() => patchCapsuleId(file, path.join(dir, 'y.mogrt'), 'z')).toThrow(/capsuleID not found/);
  });

  it('tells a ready .mogrt from a half-written one', () => {
    const { dir, file } = makeMogrt();
    expect(mogrtReady(file)).toEqual({ ok: true, capsuleID: OLD });
    const half = path.join(dir, 'half.mogrt');
    writeFileSync(half, readFileSync(file).subarray(0, 40));
    expect(mogrtReady(half).ok).toBe(false);
  });

  it('makes fresh UUIDs', () => {
    expect(newCapsuleId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newCapsuleId()).not.toBe(newCapsuleId());
  });
});
