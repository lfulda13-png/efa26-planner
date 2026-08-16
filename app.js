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
const LANG_STORAGE_KEY = "efa26-lang";

// ---------- Sprachumschalter (DE/EN) ----------
let currentLang = localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "de";

// Ausgeschriebene Namen fuer die Track-Kuerzel (aus scripts/scrape.js
// TRACK_CODE_BY_NAME uebernommen, dort aus den echten PDF-"Track:"-Zeilen
// abgeleitet - keine Vermutung; Englisch ist das Original, Deutsch die
// Uebersetzung). Fuer Tooltips + die Legende in den Filtern.
const TRACK_LEGEND = {
  de: {
    ART: "Kunst",
    CLI: "Klima",
    DEM: "Demokratie",
    FIN: "Finanzen",
    LAB: "Lab",
    SEC: "Sicherheit",
    SEM: "Seminar",
    STU: "Studio",
  },
  en: {
    ART: "Art",
    CLI: "Climate",
    DEM: "Democracy",
    FIN: "Finance",
    LAB: "Lab",
    SEC: "Security",
    SEM: "Seminar",
    STU: "Studio",
  },
};

const I18N = {
  de: {
    subtitle: "Kalender-Builder für das European Forum Alpbach 2026",
    yourName: "Dein Name:",
    namePlaceholder: "z.B. Anna",
    syncButton: "Mit Club synchronisieren",
    syncNotConfigured: "Sync noch nicht eingerichtet (siehe README.md).",
    syncEnterName: "Bitte zuerst deinen Namen eingeben.",
    syncing: "Synchronisiere …",
    syncedAt: "Synchronisiert um {time}",
    syncFailed: "Sync fehlgeschlagen. Details in der Konsole.",
    loadingClub: "Lade Club-Auswahl …",
    clubLoaded: "Club-Auswahl geladen.",
    clubLoadFailed: "Club-Auswahl konnte nicht geladen werden.",
    loadingEvents: "Lade Events …",
    loadEventsFailed: "Fehler beim Laden der Events. Details in der Konsole.",
    selectedStatus: "{count} von {total} Events ausgewählt",
    clearSelection: "Auswahl leeren",
    clearConfirm: "Wirklich alle {count} ausgewählten Events entfernen?",
    exportIcs: "Auswahl als .ics exportieren",
    viewList: "Alle Events",
    viewCalendar: "Meine Auswahl (Kalender)",
    filtersSummary: "Filter",
    searchPlaceholder: "Suche nach Titel, Beschreibung, Speaker:in, Location …",
    filterAll: "Alle",
    filterDay: "Tag: ",
    filterFormat: "Format",
    filterLanguage: "Sprache",
    filterTrack: "Track: ",
    onlySelected: " Nur ausgewählte anzeigen",
    legendPrefix: "Kürzel: ",
    timeUnknown: "Zeit unbekannt",
    noDate: "Ohne Datum",
    speakersLabel: "Speaker:innen: ",
    hostedByLabel: "Veranstaltet von: ",
    alsoSelectedBy: "Auch gewählt von: {names}",
    calendarViewerLabel: "Kalender von:",
    calendarViewerMe: "Ich (lokale Auswahl)",
    calendarModeDay: "Tag",
    calendarModeWeek: "Woche",
    calendarNoTime: "Ohne genaue Uhrzeit:",
    calendarSummarySelected: "{who}: {count} ausgewählt · {parts}",
    calendarSummaryEmpty: "{who}: noch keine Events in diesem Zeitraum ausgewählt.",
    calendarMe: "Ich",
    prev: "Zurück",
    next: "Weiter",
  },
  en: {
    subtitle: "Calendar builder for the European Forum Alpbach 2026",
    yourName: "Your name:",
    namePlaceholder: "e.g. Anna",
    syncButton: "Sync with club",
    syncNotConfigured: "Sync not set up yet (see README.md).",
    syncEnterName: "Please enter your name first.",
    syncing: "Syncing …",
    syncedAt: "Synced at {time}",
    syncFailed: "Sync failed. See console for details.",
    loadingClub: "Loading club selection …",
    clubLoaded: "Club selection loaded.",
    clubLoadFailed: "Could not load club selection.",
    loadingEvents: "Loading events …",
    loadEventsFailed: "Failed to load events. See console for details.",
    selectedStatus: "{count} of {total} events selected",
    clearSelection: "Clear selection",
    clearConfirm: "Really remove all {count} selected events?",
    exportIcs: "Export selection as .ics",
    viewList: "All events",
    viewCalendar: "My selection (calendar)",
    filtersSummary: "Filters",
    searchPlaceholder: "Search title, description, speaker, location …",
    filterAll: "All",
    filterDay: "Day: ",
    filterFormat: "Format",
    filterLanguage: "Language",
    filterTrack: "Track: ",
    onlySelected: " Show only selected",
    legendPrefix: "Abbreviations: ",
    timeUnknown: "Time unknown",
    noDate: "No date",
    speakersLabel: "Speakers: ",
    hostedByLabel: "Hosted by: ",
    alsoSelectedBy: "Also selected by: {names}",
    calendarViewerLabel: "Calendar of:",
    calendarViewerMe: "Me (local selection)",
    calendarModeDay: "Day",
    calendarModeWeek: "Week",
    calendarNoTime: "Without exact time:",
    calendarSummarySelected: "{who}: {count} selected · {parts}",
    calendarSummaryEmpty: "{who}: no events selected in this range yet.",
    calendarMe: "Me",
    prev: "Back",
    next: "Next",
  },
};

