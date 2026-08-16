// EFA26 Planner - App-Logik
//
// Phase 2: Events aus data/events.json laden, nach Tag gruppiert anzeigen,
// Auswahl treffen (in localStorage gespeichert). Filter folgen im naechsten
// Schritt, siehe CLAUDE.md.

const SELECTION_STORAGE_KEY = "efa26-selected-events";

const DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function loadSelection() {
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (err) {
    console.error("Auswahl konnte nicht geladen werden:", err);
    return new Set();
  }
}

function saveSelection(selection) {
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...selection]));
}

const selection = loadSelection();

let allEvents = [];
let totalEventCount = 0;
const filters = {
  day: "all",
  format: "all",
  language: "all",
  tracks: new Set(),
  onlySelected: false,
};

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function applyFilters(events) {
  return events.filter((event) => {
    if (filters.day !== "all" && event.day !== filters.day) return false;
    if (filters.format !== "all" && event.format !== filters.format) return false;
    if (filters.language !== "all" && event.language !== filters.language)
      return false;
    if (
      filters.tracks.size > 0 &&
      !event.trackTags.some((tag) => filters.tracks.has(tag))
    )
      return false;
    if (filters.onlySelected && !selection.has(event.id)) return false;
    return true;
  });
}

function refresh() {
  renderEvents(applyFilters(allEvents));
}

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
  card.classList.toggle("selected", selection.has(event.id));

  const label = document.createElement("label");
  label.className = "event-select";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selection.has(event.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selection.add(event.id);
    else selection.delete(event.id);
    saveSelection(selection);
    card.classList.toggle("selected", checkbox.checked);
    updateSelectionCount();
    if (filters.onlySelected) refresh();
  });
  label.appendChild(checkbox);

  const time = document.createElement("span");
  time.className = "event-time";
  time.textContent = eventTimeLabel(event);
  label.appendChild(time);

  card.appendChild(label);

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

function renderSelect(labelText, options, currentValue, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "filter";
  wrapper.append(`${labelText}: `);

  const select = document.createElement("select");
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Alle";
  select.appendChild(allOption);

  for (const option of options) {
    select.appendChild(new Option(option, option));
  }
  select.value = currentValue;
  select.addEventListener("change", () => onChange(select.value));

  wrapper.appendChild(select);
  return wrapper;
}

function renderFilters(events) {
  const container = document.getElementById("filters");
  container.innerHTML = "";

  const days = uniqueSorted(events.map((e) => e.day));
  const formats = uniqueSorted(events.map((e) => e.format));
  const languages = uniqueSorted(events.map((e) => e.language));
  const tracks = uniqueSorted(events.flatMap((e) => e.trackTags));

  const dayOptions = days.map((day) => ({ value: day, label: formatDay(day) }));
  const dayWrapper = document.createElement("label");
  dayWrapper.className = "filter";
  dayWrapper.append("Tag: ");
  const daySelect = document.createElement("select");
  daySelect.appendChild(new Option("Alle", "all"));
  for (const { value, label } of dayOptions) {
    daySelect.appendChild(new Option(label, value));
  }
  daySelect.value = filters.day;
  daySelect.addEventListener("change", () => {
    filters.day = daySelect.value;
    refresh();
  });
  dayWrapper.appendChild(daySelect);
  container.appendChild(dayWrapper);

  container.appendChild(
    renderSelect("Format", formats, filters.format, (value) => {
      filters.format = value;
      refresh();
    })
  );

  container.appendChild(
    renderSelect("Sprache", languages, filters.language, (value) => {
      filters.language = value;
      refresh();
    })
  );

  const trackWrapper = document.createElement("div");
  trackWrapper.className = "filter filter-tracks";
  trackWrapper.append("Track: ");
  for (const track of tracks) {
    const trackLabel = document.createElement("label");
    trackLabel.className = "track-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = filters.tracks.has(track);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) filters.tracks.add(track);
      else filters.tracks.delete(track);
      refresh();
    });
    trackLabel.appendChild(checkbox);
    trackLabel.append(track);
    trackWrapper.appendChild(trackLabel);
  }
  container.appendChild(trackWrapper);

  const onlySelectedWrapper = document.createElement("label");
  onlySelectedWrapper.className = "filter";
  const onlySelectedCheckbox = document.createElement("input");
  onlySelectedCheckbox.type = "checkbox";
  onlySelectedCheckbox.checked = filters.onlySelected;
  onlySelectedCheckbox.addEventListener("change", () => {
    filters.onlySelected = onlySelectedCheckbox.checked;
    refresh();
  });
  onlySelectedWrapper.appendChild(onlySelectedCheckbox);
  onlySelectedWrapper.append(" Nur ausgewählte anzeigen");
  container.appendChild(onlySelectedWrapper);
}

function updateSelectionCount() {
  const status = document.getElementById("status");
  status.textContent = `${selection.size} von ${totalEventCount} Events ausgewählt`;
}

async function main() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("data/events.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = await res.json();
    allEvents = events;
    totalEventCount = events.length;
    renderFilters(events);
    refresh();
    updateSelectionCount();
  } catch (err) {
    status.textContent = "Fehler beim Laden der Events. Details in der Konsole.";
    console.error(err);
  }
}

main();
