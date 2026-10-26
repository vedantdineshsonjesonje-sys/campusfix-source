# CampusFix

A runnable recreation inspired by the public [CampusFix website](https://campus-fixup-hub.lovable.app/admin). This is newly written HTML, CSS, and JavaScript, not an export of the original Lovable repository. The original protected admin dashboard was not available for inspection.

## Open the website

1. Extract the ZIP file.
2. Open the extracted `campusfix-source` folder.
3. Double-click `index.html` in a modern browser.

No installation, API keys, or internet connection are needed for the website. The pages use hash links such as `#/feed`, `#/report`, and `#/admin` so navigation also works when opened directly.

For a local web server, install Node.js 18 or newer, open a terminal in the project folder, and run:

```sh
npm start
```

Open **http://127.0.0.1:4173**. Direct links to `/admin` and `/report` also work with this server. To choose another port:

```sh
npm start -- --port 4200
```

Stop the server with Ctrl+C. There are no npm dependencies, so `npm install` is unnecessary.

## Try the demo

- Browse sample campus issues; search, filter by category or status, and sort them.
- Upvote an issue. Each browser can toggle its own vote.
- Submit a report with a title, location, description, category, and optional photo.
- Use the triage helper for keyword-based category suggestions and possible duplicate reports. It runs locally and does not call an AI service.
- Open Admin and enter **`campusfix123`**. Change status, assign a team, and review issue history. Export issues to CSV, reset the sample data, or log out.

Photos may be JPEG, PNG, WebP, or GIF and must be no larger than **2 MB**. Browser storage has limited space; remove large photos or reset demo data if it fills up.

Reports, votes, and changes are saved in this browser's `localStorage`. They are not shared with other people, devices, or browsers. A file opened directly and the local server use separate browser storage. Private browsing or clearing browser data may erase the demo.

## Edit the code

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and script loading |
| `styles.css` | Responsive yellow, cream, and black design |
| `app.js` | Feed, report form, admin dashboard, storage, and demo passcode |
| `data.js` | Sample issues, filtering, validation, suggestions, and statistics |
| `server.cjs` | Optional dependency-free local server |
| `tests/` | Node tests for data logic and server behavior |

Change the demo passcode in `app.js`. The passcode is visible in the source: it only demonstrates the admin flow and does **not** provide production authentication.

Run the checks with Node installed:

```sh
npm run check
npm test
```

## Before a real campus launch

Add a shared backend and database, server-side authentication and admin role checks, validated upload storage, and rate limiting. Replace the local triage rules with a server API if you need AI classification. Enforce all permissions and validation on the server; changing a browser-side passcode is insufficient.

The ZIP contains editable source, instructions, and tests. It excludes `node_modules`, secrets, and the original site's private data.
