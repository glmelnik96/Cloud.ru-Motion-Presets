// Facts about this machine for performance spikes (S8, S11): OS, CPU, RAM, GPU.
// GPU names come from CIM on Windows and system_profiler on macOS; a failure is reported, not thrown.
// The team inventory (part F) stays the source of truth for picking the weakest machine.
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export function machineInfo({ gpu = true } = {}) {
  const cpus = os.cpus();
  const info = {
    hostname: os.hostname(),
    platform: process.platform,
    release: os.release(),
    cpu: cpus.length ? cpus[0].model.trim() : 'unknown',
    threads: cpus.length,
    ramGb: Math.round(os.totalmem() / 1e9),
    gpus: [],
  };
  if (!gpu) return info;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion | ConvertTo-Json -Compress'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const v = JSON.parse(out);
      info.gpus = (Array.isArray(v) ? v : [v]).map((g) => g.Name + ' (driver ' + g.DriverVersion + ')');
    } else if (process.platform === 'darwin') {
      const out = execFileSync('system_profiler', ['SPDisplaysDataType', '-json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      info.gpus = (JSON.parse(out).SPDisplaysDataType || []).map((g) => g.sppci_model || g._name);
    }
  } catch (e) {
    info.gpus = ['unknown (' + String(e.message).split('\n')[0] + ')'];
  }
  return info;
}
