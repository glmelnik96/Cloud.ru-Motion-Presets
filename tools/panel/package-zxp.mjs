#!/usr/bin/env node
// Signed ZXP of the panel (spec 8.1, criterion K2 of decision A5): self-signed certificate, DigiCert time
// stamp, ZXPSignCmd 4.1.3, then -verify and the package check of tools/panel/zxp-info.mjs.
//   node tools/panel/package-zxp.mjs --zxpsign <ZXPSignCmd> --cert <cert.p12> [--make-cert] [--out <file.zxp>]
// The certificate password comes from BRANDKIT_CERT_PASSWORD, never from the command line or the repo.
// --make-cert creates the self-signed certificate first when the file does not exist.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDist } from './dist-check.mjs';
import { zxpInfo } from './zxp-info.mjs';
import { workPath } from '../lib/work.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(REPO, 'panel', 'dist');
export const TSA = 'http://timestamp.digicert.com';

export function signArgs({ dist, out, cert, password }) {
  return ['-sign', dist, out, cert, password, '-tsa', TSA];
}

export function certArgs({ cert, password }) {
  return ['-selfSignedCert', 'RU', 'Moscow', 'Cloud.ru', 'Cloud.ru BrandKit', password, cert];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const zxpsign = get('--zxpsign') || process.env.BRANDKIT_ZXPSIGN;
  const cert = get('--cert') || process.env.BRANDKIT_CERT;
  const password = process.env.BRANDKIT_CERT_PASSWORD;
  if (!zxpsign || !cert || !password) {
    console.error('usage: BRANDKIT_CERT_PASSWORD=... node tools/panel/package-zxp.mjs --zxpsign <ZXPSignCmd> --cert <cert.p12> [--make-cert] [--out <file.zxp>]');
    process.exit(2);
  }
  const { version } = JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8'));
  const run = (args) => {
    const r = spawnSync(zxpsign, args, { encoding: 'utf8' });
    const text = `${r.stdout || ''}${r.stderr || ''}`.trim();
    return { ok: r.status === 0, text };
  };
  const b = spawnSync(process.execPath, [path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'panel/vite.config.mjs'], { cwd: REPO, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
  const check = checkDist(DIST, { version });
  if (!check.ok) {
    console.error('panel/dist is not a valid extension:\n  ' + check.problems.join('\n  '));
    process.exit(1);
  }
  if (!existsSync(cert)) {
    if (!argv.includes('--make-cert')) {
      console.error(`no certificate ${cert} (add --make-cert to create a self-signed one)`);
      process.exit(1);
    }
    const c = run(certArgs({ cert, password }));
    console.log(c.text);
    if (!c.ok) process.exit(1);
  }
  const out = get('--out') || workPath('panel', `CloudRuBrandKit-${version}.zxp`);
  mkdirSync(path.dirname(out), { recursive: true });
  rmSync(out, { force: true });
  const s = run(signArgs({ dist: DIST, out, cert, password }));
  console.log(s.text);
  if (!s.ok) process.exit(1);
  const v = run(['-verify', out, '-certinfo']);
  console.log(v.text);
  const z = zxpInfo(out);
  console.log(`zxp: ${z.sizeBytes} bytes, ${z.entries} entries, signed ${z.signed}, .debug ${z.hasDebugFile}, manifest ${z.manifest?.bundleId} ${z.manifest?.bundleVersion}`);
  if (!v.ok || !/verified successfully/i.test(v.text) || !z.signed || z.hasDebugFile) process.exit(1);
  console.log(`OK ${out}`);
}
