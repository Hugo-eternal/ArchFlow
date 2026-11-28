// module: designs:schedule — date arithmetic used for task intervals (V2.10.1 L574–577, L621–623).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('schedule date calculations', () => {
  let app;
  beforeAll(async () => { app = await openApp(); await app.createProject('schedule'); });
  afterAll(async () => { await app?.close(); });

  it('scheduleDay parses strict YYYY-MM-DD in UTC days and rejects anything else', async () => {
    const r = await app.eval(() => ['2024-01-01', '2024-01-02', '2024-02-29', '2025-02-29', '2024-13-01', '2024-1-01', '2024/01/01', '', null, 20240101]
      .map(v => scheduleDay(v)));
    expect(r[1] - r[0]).toBe(1);
    expect(r[2]).not.toBeNull();          // leap day
    expect(r.slice(3)).toEqual([null, null, null, null, null, null, null]);
    expect(r[0]).toBe(Date.UTC(2024, 0, 1) / 86400000);
  });

  it('scheduleEndpoint picks start or end of a range, the deadline, or null', async () => {
    const r = await app.eval(() => {
      const range = { timeType: 'range', startDate: '2024-03-01', endDate: '2024-03-10' };
      return [
        scheduleEndpoint(range, 'start'), scheduleEndpoint(range, 'end'),
        scheduleEndpoint({ timeType: 'deadline', deadline: '2024-03-05' }, 'start'),
        scheduleEndpoint({ timeType: 'range', startDate: '2024-03-10', endDate: '2024-03-01' }, 'start'), // reversed range
        scheduleEndpoint({ timeType: 'range', startDate: '2024-03-01', endDate: '' }, 'start'),             // incomplete range
        scheduleEndpoint({ timeType: 'none' }, 'start'), scheduleEndpoint(null, 'start'),
      ].map(v => v === null ? null : v - scheduleDay('2024-03-01'));
    });
    expect(r).toEqual([0, 9, 4, null, null, null, null]);
  });

  it('validManualDays accepts integers 0–999999 only', async () => {
    const r = await app.eval(() => [0, '0', 5, '42', 999999, 1000000, -1, '1.5', 'abc', '', null, undefined].map(validManualDays));
    expect(r).toEqual([true, true, true, true, true, false, false, false, false, false, false, false]);
  });

  describe('intervalState between two tasks', () => {
    // two tasks a → b and one link; returns intervalState(link) after applying the given fields
    const state = (aFields, bFields, linkFields = {}, rules = { endpoint: 'start', count: 'difference' }) =>
      app.eval((a, b, l, r) => {
        const [na, nb] = model.nodes;
        for (const n of [na, nb]) for (const k of ['timeType', 'startDate', 'endDate', 'deadline']) delete n[k];
        Object.assign(na, a); Object.assign(nb, b);
        model.scheduleRules = r;
        const e = { id: 'tlink', a: { node: na.id }, b: { node: nb.id }, ...l };
        return intervalState(e);
      }, aFields, bFields, linkFields, rules);
    const range = (s, e) => ({ timeType: 'range', startDate: s, endDate: e });

    it('counts calendar days between the chosen endpoints (same day = 0)', async () => {
      expect((await state(range('2024-03-01', '2024-03-05'), range('2024-03-11', '2024-03-20'))).label).toBe('10 天');
      expect((await state(range('2024-03-01', '2024-03-05'), range('2024-03-01', '2024-03-02'))).label).toBe('0 天');
    });

    it('uses the design rule endpoint unless the link overrides fromDate / toDate', async () => {
      const a = range('2024-03-01', '2024-03-05'), b = range('2024-03-11', '2024-03-20');
      expect((await state(a, b, {}, { endpoint: 'end', count: 'difference' })).label).toBe('15 天');
      expect((await state(a, b, { fromDate: 'end', toDate: 'start' })).label).toBe('6 天');
    });

    it('works with deadlines', async () => {
      expect((await state({ timeType: 'deadline', deadline: '2024-03-01' }, { timeType: 'deadline', deadline: '2024-04-01' })).label).toBe('31 天');
    });

    it('shows nothing when dates are missing or go backwards', async () => {
      expect((await state({ timeType: 'none' }, range('2024-03-11', '2024-03-20'))).label).toBe('');
      expect((await state(range('2024-03-11', '2024-03-20'), range('2024-03-01', '2024-03-05'))).label).toBe('');
    });

    it('manual mode ignores task dates', async () => {
      expect((await state({ timeType: 'none' }, { timeType: 'none' }, { timeMode: 'manual', manualDays: '7' })).label).toBe('7 天');
      expect((await state(range('2024-03-01', '2024-03-02'), range('2024-03-03', '2024-03-04'), { timeMode: 'manual', manualDays: 'x' })).label).toBe('');
    });
  });

  // v2-fix B4 (reviewed 2026-11-28): links count days as the date difference. `count: 'inclusive'`
  // is a retired rule — validation (L633) resets every schedule to 'difference' on load and no UI sets
  // it — so scheduleLabel (L624 → intervalState) ignores it. An unknown endpoint uses the link's own dates.
  it('scheduleLabel counts the date difference (the retired inclusive rule has no effect)', async () => {
    const r = await app.eval(() => {
      const [na, nb] = model.nodes;
      Object.assign(na, { timeType: 'range', startDate: '2024-03-01', endDate: '2024-03-05' });
      Object.assign(nb, { timeType: 'range', startDate: '2024-03-11', endDate: '2024-03-20' });
      const e = { a: { node: na.id }, b: { node: nb.id } };
      const out = [];
      for (const count of ['difference', 'inclusive']) { model.scheduleRules = { endpoint: 'start', count }; out.push(scheduleLabel(e)); }
      model.scheduleRules = { endpoint: 'bogus', count: 'difference' }; out.push(scheduleLabel(e));
      return out;
    });
    expect(r).toEqual(['10 天', '10 天', '']);
  });
});
