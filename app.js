// EFA26 Planner - App-Logik
//
// Events laden/anzeigen/filtern (Phase 2), ICS-Export (Phase 3), Club-Sync
// via Google Sheet (Phase 4). Siehe CLAUDE.md fuer den Gesamtplan.

// Nach dem Deployment des Google Apps Script (siehe README.md, Abschnitt
// "Club-Sync einrichten") die Web-App-URL hier eintragen. Leer = Sync
// deaktiviert, App funktioniert trotzdem normal (nur ohne Club-Abgleich).
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbwJ0aFUGEVbL8FW5w5mctbvPFxFDPNNDM_4uJUKtAyVNmfu1czH0HQZLcryMEmsEWSaKw/exec";

const SELECTION_STORAGE_KEY = "efa26-selected-events";
const USER_NAME_STORAGE_KEY = "efa26-user-name";

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

// ---------- Club-Sync (Phase 4) ----------
// clubSelectionsByEvent: Map<eventId, Set<name>> - wer hat welches Event
// gewaehlt (aus dem letzten Sync geladen, nicht live).
let clubSelectionsByEvent = new Map();

function loadUserName() {
  return localStorage.getItem(USER_NAME_STORAGE_KEY) || "";
}

function saveUserName(name) {
  localStorage.setItem(USER_NAME_STORAGE_KEY, name);
}

function setSyncStatus(text) {
  document.getElementById("sync-status").textContent = text;
}

async function fetchClubSelections() {
  const res = await fetch(SHEET_API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const map = new Map();
  for (const entry of data.selections || []) {
    if (!map.has(entry.eventId)) map.set(entry.eventId, new Set());
    map.get(entry.eventId).add(entry.name);
  }
  return map;
}

async function postOwnSelection(name) {
  // text/plain statt application/json, damit der Browser keinen CORS-
  // Preflight (OPTIONS) schickt - Apps-Script-Web-Apps beantworten den nicht.
  const res = await fetch(SHEET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, eventIds: [...selection] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function syncWithClub() {
  if (!SHEET_API_URL) {
    setSyncStatus("Sync noch nicht eingerichtet (siehe README.md).");
    return;
  }

  const nameInput = document.getElementById("user-name");
  const name = nameInput.value.trim();
  if (!name) {
    setSyncStatus("Bitte zuerst deinen Namen eingeben.");
    return;
  }
  saveUserName(name);

  setSyncStatus("Synchronisiere …");
  try {
    await postOwnSelection(name);
    clubSelectionsByEvent = await fetchClubSelections();
    refresh();
    setSyncStatus(
      `Synchronisiert um ${new Date().toLocaleTimeString("de-DE")}`
    );
  } catch (err) {
    console.error(err);
    setSyncStatus("Sync fehlgeschlagen. Details in der Konsole.");
  }
}

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
      badge.className = `tag tag-format tag-format-${event.format.toLowerCase()}`;
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

  const clubNames = clubSelectionsByEvent.get(event.id);
  if (clubNames && clubNames.size > 0) {
    const clubInfo = document.createElement("p");
    clubInfo.className = "event-club-selections";
    clubInfo.textContent = `Auch gewählt von: ${[...clubNames].join(", ")}`;
    card.appendChild(clubInfo);
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

// ---------- ICS-Export ----------
// Alpbach liegt in der Zeitzone Europe/Vienna. Die gesamte Konferenz
// (24. Aug - 4. Sep) faellt in die Sommerzeit (CEST, UTC+2), daher reicht
// ein fest verdrahteter Offset - keine DST-Umstellung in diesem Zeitraum.
const VIENNA_UTC_OFFSET_HOURS = 2;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIcsDateTimeUtc(day, time) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, hh - VIENNA_UTC_OFFSET_HOURS, mm));
  return (
    `${utc.getUTCFullYear()}${pad2(utc.getUTCMonth() + 1)}${pad2(utc.getUTCDate())}` +
    `T${pad2(utc.getUTCHours())}${pad2(utc.getUTCMinutes())}00Z`
  );
}

function toIcsDate(day) {
  return day.replaceAll("-", "");
}

function addDaysToIsoDate(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545: Zeilen ueber 75 Oktetten (Bytes, nicht Zeichen!) muessen gefaltet
// werden (CRLF + Leerzeichen). Wichtig bei Umlauten/ß, die in UTF-8 mehrere
// Bytes belegen - deshalb byteweise statt zeichenweise zaehlen.
const ICS_ENCODER = new TextEncoder();

function foldLine(line) {
  if (ICS_ENCODER.encode(line).length <= 75) return line;

  const chunks = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = ICS_ENCODER.encode(ch).length;
    if (currentBytes + chBytes > 74) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  chunks.push(current);

  return chunks.map((chunk, i) => (i === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

function eventToVEvent(event, dtstamp) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@efa26-planner`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.startTime && event.endTime) {
    lines.push(`DTSTART:${toIcsDateTimeUtc(event.day, event.startTime)}`);
    lines.push(`DTEND:${toIcsDateTimeUtc(event.day, event.endTime)}`);
  } else {
    // Keine exakte Zeit bekannt (siehe CLAUDE.md) -> ganztaegiger Eintrag,
    // damit das Event nicht komplett verloren geht. DTEND ist bei
    // ganztaegigen Terminen exklusiv, daher +1 Tag.
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.day)}`);
    lines.push(`DTEND;VALUE=DATE:${addDaysToIsoDate(event.day, 1)}`);
  }

  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.description)
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);

  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

function nowAsIcsUtc() {
  const now = new Date();
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  );
}

function buildIcs(events) {
  const dtstamp = nowAsIcsUtc();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EFA26 Planner//DE",
    "CALSCALE:GREGORIAN",
    ...events.map((event) => eventToVEvent(event, dtstamp)),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

function downloadIcsFile(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function updateSelectionCount() {
  const status = document.getElementById("status");
  status.textContent = `${selection.size} von ${totalEventCount} Events ausgewählt`;

  const exportButton = document.getElementById("export-ics");
  exportButton.disabled = selection.size === 0;
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

    document.getElementById("export-ics").addEventListener("click", () => {
      const selectedEvents = allEvents.filter((event) => selection.has(event.id));
      downloadIcsFile("efa26-mein-programm.ics", buildIcs(selectedEvents));
    });

    document.getElementById("user-name").value = loadUserName();
    document
      .getElementById("sync-button")
      .addEventListener("click", syncWithClub);

    if (SHEET_API_URL) {
      setSyncStatus("Lade Club-Auswahl …");
      try {
        clubSelectionsByEvent = await fetchClubSelections();
        refresh();
        setSyncStatus("Club-Auswahl geladen.");
      } catch (err) {
        console.error(err);
        setSyncStatus("Club-Auswahl konnte nicht geladen werden.");
      }
    } else {
      setSyncStatus("Sync noch nicht eingerichtet (siehe README.md).");
    }
  } catch (err) {
    status.textContent = "Fehler beim Laden der Events. Details in der Konsole.";
    console.error(err);
  }
}

main();