function t(key, vars) {
  let text = I18N[currentLang][key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of document.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
}

function setLang(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.getElementById("lang-de").classList.toggle("active", lang === "de");
  document.getElementById("lang-en").classList.toggle("active", lang === "en");
  applyStaticTranslations();
  if (allEvents.length > 0) {
    renderFilters(allEvents);
    refresh();
    updateSelectionCount();
    populateCalendarViewerSelect();
    if (!document.getElementById("calendar-view").hidden) renderCalendar();
  }
}

function localeTag() {
  return currentLang === "de" ? "de-DE" : "en-GB";
}

function dayFormatter() {
  return new Intl.DateTimeFormat(localeTag(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Titel/Beschreibung in der aktuell gewaehlten Sprache (mit Fallback,
// siehe scripts/scrape.js - titleEn/descriptionEn sind fuer alle Events
// vorhanden, aber zur Sicherheit trotzdem abgesichert).
function eventTitle(event) {
  return currentLang === "en" ? event.titleEn || event.title : event.title;
}

function eventDescription(event) {
  return currentLang === "en"
    ? event.descriptionEn || event.description
    : event.description;
}

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
    setSyncStatus(t("syncNotConfigured"));
    return;
  }

  const nameInput = document.getElementById("user-name");
  const name = nameInput.value.trim();
  if (!name) {
    setSyncStatus(t("syncEnterName"));
    return;
  }
  saveUserName(name);

  setSyncStatus(t("syncing"));
  try {
    await postOwnSelection(name);
    clubSelectionsByEvent = await fetchClubSelections();
    populateCalendarViewerSelect();
    refresh();
    setSyncStatus(
      t("syncedAt", { time: new Date().toLocaleTimeString(localeTag()) })
    );
  } catch (err) {
    console.error(err);
    setSyncStatus(t("syncFailed"));
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
  search: "",
};

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

// Durchsucht Titel, Beschreibung, Location, Format, Sprache, Track-Kuerzel
// (+ ausgeschriebene Namen), Speaker:innen (Name, Rolle, Organisation) und
// "Veranstaltet von". Ein Suchbegriff muss nur in EINEM der Felder vorkommen.
function eventSearchText(event) {
  const trackNames = event.trackTags.flatMap((tag) => [
    TRACK_LEGEND.de[tag] || "",
    TRACK_LEGEND.en[tag] || "",
  ]);
  const speakerText = event.speakers
    .flatMap((s) => [s.name, s.role, s.organization])
    .filter(Boolean);
  return [
    event.title,
    event.titleEn,
    event.description,
    event.descriptionEn,
    event.location,
    event.format,
    event.language,
    event.hostedBy,
    ...event.trackTags,
    ...trackNames,
    ...speakerText,
  ]
    .filter(Boolean)
    .join(" ␟ ") // Trennzeichen, damit Wortenden nicht versehentlich zusammenlaufen
    .toLowerCase();
}

function applyFilters(events) {
  const query = filters.search.trim().toLowerCase();
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
    if (query && !eventSearchText(event).includes(query)) return false;
    return true;
  });
}

function refresh() {
  renderEvents(applyFilters(allEvents));
}

function formatDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  return dayFormatter().format(date);
}

function eventTimeLabel(event) {
  if (event.startTime && event.endTime) {
    return `${event.startTime}–${event.endTime}`;
  }
  return t("timeUnknown");
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
  title.textContent = eventTitle(event);
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
      if (TRACK_LEGEND[currentLang][tag]) badge.title = TRACK_LEGEND[currentLang][tag];
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

  const description = eventDescription(event);
  if (description) {
    const descriptionEl = document.createElement("p");
    descriptionEl.className = "event-description";
    descriptionEl.textContent = description;
    card.appendChild(descriptionEl);
  }

  if (event.speakers.length > 0) {
    const speakers = document.createElement("p");
    speakers.className = "event-speakers";
    const label = document.createElement("strong");
    label.textContent = t("speakersLabel");
    speakers.appendChild(label);
    speakers.append(
      event.speakers
        .map((s) => {
          const details = [s.role, s.organization].filter(Boolean).join(", ");
          return details ? `${s.name} (${details})` : s.name;
        })
        .join(" · ")
    );
    card.appendChild(speakers);
  } else if (event.hostedBy) {
    const hosted = document.createElement("p");
    hosted.className = "event-speakers";
    const label = document.createElement("strong");
    label.textContent = t("hostedByLabel");
    hosted.appendChild(label);
    hosted.append(event.hostedBy);
    card.appendChild(hosted);
  }

  const clubNames = clubSelectionsByEvent.get(event.id);
  if (clubNames && clubNames.size > 0) {
    const clubInfo = document.createElement("p");
    clubInfo.className = "event-club-selections";
    clubInfo.textContent = t("alsoSelectedBy", { names: [...clubNames].join(", ") });
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
    heading.textContent = day === "unbekannt" ? t("noDate") : formatDay(day);
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
  allOption.textContent = t("filterAll");
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
  dayWrapper.append(t("filterDay"));
  const daySelect = document.createElement("select");
  daySelect.appendChild(new Option(t("filterAll"), "all"));
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
    renderSelect(t("filterFormat"), formats, filters.format, (value) => {
      filters.format = value;
      refresh();
    })
  );

  container.appendChild(
    renderSelect(t("filterLanguage"), languages, filters.language, (value) => {
      filters.language = value;
      refresh();
    })
  );

  const trackWrapper = document.createElement("div");
  trackWrapper.className = "filter filter-tracks";
  trackWrapper.append(t("filterTrack"));
  for (const track of tracks) {
    const trackLabel = document.createElement("label");
    trackLabel.className = "track-toggle";
    trackLabel.classList.toggle("checked", filters.tracks.has(track));
    if (TRACK_LEGEND[currentLang][track]) trackLabel.title = TRACK_LEGEND[currentLang][track];
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = filters.tracks.has(track);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) filters.tracks.add(track);
      else filters.tracks.delete(track);
      trackLabel.classList.toggle("checked", checkbox.checked);
      refresh();
    });
    trackLabel.appendChild(checkbox);
    trackLabel.append(track);
    trackWrapper.appendChild(trackLabel);
  }
  container.appendChild(trackWrapper);

  const legend = document.createElement("p");
  legend.className = "track-legend";
  legend.textContent =
    t("legendPrefix") +
    tracks.map((code) => `${code} = ${TRACK_LEGEND[currentLang][code] || code}`).join(" · ");
  container.appendChild(legend);

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
  onlySelectedWrapper.append(t("onlySelected"));
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
    `SUMMARY:${escapeIcsText(eventTitle(event))}`,
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
  const description = eventDescription(event);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

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

