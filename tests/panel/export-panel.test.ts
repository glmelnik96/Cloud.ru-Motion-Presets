// The controller side of «Экспорт» (decisions P19–P23) and the Node services: the tab in both hosts, the way
// remembered, the folder made, aerender in the background and how it ends; the command line of aerender and
// of «Показать в папке».
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { ExportRequest } from '../../panel/src/core/export';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { memoryStore } from '../../panel/src/core/memory';
import type { HostContext } from '../../panel/src/core/types';
import { aerenderArgs, aerenderProblem, revealCommand, runAerender, type ChildLike } from '../../panel/src/services/export';
import { aeContext, exampleCatalog, prContext } from './fixtures';

class Host implements HostCaller {
  requests: ExportRequest[] = [];
  constructor(public ctx: HostContext, private readonly reply: (r: ExportRequest) => HostReply = (r) => ({ ok: true, data: { file: r.output, bytes: 1 } })) {}
  async call<T>(fn: string, args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'exportComp' || fn === 'exportSequence') {
      this.requests.push(args as ExportRequest);
      return this.reply(args as ExportRequest) as HostReply<T>;
    }
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

function app(host: Host, over: Partial<Services> = {}, store = memoryStore()) {
  const files = new Map<string, number>();
  const dirs: string[] = [];
  const svc: Services = {
    host,
    hostKey: host.ctx.host,
    pluginVersion: '0.1.17',
    platform: 'win',
    libraryRoot: 'C:/lib',
    readLibrary: async () => JSON.stringify(exampleCatalog()),
    store,
    exportFs: { size: (p) => files.get(p) ?? null, mkdirp: (d) => void dirs.push(d), documents: 'C:/Users/u/Documents' },
    ...over,
  };
  return { a: new PanelApp(svc), files, dirs };
}

describe('panel app: «Экспорт»', () => {
  it('Premiere has the tab next to the catalog; the way is remembered per host', async () => {
    const store = memoryStore();
    const { a } = app(new Host(prContext()), {}, store);
    await a.init();
    expect(a.tabs().map((t) => t.key)).toEqual(['catalog', 'export']);
    expect(a.state.exportMode).toBe('queue');
    a.setExportMode('direct');
    const again = app(new Host(prContext()), {}, store).a;
    expect(again.state.exportMode).toBe('direct');
  });

  it('exports the first preset for the frame into Export, made before the host call', async () => {
    const host = new Host(prContext());
    const { a, dirs } = app(host);
    await a.init();
    a.setTab('export');
    expect(a.exportChoice()!.id).toBe('AME_FullHD');
    const out = await a.exportNow();
    expect(out).toMatchObject({ ok: true, file: 'C:/CRBK/work/pr/Export/Edit_FullHD.mp4', note: 'Готово: Edit_FullHD.mp4.' });
    expect(dirs).toEqual(['C:/CRBK/work/pr/Export']);
    expect(host.requests[0]).toMatchObject({ mode: 'queue', presetId: 'AME_FullHD', epr: 'C:/lib/items/AME_FullHD/AME_FullHD_epr_v1.epr' });
    a.setExportPreset('AME_WebinarTimer');
    await a.exportNow();
    expect(host.requests[1].presetId).toBe('AME_WebinarTimer');
  });

  it('a folder that cannot be made stops before the host', async () => {
    const host = new Host(prContext());
    const { a } = app(host, { exportFs: { size: () => null, mkdirp: () => { throw new Error('EACCES'); }, documents: 'D:' } });
    await a.init();
    const out = await a.exportNow();
    expect(out.problems[0].message).toBe('Экспорт не выполнен: нет папки C:/CRBK/work/pr/Export: EACCES.');
    expect(host.requests).toEqual([]);
  });

  it('AE in the background: the panel is free at once, the job ends done when the file is there', async () => {
    const host = new Host(aeContext(), (r) => ({ ok: true, data: { file: r.output, aerender: { exe: 'C:/AE/aerender.exe', project: 'C:/CRBK/work/user/user.aep', rqIndex: 3 } } }));
    let jobs: unknown[] = [];
    const { a, files } = app(host, {
      aerender: async (job) => {
        jobs.push(job);
        files.set('C:/CRBK/work/user/Export/Main_FullHD.mp4', 2048);
        return { ok: true, code: 0, tail: [] };
      },
    });
    await a.init();
    a.setExportMode('background');
    const out = await a.exportNow();
    expect(out.note).toBe('Рендер в фоне: Main_FullHD.mp4. Можно работать дальше.');
    expect(a.state.busy).toBe(false);
    await a.backgroundDone;
    expect(jobs).toEqual([{ exe: 'C:/AE/aerender.exe', project: 'C:/CRBK/work/user/user.aep', rqIndex: 3 }]);
    expect(a.state.background).toEqual([{ file: 'C:/CRBK/work/user/Export/Main_FullHD.mp4', title: 'Full HD — основной мастер', project: 'C:/CRBK/work/user/user.aep', status: 'done' }]);
    expect(a.backgroundJobs()).toHaveLength(1);
    // another project: its own list, the finished job of the first one is not shown
    host.ctx = aeContext({ project: { saved: true, path: 'C:/CRBK/work/other/other.aep' } });
    await a.refreshContext();
    expect(a.backgroundJobs()).toEqual([]);
    host.ctx = aeContext();
    await a.refreshContext();
    expect(a.backgroundJobs()).toHaveLength(1);
  });

  it('AE in the background: an aerender error is named on the job', async () => {
    const host = new Host(aeContext(), (r) => ({ ok: true, data: { file: r.output, aerender: { exe: 'x', project: 'p', rqIndex: 1 } } }));
    const { a } = app(host, { aerender: async () => ({ ok: false, code: 1, tail: ['PROGRESS: 0:00:01:00', 'aerender ERROR: Unable to render: the output folder is missing'] }) });
    await a.init();
    a.setExportMode('background');
    await a.exportNow();
    await a.backgroundDone;
    expect(a.state.background[0]).toMatchObject({ status: 'failed', message: 'Рендер в фоне не выполнен: Main_FullHD.mp4: aerender ERROR: Unable to render: the output folder is missing.' });
  });
});

// A child process of its own: tsc of the panel has no Node types (node:events), as in media-panel.test.ts.
class Emitter {
  private readonly fns = new Map<string, Array<(x: unknown) => void>>();
  on(ev: string, fn: (x: never) => void): this {
    this.fns.set(ev, [...(this.fns.get(ev) ?? []), fn as (x: unknown) => void]);
    return this;
  }
  emit(ev: string, x: unknown): void {
    for (const fn of this.fns.get(ev) ?? []) fn(x);
  }
}

class FakeChild extends Emitter {
  stdout = new Emitter();
  stderr = new Emitter();
}

describe('aerender and the folder', () => {
  it('runs aerender with the project and the render queue item, Windows paths native', async () => {
    const calls: Array<[string, string[]]> = [];
    const child = new FakeChild();
    const p = runAerender((cmd, args) => {
      calls.push([cmd, args]);
      return child as unknown as ChildLike;
    }, 'win', { exe: 'C:/AE/Support Files/aerender.exe', project: 'C:/w/p.aep', rqIndex: 2 });
    child.stdout.emit('data', 'PROGRESS: Start\nPROGRESS: 0:00:00:10 (11)');
    child.stdout.emit('data', ': 0 Seconds\nPROGRESS: Finished\n');
    child.emit('close', 0);
    expect(await p).toEqual({ ok: true, code: 0, tail: ['PROGRESS: Start', 'PROGRESS: 0:00:00:10 (11): 0 Seconds', 'PROGRESS: Finished'] });
    expect(calls).toEqual([['C:\\AE\\Support Files\\aerender.exe', ['-project', 'C:\\w\\p.aep', '-rqindex', '2']]]);
    expect(aerenderArgs('mac', { exe: '/A/aerender', project: '/w/p.aep', rqIndex: 1 })).toEqual(['-project', '/w/p.aep', '-rqindex', '1']);
  });

  it('an exit code 0 with «aerender ERROR» is a failure', async () => {
    const child = new FakeChild();
    const p = runAerender(() => child as unknown as ChildLike, 'win', { exe: 'a', project: 'p', rqIndex: 1 });
    child.stderr.emit('data', 'aerender ERROR: No comp was found with the given name.\n');
    child.emit('close', 0);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(aerenderProblem(r, 'C:/x/a.mp4')).toBe('a.mp4: aerender ERROR: No comp was found with the given name.');
  });

  it('shows the file in Explorer or Finder, or its folder while it is not there; quotes around the path only', () => {
    expect(revealCommand('win', 'C:/Users/Глеб/Documents/Cloud.ru BrandKit/Export/BK unsaved_WebinarIntro.mp4', true)).toEqual({
      cmd: 'explorer.exe', args: ['/select,"C:\\Users\\Глеб\\Documents\\Cloud.ru BrandKit\\Export\\BK unsaved_WebinarIntro.mp4"'], verbatim: true,
    });
    expect(revealCommand('win', 'C:/p/Export/a.mp4', false)).toEqual({ cmd: 'explorer.exe', args: ['"C:\\p\\Export"'], verbatim: true });
    expect(revealCommand('mac', '/p/a b/Export/a.mp4', true)).toEqual({ cmd: 'open', args: ['-R', '/p/a b/Export/a.mp4'], verbatim: false });
  });
});
