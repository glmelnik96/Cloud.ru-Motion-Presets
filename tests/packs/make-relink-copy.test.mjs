import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planCopy, makeRelinkCopy } from '../../tools/packs/make-relink-copy.mjs';
import { RENAMES } from '../../tools/packs/packs.mjs';
import { snapshot } from '../../tools/packs/snapshot.mjs';

const LONG = 'A_robotic_arm_performing_minimal,_precise_technological_movements._The_scene_showcases_a_sleek_' +
  'modern_design_with_smooth_metallic_textures_and_geometric_forms,_conveying_a_photographic_minimalism_' +
  'inspired_by_Carl_Kleiner_and_Jeffrey_Milstei.mp4';
const NFD_IMG = 'Оверлей спикера.png'.normalize('NFD'); // "й" decomposes in NFD
const V = '2_Вебинары/(Footage)/Folder/Video/';

function webinarsSource() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bk-pkg-'));
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  };
  put('2_Вебинары/Вебинары.aep', 'aep');
  put(V + LONG, 'clip-a');
  put(V + 'Seedance.mp4', 'clip-b');
  put('2_Вебинары/(Footage)/Folder/Img/' + NFD_IMG, 'png');
  put('2_Вебинары/(Footage)/Folder/Img/._Group.png', 'junk');
  return root;
}

describe('planCopy', () => {
  const files = [V + LONG, V + 'Seedance.mp4', '2_Вебинары/(Footage)/Folder/Img/' + NFD_IMG, '2_Вебинары/(Footage)/._x.png'];
  it('renames the AI clips, normalises names to NFC and skips macOS metadata', () => {
    const { entries, skipped } = planCopy({ slug: 'webinars', aepRel: '2_Вебинары/Вебинары.aep', files, renames: RENAMES.webinars });
    expect(entries.map((e) => e.new)).toEqual([
      'webinars.aep',
      '(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4',
      '(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4',
      '(Footage)/Folder/Img/' + NFD_IMG.normalize('NFC'),
    ]);
    expect(entries[3].nfcChanged).toBe(true);
    expect(entries[1].old).toBe('(Footage)/Folder/Video/' + LONG);
    expect(skipped).toEqual([{ old: '(Footage)/._x.png', reason: 'macos-metadata' }]);
  });
  it('refuses two files that become one name', () => {
    const clash = ['p/(Footage)/a/Й.wav', 'p/(Footage)/a/' + 'Й.wav'.normalize('NFD')];
    expect(() => planCopy({ slug: 'x', aepRel: 'p/x.aep', files: clash })).toThrow(/NAME_CLASH/);
  });
  it('fails when a required rename finds no file', () => {
    expect(() => planCopy({ slug: 'webinars', aepRel: '2_Вебинары/Вебинары.aep', files: [V + 'Seedance.mp4'], renames: RENAMES.webinars }))
      .toThrow(/RENAME_NOT_FOUND: AI_robot_arm_A_1440p24\.mp4/);
  });
});

describe('makeRelinkCopy', () => {
  it('copies the pack from a verified archive and writes relink-map.json', async () => {
    const pkg = webinarsSource();
    const arc = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-arc-')), 'a');
    const manifest = await snapshot({ src: pkg, dest: arc });
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-packs-')), 'webinars').replace(/\\/g, '/');
    const doc = await makeRelinkCopy({ slug: 'webinars', srcRoot: arc, outDir: out, manifest });
    expect(doc.aep).toBe(out + '/webinars.aep');
    expect(readFileSync(out + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4', 'utf8')).toBe('clip-a');
    expect(statSync(out + '/webinars.aep').mode & 0o200).not.toBe(0);
    expect(existsSync(out + '/(Footage)/Folder/Img/._Group.png')).toBe(false);
    expect(doc.map['(Footage)/Folder/Video/' + LONG]).toBe(out + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4');
    expect(doc.map['(Footage)/Folder/Img/' + NFD_IMG.normalize('NFC')]).toBe(out + '/(Footage)/Folder/Img/' + NFD_IMG.normalize('NFC'));
    expect(doc.source.verified).toBe(true);
    expect(JSON.parse(readFileSync(out + '/relink-map.json', 'utf8')).slug).toBe('webinars');
    await expect(makeRelinkCopy({ slug: 'webinars', srcRoot: arc, outDir: out, manifest })).rejects.toThrow(/PACK_EXISTS/);
  });
  it('stops on a byte that differs from the archive manifest', async () => {
    const pkg = webinarsSource();
    const arc = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-arc-')), 'a');
    const manifest = await snapshot({ src: pkg, dest: arc });
    const bad = { ...manifest, files: manifest.files.map((f) => (f.path.endsWith('Seedance.mp4') ? { ...f, sha256: '0'.repeat(64) } : f)) };
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-packs-')), 'webinars');
    await expect(makeRelinkCopy({ slug: 'webinars', srcRoot: arc, outDir: out, manifest: bad })).rejects.toThrow(/HASH_MISMATCH/);
  });
});
