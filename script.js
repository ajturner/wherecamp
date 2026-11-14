/* WhereCamp site script: vanilla JS, no build step.
 * Data:      wherecamps.geojson (past + upcoming camps, PR-editable)
 * Proposals: GitHub issues labelled "proposed-location"; 👍 reactions = votes
 */
(() => {
  "use strict";

  const REPO = "ajturner/wherecamp";
  const PROPOSAL_LABEL = "proposed-location";
  const ISSUES_API = `https://api.github.com/repos/${REPO}/issues?labels=${PROPOSAL_LABEL}&state=open&per_page=100`;
  const CACHE_KEY = "wherecamp:proposals:v1";
  const CACHE_MS = 10 * 60 * 1000;
  const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CONTINENT = {
    USA: "North America", Canada: "North America", "United Kingdom": "Europe", Germany: "Europe",
    "The Netherlands": "Europe", Italy: "Europe", Taiwan: "Asia", Kenya: "Africa", Ethiopia: "Africa",
  };

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const year = (d) => (d ? d.slice(0, 4) : "");
  const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d + "T12:00:00Z");
    return dt.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  };
  const fmtCoord = (lat, lng) =>
    `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;
  const todayISO = new Date().toISOString().slice(0, 10);

  function proposeUrl(lat, lng, place) {
    const p = new URLSearchParams({ template: "propose-location.yml" });
    if (lat != null) {
      p.set("title", `[Proposal] WhereCamp ${place || `near ${lat.toFixed(2)}, ${lng.toFixed(2)}`}`);
      p.set("latitude", lat.toFixed(4));
      p.set("longitude", lng.toFixed(4));
      if (place) p.set("city", place);
    }
    return `https://github.com/${REPO}/issues/new?${p}`;
  }

  /* ---------- nav ---------- */
  function initNav() {
    const nav = $("#top-nav");
    const toggle = $(".nav__toggle");
    const links = $("#nav-links");
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });

    const anchors = [...links.querySelectorAll('a[href^="#"]')];
    const byId = new Map(anchors.map((a) => [a.getAttribute("href").slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && byId.has(en.target.id)) {
          anchors.forEach((a) => a.classList.remove("active"));
          byId.get(en.target.id).classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ---------- hero graticule ---------- */
  function initHero(points) {
    const canvas = $(".hero__grid");
    const hero = $(".hero");
    const out = $("#hero-coords");
    const place = $("#hero-place");
    const ctx = canvas.getContext("2d");
    let w, h, s, cx, cy, raf = null, visible = true;

    const project = (lng, lat) => [cx + lng * s, cy - lat * s];
    const unproject = (x, y) => [(x - cx) / s, (cy - y) / s];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth; h = hero.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s = Math.max(w / 360, h / 180) * 1.05;
      cx = w / 2; cy = h / 2;
      draw(performance.now());
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let lng = -180; lng <= 180; lng += 15) {
        const [x] = project(lng, 0);
        ctx.strokeStyle = lng === 0 ? "rgba(221,96,82,.45)" : "rgba(132,186,229,.09)";
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let lat = -90; lat <= 90; lat += 15) {
        const [, y] = project(0, lat);
        ctx.strokeStyle = lat === 0 ? "rgba(221,96,82,.45)" : "rgba(132,186,229,.09)";
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      points.forEach(([lng, lat], i) => {
        const [x, y] = project(lng, lat);
        const phase = reduceMotion ? 0 : ((t / 2600 + i * 0.137) % 1);
        if (!reduceMotion) {
          ctx.beginPath();
          ctx.arc(x, y, 3 + phase * 16, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(246,196,22,${0.45 * (1 - phase)})`;
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(246,196,22,.85)"; ctx.fill();
      });
      // Null Island
      const [nx, ny] = project(0, 0);
      const np = reduceMotion ? 0 : (t / 1800) % 1;
      ctx.beginPath(); ctx.arc(nx, ny, 5 + np * 26, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(221,96,82,${0.7 * (1 - np)})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(nx, ny, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#DD6052"; ctx.fill();
    }

    function loop(t) { draw(t); raf = visible ? requestAnimationFrame(loop) : null; }

    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      let [lng, lat] = unproject(e.clientX - r.left, e.clientY - r.top);
      lat = Math.max(-90, Math.min(90, lat)); lng = Math.max(-180, Math.min(180, lng));
      out.textContent = fmtCoord(lat, lng);
      const atNull = Math.abs(lat) < 2 && Math.abs(lng) < 2;
      place.textContent = atNull ? "Null Island 🏝️" : "not Null Island ✓";
      place.classList.toggle("away", !atNull);
    });
    hero.addEventListener("pointerleave", () => {
      out.textContent = fmtCoord(0, 0); place.textContent = "Null Island"; place.classList.remove("away");
    });

    window.addEventListener("resize", resize);
    resize();
    if (!reduceMotion) {
      new IntersectionObserver(([en]) => {
        visible = en.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(loop);
      }).observe(hero);
    }
  }

  /* ---------- data ---------- */
  function classify(features) {
    const past = [], upcoming = [], online = [];
    features.forEach((f) => {
      const p = f.properties;
      if (p.online || !p.startDate) online.push(f);
      else if ((p.endDate || p.startDate) >= todayISO) upcoming.push(f);
      else past.push(f);
    });
    past.sort((a, b) => a.properties.startDate.localeCompare(b.properties.startDate));
    upcoming.sort((a, b) => a.properties.startDate.localeCompare(b.properties.startDate));
    return { past, upcoming, online };
  }

  function groupBy(arr, keyFn) {
    const m = new Map();
    arr.forEach((x) => { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return m;
  }

  function renderStats({ past }) {
    const cities = new Set(past.map((f) => `${f.properties.venueLocality}|${f.properties.venueCountry}`));
    const continents = new Set(past.map((f) => CONTINENT[f.properties.venueCountry]).filter(Boolean));
    const set = (k, v) => { const el = document.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v; };
    set("camps", past.length);
    set("cities", cities.size);
    set("continents", continents.size);
    if (past[0]) set("since", year(past[0].properties.startDate));
  }

  function editionItem(p) {
    const url = safeUrl(p.url);
    const name = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.eventName)}</a>` : esc(p.eventName);
    const flyer = p.flyer ? ` · <a href="${esc(p.flyer)}">flyer (PDF)</a>` : "";
    return `<li><div>${name}${flyer}</div><span>${esc(p.venueName || "")}<br>${esc(fmtDate(p.startDate))}</span></li>`;
  }

  function renderSeries({ past }, flyTo) {
    const grid = $("#series-grid");
    const groups = [...groupBy(past, (f) => f.properties.series || f.properties.eventName).entries()]
      .sort((a, b) => a[1][0].properties.startDate.localeCompare(b[1][0].properties.startDate));
    grid.innerHTML = groups.map(([series, fs]) => {
      const first = year(fs[0].properties.startDate), last = year(fs[fs.length - 1].properties.startDate);
      const cities = [...new Set(fs.map((f) => f.properties.venueLocality))].join(" · ");
      const accent = fs[0].properties.color || "#1A5095";
      const items = fs.slice().reverse().map((f) => editionItem(f.properties)).join("");
      return `<article class="series" style="--accent:${esc(accent)}">
        <h3>${esc(series)} <small>${first === last ? first : `${first}–${last}`} · ${fs.length}×</small></h3>
        <p class="where">${esc(cities)}, ${esc(fs[0].properties.venueCountry)}</p>
        <ul>${items}</ul>
        <button class="zoom" type="button" data-lng="${fs[0].geometry.coordinates[0]}" data-lat="${fs[0].geometry.coordinates[1]}">Show on map →</button>
      </article>`;
    }).join("");
    grid.addEventListener("click", (e) => {
      const b = e.target.closest(".zoom");
      if (!b) return;
      flyTo(+b.dataset.lng, +b.dataset.lat, 9);
    });
  }

  function renderUpcoming({ upcoming }) {
    if (!upcoming.length) return;
    $("#upcoming-block").hidden = false;
    $("#upcoming-list").innerHTML = upcoming.map((f) => {
      const p = f.properties; const url = safeUrl(p.url);
      return `<li class="series series--upcoming"><h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.eventName)}</a>` : esc(p.eventName)}</h3>
        <p class="where">${esc(fmtDate(p.startDate))} · ${esc(p.venueName || "")}, ${esc(p.venueLocality || "")}</p></li>`;
    }).join("");
  }

  function renderTimeline({ past, upcoming }) {
    const tl = $("#timeline");
    const seriesFirst = [...groupBy(past, (f) => f.properties.series).values()].map((fs) => fs[0]);
    const byYear = groupBy(seriesFirst, (f) => year(f.properties.startDate));
    const label = (f) => `${esc(f.properties.series)} (${esc(f.properties.venueLocality)})`;
    const rows = [];
    [...byYear.entries()].sort().forEach(([y, fs]) => {
      if (fs.length === 1 && y === year(past[0]?.properties.startDate)) {
        const p = fs[0].properties;
        rows.push(`<li class="camp"><b>${y}</b><span>The first WhereCamp: <strong>${esc(p.eventName)}</strong>, hosted at ${esc(p.venueName)} in ${esc(p.venueLocality)}. A wall of sticky notes and a lot of mashups.</span></li>`);
      } else {
        const verb = fs.length === 1 ? "launches" : "launch";
        rows.push(`<li class="camp"><b>${y}</b><span>${fs.map(label).join(", ")} ${verb}.</span></li>`);
      }
    });
    const lastYear = year(past[past.length - 1]?.properties.startDate);
    const lastOnes = past.filter((f) => year(f.properties.startDate) === lastYear).map((f) => esc(f.properties.eventName));
    if (lastOnes.length) rows.push(`<li class="camp"><b>${lastYear}</b><span>The first wave winds down with ${lastOnes.join(" and ")}. ${past.length} camps in all.</span></li>`);
    upcoming.forEach((f) => rows.push(`<li class="camp"><b>${year(f.properties.startDate)}</b><span><strong>${esc(f.properties.eventName)}</strong>, ${esc(f.properties.venueLocality || "")}.</span></li>`));
    rows.push(`<li class="next"><b>Next</b><span>You. <a href="#proposals">Vote on, or propose, the next WhereCamp →</a></span></li>`);
    tl.insertAdjacentHTML("beforeend", rows.join(""));
  }

  /* ---------- proposals (GitHub issues) ---------- */
  function field(body, label) {
    const re = new RegExp(`###\\s*${label}\\s*\\n+([^\\n]+)`, "i");
    const m = (body || "").match(re);
    const v = m ? m[1].trim() : "";
    return v === "_No response_" ? "" : v;
  }

  function parseProposal(issue) {
    const body = issue.body || "";
    let lat = parseFloat(field(body, "Latitude"));
    let lng = parseFloat(field(body, "Longitude"));
    const pair = field(body, "Latitude").match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (pair && Number.isNaN(lng)) { lat = parseFloat(pair[1]); lng = parseFloat(pair[2]); }
    const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
    const city = field(body, "City or region") || issue.title.replace(/^\[Proposal\]\s*/i, "");
    return {
      number: issue.number,
      title: issue.title.replace(/^\[Proposal\]\s*/i, ""),
      city,
      url: issue.html_url,
      votes: (issue.reactions && issue.reactions["+1"]) || 0,
      host: field(body, "Would you help organise it\\?"),
      timeframe: field(body, "Rough timeframe"),
      lat: valid ? lat : 0,
      lng: valid ? lng : 0,
      washedUp: !valid,
    };
  }

  async function loadProposals() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.t < CACHE_MS) return cached.data;
    } catch { /* storage unavailable */ }
    const res = await fetch(ISSUES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const issues = await res.json();
    const data = issues.filter((i) => !i.pull_request).map(parseProposal).sort((a, b) => b.votes - a.votes || a.number - b.number);
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* ignore */ }
    return data;
  }

  function renderProposals(list, error) {
    const ol = $("#proposal-list");
    if (error) {
      ol.innerHTML = `<li class="leaderboard__empty">Couldn’t reach GitHub just now. <a href="https://github.com/${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3A${PROPOSAL_LABEL}" target="_blank" rel="noopener">See the proposals on GitHub</a>, or click the map to add one.</li>`;
      return;
    }
    if (!list.length) {
      ol.innerHTML = `<li class="leaderboard__empty">No proposals yet. Be the first! Click anywhere on the <a href="#map">map</a> or <a href="${esc(proposeUrl())}" target="_blank" rel="noopener">fill in the form</a>.</li>`;
      return;
    }
    ol.innerHTML = list.map((p) => `<li>
        <div>
          <div class="title"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
          <div class="sub">#${p.number} · ${p.washedUp ? '<span class="washed">washed up on Null Island (no valid coordinates)</span>' : esc(fmtCoord(p.lat, p.lng))}${p.host ? ` · ${esc(p.host)}` : ""}${p.timeframe ? ` · ${esc(p.timeframe)}` : ""}</div>
        </div>
        <a class="votes" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="${p.votes} votes. Open on GitHub to vote">👍 ${p.votes}</a>
      </li>`).join("");
  }

  /* ---------- map ---------- */
  function initMap(groups, proposalsPromise) {
    const fallback = () => { $("#map-fallback").hidden = false; };
    if (!window.maplibregl) { fallback(); return { flyTo() {} }; }

    let map;
    try {
      map = new maplibregl.Map({
        container: "map-canvas",
        style: MAP_STYLE,
        center: [10, 25],
        zoom: 1.3,
        minZoom: 0.8,
        maxZoom: 16,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.warn("Map failed to initialise", err);
      fallback();
      return { flyTo() {} };
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const flyTo = (lng, lat, zoom = 6) => {
      document.getElementById("map").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      map.flyTo({ center: [lng, lat], zoom, essential: true, duration: reduceMotion ? 0 : 2200 });
    };

    // Past camps grouped by city so repeat camps share one marker.
    const cityGroups = groupBy(groups.past, (f) => `${f.properties.venueLocality}|${f.properties.venueCountry}`);
    const pastFC = {
      type: "FeatureCollection",
      features: [...cityGroups.values()].map((fs) => ({
        type: "Feature",
        geometry: fs[fs.length - 1].geometry,
        properties: {
          city: fs[0].properties.venueLocality,
          country: fs[0].properties.venueCountry,
          count: fs.length,
          editions: JSON.stringify(fs.map((f) => f.properties)),
        },
      })),
    };
    const upcomingFC = { type: "FeatureCollection", features: groups.upcoming.map((f) => ({ ...f, properties: { ...f.properties, editions: JSON.stringify([f.properties]) } })) };
    let proposals = [];

    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "320px", offset: 10 });

    function cityPopup(props) {
      const eds = JSON.parse(props.editions);
      const yrs = eds.map((e) => year(e.startDate));
      return `<h4>${esc(props.city)}</h4>
        <p class="meta">${esc(props.country)} · ${eds.length} camp${eds.length > 1 ? "s" : ""} · ${yrs[0]}${yrs.length > 1 ? "–" + yrs[yrs.length - 1] : ""}</p>
        <ul>${eds.slice().reverse().map((e) => {
          const u = safeUrl(e.url);
          return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(e.eventName)}</a>` : esc(e.eventName)}<br><span class="meta">${esc(e.venueName || "")} · ${esc(fmtDate(e.startDate))}</span></li>`;
        }).join("")}</ul>`;
    }

    function proposalPopup(p) {
      return `<h4>${esc(p.title)}</h4>
        <p class="meta">Proposed in #${p.number} · ${esc(fmtCoord(p.lat, p.lng))}</p>
        ${p.host ? `<p>${esc(p.host)}</p>` : ""}${p.timeframe ? `<p class="meta">When: ${esc(p.timeframe)}</p>` : ""}
        <a class="pbtn" href="${esc(p.url)}" target="_blank" rel="noopener">👍 ${p.votes}: vote on GitHub</a>`;
    }

    function nullIslandPopup() {
      const washed = proposals.filter((p) => p.washedUp);
      const online = groups.online[0]?.properties;
      return `<h4>🏝️ Null Island</h4>
        <p class="meta">0.0000° N, 0.0000° E · Gulf of Guinea</p>
        <p>Pop. one weather buoy and every failed geocode ever. Welcome, you’re in good company.</p>
        ${online ? `<p><strong>${esc(online.eventName)}</strong>: ${esc(online.summary || "")}</p>` : ""}
        ${washed.length ? `<p class="meta">Proposals that washed ashore here (missing coordinates):</p><ul>${washed.map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a> · 👍 ${p.votes}</li>`).join("")}</ul>` : ""}
        <a class="pbtn" href="${esc(proposeUrl(0, 0, "Null Island (online)"))}" target="_blank" rel="noopener">I want an online camp</a>`;
    }

    // Null Island: a DOM marker so it pulses with CSS
    const nullEl = document.createElement("button");
    nullEl.type = "button";
    nullEl.className = "null-marker";
    nullEl.setAttribute("aria-label", "Null Island, 0 degrees north 0 degrees east");
    nullEl.addEventListener("click", (e) => {
      e.stopPropagation();
      popup.setLngLat([0, 0]).setHTML(nullIslandPopup()).addTo(map);
    });
    new maplibregl.Marker({ element: nullEl }).setLngLat([0, 0]).addTo(map);

    const proposalsFC = () => ({
      type: "FeatureCollection",
      features: proposals.filter((p) => !p.washedUp).map((p) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { number: p.number, votes: p.votes },
      })),
    });

    map.on("load", () => {
      map.addSource("past", { type: "geojson", data: pastFC });
      map.addSource("upcoming", { type: "geojson", data: upcomingFC });
      map.addSource("proposed", { type: "geojson", data: proposalsFC() });

      map.addLayer({
        id: "proposed", type: "circle", source: "proposed",
        paint: {
          "circle-color": "#F6C416",
          "circle-opacity": 0.9,
          "circle-radius": ["interpolate", ["linear"], ["get", "votes"], 0, 7, 10, 14, 50, 24],
          "circle-stroke-color": "#0A1628", "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "past", type: "circle", source: "past",
        paint: {
          "circle-color": "#1A5095",
          "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 7, 8, 13],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "past-count", type: "symbol", source: "past",
        filter: [">", ["get", "count"], 1],
        layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "upcoming", type: "circle", source: "upcoming",
        paint: { "circle-color": "#91C77C", "circle-radius": 10, "circle-stroke-color": "#0A1628", "circle-stroke-width": 2 },
      });

      ["past", "upcoming", "proposed"].forEach((id) => {
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      });

      proposalsPromise.then((list) => {
        proposals = list;
        map.getSource("proposed")?.setData(proposalsFC());
      }).catch(() => {});
    });

    map.on("error", (e) => console.warn("Map error:", e && e.error ? e.error.message : e));

    map.on("click", (e) => {
      const hits = map.getLayer("past")
        ? map.queryRenderedFeatures(e.point, { layers: ["upcoming", "past", "proposed"] })
        : [];
      if (hits.length) {
        const f = hits[0];
        if (f.layer.id === "proposed") {
          const p = proposals.find((x) => x.number === f.properties.number);
          if (p) popup.setLngLat(f.geometry.coordinates).setHTML(proposalPopup(p)).addTo(map);
        } else {
          const props = f.layer.id === "upcoming"
            ? { city: f.properties.venueLocality, country: f.properties.venueCountry, editions: f.properties.editions }
            : f.properties;
          popup.setLngLat(f.geometry.coordinates).setHTML(cityPopup(props)).addTo(map);
        }
        return;
      }
      const { lng, lat } = e.lngLat.wrap();
      const atNull = Math.abs(lat) < 1 && Math.abs(lng) < 1;
      popup.setLngLat(e.lngLat).setHTML(`<h4>📍 Propose a WhereCamp here?</h4>
        <p class="meta">${esc(fmtCoord(lat, lng))}</p>
        <p>${atNull ? "Bold choice. It’s mostly ocean, but the online edition is always welcome." : "This opens a GitHub issue with the coordinates filled in. Add the city and why it’s a good fit."}</p>
        <a class="pbtn" href="${esc(proposeUrl(lat, lng))}" target="_blank" rel="noopener">Propose this spot →</a>`).addTo(map);
    });

    $("#fly-null").addEventListener("click", () => {
      map.flyTo({ center: [0, 0], zoom: 5, essential: true, duration: reduceMotion ? 0 : 2400 });
      map.once("moveend", () => popup.setLngLat([0, 0]).setHTML(nullIslandPopup()).addTo(map));
    });
    $("#fly-world").addEventListener("click", () => map.flyTo({ center: [10, 25], zoom: 1.3, essential: true, duration: reduceMotion ? 0 : 1600 }));

    return { flyTo };
  }

  /* ---------- boot ---------- */
  async function main() {
    initNav();
    $("#propose-link").href = proposeUrl();

    let groups = { past: [], upcoming: [], online: [] };
    try {
      const res = await fetch("wherecamps.geojson");
      groups = classify((await res.json()).features);
    } catch (err) {
      console.error("Could not load wherecamps.geojson", err);
    }

    initHero(groups.past.concat(groups.upcoming).map((f) => f.geometry.coordinates));
    renderStats(groups);
    renderUpcoming(groups);
    renderTimeline(groups);

    const proposalsPromise = loadProposals();
    proposalsPromise.then((list) => renderProposals(list), (err) => { console.warn(err); renderProposals([], err); });

    const map = initMap(groups, proposalsPromise);
    renderSeries(groups, map.flyTo);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
