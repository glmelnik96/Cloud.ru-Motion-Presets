#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResults, renderReport } from './result.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../spikes/RESULTS.md');
writeFileSync(out, renderReport(readResults()), 'utf8');
console.log('written ' + out);
