import { describe, it, expect } from 'vitest';
import {
  parseHostVersion, compareVersions, hostVersionAtLeast, formatVersion, parseSemver, compareSemver, pluginAtLeast,
  compareCalver,
} from '../../../panel/src/core/versions';

describe('host versions', () => {
  it('parses app.version of AE and Premiere and minHostVersion', () => {
    expect(parseHostVersion('26.5x89')).toEqual([26, 5, 0]);
    expect(parseHostVersion('26.5.2')).toEqual([26, 5, 2]);
    expect(parseHostVersion('26.0')).toEqual([26, 0, 0]);
    expect(parseHostVersion('26')).toEqual([26, 0, 0]);
    expect(parseHostVersion('25.2.1x5')).toEqual([25, 2, 1]);
    expect(parseHostVersion(' 26.5.2 ')).toEqual([26, 5, 2]);
  });
  it('gives null for a string without a version', () => {
    expect(parseHostVersion('')).toBeNull();
    expect(parseHostVersion('x89')).toBeNull();
    expect(parseHostVersion('undefined')).toBeNull();
  });
  it('compares part by part, a missing part is 0', () => {
    expect(compareVersions([26, 5, 0], [26, 0, 0])).toBe(1);
    expect(compareVersions([26, 0, 0], [26, 0, 0])).toBe(0);
    expect(compareVersions([25, 9, 9], [26, 0, 0])).toBe(-1);
    expect(compareVersions([26, 5], [26, 5, 0])).toBe(0);
    expect(compareVersions([26, 5, 10], [26, 5, 9])).toBe(1);
  });
  it('checks a host against minHostVersion and fails safe on garbage', () => {
    expect(hostVersionAtLeast('26.5x89', '26.0')).toBe(true);
    expect(hostVersionAtLeast('26.5.2', '26.5.2')).toBe(true);
    expect(hostVersionAtLeast('26.5.1', '26.5.2')).toBe(false);
    expect(hostVersionAtLeast('25.6x101', '26.0')).toBe(false);
    expect(hostVersionAtLeast('', '26.0')).toBe(false);
    expect(hostVersionAtLeast('26.5.2', 'new')).toBe(false);
  });
  it('prints a host version for people, without a zero patch', () => {
    expect(formatVersion([26, 5, 0])).toBe('26.5');
    expect(formatVersion([26, 0, 0])).toBe('26.0');
    expect(formatVersion([26, 5, 2])).toBe('26.5.2');
  });
});

describe('plugin versions (semver)', () => {
  it('parses x.y.z with an optional pre-release and build', () => {
    expect(parseSemver('0.1.0')).toEqual({ core: [0, 1, 0], pre: [] });
    expect(parseSemver('1.2.3-beta.11+exp.sha')).toEqual({ core: [1, 2, 3], pre: ['beta', 11] });
    expect(parseSemver('1.0')).toBeNull();
    expect(parseSemver('v1.0.0')).toBeNull();
    expect(parseSemver('dev')).toBeNull();
  });
  it('orders releases and pre-releases the semver way', () => {
    const order = ['0.0.0-test', '0.1.0-alpha', '0.1.0-alpha.1', '0.1.0-alpha.beta', '0.1.0-beta.2', '0.1.0-beta.11',
      '0.1.0', '0.1.1', '0.2.0', '0.10.0', '1.0.0'];
    for (let i = 1; i < order.length; i += 1) {
      expect(compareSemver(order[i - 1]!, order[i]!)).toBe(-1);
      expect(compareSemver(order[i]!, order[i - 1]!)).toBe(1);
    }
    expect(compareSemver('1.0.0+a', '1.0.0+b')).toBe(0);
  });
  it('sorts an unreadable version below every readable one', () => {
    expect(compareSemver('dev', '0.0.0')).toBe(-1);
    expect(compareSemver('0.0.0', 'dev')).toBe(1);
  });
  it('tells whether the panel is new enough, failing safe on garbage', () => {
    expect(pluginAtLeast('0.1.0', '0.1.0')).toBe(true);
    expect(pluginAtLeast('0.2.0', '0.1.0')).toBe(true);
    expect(pluginAtLeast('0.1.0-rc.1', '0.1.0')).toBe(false);
    expect(pluginAtLeast('dev', '0.1.0')).toBe(false);
    expect(pluginAtLeast('0.1.0', '1')).toBe(false);
  });
});

describe('library versions (calver)', () => {
  it('orders dates and the .N of a second build that day', () => {
    expect(compareCalver('2026.10.05', '2026.10.05.2')).toBe(-1);
    expect(compareCalver('2026.10.05.2', '2026.10.05.10')).toBe(-1);
    expect(compareCalver('2026.10.06', '2026.10.05.2')).toBe(1);
    expect(compareCalver('2026.11.01', '2026.10.31')).toBe(1);
    expect(compareCalver('2026.10.05', '2026.10.05')).toBe(0);
    expect(compareCalver('junk', '2026.10.05')).toBe(-1);
  });
});
