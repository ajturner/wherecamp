/* WhereCamp archives page: vanilla JS, no build step.
 * Data: wherecamps.geojson (each camp and its site) + archives.json (notes, write-ups, slides, video)
 */
(() => {
  "use strict";

  const TYPES = { video: "Video", notes: "Session notes", "write-up": "Write-ups", slides: "Slides" };
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const isArchived = (u) => /^https?:\/\/web\.archive\.org\//i.test(u);
  const fmtDate = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "");
  const archivedTag = (u) => (isArchived(u) ? ' <span class="tag tag--archive">archived</span>' : "");

  function initNav() {
    const toggle = $(".nav__toggle"), links = $("#nav-links");
    toggle.addEventListener("click", () => {
      toggle.setAttribute("aria-expanded", String(links.classList.toggle("open")));
    });
  }

  function itemHtml(a) {
    const url = safeUrl(a.url);
    if (!url) return "";
    return `<li data-type="${esc(a.type)}">
      <span class="tag tag--${esc(a.type)}">${esc(a.type)}</span>
      <div><a href="${esc(url)}" target="_blank" rel="noopener">${esc(a.title)}</a>${archivedTag(url)}
        ${a.author ? `<span class="by">${esc(a.author)}</span>` : ""}</div>
    </li>`;
  }

  function campHtml(p, items) {
    const url = safeUrl(p.url);
    const where = [p.venueName, p.venueLocality, p.venueCountry].filter(Boolean).join(", ");
    const site = url ? `<li data-type="site"><span class="tag tag--site">site</span>
      <div><a href="${esc(url)}" target="_blank" rel="noopener">Camp website or wiki</a>${archivedTag(url)}</div></li>` : "";
    return `<article class="camp-archive" data-types="${esc(items.map((a) => a.type).join(" "))}">
      <h3>${esc(p.eventName)}</h3>
      <p class="where">${esc(fmtDate(p.startDate))}${where ? " · " + esc(where) : ""}</p>
      <ul class="archive-items">${site}${items.map(itemHtml).join("")}</ul>
    </article>`;
  }

  function render(camps, archives) {
    const byCamp = new Map();
    archives.forEach((a) => { if (!byCamp.has(a.camp)) byCamp.set(a.camp, []); byCamp.get(a.camp).push(a); });

    const years = new Map();
    camps.forEach((f) => {
      const y = f.properties.startDate.slice(0, 4);
      if (!years.has(y)) years.set(y, []);
      years.get(y).push(f.properties);
    });

    const general = byCamp.get("All camps") || [];
    let html = general.length
      ? `<section class="year-block"><h2>The WhereCamp wiki and general pages</h2><article class="camp-archive" data-types="${esc(general.map((a) => a.type).join(" "))}"><ul class="archive-items">${general.map(itemHtml).join("")}</ul></article></section>`
      : "";
    [...years.keys()].sort().reverse().forEach((y) => {
      html += `<section class="year-block"><h2>${esc(y)}</h2>${years.get(y).map((p) => campHtml(p, byCamp.get(p.eventName) || [])).join("")}</section>`;
    });
    $("#archive-list").innerHTML = html;

    const counts = {};
    archives.forEach((a) => { counts[a.type] = (counts[a.type] || 0) + 1; });
    const filters = $("#filters");
    filters.innerHTML = `<button type="button" class="chip" aria-pressed="true" data-filter="">Everything</button>` +
      Object.keys(TYPES).filter((t) => counts[t]).map((t) =>
        `<button type="button" class="chip" aria-pressed="false" data-filter="${esc(t)}">${esc(TYPES[t])} <b>${counts[t]}</b></button>`).join("");
    filters.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      filters.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      applyFilter(b.dataset.filter);
    });
  }

  function applyFilter(type) {
    document.querySelectorAll(".camp-archive").forEach((card) => {
      const has = !type || card.dataset.types.split(" ").includes(type);
      card.hidden = !has;
      card.querySelectorAll("li").forEach((li) => { li.hidden = !!type && li.dataset.type !== type; });
    });
    document.querySelectorAll(".year-block").forEach((s) => {
      s.hidden = !s.querySelector(".camp-archive:not([hidden])");
    });
  }

  async function main() {
    initNav();
    try {
      const [geo, archives] = await Promise.all([
        fetch("wherecamps.geojson").then((r) => r.json()),
        fetch("archives.json").then((r) => r.json()),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const camps = geo.features.filter((f) => f.properties.startDate && (f.properties.endDate || f.properties.startDate) < today);
      render(camps, archives);
    } catch (err) {
      console.error("Could not load the archive data", err);
      $("#archive-list").innerHTML = '<p>The archive could not load. Browse <a href="archives.json">archives.json</a> directly.</p>';
    }
  }

  main();
})();
