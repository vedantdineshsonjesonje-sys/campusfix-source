/* Pure scoring helpers for the bundled MiniLM sentence-embedding model. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CampusAICore = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const PROTOTYPES = Object.freeze([
    { category: 'Wi-Fi & Network', text: 'The campus Wi-Fi disconnects frequently and the internet connection is unreliable.' },
    { category: 'Wi-Fi & Network', text: 'Slow internet, failed network login, a broken router, or an ethernet connection problem.' },
    { category: 'Wi-Fi & Network', text: 'Students cannot connect their laptops to the wireless network during online classes.' },
    { category: 'Electrical', text: 'A power socket is broken, loose, sparking, or has exposed electrical wiring.' },
    { category: 'Electrical', text: 'Corridor lights, classroom bulbs, ceiling fans, or electrical switches are not working.' },
    { category: 'Electrical', text: 'There is a power outage in the building and the electricity supply needs repair.' },
    { category: 'Plumbing', text: 'A leaking tap or broken pipe is wasting water and flooding the washroom floor.' },
    { category: 'Plumbing', text: 'A toilet, sink, bathroom drain, or sewer is clogged, overflowing, or needs a plumber.' },
    { category: 'Plumbing', text: 'Water supply pressure is low and the drinking water dispenser or faucet is broken.' },
    { category: 'Classroom Equipment', text: 'A classroom projector flickers, shuts down, or cannot display lecture slides.' },
    { category: 'Classroom Equipment', text: 'The whiteboard, blackboard, teaching screen, or classroom audio equipment is damaged.' },
    { category: 'Classroom Equipment', text: 'A lecture hall microphone, speaker, or presentation system is not functioning.' },
    { category: 'Furniture', text: 'A chair, desk, bench, or table has a broken leg and needs furniture repair.' },
    { category: 'Furniture', text: 'Damaged cafeteria seating, a cracked classroom desk, or unstable hostel furniture.' },
    { category: 'Furniture', text: 'A cupboard, book shelf, locker, or cabinet is broken and needs maintenance.' },
    { category: 'Cleanliness', text: 'Rubbish and litter are scattered around campus and the overflowing trash bins need emptying.' },
    { category: 'Cleanliness', text: 'A washroom is dirty and needs cleaning, disinfection, or housekeeping.' },
    { category: 'Cleanliness', text: 'Food waste, dust, bad smells, or unclean shared spaces need attention from cleaners.' },
    { category: 'Safety', text: 'A damaged stair railing or blocked fire exit creates an immediate safety hazard.' },
    { category: 'Safety', text: 'Campus security needs to investigate a dangerous situation, unsafe area, or broken CCTV camera.' },
    { category: 'Safety', text: 'A fire alarm, smoke detector, emergency exit, or fire extinguisher is missing or damaged.' },
    { category: 'Other', text: 'A campus road has potholes, a footpath is damaged, or signs and directions need repair.' },
    { category: 'Other', text: 'An elevator, building door, window, transport service, or miscellaneous campus facility needs maintenance.' },
    { category: 'Other', text: 'A campus facilities problem does not fit the internet, electrical, plumbing, equipment, furniture, cleaning, or safety categories.' }
  ].map(item => Object.freeze(item)));

  function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
  function sanitizeInput(input) {
    if (!input || typeof input !== 'object') throw new Error('Add an issue title before using AI triage.');
    const title = text(input.title, 100);
    if (title.length < 3) throw new Error('Add an issue title of at least 3 characters.');
    const seen = new Set();
    const issues = (Array.isArray(input.issues) ? input.issues : []).filter(issue => {
      if (!issue || typeof issue.id !== 'string' || seen.has(issue.id) || !text(issue.title, 100)) return false;
      seen.add(issue.id);
      return true;
    }).map(issue => ({ id: text(issue.id, 100), title: text(issue.title, 100), description: text(issue.description, 2000), location: text(issue.location, 120), category: text(issue.category, 100), status: text(issue.status, 40) }));
    return { title, description: text(input.description, 2000), location: text(input.location, 120), issues };
  }
  function reportText(report) { return [report.title, report.description].filter(Boolean).join('. '); }
  function cosine(a, b) {
    if (!a || !b || typeof a.length !== 'number' || a.length !== b.length || !a.length) return 0;
    let dot = 0, left = 0, right = 0;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
      dot += a[i] * b[i]; left += a[i] * a[i]; right += b[i] * b[i];
    }
    return left && right ? Math.max(-1, Math.min(1, dot / Math.sqrt(left * right))) : 0;
  }
  function rankClassification(queryVector, prototypeVectors) {
    if (!Array.isArray(prototypeVectors) || prototypeVectors.length !== PROTOTYPES.length) throw new Error('AI category vectors are incomplete.');
    const scores = new Map();
    PROTOTYPES.forEach((prototype, index) => {
      const score = cosine(queryVector, prototypeVectors[index]);
      scores.set(prototype.category, Math.max(scores.get(prototype.category) ?? -1, score));
    });
    const ranking = Array.from(scores, ([category, score]) => ({ category, score })).sort((a, b) => b.score - a.score);
    const best = ranking[0];
    const chosen = best.score >= 0.25 ? best : ranking.find(item => item.category === 'Other');
    return { category: chosen.category, score: chosen.score, alternatives: ranking.filter(item => item.category !== chosen.category).slice(0, 2) };
  }
  function rankDuplicates(queryVector, queryLocationVector, candidates) {
    if (!Array.isArray(candidates)) return [];
    return candidates.map(candidate => {
      if (!candidate || typeof candidate.id !== 'string') return null;
      const contentScore = cosine(queryVector, candidate.vector);
      const hasLocations = Boolean(queryLocationVector && candidate.locationVector);
      const locationScore = hasLocations ? cosine(queryLocationVector, candidate.locationVector) : 0;
      // Similar maintenance subjects in unrelated buildings are related, not duplicates.
      const qualifies = contentScore >= 0.65 && (!hasLocations || locationScore >= 0.45 || contentScore >= 0.93);
      if (!qualifies) return null;
      return { id: candidate.id, score: contentScore, locationScore };
    }).filter(Boolean).sort((a, b) => (b.score + b.locationScore * 0.08) - (a.score + a.locationScore * 0.08)).slice(0, 3).map(({ id, score }) => ({ id, score }));
  }
  return Object.freeze({ PROTOTYPES, sanitizeInput, reportText, cosine, rankClassification, rankDuplicates });
});
