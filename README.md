# WhereCamp

Unconferences at the intersection of geography, technology, design, and culture.

The Where 2.0 Conference is no more, but we still need a place and time where people fascinated by the power of location technology can gather to share ideas, show off projects, and connect our community. WhereCamps are a distributed unconference held in different cities. Each one is a free event where anyone can come to talk about geo. Between 2007 and 2015 there were 38 camps in 20 cities on 4 continents, and now we're bringing them back.

**Website:** https://wherecamp.github.io/wherecamp/

## Propose and vote on the next camp

- **Propose:** click anywhere on the [site map](https://wherecamp.github.io/wherecamp/#map), or [open a proposal](https://github.com/wherecamp/wherecamp/issues/new?template=propose-location.yml) directly. Proposals are GitHub issues labelled `proposed-location`.
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

**Maintainer setup:**
1. Enable Pages in Settings → Pages: deploy from branch `master`, folder `/`.
2. Create the `proposed-location` label.

This work is licensed under a [Creative Commons Attribution-ShareAlike 3.0 Unported License](http://creativecommons.org/licenses/by-sa/3.0/)
