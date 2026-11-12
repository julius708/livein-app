import test from 'node:test';
import assert from 'node:assert/strict';
import { ingest, projectTask } from '../lib/hq-events.js';

const clock = '2026-11-12T19:00:00Z';
const actors = {
  ceo: { id: 'person:ceo', workspaceId: 'livein', capabilities: ['assign'] },
  worker: { id: 'agent:codex', workspaceId: 'livein', capabilities: ['work'] },
  reviewer: { id: 'agent:claude-reviewer', workspaceId: 'livein', capabilities: ['verify'] },
  integration: { id: 'integration:asana', workspaceId: 'livein', capabilities: ['apply'] },
};
function event(n, status, overrides = {}) {
  return { version: 'livein-work-event-1', eventId: 'evt-'+n,
    workspaceId: 'livein', taskId: 'task-001', caseId: 'case-001',
    source: 'fixture', sourceEventId: 'source-'+n, sequence: n,
    occurredAt: clock, status, summary: 'Synthetic test event',
    assigneeId: 'agent:codex', nextAction: 'Inspect the next step',
    evidence: [], ...overrides };
}
const add = (list, row, actor = actors.worker) => ingest(list, row, { actor, receivedAt: clock });
const prepared = () => add([], event(1,'prepared'), actors.ceo).events;
const evidence = [{ uri: 'artifact:synthetic-output-v1', version: '1', digest: 'a'.repeat(64) }];

test('a task travels from assignment to accepted work and a result, without claiming deployment', () => {
  let events = prepared();
  for (const [n,status] of [[2,'accepted'],[3,'working'],[4,'result_ready']]) {
    events = add(events,event(n,status,{evidence:status==='result_ready'?evidence:[]})).events;
  }
  const task = projectTask(events,'task-001');
  assert.equal(task.status,'result_ready');
  assert.equal(task.actorId,actors.worker.id);
  assert.equal(task.verified,false);
  assert.equal(task.applied,false);
});
test('a retry is idempotent, while a different payload under the same source identity is rejected', () => {
  const events = prepared();
  assert.equal(add(events,event(1,'prepared'),actors.ceo).duplicate,true);
  assert.throws(()=>add(events,event(1,'prepared',{summary:'Different'}),actors.ceo),/collision/);
  assert.throws(()=>add(events,event(99,'prepared',{sourceEventId:'source-1'}),actors.ceo),/collision/);
});
test('actor identity and capability come from trusted context rather than event text', () => {
  assert.throws(()=>ingest([],event(1,'prepared'),{receivedAt:clock}),/actor/);
  assert.throws(()=>add([],event(1,'prepared'),actors.worker),/capability/);
  const result=add([],event(1,'prepared',{actorId:'forged'}),actors.ceo);
  assert.equal(result.events[0].actorId,'person:ceo');
});
test('a different worker cannot accept a task assigned to another agent', () => {
  assert.throws(()=>add(prepared(),event(2,'accepted'),{...actors.worker,id:'agent:other'}),/assignee/);
});
test('workspace access is checked', () => {
  assert.throws(()=>add([],event(1,'prepared'),{...actors.ceo,workspaceId:'other'}),/workspace/);
});
test('gaps and late events cannot overwrite a newer state', () => {
  let events=prepared();
  assert.throws(()=>add(events,event(3,'working')),/sequence/);
  events=add(events,event(2,'accepted')).events;
  assert.throws(()=>add(events,event(1,'prepared',{eventId:'old',sourceEventId:'old'}),actors.ceo),/sequence/);
});
test('a result requires a versioned evidence reference', () => {
  let events=add(prepared(),event(2,'accepted')).events;
  assert.throws(()=>add(events,event(3,'result_ready')),/evidence/);
  assert.throws(()=>add(events,event(3,'result_ready',{evidence:[{uri:'artifact:a'}]})),/evidence/);
});
test('verification and application require their own authorised receipts', () => {
  let events=add(prepared(),event(2,'accepted')).events;
  events=add(events,event(3,'result_ready',{evidence})).events;
  const checked={checkedEventId:'evt-3',checkedDigests:['a'.repeat(64)]};
  assert.throws(()=>add(events,event(4,'verified',{evidence,verification:checked})),/capability/);
  assert.throws(()=>add(events,event(4,'verified',{evidence}),actors.reviewer),/verification/);
  assert.throws(()=>add(events,event(4,'verified',{evidence,verification:{...checked,checkedEventId:'other'}}),actors.reviewer),/verification/);
  events=add(events,event(4,'verified',{evidence,verification:checked}),actors.reviewer).events;
  assert.equal(projectTask(events,'task-001').verified,true);
  assert.equal(projectTask(events,'task-001').applied,false);
  assert.throws(()=>add(events,event(5,'applied',{evidence}),actors.integration),/receipt/);
  events=add(events,event(5,'applied',{evidence,receipt:{id:'synthetic-receipt-1',target:'asana',verifiedEventId:'evt-4'}}),actors.integration).events;
  assert.equal(projectTask(events,'task-001').applied,true);
});
test('the result author cannot verify their own output', () => {
  let events=add(prepared(),event(2,'accepted')).events;
  events=add(events,event(3,'result_ready',{evidence})).events;
  assert.throws(()=>add(events,event(4,'verified',{evidence,verification:{checkedEventId:'evt-3',checkedDigests:['a'.repeat(64)]}}),{...actors.worker,capabilities:['work','verify']}),/independent/);
});
test('a blocker is preserved in history and work can resume', () => {
  let events=add(prepared(),event(2,'accepted')).events;
  events=add(events,event(3,'blocked')).events;
  assert.equal(projectTask(events,'task-001').status,'blocked');
  events=add(events,event(4,'working')).events;
  assert.equal(projectTask(events,'task-001').status,'working');
  assert.equal(events[2].status,'blocked');
});
test('timestamps require timezones and reject impossible dates or future claims', () => {
  for (const occurredAt of ['2026-11-12T19:00:00','2026-02-31T19:00:00Z','2030-01-01T00:00:00Z']) {
    assert.throws(()=>add([],event(1,'prepared',{occurredAt}),actors.ceo),/timestamp/);
  }
});
test('ingestion does not mutate caller data', () => {
  const input=event(1,'prepared');const history=[];
  const result=add(history,input,actors.ceo);
  result.events[0].summary='Changed';
  assert.equal(input.summary,'Synthetic test event');assert.equal(history.length,0);
});

// --- doplnené pri porte do livein-app (Claude Code): nepovinné pôvodné odkazy ---
test('original source links are preserved, validated and do not change the digest of events without them', () => {
  const plain = add([], event(1, 'prepared'), actors.ceo).events[0]
  const refs = [{ kind: 'slack', id: 'C0TEST/1700000000.000100', url: 'https://example.slack.com/archives/C0TEST/p1700000000000100' }, { kind: 'asana', id: '1200000000000001' }]
  const linked = add([], event(1, 'prepared', { refs }), actors.ceo).events[0]
  assert.deepEqual(linked.refs, refs)
  assert.equal('refs' in plain, false)
  assert.notEqual(linked.payloadDigest, plain.payloadDigest)
  assert.throws(() => add([], event(1, 'prepared', { refs: [{ kind: 'slack', id: 'x', url: 'http://insecure.example' }] }), actors.ceo), /ref URL/)
  assert.throws(() => add([], event(1, 'prepared', { refs: [{ kind: 'unknown', id: 'x' }] }), actors.ceo), /refs/)
  assert.throws(() => add([], event(1, 'prepared', { refs: [] }), actors.ceo), /refs/)
})
