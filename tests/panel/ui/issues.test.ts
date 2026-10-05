import { describe, it, expect } from 'vitest';
import { APP_MESSAGES, bannerIssues, describeIssue } from '../../../panel/src/ui/issues';
import { message, MESSAGES } from '../../../panel/src/core/errors';
import type { Issue } from '../../../panel/src/core/types';

const error = (code: string, params?: Issue['params']): Issue => (params ? { code, level: 'error', params } : { code, level: 'error' });

describe('describeIssue', () => {
  it('gives the Russian text of the core for a code of the core', () => {
    const issue = error('FONT_MISSING', { font: 'SBSansDisplay-Bold' });
    expect(describeIssue(issue)).toEqual({ code: 'FONT_MISSING', level: 'error', text: message(issue) });
    expect(describeIssue(error('NO_TARGET')).text).toBe(MESSAGES.NO_TARGET);
  });

  it('keeps the level of the issue', () => {
    expect(describeIssue({ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 30 } }).level).toBe('warning');
  });

  it('has the text of the codes the host and the bridge send, including the ones added late', () => {
    for (const code of ['TARGET_IS_TEMPLATE', 'NAME_MISMATCH', 'HOST_BRIDGE_ERROR', 'HOST_EMPTY', 'TIMEOUT', 'ADAPTER_LOAD', 'FIELD_NOT_FOUND', 'LENGTH_MISMATCH']) {
      expect(describeIssue(error(code)).text).toBe(message(error(code)));
      expect(describeIssue(error(code)).detail).toBeUndefined();
    }
  });

  it('shows the detail of a code that has no text of its own, and says it is unexpected', () => {
    const r = describeIssue(error('SOMETHING_NEW', { detail: 'it broke at line 4' }));
    expect(r.text).toBe('Непредвиденная ошибка SOMETHING_NEW. Скопируйте диагностику и передайте разработчикам.');
    expect(r.detail).toBe('it broke at line 4');
    expect(describeIssue(error('SOMETHING_NEW')).detail).toBeUndefined();
  });

  it('shows no detail for a code that has a text of its own: that is for the log and the diagnostics', () => {
    const r = describeIssue(error('TIMEOUT', { detail: 'findPlaced TIMEOUT' }));
    expect(r.detail).toBeUndefined();
  });

  it('gives a name that is on Object.prototype the unexpected-code text, not a function', () => {
    expect(describeIssue(error('constructor')).text).toContain('Непредвиденная ошибка constructor');
    expect(describeIssue(error('toString')).text).toContain('Непредвиденная ошибка toString');
  });
});

describe('the codes of the app itself', () => {
  it('have a Russian text each, filled from the params and with no hole', () => {
    for (const code of Object.keys(APP_MESSAGES)) {
      for (const params of [undefined, { detail: 'причина', id: 'LOGO_X' }]) {
        const { text } = describeIssue(error(code, params));
        expect(text, code).toMatch(/[а-яА-Я]/);
        expect(text, code).not.toMatch(/undefined|null|\{|\}|\[|\]/);
      }
    }
  });

  it('say what failed', () => {
    expect(describeIssue(error('PANEL_BOOT_FAILED', { detail: 'Node.js is off' })).text).toBe(
      'Панель не запустилась: Node.js is off. Закройте и снова откройте панель.',
    );
    expect(describeIssue(error('PANEL_BOOT_FAILED')).text).toBe('Панель не запустилась. Закройте и снова откройте панель.');
    expect(describeIssue(error('ITEM_NOT_FOUND', { id: 'TTL_Gone' })).text).toBe('Шаблон не найден в библиотеке: TTL_Gone.');
    expect(describeIssue(error('INSERT_BUSY')).text).toBe('Предыдущая вставка ещё выполняется. Дождитесь результата и повторите.');
    expect(describeIssue(error('PANEL_ERROR', { detail: 'boom' })).text).toContain('boom');
  });
});

describe('bannerIssues', () => {
  const adapter = error('ADAPTER_LOAD');
  const empty = error('HOST_EMPTY', { detail: 'cold' });

  it('shows the failure of the adapter at start while the host has not answered since', () => {
    expect(bannerIssues({ adapterIssue: adapter, hostIssue: null, hostOk: false })).toEqual([adapter]);
  });

  it('drops that failure once a context came: the adapter works now', () => {
    expect(bannerIssues({ adapterIssue: adapter, hostIssue: null, hostOk: true })).toEqual([]);
  });

  it('adds the failure to reach the host now, one line per code', () => {
    expect(bannerIssues({ adapterIssue: null, hostIssue: empty, hostOk: false })).toEqual([empty]);
    expect(bannerIssues({ adapterIssue: adapter, hostIssue: empty, hostOk: false })).toEqual([adapter, empty]);
    expect(bannerIssues({ adapterIssue: empty, hostIssue: error('HOST_EMPTY'), hostOk: false })).toEqual([empty]);
  });

  it('is silent when all is well', () => {
    expect(bannerIssues({ adapterIssue: null, hostIssue: null, hostOk: true })).toEqual([]);
    expect(bannerIssues({ adapterIssue: null, hostIssue: null, hostOk: false })).toEqual([]);
  });
});
