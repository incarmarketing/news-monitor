import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationalPoller, kstPollingDay } from '../src/operationalPolling.js';

function harness() {
  const state = { now: Date.parse('2026-09-10T00:00:00Z'), revision: 'a1', patch: {}, warnings: [], visible: true,
    coreCalls: 0, changeCalls: 0, core: { source: 'supabase', status: 'live', articles: [{ title: 'Article' }] }, errors: 0, received: [] };
  let timer;
  const poller = createOperationalPoller({
    now: () => state.now, visible: () => state.visible,
    schedule: (fn) => { timer = fn; return 1; }, cancel: () => { timer = null; },
    readChanges: async (revisions) => { state.changeCalls++; state.requested = { ...revisions };
      if (state.fail) throw Error('offline');
      return { revisions: { news_articles: state.revision, notification_sends: 'n1', job_runs: 'j1' }, patch: state.patch, warnings: state.warnings }; },
    readCore: async () => { state.coreCalls++; if (state.hold) await state.hold; return state.core; },
    onCore: (core) => state.received.push(core), onStatus: (patch) => { state.lastPatch = patch; }, onError: () => state.errors++,
  });
  return { state, poller, tick: async () => { state.now += 60_000; if (timer) await timer(); } };
}

test('one hour unchanged: one article load, no GitHub path, lightweight checks only', async () => {
  const h = harness(); await h.poller.start();
  for (let i = 0; i < 60; i++) await h.tick();
  assert.equal(h.state.coreCalls, 1);
  assert.equal(h.state.changeCalls, 61);
  assert.equal(h.state.received[0].articles, h.state.core.articles);
  h.poller.stop();
});

test('Slack completion updates status without downloading article rows', async () => {
  const h = harness(); await h.poller.start();
  h.state.patch = { notifications: [{ status: 'success', time: '08:12' }] };
  await h.tick();
  assert.equal(h.state.lastPatch.notifications[0].time, '08:12');
  assert.equal(h.state.coreCalls, 1);
  await h.tick();
  assert.equal(h.state.requested.notification_sends, 'n1');
});

test('article insert, edit or delete invalidates even if the article count is unchanged', async () => {
  const h = harness(); await h.poller.start();
  for (const revision of ['edited', 'deleted', 'new-negative']) { h.state.revision = revision; await h.tick(); }
  assert.equal(h.state.coreCalls, 4);
});

test('partial ledger outages keep existing rows and leave the revision unacknowledged', async () => {
  const h = harness(); h.state.warnings = ['notifications_unavailable', 'watch_job_unavailable'];
  h.state.patch = { jobRuns: [] };
  await h.poller.start(); await h.tick();
  assert.equal(h.state.requested.notification_sends, undefined);
  assert.equal(h.state.requested.job_runs, undefined);
  assert.equal(Object.hasOwn(h.state.lastPatch, 'notifications'), false);
  h.state.warnings = []; h.state.patch = { notifications: [], jobRuns: [] };
  await h.tick(); await h.tick();
  assert.equal(h.state.requested.notification_sends, 'n1');
});

test('static fallback cannot acknowledge a DB article revision', async () => {
  const h = harness(); await h.poller.start();
  h.state.revision = 'new'; h.state.core = { source: 'static', status: 'live' };
  await h.tick(); await h.tick();
  assert.equal(h.state.requested.news_articles, 'a1');
  h.state.core = { source: 'supabase', status: 'live' };
  await h.tick(); await h.tick();
  assert.equal(h.state.requested.news_articles, 'new');
});

test('no hidden-tab reads; returning or reconnecting checks immediately', async () => {
  const h = harness(); await h.poller.start();
  h.state.visible = false;
  for (let i = 0; i < 10; i++) await h.tick();
  assert.equal(h.state.changeCalls, 1);
  h.state.visible = true; h.state.revision = 'alert'; await h.poller.resume();
  assert.equal(h.state.coreCalls, 2);
});

test('KST midnight refreshes today even without a database write', async () => {
  const h = harness(); h.state.now = Date.parse('2026-09-10T14:59:59Z'); await h.poller.start();
  await h.tick(); assert.equal(h.state.coreCalls, 2);
  assert.equal(kstPollingDay(h.state.now), '2026-09-11');
});

test('overlapping checks coalesce and stopping prevents late state writes', async () => {
  const h = harness(); let release;
  h.state.hold = new Promise((resolve) => { release = resolve; });
  const first = h.poller.check(); const second = h.poller.check();
  assert.equal(first, second);
  h.poller.stop(); release(); await first;
  assert.equal(h.state.received.length, 0);
});

test('change endpoint outage reports uncertainty and retains five-minute core fallback', async () => {
  const h = harness(); await h.poller.start(); h.state.fail = true;
  for (let i = 0; i < 4; i++) await h.tick();
  assert.equal(h.state.coreCalls, 1);
  await h.tick(); assert.equal(h.state.coreCalls, 2);
  assert.equal(h.state.errors, 5);
});
