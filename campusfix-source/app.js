/* CampusFix UI — a standalone, browser-local hackathon demo. */
(function () {
  'use strict';

  // This passcode only gates the DEMO UI. Production needs server-side authentication.
  const CONFIG = Object.freeze({ demoPasscode: 'campusfix123', storageKey: 'campusfix-demo-v1', sessionKey: 'campusfix-demo-admin', maxPhotoBytes: 2 * 1024 * 1024 });
  const D = window.CampusData;
  const main = document.getElementById('main');
  let toastTimer;
  let photo = null;
  let photoLoading = false;
  let photoVersion = 0;
  let authenticated = false;
  let route = 'feed';
  let filters = defaultFilters();
  let nextRouteFilters = null;
  let storageAvailable = true;

  function defaultFilters() { return { query: '', category: 'All categories', status: 'Any status', sort: 'votes' }; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function icon(name, size = 18) {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      arrow: '<path d="m12 3-8 8h5v9h6v-9h5l-8-8Z"/>',
      pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
      team: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
      lock: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
      sparkles: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2ZM21 2v4m-2-2h4"/>',
      photo: '<rect x="3" y="5" width="18" height="16" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m21 16-5-5L5 21"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
      logout: '<path d="M9 3H4v18h5m6-14 5 5-5 5m-7-5h12"/>',
      empty: '<path d="M3 7h18v14H3zM3 7l4-5h10l4 5M8 12h8"/>'
    };
    return '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.info) + '</svg>';
  }
  function toast(message) {
    const node = document.getElementById('toast');
    clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add('visible');
    toastTimer = setTimeout(() => node.classList.remove('visible'), 4500);
  }
  function safePhoto(value) { return typeof value === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) ? value : null; }
  function loadState() {
    const fresh = { version: 1, issues: D.createSeedIssues(), voted: [] };
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) { localStorage.setItem(CONFIG.storageKey, JSON.stringify(fresh)); return fresh; }
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.issues) || !Array.isArray(parsed.voted)) throw new Error('Invalid saved demo');
      const valid = parsed.issues.every(i => i && typeof i.id === 'string' && !Object.keys(D.validateReport(i)).length && D.STATUSES.includes(i.status) && D.TEAMS.includes(i.team) && Number.isInteger(i.votes) && i.votes >= 0 && Number.isFinite(Date.parse(i.createdAt)) && Number.isFinite(Date.parse(i.updatedAt)) && Array.isArray(i.history) && i.history.every(h => h && D.STATUSES.includes(h.status) && typeof h.note === 'string' && Number.isFinite(Date.parse(h.at))));
      if (!valid || new Set(parsed.issues.map(i => i.id)).size !== parsed.issues.length) throw new Error('Invalid saved issues');
      parsed.issues.forEach(i => { i.photo = safePhoto(i.photo); });
      parsed.voted = parsed.voted.filter(id => typeof id === 'string' && parsed.issues.some(i => i.id === id));
      return parsed;
    } catch (error) {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(fresh)); }
      catch (_) { storageAvailable = false; }
      setTimeout(() => toast(storageAvailable ? 'Unreadable saved demo data was reset.' : 'Browser storage is unavailable. Changes will last until this page closes.'), 300);
      return fresh;
    }
  }
  let state = loadState();
  try { authenticated = sessionStorage.getItem(CONFIG.sessionKey) === 'yes'; } catch (_) { /* Memory-only session. */ }
  if (!storageAvailable) document.querySelector('.demo-label').textContent = 'LOCAL DEMO · IN MEMORY';

  // Commit only if persistence succeeds; keep the report form intact on quota errors.
  function commit(change) {
    const previous = JSON.stringify(state);
    change();
    if (!storageAvailable) return true;
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); return true; }
    catch (_) {
      state = JSON.parse(previous);
      toast('Browser storage is full. Remove the photo or reset demo data before trying again.');
      return false;
    }
  }
  function slug(status) { return status.toLowerCase().replace(/ /g, '-'); }
  function badge(status) { return '<span class="badge"><span class="status-dot ' + slug(status) + '"></span>' + esc(status) + '</span>'; }
  function options(items, selected, placeholder) {
    return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') + items.map(item => '<option' + (item === selected ? ' selected' : '') + ' value="' + esc(item) + '">' + esc(item) + '</option>').join('');
  }
  function statsHTML() {
    const s = D.getStats(state.issues);
    return '<section class="stats" aria-label="Campus issue totals">' + [['Reported', s.reported], ['In Progress', s.inProgress], ['Resolved', s.resolved]].map(([label, value]) => '<button class="stat' + (filters.status === label ? ' selected' : '') + '" data-status="' + label + '" aria-pressed="' + (filters.status === label) + '"><span><span class="status-dot ' + slug(label) + '"></span>' + label + '</span><strong>' + value + '</strong></button>').join('') + '</section>';
  }
  function chipsHTML(type, values) {
    return '<div class="filter-group" role="group" aria-label="Filter by ' + type + '">' + values.map(value => '<button class="chip' + (filters[type] === value ? ' active' : '') + '" data-' + type + '="' + esc(value) + '" aria-pressed="' + (filters[type] === value) + '">' + esc(value) + '</button>').join('') + '</div>';
  }
  function searchHTML() { return '<div class="search">' + icon('search', 16) + '<label class="sr-only" for="search-issues">Search issues</label><input id="search-issues" type="search" placeholder="Search issues or locations…" value="' + esc(filters.query) + '" autocomplete="off"></div>'; }
  function sortHTML() { return '<label class="sr-only" for="sort-issues">Sort issues</label><select id="sort-issues" class="sort-select">' + [['votes', 'Most upvoted'], ['newest', 'Newest first'], ['oldest', 'Oldest first']].map(([v, label]) => '<option value="' + v + '"' + (filters.sort === v ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>'; }
  function cardHTML(issue) {
    const voted = state.voted.includes(issue.id);
    return '<article class="issue-card"><button class="vote-button' + (voted ? ' voted' : '') + '" data-vote="' + esc(issue.id) + '" aria-pressed="' + voted + '" aria-label="Upvote ' + esc(issue.title) + '">' + icon('arrow', 22) + '<span>' + issue.votes + '</span></button><div class="issue-content"><div class="issue-meta">' + badge(issue.status) + '<span>' + esc(issue.category.toUpperCase()) + ' · ' + D.relativeTime(issue.createdAt) + '</span></div><h3><button class="issue-title" data-detail="' + esc(issue.id) + '">' + esc(issue.title) + '</button></h3><p class="issue-description">' + esc(issue.description) + '</p><div class="issue-bottom"><span>' + icon('pin', 14) + esc(issue.location) + '</span>' + (issue.team !== 'Unassigned' ? '<span>' + icon('team', 15) + esc(issue.team) + '</span>' : '') + '</div>' + (safePhoto(issue.photo) ? '<img class="issue-photo" src="' + issue.photo + '" alt="Photo of ' + esc(issue.title) + '" loading="lazy">' : '') + '</div></article>';
  }
  function emptyHTML() { return '<div class="empty-state">' + icon('empty', 32) + '<h2>No issues found.</h2><p>Try another search or clear your filters.</p><button class="btn btn-small" data-action="clear-filters">Clear filters</button></div>'; }
  function renderFeed() {
    document.title = 'CampusFix — Report & track campus problems';
    main.innerHTML = '<section class="hero"><div><p class="eyebrow">Live campus status board</p><h1>Spotted something<br>broken? <span class="highlight">Flag it.</span></h1></div><a class="btn btn-primary" href="#/report">' + icon('plus', 20) + 'Report an issue</a></section>' + statsHTML() + '<section aria-label="Browse issues">' + chipsHTML('category', ['All categories', ...D.CATEGORIES]) + chipsHTML('status', ['Any status', ...D.STATUSES]) + '<div class="feed-tools">' + searchHTML() + sortHTML() + '<span id="result-count" class="result-count" role="status"></span></div><div id="issue-results" class="issue-list"></div></section>';
    renderResults();
  }
  function updateFilterButtons() {
    main.querySelectorAll('[data-category], [data-status]').forEach(button => {
      const type = button.hasAttribute('data-category') ? 'category' : 'status';
      const active = button.dataset[type] === filters[type];
      button.classList.toggle(button.classList.contains('stat') ? 'selected' : 'active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function renderResults() {
    const issues = D.filterIssues(state.issues, filters);
    const count = document.getElementById('result-count');
    if (count) count.textContent = issues.length + ' issue' + (issues.length === 1 ? '' : 's');
    const results = document.getElementById('issue-results');
    if (results) results.innerHTML = issues.length ? issues.map(cardHTML).join('') : emptyHTML();
    const table = document.getElementById('admin-results');
    if (table) table.innerHTML = issues.length ? adminTableHTML(issues) : emptyHTML();
    updateFilterButtons();
  }
  function renderReport() {
    document.title = 'Report an issue — CampusFix';
    photo = null;
    photoLoading = false;
    photoVersion++;
    main.innerHTML = '<div class="report-wrap"><div class="page-heading"><p class="eyebrow">See it. Report it. Track it.</p><h1>Report an issue</h1><p>Tell us what’s wrong. A little detail helps the right team get it fixed.</p></div><form id="report-form" class="panel" novalidate>' + fieldHTML('title', 'Title', '<input id="title" name="title" placeholder="e.g. Broken power socket" maxlength="100" minlength="3" required>') + fieldHTML('location', 'Location', '<input id="location" name="location" placeholder="e.g. Central Library, 1st floor, desk 12" maxlength="120" required>') + fieldHTML('description', 'Description', '<textarea id="description" name="description" placeholder="What’s happening? Since when?" maxlength="2000" minlength="10" required></textarea>') + '<section class="triage" aria-label="Category and duplicate helper"><div class="triage-heading"><strong>' + icon('sparkles', 20) + 'Smart triage</strong><button class="btn btn-small" type="button" data-action="triage">' + icon('sparkles', 14) + 'Suggest category & check duplicates</button></div><p class="triage-note">Offline keyword suggestions. Review the category before submitting.</p><div id="triage-result" role="status"></div></section>' + fieldHTML('category', 'Category', '<select id="category" name="category" required>' + options(D.CATEGORIES, '', 'Select a category…') + '</select>') + '<div class="field"><span class="field-label">Photo (optional)</span><label class="upload-box" for="photo">' + icon('photo', 26) + '<span>Tap to add a photo</span><small>JPG, PNG, WEBP or GIF · up to 2 MB</small><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Add a photo" aria-describedby="photo-error"></label><p id="photo-error" class="error-text" role="alert"></p><div id="photo-preview" class="photo-preview" hidden></div></div><div class="form-footer"><p>Reports are public within this browser’s demo. Avoid adding personal information.</p><button class="btn btn-primary" type="submit">' + icon('plus', 18) + 'Submit report</button></div></form></div>';
  }
  function fieldHTML(id, label, input) { return '<div class="field"><label for="' + id + '">' + label + '</label>' + input.replace('id="' + id + '"', 'id="' + id + '" aria-describedby="' + id + '-error"') + '<p class="error-text" id="' + id + '-error" role="alert"></p></div>'; }
  function renderLogin() {
    document.title = 'Admin access — CampusFix';
    main.innerHTML = '<div class="login-wrap"><form id="login-form" class="panel"><h1>' + icon('lock', 24) + 'Admin access</h1><label for="passcode" class="sr-only">Admin passcode</label><input id="passcode" type="password" placeholder="Passcode" autocomplete="off" required aria-describedby="login-error"><p id="login-error" class="error-text" role="alert"></p><button class="btn btn-primary" type="submit">Enter dashboard</button></form><p class="login-note">Try the demo with passcode <code>campusfix123</code><br>This is a browser-local demo, with a demo access gate.</p></div>';
  }
  function renderAdmin() {
    if (!authenticated) { renderLogin(); return; }
    document.title = 'Admin dashboard — CampusFix';
    main.innerHTML = '<div class="demo-banner">' + icon('info', 17) + '<span><strong>Demo workspace.</strong> Changes are stored in this browser. The demo passcode is visible in the source; it is not production authentication.</span></div><section class="admin-heading"><div><p class="eyebrow">Campus operations / Admin</p><h1>Keep campus moving.</h1><p>Small problems. Clear ownership. Visible progress.</p></div><div class="button-row"><button class="btn btn-small" data-action="export">' + icon('download', 16) + 'Export CSV</button><button class="btn btn-small btn-quiet" data-action="logout">' + icon('logout', 15) + 'Sign out</button></div></section>' + statsHTML() + '<section aria-labelledby="queue-title"><div class="section-title"><h2 id="queue-title">Issue queue</h2><span id="result-count" class="result-count" role="status"></span></div><div class="admin-tools">' + searchHTML() + '<label class="sr-only" for="admin-category">Filter category</label><select id="admin-category">' + options(['All categories', ...D.CATEGORIES], filters.category) + '</select>' + sortHTML() + '</div>' + chipsHTML('status', ['Any status', ...D.STATUSES]) + '<div id="admin-results"></div></section><section class="activity-panel" aria-labelledby="activity-title"><div class="section-title"><h2 id="activity-title">Recent activity</h2><span class="eyebrow" style="margin:0">Latest updates</span></div><div class="activity-grid">' + activityHTML() + '</div></section><div class="admin-bottom"><span>Open an issue to view its full history. CSV includes the current filtered results.</span><button class="btn btn-small btn-quiet btn-danger" data-action="reset">Reset demo data</button></div>';
    renderResults();
  }
  function adminTableHTML(issues) {
    return '<div class="table-wrap"><table><thead><tr><th scope="col">Issue / Location</th><th scope="col">Upvotes</th><th scope="col">Status</th><th scope="col">Assigned team</th><th scope="col">Updated</th></tr></thead><tbody>' + issues.map(i => '<tr><td><button class="issue-title" data-detail="' + esc(i.id) + '">' + esc(i.title) + '</button><div class="table-meta">' + esc(i.category) + ' · ' + esc(i.id) + '</div><span class="table-location">' + esc(i.location) + '</span></td><td class="priority-cell">↑ ' + i.votes + '</td><td><label class="sr-only" for="status-' + esc(i.id) + '">Status for ' + esc(i.title) + '</label><select id="status-' + esc(i.id) + '" data-update="status" data-id="' + esc(i.id) + '">' + options(D.STATUSES, i.status) + '</select></td><td><label class="sr-only" for="team-' + esc(i.id) + '">Team for ' + esc(i.title) + '</label><select id="team-' + esc(i.id) + '" data-update="team" data-id="' + esc(i.id) + '">' + options(D.TEAMS, i.team) + '</select></td><td class="mono muted" style="font-size:10px;white-space:nowrap">' + D.relativeTime(i.updatedAt) + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function activityHTML() {
    const updates = state.issues.flatMap(i => i.history.map(h => ({ ...h, issue: i }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 4);
    return updates.map(h => '<article class="activity-item"><strong>' + esc(h.issue.title) + '</strong>' + badge(h.status) + '<p>' + esc(h.note) + ' · ' + D.relativeTime(h.at) + '</p></article>').join('');
  }
  function readRoute() {
    if (location.hash === '#main') return route;
    const candidate = location.hash.replace(/^#\/?/, '') || location.pathname.replace(/^\/+|\/+$/g, '');
    return ['feed', 'report', 'admin'].includes(candidate) ? candidate : 'feed';
  }
  function renderRoute(focus = false) {
    route = readRoute();
    document.querySelectorAll('[data-nav]').forEach(link => { link.classList.toggle('active', link.dataset.nav === route); if (link.dataset.nav === route) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    if (route === 'feed') renderFeed();
    else if (route === 'report') renderReport();
    else renderAdmin();
    if (focus) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  function navigate(destination) {
    if (location.hash === '#/' + destination) renderRoute(true);
    else location.hash = '#/' + destination;
  }
  function toggleVote(id) {
    const issue = state.issues.find(i => i.id === id);
    if (!issue) return;
    const hadVote = state.voted.includes(id);
    if (!commit(() => { issue.votes = Math.max(0, issue.votes + (hadVote ? -1 : 1)); state.voted = hadVote ? state.voted.filter(v => v !== id) : [...state.voted, id]; })) return;
    renderResults();
    toast(hadVote ? 'Your upvote was removed.' : 'Upvoted. You’re helping this issue get noticed.');
  }
  function openDetail(id) {
    const issue = state.issues.find(i => i.id === id);
    if (!issue) return;
    const dialog = document.getElementById('issue-dialog');
    dialog.innerHTML = '<div class="dialog-top"><div><p class="eyebrow">' + esc(issue.id) + ' · ' + esc(issue.category) + '</p><h2 id="dialog-title">' + esc(issue.title) + '</h2></div><button class="close-button" data-action="close-dialog" aria-label="Close issue details">' + icon('close') + '</button></div>' + badge(issue.status) + '<p class="dialog-description">' + esc(issue.description) + '</p><div class="dialog-facts"><span>' + icon('pin', 13) + ' ' + esc(issue.location) + '</span><span>' + icon('team', 13) + ' ' + esc(issue.team) + '</span><span>↑ ' + issue.votes + ' upvotes</span></div>' + (safePhoto(issue.photo) ? '<img class="issue-photo" src="' + issue.photo + '" alt="Photo of ' + esc(issue.title) + '">' : '') + '<section class="timeline"><h3>Issue history</h3>' + [...issue.history].reverse().map(h => '<div class="timeline-item"><strong>' + esc(h.status) + '</strong><p>' + esc(h.note) + '</p><time datetime="' + esc(h.at) + '">' + esc(new Date(h.at).toLocaleString()) + '</time></div>').join('') + '</section><div class="dialog-actions"><button class="btn btn-small" data-action="close-dialog">Close</button></div>';
    dialog.showModal();
  }
  function reportData() {
    const form = document.getElementById('report-form');
    return Object.fromEntries(['title', 'location', 'description', 'category'].map(key => [key, form.elements[key].value.trim()]));
  }
  function triage() {
    const data = reportData();
    if (data.title.length < 3) { toast('Add an issue title first.'); document.getElementById('title').focus(); return; }
    const category = D.suggestCategory(data.title + ' ' + data.description);
    document.getElementById('category').value = category;
    document.getElementById('category').removeAttribute('aria-invalid');
    document.getElementById('category-error').textContent = '';
    const duplicates = D.findDuplicates(state.issues, data.title, data.location);
    const result = document.getElementById('triage-result');
    result.className = 'triage-result';
    result.innerHTML = '<p>Suggested category: <strong>' + esc(category) + '</strong>. ' + (duplicates.length ? 'These existing reports may be related:' : 'No close matches found. You can submit a new report.') + '</p>' + duplicates.map(i => '<button type="button" class="duplicate" data-detail="' + esc(i.id) + '">' + esc(i.title) + ' — ' + esc(i.location) + '</button>').join('');
  }
  function showPhotoError(message) { document.getElementById('photo-error').textContent = message; }
  function loadPhoto(file) {
    const request = ++photoVersion;
    photo = null;
    photoLoading = false;
    document.getElementById('photo-preview').hidden = true;
    showPhotoError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > CONFIG.maxPhotoBytes) {
      showPhotoError('Choose a JPG, PNG, WEBP or GIF image no larger than 2 MB.');
      document.getElementById('photo').value = '';
      return;
    }
    photoLoading = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (request !== photoVersion || route !== 'report') return;
      const value = safePhoto(reader.result);
      const image = new Image();
      image.onload = () => {
        if (request !== photoVersion || route !== 'report') return;
        photoLoading = false;
        photo = value;
        const preview = document.getElementById('photo-preview');
        preview.innerHTML = '<img src="' + value + '" alt="Selected report photo"><button class="btn btn-small" type="button" data-action="remove-photo">Remove photo</button>';
        preview.hidden = false;
      };
      image.onerror = () => { if (request === photoVersion && route === 'report') { photoLoading = false; showPhotoError('This image could not be read. Try another photo.'); document.getElementById('photo').value = ''; } };
      if (value) image.src = value;
      else { photoLoading = false; showPhotoError('This image could not be read.'); }
    };
    reader.onerror = () => { if (request === photoVersion && route === 'report') { photoLoading = false; showPhotoError('The file could not be read. Please try again.'); } };
    reader.readAsDataURL(file);
  }
  function submitReport() {
    const data = reportData();
    const errors = D.validateReport(data);
    for (const key of ['title', 'location', 'description', 'category']) {
      document.getElementById(key + '-error').textContent = errors[key] || '';
      document.getElementById(key).setAttribute('aria-invalid', String(Boolean(errors[key])));
    }
    if (Object.keys(errors).length) { document.getElementById(Object.keys(errors)[0]).focus(); return; }
    if (photoLoading) { toast('Please wait for the photo to finish loading.'); return; }
    const at = new Date().toISOString();
    const id = 'CF-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8).toUpperCase() : Date.now().toString(36).toUpperCase());
    const issue = { ...data, id, status: 'Reported', team: 'Unassigned', votes: 1, photo, createdAt: at, updatedAt: at, history: [{ status: 'Reported', note: 'Issue reported by a student.', at }] };
    if (!commit(() => { state.issues.unshift(issue); state.voted.push(id); })) return;
    photo = null;
    nextRouteFilters = { ...defaultFilters(), sort: 'newest' };
    navigate('feed');
    toast('Report submitted. Track the fix here.');
  }
  function updateIssue(id, key, value) {
    if (!authenticated || !['status', 'team'].includes(key)) return;
    if (!(key === 'status' ? D.STATUSES : D.TEAMS).includes(value)) return;
    const issue = state.issues.find(i => i.id === id);
    if (!issue || issue[key] === value) return;
    const at = new Date().toISOString();
    if (!commit(() => {
      issue[key] = value;
      issue.updatedAt = at;
      issue.history.push({ status: issue.status, note: key === 'status' ? 'Status changed to ' + value + '.' : value === 'Unassigned' ? 'Team assignment removed.' : 'Assigned to ' + value + '.', at });
    })) { renderAdmin(); return; }
    renderAdmin();
    toast(key === 'status' ? 'Issue status updated.' : 'Team assignment updated.');
  }
  function exportCSV() {
    if (!authenticated) return;
    // Quoted cells also neutralize spreadsheet formulas in student-supplied text.
    const csvCell = value => '"' + String(value == null ? '' : value).replace(/^[\s]*[=+@-]/, match => "'" + match).replace(/"/g, '""') + '"';
    const rows = [['ID', 'Title', 'Description', 'Category', 'Location', 'Status', 'Team', 'Upvotes', 'Created', 'Updated'], ...D.filterIssues(state.issues, filters).map(i => [i.id, i.title, i.description, i.category, i.location, i.status, i.team, i.votes, i.createdAt, i.updatedAt])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'campusfix-issues-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('CSV export downloaded.');
  }
  function confirmReset() {
    if (!authenticated) return;
    const dialog = document.getElementById('confirm-dialog');
    dialog.innerHTML = '<h2 id="confirm-title">Reset this demo?</h2><p class="dialog-description">This removes reports, photos, votes, and changes in this browser and restores the five sample issues. Download a CSV first if you want to keep a copy.</p><div class="dialog-actions"><button class="btn btn-small" data-action="cancel-reset">Cancel</button><button class="btn btn-small btn-primary" data-action="confirm-reset">Reset demo</button></div>';
    dialog.showModal();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.vote) { toggleVote(button.dataset.vote); return; }
    if (button.dataset.detail) { openDetail(button.dataset.detail); return; }
    if (button.hasAttribute('data-category') || button.hasAttribute('data-status')) {
      const key = button.hasAttribute('data-category') ? 'category' : 'status';
      filters[key] = button.dataset[key];
      renderResults();
      return;
    }
    const action = button.dataset.action;
    if (action === 'clear-filters') { filters = defaultFilters(); route === 'admin' ? renderAdmin() : renderFeed(); }
    if (action === 'triage') triage();
    if (action === 'remove-photo') { photo = null; photoLoading = false; photoVersion++; document.getElementById('photo').value = ''; document.getElementById('photo-preview').hidden = true; showPhotoError(''); }
    if (action === 'close-dialog') document.getElementById('issue-dialog').close();
    if (action === 'export') exportCSV();
    if (action === 'logout') { authenticated = false; try { sessionStorage.removeItem(CONFIG.sessionKey); } catch (_) { /* No persistent session. */ } renderLogin(); toast('Signed out of the demo dashboard.'); }
    if (action === 'reset') confirmReset();
    if (action === 'cancel-reset') document.getElementById('confirm-dialog').close();
    if (action === 'confirm-reset' && authenticated) {
      if (commit(() => { state = { version: 1, issues: D.createSeedIssues(), voted: [] }; })) { document.getElementById('confirm-dialog').close(); filters = defaultFilters(); renderAdmin(); toast('Demo reset. Sample issues restored.'); }
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'search-issues') { filters.query = event.target.value; renderResults(); }
    if (event.target.closest('#report-form')) {
      const error = document.getElementById(event.target.id + '-error');
      if (error) { error.textContent = ''; event.target.removeAttribute('aria-invalid'); }
      if (['title', 'description', 'location'].includes(event.target.id)) { document.getElementById('triage-result').textContent = ''; document.getElementById('triage-result').className = ''; }
    }
  });
  document.addEventListener('change', event => {
    const node = event.target;
    if (node.id === 'sort-issues') { filters.sort = node.value; renderResults(); }
    if (node.id === 'admin-category') { filters.category = node.value; renderResults(); }
    if (node.id === 'photo') loadPhoto(node.files[0]);
    if (node.dataset.update) updateIssue(node.dataset.id, node.dataset.update, node.value);
  });
  document.addEventListener('submit', event => {
    if (event.target.id === 'report-form') { event.preventDefault(); submitReport(); }
    if (event.target.id === 'login-form') {
      event.preventDefault();
      const input = document.getElementById('passcode');
      if (input.value !== CONFIG.demoPasscode) { document.getElementById('login-error').textContent = 'Incorrect demo passcode. Try campusfix123.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      authenticated = true;
      try { sessionStorage.setItem(CONFIG.sessionKey, 'yes'); } catch (_) { /* Session remains in memory. */ }
      filters = defaultFilters();
      renderAdmin();
      main.focus({ preventScroll: true });
      toast('Welcome to the CampusFix demo dashboard.');
    }
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#main') return;
    filters = nextRouteFilters || defaultFilters();
    nextRouteFilters = null;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    renderRoute(true);
  });
  window.addEventListener('storage', event => {
    if (event.key !== CONFIG.storageKey) return;
    state = loadState();
    if (route !== 'report') renderRoute();
    toast('Campus issues updated in another tab.');
  });
  renderRoute();
})();
