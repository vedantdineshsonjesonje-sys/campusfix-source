'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../data.js');

test('seed issues have independent records, valid fields, and correct statistics', () => {
  const issues = data.createSeedIssues();
  assert.equal(issues.length, 5);
  assert.equal(new Set(issues.map(issue => issue.id)).size, 5);
  assert.deepEqual(data.getStats(issues), { total: 5, reported: 2, inProgress: 2, resolved: 1 });
  for (const issue of issues) {
    assert.deepEqual(data.validateReport(issue), {});
    assert.ok(data.STATUSES.includes(issue.status));
    assert.ok(data.TEAMS.includes(issue.team));
    assert.ok(issue.history.length);
    assert.ok(Number.isFinite(Date.parse(issue.createdAt)));
  }
  issues[0].history[0].note = 'changed';
  assert.notEqual(data.createSeedIssues()[0].history[0].note, 'changed');
});

test('filters combine category, status, and case-insensitive location search', () => {
  const issues = data.createSeedIssues();
  const result = data.filterIssues(issues, { category: 'Electrical', status: 'Reported', query: '  SCIENCE  ' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'CF-1003');
  assert.equal(data.filterIssues(issues, { category: 'Electrical', status: 'Resolved' }).length, 0);
  assert.equal(data.filterIssues(issues, { query: 'IT Services' })[0].id, 'CF-1001');
});

test('sorting is deterministic and never mutates the input', () => {
  const issues = data.createSeedIssues().reverse();
  const before = issues.map(issue => issue.id);
  assert.equal(data.filterIssues(issues)[0].id, 'CF-1001');
  assert.equal(data.filterIssues(issues, { sort: 'newest' })[0].id, 'CF-1004');
  assert.equal(data.filterIssues(issues, { sort: 'oldest' })[0].id, 'CF-1005');
  assert.deepEqual(issues.map(issue => issue.id), before);
});

test('malformed filter inputs and missing numbers do not throw', () => {
  assert.deepEqual(data.filterIssues(null), []);
  assert.deepEqual(data.getStats(null), { total: 0, reported: 0, inProgress: 0, resolved: 0 });
  assert.equal(data.filterIssues([null, 'bad', { title: 'Valid' }], null).length, 1);
  assert.equal(data.filterIssues([{ title: 'one', votes: NaN }, { title: 'two', votes: 4 }])[0].title, 'two');
});

test('keyword category suggestions cover common campus problems without remote AI', () => {
  assert.equal(data.suggestCategory('The Wi-Fi router keeps disconnecting'), 'Wi-Fi & Network');
  assert.equal(data.suggestCategory('Corridor lights and power socket'), 'Electrical');
  assert.equal(data.suggestCategory('Tap leaking water'), 'Plumbing');
  assert.equal(data.suggestCategory('Projector flickers'), 'Classroom Equipment');
  assert.equal(data.suggestCategory('A broken chair'), 'Furniture');
  assert.equal(data.suggestCategory('Trash and litter'), 'Cleanliness');
  assert.equal(data.suggestCategory('Fire hazard'), 'Safety');
  assert.equal(data.suggestCategory('Please look into this'), 'Other');
  assert.equal(data.suggestCategory(null), 'Other');
});

test('duplicate finder requires meaningful overlap and caps ranked results', () => {
  const issues = data.createSeedIssues();
  assert.equal(data.findDuplicates(issues, 'Corridor lights are out', 'Science Block')[0].id, 'CF-1003');
  assert.equal(data.findDuplicates(issues, 'WiFi keeps dropping', 'Engineering Block, 2nd floor')[0].id, 'CF-1001');
  assert.deepEqual(data.findDuplicates(issues, 'Broken thing', 'Elsewhere'), []);
  assert.deepEqual(data.findDuplicates(issues, '', ''), []);
  assert.deepEqual(data.findDuplicates(null, 'Leaking tap', 'Hostel'), []);
  const repeated = Array.from({ length: 7 }, (_, index) => ({ title: 'Corridor lights broken', location: 'Science Block', votes: index }));
  const matches = data.findDuplicates(repeated, 'Corridor lights not working', 'Science Block');
  assert.equal(matches.length, 3);
  assert.equal(matches[0].votes, 6);
});

test('validation rejects empty, non-string, oversized, and invalid categories', () => {
  assert.deepEqual(Object.keys(data.validateReport({})).sort(), ['category', 'description', 'location', 'title']);
  assert.ok(data.validateReport({ title: 123, description: {}, location: [], category: 'Electrical' }).title);
  const valid = { title: 'abc', description: '1234567890', location: 'AB', category: 'Electrical' };
  assert.deepEqual(data.validateReport(valid), {});
  assert.ok(data.validateReport({ ...valid, title: 'a'.repeat(101) }).title);
  assert.ok(data.validateReport({ ...valid, description: 'a'.repeat(2001) }).description);
  assert.ok(data.validateReport({ ...valid, location: 'a'.repeat(121) }).location);
  assert.ok(data.validateReport({ ...valid, category: '__proto__' }).category);
  assert.ok(data.validateReport({ ...valid, title: '  a  ' }).title);
});

test('relative dates handle thresholds, future timestamps, and invalid dates', () => {
  const now = Date.parse('2026-10-26T10:00:00.000Z');
  assert.equal(data.relativeTime(now - 59000, now), 'Just now');
  assert.equal(data.relativeTime(now - 60000, now), '1m ago');
  assert.equal(data.relativeTime(now - 5 * 60000, now), '5m ago');
  assert.equal(data.relativeTime(now - 2 * 3600000, now), '2h ago');
  assert.equal(data.relativeTime(now - 3 * 86400000, now), '3d ago');
  assert.equal(data.relativeTime(now + 60000, now), 'Just now');
  assert.equal(data.relativeTime('not a date', now), 'Unknown');
  assert.equal(data.relativeTime(null, now), 'Unknown');
});