// ---------- Kalenderansicht (Phase 6) ----------
// Zeigt NUR die ausgewaehlten Events als Zeitraster (Tag/Woche), damit man
// vor dem .ics-Export sieht, wie sich die Auswahl ueber die Tage verteilt.

let conferenceDays = []; // sortierte eindeutige ISO-Tage aus allEvents
// viewingName: null = eigene lokale Auswahl im Kalender zeigen, sonst Name
// einer/eines synchronisierten Club-Mitglieds (siehe Kalender-Viewer-Select).
const calendarState = { mode: "day", anchorIndex: 0, viewingName: null };

const CALENDAR_START_HOUR = 6;
const CALENDAR_END_HOUR = 24;
const CALENDAR_PX_PER_HOUR = 60;

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function eventIdsForViewer(name) {
  if (!name) return selection;
  const ids = new Set();
  for (const [eventId, names] of clubSelectionsByEvent) {
    if (names.has(name)) ids.add(eventId);
  }
  return ids;
}

function selectedEventsForDay(day) {
  const ids = eventIdsForViewer(calendarState.viewingName);
  return allEvents.filter((e) => e.day === day && ids.has(e.id));
}

function populateCalendarViewerSelect() {
  const select = document.getElementById("calendar-viewer-select");
  const previousValue = select.value;
  const names = [...new Set([...clubSelectionsByEvent.values()].flatMap((s) => [...s]))].sort();

  select.innerHTML = "";
  select.appendChild(new Option(t("calendarViewerMe"), ""));
  for (const name of names) {
    select.appendChild(new Option(name, name));
  }
  select.value = names.includes(previousValue) ? previousValue : "";
  calendarState.viewingName = select.value || null;
}

