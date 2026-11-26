<img src="docs/app-icon.png" width="96" align="right" alt="App icon">

# I-5 Express for the Web

[![Test and deploy](https://github.com/andrewmacheret/i5-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/andrewmacheret/i5-web/actions/workflows/deploy.yml) [![Canary](https://github.com/andrewmacheret/i5-web/actions/workflows/canary.yml/badge.svg)](https://github.com/andrewmacheret/i5-web/actions/workflows/canary.yml) [![License](https://img.shields.io/badge/license-MIT-lightgray.svg)](https://github.com/andrewmacheret/i5-web/blob/main/LICENSE.md)

A web page that shows which way Seattle's I-5 express lanes are running right now, and whether they're open at all. It also serves a live badge that any site or README can show:

[![I-5 express lanes status](https://i5.andrewmacheret.com/badge.svg)](https://andrewmacheret.com/projects/i5/)

Live at [andrewmacheret.com/projects/i5](https://andrewmacheret.com/projects/i5/).

It's the web version of [i5-macos-menubar](https://github.com/andrewmacheret/i5-macos-menubar) and [i5-android](https://github.com/andrewmacheret/i5-android), and uses the same rules.

![The page showing the lanes northbound, closing early at 9 PM, with timelines for today and tomorrow](public/screenshot.png)

## Features

The page has the same sections as the Mac popover and the Android app screen:

- **Status:** green **N** for northbound, blue **S** for southbound, red **✕** for closed, and what happens next, like "Closes at 9:00 PM · 5h 24m". An amber dot on the icon means the lanes switch within 15 minutes.
- **Can't confirm:** an amber **⚠** replaces the direction whenever the status can't be trusted, with each reason and links to live sources. See [When to trust it](#when-to-trust-it).
- **Notices:** closures in effect now, tonight's early closure, and old WSDOT notices, grayed out.
- **Timelines:** colored bars for today and tomorrow, with a marker for now.
- **Coming up:** the next four changes with countdowns. A ⚠ marks days that may not follow the regular schedule.
- **Planned changes:** weekend closures, early closing dates, and holidays in the next two weeks.
- **Regular schedule and sources:** the weekly schedule as WSDOT posts it, and links to every page the data comes from.
- **Badge for your site:** builds the Markdown or HTML for the badge below.

Times are always Seattle time. If your browser uses another time zone, the page says so.

The page updates itself every 15 seconds and asks the server for new data every 5 minutes. It remembers the last copy it got, so it shows something right away and keeps working offline, until that copy is 2 hours old.

There are no notifications or home screen icon. Use the Mac or Android app for those.

To see the page at another moment, add `?now=` with a time, like [`?now=2026-11-26T10:00-08:00`](https://andrewmacheret.com/projects/i5/?now=2026-11-26T10:00-08:00) for Thanksgiving morning. It uses today's data from WSDOT.

## Badge

Put this in a README or web page:

```markdown
[![I-5 express lanes status](https://i5.andrewmacheret.com/badge.svg)](https://andrewmacheret.com/projects/i5/)
```

| URL | Looks like |
| --- | --- |
| `https://i5.andrewmacheret.com/badge.svg` | ![badge](https://i5.andrewmacheret.com/badge.svg) |
| `https://i5.andrewmacheret.com/badge.svg?time=0` | ![badge without time](https://i5.andrewmacheret.com/badge.svg?time=0) |
| `https://i5.andrewmacheret.com/badge.svg?style=flat-square` | ![square badge](https://i5.andrewmacheret.com/badge.svg?style=flat-square) |
| `https://i5.andrewmacheret.com/icon.svg?size=40` | ![icon](https://i5.andrewmacheret.com/icon.svg?size=40) |

- `time=0` leaves off when the lanes change next.
- `style=flat-square` gives square corners, like shields.io's style of the same name.
- `label=` changes the gray text on the left, up to 60 characters.
- `/icon.svg` is the apps' icon. `size=` sets its height in pixels, from 12 to 256, and defaults to 20.

The badge says "can't confirm" in amber whenever the page would. It's sent with `Cache-Control: no-cache` and an ETag, so GitHub's image proxy checks back on every view instead of keeping an old copy.

## API

`GET https://i5.andrewmacheret.com/status` returns what the server last read from WSDOT, as JSON. Anyone can call it from a browser (`Access-Control-Allow-Origin: *`).

| Field | What it is |
| --- | --- |
| `info` | The parsed page: `schedule`, `earlyCloses`, `events` (with exact `closure` times when the page gives them), `advisories` and `warnings`. Null until the server has read a good copy. |
| `fetchedAt` | When `info` was read from WSDOT |
| `checkedAt` | When the server last tried. Later than `fetchedAt` means the last try failed and `info` is the last good copy. |
| `error` | Why the last try failed |
| `pageChanged`, `problems` | WSDOT's page loaded but couldn't be read, and what was wrong with it. Stays set until a good page comes in. |
| `current` | What it all means when the response was made: `verdict` (`confident` or `uncertain`), `scheduled`, `shown` (null unless confident), `next` and `concerns` |

Times are milliseconds since 1970. Days are Seattle dates like `"2026-11-26"`. Times of day are minutes after midnight. Use `current.shown`, not `current.scheduled`, if you only want a direction when it's safe to trust.

## When to trust it

WSDOT doesn't publish a live feed for the express lanes. The server reads [WSDOT's express lanes page](https://wsdot.wa.gov/travel/roads-bridges/express-lanes) every 15 minutes and works out the status from the posted schedule, early closures and planned closures.

It only shows **N**, **S** or **✕** when all of these are true:

- The server read WSDOT's page in the last 2 hours.
- Every part of the page made sense. A new section or a line it can't read counts as a problem.
- The schedule itself looks sane, with no overlapping or backwards time ranges.
- Nothing on the page suggests today is different. That includes notices dated today, undated notices, and planned closures today without exact times.
- If today closes early, the page gives the closing time.
- Today isn't a holiday. WSDOT doesn't post holiday hours.

Otherwise it shows an amber **⚠**, explains why, and links to the [travel map](https://wsdot.com/travel/real-time/map/) and [@wsdot_traffic](https://x.com/wsdot_traffic) so you can check a live source.

If WSDOT can't be reached, the server keeps the last good copy of the page, and the page shows ⚠ once that copy is more than 2 hours old. If WSDOT's page changes into something it can't read, it shows ⚠ until a good copy comes in again.

It can't know about a closure WSDOT hasn't posted yet, like an emergency repair announced only on social media.

## How it works

- `src/core` is TypeScript with no browser or AWS code, ported from the apps. It reads WSDOT's page (`parser.ts`), works out the status at any moment (`engine.ts`), decides whether the status can be trusted (`trust.ts`), and draws the icon (`icon.ts`). The page and the Lambda both use it.
- `src/web` is the page (React and Vite), deployed to `s3://andrewmacheret.com/projects/i5`.
- `src/lambda` is a Node.js AWS Lambda called `I5Express`, behind an API Gateway HTTP API at `i5.andrewmacheret.com`. The API's stage settings, which aren't in git, limit it to 20 requests a second with bursts of 40.
  - An EventBridge rule sends it `{"refresh": true}` every 15 minutes. It downloads WSDOT's page, about 140 KB, and saves what it read to `state.json` in the private S3 bucket `andrewmacheret-i5`, with the raw page beside it. An unreadable page is saved as `unreadable.html` instead, so the last good copy stays.
  - `GET /status`, `/badge.svg` and `/icon.svg` read that file, checking S3 again after a minute. If the schedule hasn't run in 30 minutes, a request reads WSDOT itself.
  - The badge measures its text with a table of Verdana widths, like shields.io. `scripts/verdana-widths.swift` makes the table on a Mac.

Tests run against a saved copy of WSDOT's page in `test/fixtures`, the same one the apps use.

## Development

You need Node.js 24 or later.

| Command | What it does |
| --- | --- |
| `npm install` | Install the dependencies |
| `npm test` | Run the parser, schedule, trust, badge and API tests |
| `npm run typecheck` | Check the TypeScript types |
| `npm run api` | Run the API on [localhost:8787](http://localhost:8787/status), reading WSDOT from your computer. Add `-- --fixture` to use the saved page instead. |
| `npm run dev` | Run the page on [localhost:5173](http://localhost:5173), using the local API |
| `npm run build` | Build the page into `dist/` |
| `npm run build:lambda` | Bundle the Lambda into `dist-lambda/index.mjs` |

Add `?api=` to the page's address to use another copy of the API, like `?api=https://i5.andrewmacheret.com` to run the local page against the real one.

## Health check

Once a day, the Canary workflow (`.github/workflows/canary.yml`) checks the page and its scripts and styles, the README badge, and the API's own health check, which fails if the 15 minute refresh stopped or can't read WSDOT's page. It's started by [andrewmacheret/canary](https://github.com/andrewmacheret/canary).

## Deploy

Pushes to `main` run the tests, then GitHub Actions ([`deploy.yml`](.github/workflows/deploy.yml)) updates the Lambda, has it read WSDOT once, uploads the page and clears the CloudFront cache. To redeploy without a code change, use "Run workflow" on the Actions tab.

The workflow signs in to AWS with GitHub OIDC, using the IAM role `GitHubDeployI5Web` in the `AWS_ROLE_ARN` repo variable. The Lambda runs as `I5ExpressLambda`, which can only read and write the `andrewmacheret-i5` bucket and write its logs.

## Built with LLM tools

This project was written with LLM coding tools: an AI agent in [Cursor](https://cursor.com) wrote the code, tests and this README, directed by a human. Treat it like any other code from the internet and read it before you rely on it.

## Not affiliated with WSDOT

This is a personal project. Schedule data comes from the Washington State Department of Transportation. Always follow posted signs on the road.

## License

[MIT](LICENSE.md)
