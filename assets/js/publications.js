/*
 * Renders data/publications.json (made by scripts/fetch_scholar.py).
 *
 * Usage on any page:
 *   <div id="publications" data-src="data/publications.json"></div>
 *   <script src="assets/js/publications.js"></script>
 *
 * Optional attributes on the container:
 *   data-src        path to the JSON file (default: data/publications.json)
 *   data-highlight  your name as it appears in author lists, to bold it, e.g. "J Smith"
 *   data-limit      show only the N most recent papers
 *   data-metrics    "false" to hide the citations / h-index summary
 */
(function () {
  "use strict";

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function highlightName(authors, name) {
    var safe = esc(authors);
    if (!name) return safe;
    var pattern = new RegExp(esc(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return safe.replace(pattern, function (m) { return "<strong>" + m + "</strong>"; });
  }

  function renderPub(p, highlight) {
    var title = p.url
      ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + "</a>"
      : esc(p.title);
    var parts = ['<li class="pub">', '<div class="pub-title">' + title + "</div>"];
    if (p.authors) parts.push('<div class="pub-authors">' + highlightName(p.authors, highlight) + "</div>");
    var meta = [];
    if (p.venue) meta.push("<em>" + esc(p.venue) + "</em>");
    if (p.citations) meta.push("Cited by " + p.citations);
    if (meta.length) parts.push('<div class="pub-meta">' + meta.join(" · ") + "</div>");
    parts.push("</li>");
    return parts.join("");
  }

  function render(container, data) {
    var highlight = container.dataset.highlight || "";
    var limit = parseInt(container.dataset.limit, 10);
    var showMetrics = container.dataset.metrics !== "false";
    var pubs = (data.publications || []).slice();

    var html = "";

    if (showMetrics && data.profile) {
      var pr = data.profile;
      html +=
        '<div class="pub-metrics">' +
        "<span><b>" + (pr.citations || 0) + "</b> citations</span>" +
        "<span><b>" + (pr.h_index || 0) + "</b> h-index</span>" +
        "<span><b>" + (pr.i10_index || 0) + "</b> i10-index</span>" +
        (pr.url ? '<a href="' + esc(pr.url) + '" target="_blank" rel="noopener">Google Scholar profile</a>' : "") +
        "</div>";
    }

    html +=
      '<div class="pub-controls">' +
      '<input type="search" class="pub-search" placeholder="Search publications…" aria-label="Search publications">' +
      '<select class="pub-sort" aria-label="Sort publications">' +
      '<option value="year">Newest first</option>' +
      '<option value="citations">Most cited</option>' +
      "</select></div>" +
      '<div class="pub-list"></div>' +
      (data.updated ? '<p class="pub-updated">Last updated ' + esc(data.updated) + "</p>" : "");

    container.innerHTML = html;

    var listEl = container.querySelector(".pub-list");
    var searchEl = container.querySelector(".pub-search");
    var sortEl = container.querySelector(".pub-sort");

    function draw() {
      var q = searchEl.value.trim().toLowerCase();
      var items = pubs.filter(function (p) {
        if (!q) return true;
        return [p.title, p.authors, p.venue, p.year].join(" ").toLowerCase().indexOf(q) !== -1;
      });

      if (sortEl.value === "citations") {
        items.sort(function (a, b) { return (b.citations || 0) - (a.citations || 0); });
      } else {
        items.sort(function (a, b) { return (b.year || 0) - (a.year || 0) || (b.citations || 0) - (a.citations || 0); });
      }
      if (limit > 0) items = items.slice(0, limit);

      if (!items.length) {
        listEl.innerHTML = '<p class="pub-empty">No matching publications.</p>';
        return;
      }

      if (sortEl.value === "year") {
        var out = "", currentYear;
        items.forEach(function (p) {
          var y = p.year || "Other";
          if (y !== currentYear) {
            if (currentYear !== undefined) out += "</ul>";
            out += '<h3 class="pub-year">' + esc(y) + '</h3><ul class="pub-items">';
            currentYear = y;
          }
          out += renderPub(p, highlight);
        });
        listEl.innerHTML = out + "</ul>";
      } else {
        listEl.innerHTML = '<ul class="pub-items">' +
          items.map(function (p) { return renderPub(p, highlight); }).join("") + "</ul>";
      }
    }

    searchEl.addEventListener("input", draw);
    sortEl.addEventListener("change", draw);
    draw();
  }

  function init() {
    var container = document.getElementById("publications");
    if (!container) return;
    var src = container.dataset.src || "data/publications.json";
    container.innerHTML = '<p class="pub-loading">Loading publications…</p>';

    fetch(src, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) { render(container, data); })
      .catch(function (err) {
        container.innerHTML = '<p class="pub-error">Could not load publications (' + esc(err.message) + ").</p>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