// Greedy Spalten-Zuordnung fuer ueberlappende Events (Standard-Ansatz fuer
// Kalenderraster): sortiert nach Startzeit, jedes Event bekommt die erste
// Spalte, deren letztes Event schon vorbei ist. Anzahl belegter Spalten an
// diesem Tag bestimmt die Breite jedes Blocks.
function assignOverlapColumns(events) {
  const sorted = [...events].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  const columnEnds = []; // Ende-Minute des zuletzt plazierten Events je Spalte
  const placed = [];

  for (const event of sorted) {
    const start = timeToMinutes(event.startTime);
    let end = timeToMinutes(event.endTime);
    if (end <= start) end = CALENDAR_END_HOUR * 60; // Ueber Mitternacht -> am Tagesende kappen

    let col = columnEnds.findIndex((endMin) => endMin <= start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[col] = end;
    }
    placed.push({ event, start, end, col });
  }

  return { placed, columnCount: columnEnds.length || 1 };
}

function formatDayShort(isoDate) {
  return new Intl.DateTimeFormat(localeTag(), {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function renderCalendarSummary(events) {
  const counts = new Map();
  for (const e of events) {
    counts.set(e.format || "?", (counts.get(e.format || "?") || 0) + 1);
  }
  const parts = [...counts.entries()].map(([format, n]) => `${n} ${format}`);
  const who = calendarState.viewingName || t("calendarMe");
  document.getElementById("calendar-summary").textContent =
    events.length > 0
      ? t("calendarSummarySelected", { who, count: events.length, parts: parts.join(" · ") })
      : t("calendarSummaryEmpty", { who });
}

function renderCalendarRangeLabel(days) {
  const label = document.getElementById("calendar-range-label");
  if (days.length === 1) {
    label.textContent = formatDay(days[0]);
  } else {
    label.textContent = `${formatDayShort(days[0])} – ${formatDayShort(days[days.length - 1])}`;
  }
}

function renderCalendarAllDay(events) {
  const container = document.getElementById("calendar-allday");
  container.innerHTML = "";
  const noTime = events.filter((e) => !e.startTime);
  if (noTime.length === 0) return;

  const heading = document.createElement("p");
  heading.className = "calendar-allday-heading";
  heading.textContent = t("calendarNoTime");
  container.appendChild(heading);

  for (const event of noTime) {
    const chip = document.createElement("span");
    chip.className = `calendar-chip tag-format-${(event.format || "").toLowerCase()}`;
    chip.textContent = `${eventTitle(event)} (${formatDayShort(event.day)})`;
    container.appendChild(chip);
  }
}

function renderCalendarDayColumn(day, container) {
  const dayEvents = selectedEventsForDay(day).filter((e) => e.startTime);
  const { placed, columnCount } = assignOverlapColumns(dayEvents);

  const column = document.createElement("div");
  column.className = "calendar-day-column";
  column.style.height = `${(CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_PX_PER_HOUR}px`;

  for (const { event, start, end, col } of placed) {
    const top = ((start - CALENDAR_START_HOUR * 60) / 60) * CALENDAR_PX_PER_HOUR;
    const height = Math.max(
      ((end - start) / 60) * CALENDAR_PX_PER_HOUR,
      18
    );
    const block = document.createElement("div");
    block.className = `calendar-event tag-format-${(event.format || "").toLowerCase()}`;
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.style.left = `${(col / columnCount) * 100}%`;
    block.style.width = `${100 / columnCount}%`;
    block.title = `${event.startTime}–${event.endTime} ${eventTitle(event)}`;

    const time = document.createElement("span");
    time.className = "calendar-event-time";
    time.textContent = event.startTime;
    block.appendChild(time);
    block.append(` ${eventTitle(event)}`);

    column.appendChild(block);
  }

  container.appendChild(column);
}

function renderCalendarHourLabels(container) {
  const labels = document.createElement("div");
  labels.className = "calendar-hour-labels";
  labels.style.height = `${(CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_PX_PER_HOUR}px`;
  for (let h = CALENDAR_START_HOUR; h < CALENDAR_END_HOUR; h++) {
    const label = document.createElement("div");
    label.className = "calendar-hour-label";
    label.style.height = `${CALENDAR_PX_PER_HOUR}px`;
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    labels.appendChild(label);
  }
  container.appendChild(labels);
}

function currentCalendarDays() {
  if (conferenceDays.length === 0) return [];
  if (calendarState.mode === "day") {
    return [conferenceDays[calendarState.anchorIndex]];
  }
  return conferenceDays.slice(calendarState.anchorIndex, calendarState.anchorIndex + 7);
}

function renderCalendar() {
  const days = currentCalendarDays();
  if (days.length === 0) return;

  const allSelected = days.flatMap((d) => selectedEventsForDay(d));
  renderCalendarRangeLabel(days);
  renderCalendarSummary(allSelected);
  renderCalendarAllDay(allSelected);

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  grid.className = calendarState.mode === "day" ? "calendar-grid-day" : "calendar-grid-week";

  // Kopfzeile mit Tagesnamen nur in der Wochenansicht - steht ÜBER der
  // Stundenachse+Spalten-Zeile (nicht davor als eigener Block, sonst sieht
  // es wie eine zweite, verwaiste Mini-Tagesansicht aus).
  if (calendarState.mode === "week") {
    const headerRow = document.createElement("div");
    headerRow.className = "calendar-week-headers";
    const spacer = document.createElement("div");
    headerRow.appendChild(spacer);
    for (const day of days) {
      const h = document.createElement("div");
      h.className = "calendar-week-header";
      h.textContent = formatDayShort(day);
      headerRow.appendChild(h);
    }
    grid.appendChild(headerRow);
  }

  const body = document.createElement("div");
  body.className = "calendar-body";
  renderCalendarHourLabels(body);

  const columnsWrapper = document.createElement("div");
  columnsWrapper.className = "calendar-columns";
  for (const day of days) {
    renderCalendarDayColumn(day, columnsWrapper);
  }
  body.appendChild(columnsWrapper);
  grid.appendChild(body);

  document.getElementById("calendar-prev").disabled = calendarState.anchorIndex <= 0;
  const step = calendarState.mode === "day" ? 1 : 7;
  document.getElementById("calendar-next").disabled =
    calendarState.anchorIndex + step >= conferenceDays.length;
}

function setCalendarMode(mode) {
  calendarState.mode = mode;
  document
    .getElementById("calendar-mode-day")
    .classList.toggle("active", mode === "day");
  document
    .getElementById("calendar-mode-week")
    .classList.toggle("active", mode === "week");
  renderCalendar();
}

function moveCalendar(delta) {
  const step = calendarState.mode === "day" ? delta : delta * 7;
  const next = calendarState.anchorIndex + step;
  calendarState.anchorIndex = Math.max(0, Math.min(next, conferenceDays.length - 1));
  renderCalendar();
}

function switchView(view) {
  document.getElementById("list-view").hidden = view !== "list";
  document.getElementById("calendar-view").hidden = view !== "calendar";
  document.getElementById("view-list").classList.toggle("active", view === "list");
  document
    .getElementById("view-calendar")
    .classList.toggle("active", view === "calendar");
  if (view === "calendar") renderCalendar();
}

function updateSelectionCount() {
  const status = document.getElementById("status");
  status.textContent = t("selectedStatus", { count: selection.size, total: totalEventCount });

  document.getElementById("export-ics").disabled = selection.size === 0;
  document.getElementById("clear-selection").disabled = selection.size === 0;
}

function clearSelection() {
  if (selection.size === 0) return;
  const confirmed = confirm(t("clearConfirm", { count: selection.size }));
  if (!confirmed) return;

  selection.clear();
  saveSelection(selection);
  refresh();
  updateSelectionCount();
  if (!document.getElementById("calendar-view").hidden) renderCalendar();
}

async function main() {
  document.getElementById("lang-de").classList.toggle("active", currentLang === "de");
  document.getElementById("lang-en").classList.toggle("active", currentLang === "en");
  applyStaticTranslations();
  document.getElementById("lang-de").addEventListener("click", () => setLang("de"));
  document.getElementById("lang-en").addEventListener("click", () => setLang("en"));

  const status = document.getElementById("status");
  try {
    const res = await fetch("data/events.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = await res.json();
    allEvents = events;
    totalEventCount = events.length;
    conferenceDays = [...new Set(events.map((e) => e.day))].sort();
    renderFilters(events);
    refresh();
    updateSelectionCount();

    document.getElementById("search").addEventListener("input", (e) => {
      filters.search = e.target.value;
      refresh();
    });

    function goHome() {
      switchView("list");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    document.getElementById("home-link").addEventListener("click", goHome);
    document.getElementById("home-link").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goHome();
      }
    });

    document.getElementById("view-list").addEventListener("click", () => switchView("list"));
    document
      .getElementById("view-calendar")
      .addEventListener("click", () => switchView("calendar"));
    document
      .getElementById("calendar-mode-day")
      .addEventListener("click", () => setCalendarMode("day"));
    document
      .getElementById("calendar-mode-week")
      .addEventListener("click", () => setCalendarMode("week"));
    document.getElementById("calendar-prev").addEventListener("click", () => moveCalendar(-1));
    document.getElementById("calendar-next").addEventListener("click", () => moveCalendar(1));
    document.getElementById("calendar-viewer-select").addEventListener("change", (e) => {
      calendarState.viewingName = e.target.value || null;
      renderCalendar();
    });

    document.getElementById("export-ics").addEventListener("click", () => {
      const selectedEvents = allEvents.filter((event) => selection.has(event.id));
      downloadIcsFile("efa26-mein-programm.ics", buildIcs(selectedEvents));
    });

    document.getElementById("clear-selection").addEventListener("click", clearSelection);

    document.getElementById("user-name").value = loadUserName();
    document
      .getElementById("sync-button")
      .addEventListener("click", syncWithClub);

    if (SHEET_API_URL) {
      setSyncStatus(t("loadingClub"));
      try {
        clubSelectionsByEvent = await fetchClubSelections();
        populateCalendarViewerSelect();
        refresh();
        setSyncStatus(t("clubLoaded"));
      } catch (err) {
        console.error(err);
        setSyncStatus(t("clubLoadFailed"));
      }
    } else {
      setSyncStatus(t("syncNotConfigured"));
    }
  } catch (err) {
    status.textContent = t("loadEventsFailed");
    console.error(err);
  }
}

main();
