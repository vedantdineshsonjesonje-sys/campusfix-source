/* CampusFix data helpers. No dependencies or network access are required. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CampusData = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var CATEGORIES = Object.freeze(['Wi-Fi & Network', 'Electrical', 'Plumbing', 'Classroom Equipment', 'Furniture', 'Cleanliness', 'Safety', 'Other']);
  var STATUSES = Object.freeze(['Reported', 'In Progress', 'Resolved']);
  var TEAMS = Object.freeze(['Unassigned', 'IT Services', 'Electrical Team', 'Plumbing Team', 'Maintenance', 'Housekeeping', 'Campus Security']);
  var DAY = 86400000;

  function text(value) { return typeof value === 'string' ? value : ''; }
  function clean(value) { return text(value).trim(); }
  function lower(value) { return clean(value).toLowerCase(); }
  function list(value) {
    return Array.isArray(value) ? value.filter(function (item) { return item && typeof item === 'object' && !Array.isArray(item); }) : [];
  }
  function timestamp(value) {
    if (value == null || value === '') return 0;
    var time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
  function votes(value) { var count = Number(value); return Number.isFinite(count) ? count : 0; }

  function createSeedIssues() {
    var now = Date.now();
    var seeds = [
      ['CF-1001', 'Wi-Fi drops every few minutes', 'The campus Wi-Fi keeps disconnecting on the 2nd floor, making it difficult to attend online lectures.', 'Wi-Fi & Network', 'Engineering Block, 2nd floor', 'In Progress', 'IT Services', 23, 3],
      ['CF-1002', 'Projector flickering', 'The projector in room 204 flickers and shuts down in the middle of lectures.', 'Classroom Equipment', 'Lecture Hall 204', 'Reported', 'Unassigned', 14, 2],
      ['CF-1003', 'Corridor lights not working', 'Half the lights in the corridor are out. The walkway becomes very dark at night.', 'Electrical', 'Science Block, 1st floor corridor', 'Reported', 'Electrical Team', 11, 4],
      ['CF-1004', 'Leaking tap in washroom', 'A tap is leaking constantly and water is pooling on the washroom floor.', 'Plumbing', 'Hostel B, Ground floor washroom', 'In Progress', 'Plumbing Team', 9, 1],
      ['CF-1005', 'Broken bench in cafeteria', 'One of the long benches has a cracked leg and is unsafe to sit on.', 'Furniture', 'Main Cafeteria', 'Resolved', 'Maintenance', 6, 6]
    ];
    return seeds.map(function (seed) {
      var created = new Date(now - seed[8] * DAY).toISOString();
      var updated = seed[5] === 'Reported' ? created : new Date(now - Math.max(0.1, seed[8] - 1) * DAY).toISOString();
      var history = [{ status: 'Reported', note: 'Issue reported by a student.', at: created }];
      if (seed[5] !== 'Reported') history.push({ status: seed[5], note: seed[5] === 'Resolved' ? 'Repair completed and checked by the maintenance team.' : 'Assigned to ' + seed[6] + '.', at: updated });
      return { id: seed[0], title: seed[1], description: seed[2], category: seed[3], location: seed[4], status: seed[5], team: seed[6], votes: seed[7], createdAt: created, updatedAt: updated, photo: null, history: history };
    });
  }

  function filterIssues(issues, options) {
    options = options && typeof options === 'object' ? options : {};
    var query = lower(options.query);
    var category = lower(options.category);
    var status = lower(options.status);
    var result = list(issues).filter(function (issue) {
      if (category && category !== 'all categories' && lower(issue.category) !== category) return false;
      if (status && status !== 'any status' && lower(issue.status) !== status) return false;
      var searchable = [issue.title, issue.description, issue.location, issue.category, issue.team, issue.id].map(lower).join(' ');
      return !query || searchable.indexOf(query) !== -1;
    });
    return result.sort(function (a, b) {
      if (options.sort === 'newest') return timestamp(b.createdAt) - timestamp(a.createdAt);
      if (options.sort === 'oldest') return timestamp(a.createdAt) - timestamp(b.createdAt);
      return votes(b.votes) - votes(a.votes) || timestamp(b.createdAt) - timestamp(a.createdAt);
    });
  }

  function getStats(issues) {
    return list(issues).reduce(function (stats, issue) {
      stats.total += 1;
      if (issue.status === 'Reported') stats.reported += 1;
      if (issue.status === 'In Progress') stats.inProgress += 1;
      if (issue.status === 'Resolved') stats.resolved += 1;
      return stats;
    }, { total: 0, reported: 0, inProgress: 0, resolved: 0 });
  }

  // This is a transparent keyword helper, not a hosted AI service.
  function suggestCategory(value) {
    var source = lower(value).replace(/wi[ -]?fi/g, 'wifi');
    var rules = [
      ['Wi-Fi & Network', /\b(wifi|network|internet|router|ethernet|connectivity)\b/g],
      ['Electrical', /\b(lights?|bulbs?|sockets?|electrical|electricity|wiring|switches?|power|outlets?|fans?)\b/g],
      ['Plumbing', /\b(taps?|leaking|leaks?|pipes?|plumbing|drains?|toilets?|faucets?|water)\b/g],
      ['Classroom Equipment', /\b(projectors?|whiteboards?|blackboards?|screens?|speakers?|microphones?|lecterns?)\b/g],
      ['Furniture', /\b(benches|bench|chairs?|desks?|tables?|furniture|cupboards?|shelves)\b/g],
      ['Cleanliness', /\b(garbage|trash|litter|dirty|cleaning|cleanliness|rubbish|waste|dustbins?)\b/g],
      ['Safety', /\b(unsafe|safety|security|hazard|hazardous|fire|injury|injuries|cctv|dangerous)\b/g]
    ];
    var best = 'Other';
    var highest = 0;
    rules.forEach(function (rule) {
      var matches = source.match(rule[1]);
      var score = matches ? new Set(matches).size : 0;
      if (score > highest) { highest = score; best = rule[0]; }
    });
    return best;
  }

  var STOP_WORDS = new Set('a an and are as at be broken by can every few fix for from has have in is issue it keeps needs not of on or out problem report reported room something that the there this to very was with working'.split(' '));
  function tokens(value) {
    var words = lower(value).replace(/wi[ -]?fi/g, 'wifi').replace(/[^a-z0-9]+/g, ' ').split(/\s+/);
    return Array.from(new Set(words.filter(function (word) { return word.length > 2 && !STOP_WORDS.has(word); }).map(function (word) {
      if (word === 'benches') return 'bench';
      return word.length > 4 && /s$/.test(word) && !/ss$/.test(word) ? word.slice(0, -1) : word;
    })));
  }
  function overlap(a, b) { return a.filter(function (word) { return b.indexOf(word) !== -1; }).length; }

  function findDuplicates(issues, title, location) {
    var titleWords = tokens(title);
    var locationWords = tokens(location);
    if (!titleWords.length) return [];
    return list(issues).map(function (issue) {
      var sharedTitle = overlap(titleWords, tokens(issue.title));
      var sharedLocation = overlap(locationWords, tokens(issue.location));
      // Generic words alone never match. A single subject needs corroborating location words.
      var matching = sharedTitle >= 2 || (sharedTitle >= 1 && sharedLocation >= 2);
      return { issue: issue, score: matching ? sharedTitle * 3 + sharedLocation : 0 };
    }).filter(function (match) { return match.score > 0; }).sort(function (a, b) {
      return b.score - a.score || votes(b.issue.votes) - votes(a.issue.votes);
    }).slice(0, 3).map(function (match) { return match.issue; });
  }

  function validateReport(report) {
    report = report && typeof report === 'object' ? report : {};
    var errors = {};
    var title = clean(report.title);
    var description = clean(report.description);
    var location = clean(report.location);
    if (title.length < 3 || title.length > 100) errors.title = 'Use a title between 3 and 100 characters.';
    if (description.length < 10 || description.length > 2000) errors.description = 'Describe the issue in 10 to 2,000 characters.';
    if (location.length < 2 || location.length > 120) errors.location = 'Enter a location between 2 and 120 characters.';
    if (CATEGORIES.indexOf(report.category) === -1) errors.category = 'Choose a valid category.';
    return errors;
  }

  function relativeTime(value, now) {
    var time = value == null || value === '' ? NaN : new Date(value).getTime();
    var current = now === undefined ? Date.now() : new Date(now).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(current)) return 'Unknown';
    var age = Math.max(0, current - time);
    if (age < 60000) return 'Just now';
    if (age < 3600000) return Math.floor(age / 60000) + 'm ago';
    if (age < DAY) return Math.floor(age / 3600000) + 'h ago';
    return Math.floor(age / DAY) + 'd ago';
  }

  return Object.freeze({ CATEGORIES: CATEGORIES, STATUSES: STATUSES, TEAMS: TEAMS, createSeedIssues: createSeedIssues, filterIssues: filterIssues, getStats: getStats, suggestCategory: suggestCategory, findDuplicates: findDuplicates, validateReport: validateReport, relativeTime: relativeTime });
});
