// EFA26 Planner - App-Logik
//
// Phase 2, Schritt 1: Events aus data/events.json laden und nach Tag
// gruppiert anzeigen. Noch ohne Auswahl/Filter (folgt in den naechsten
// Schritten, siehe CLAUDE.md).

const DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function formatDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  return DAY_FORMATTER.format(date);
}

function eventTimeLabel(event) {
  if (event.startTime && event.endTime) {
    return `${event.startTime}–${event.endTime}`;
  }
  return "Zeit unbekannt";
}

function groupByDay(events) {
  const map = new Map();
  for (const event of events) {
    const day = event.day || "unbekannt";
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(event);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderEventCard(event) {
  const card = document.createElement("article");
  card.className = "event-card";

  const time = document.createElement("div");
  time.className = "event-time";
  time.textContent = eventTimeLabel(event);
  card.appendChild(time);

  const title = document.createElement("h3");
  title.className = "event-title";
  title.textContent = event.title;
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "event-meta";
  const metaParts = [event.location, event.language].filter(Boolean);
  meta.textContent = metaParts.join(" · ");
  card.appendChild(meta);

  if (event.trackTags.length > 0 || event.format) {
    const tags = document.createElement("div");
    tags.className = "event-tags";
    for (const tag of event.trackTags) {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = tag;
      tags.appendChild(badge);
    }
    if (event.format) {
      const badge = document.createElement("span");
      badge.className = "tag tag-format";
      badge.textContent = event.format;
      tags.appendChild(badge);
    }
    card.appendChild(tags);
  }

  if (event.description) {
    const description = document.createElement("p");
    description.className = "event-description";
    description.textContent = event.description;
    card.appendChild(description);
  }

  return card;
}

function renderEvents(events) {
  const container = document.getElementById("events");
  container.innerHTML = "";

  for (const [day, dayEvents] of groupByDay(events)) {
    const section = document.createElement("section");
    section.className = "day-section";

    const heading = document.createElement("h2");
    heading.textContent = day === "unbekannt" ? "Ohne Datum" : formatDay(day);
    section.appendChild(heading);

    for (const event of dayEvents) {
      section.appendChild(renderEventCard(event));
    }

    container.appendChild(section);
  }
}

async function main() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("data/events.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = await res.json();
    status.textContent = `${events.length} Events geladen`;
    renderEvents(events);
  } catch (err) {
    status.textContent = "Fehler beim Laden der Events. Details in der Konsole.";
    console.error(err);
  }
}

main();
