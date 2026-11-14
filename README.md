# WhereCamp

Unconferences at the intersection of geography, technology, design, and culture.

The Where 2.0 Conference is no more, but we still need a place and time where people fascinated by the power of location technology can gather to share ideas, show off projects, and connect our community. WhereCamps are a distributed unconference held in different cities. Each one is a free event where anyone can come to talk about geo. Between 2007 and 2015 there were 38 camps in 20 cities on 4 continents, and now we're bringing them back.

**Website:** https://ajturner.github.io/wherecamp/

## Propose and vote on the next camp

- **Propose:** click anywhere on the [site map](https://ajturner.github.io/wherecamp/#map), or [open a proposal](https://github.com/ajturner/wherecamp/issues/new?template=propose-location.yml) directly. Proposals are GitHub issues labelled `proposed-location`.
- **Vote:** add a 👍 reaction to a proposal. The site ranks proposals by 👍 and sizes their pins on the map.
- Proposals without valid coordinates wash up on [Null Island](https://en.wikipedia.org/wiki/Null_Island) (0°N, 0°E), like every other bad geocode.

## Run a camp

Anyone can run a camp. It typically needs:
- a venue for 30–50 people, depending on how much geo your city can muster
- Wi-Fi and power
- sticky notes and markers
- a lot of energy

When you have a date and venue, add your camp to [`wherecamps.geojson`](wherecamps.geojson) and open a pull request. Use one `Feature` per event. The required properties are `eventName`, `startDate` and `endDate` (`YYYY-MM-DD`). Optional properties are `url`, `venueName`, `venueLocality`, `venueCountry`, `series` and `color`. The site shows it as **upcoming** until its end date, then moves it to the archive automatically.

## What is the event like?

WhereCamp builds on the ideas behind [FooCamp](http://wiki.oreillynet.com/foocamp06/index.cgi), except that anyone can attend. It's an unconference, so the attendees decide the sessions on the day instead of following a set schedule. The event is what you make of it, and only as fun as the people who come, so be ready to speak and contribute. If you're not sure what that looks like, read up on FooCamp and BarCamp. These events are a big shift from conventional conferences, and they use specific tools to invite and encourage participation, pioneered by Allen Gunn among others.

## The website

It's a plain static site (`index.html`, `styles.css`, `script.js`) served by GitHub Pages from the repository root. There is no build step.
- **Map:** [MapLibre GL JS](https://maplibre.org/) with [OpenFreeMap](https://openfreemap.org/) tiles. No API keys needed.
- **Camp data:** [`wherecamps.geojson`](wherecamps.geojson), adapted from [reidab/wherecamp.org](https://github.com/reidab/wherecamp.org).
- **Proposals:** read from the public GitHub Issues API and cached in the browser for 10 minutes.
- **Run it locally:** `python3 -m http.server`, then open http://localhost:8000.

## Archives and link checks

[`archives.html`](archives.html) lists every past camp with its site, plus session notes, write-ups and slides from [`archives.json`](archives.json). To add an item, add an entry with `camp` (the camp's `eventName`, or `All camps`), `title`, `type` (`notes`, `write-up`, `slides` or `video`), `url`, and optionally `author` and `date`.

Old camp sites disappear, so `scripts/check_links.py` tests every link in `wherecamps.geojson` and `archives.json`. A link counts as live only if the page still mentions WhereCamp, because old domains get re-registered. For each dead link it finds the Internet Archive copy closest to the event date. The "Check camp links" workflow runs it on pull requests that change the data. Run it with `--fix` to rewrite dead links; the old address is kept as `originalUrl`.

## Builds and previews

The Pages workflow (`.github/workflows/pages.yml`, `scripts/build-pages.mjs`) publishes three things on every push to `master` and every pull request event:
- the live site from `master` at the site root;
- a preview of every open pull request under `pr/<number>/`;
- a listing at `builds/`: `master`, then each open pull request with what the change is for, a link to view its build and a link to the pull request.

A bar across the bottom of a preview names the pull request and links back to it and to the listing. The workflow runs nothing from a pull request, and pull requests from forks are listed without a preview. The pattern comes from [ajturner/tutti-music](https://github.com/ajturner/tutti-music). To try it locally:

```sh
gh pr list --state open --json number,title,body,author,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository,url,updatedAt,additions,deletions,changedFiles,reviewDecision,labels > /tmp/prs.json
node scripts/build-pages.mjs --out /tmp/site --prs /tmp/prs.json --repo ajturner/wherecamp
python3 -m http.server -d /tmp/site
```

**Maintainer setup:**
1. In Settings → Pages, set the source to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` deploys the site on every push to `master`.
2. Create the `proposed-location` label.

This work is licensed under a [Creative Commons Attribution-ShareAlike 3.0 Unported License](http://creativecommons.org/licenses/by-sa/3.0/)
