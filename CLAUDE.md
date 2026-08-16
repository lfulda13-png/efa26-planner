# EFA26 Planner — Projektkontext

Framework-freie Web-App (HTML/CSS/JS, kein Build-Step) zur Koordination des
European Forum Alpbach 2026 (24. August – 4. September 2026) mit Freund:innen
aus dem Club. Wird über mehrere Claude-Code-Sessions gebaut. Nutzer ist
Anfänger mit Claude Code: kleine Schritte, nach jedem funktionierenden Stück
committen, lieber nachfragen als raten.

## Datenmodell

### `data/events.json`

```jsonc
{
  "id": "welcome-of-scholarship-holders-2",   // Website-URL-Slug (stabil, eindeutig)
  "title": "Begrüßung der Stipendiat:innen",  // Deutsch (von der /de/-Programmseite)
  "day": "2026-08-24",                        // ISO-Datum
  "startTime": "18:00",                       // "HH:MM", von der PDF (kann null sein, siehe unten)
  "endTime": "19:30",
  "location": "CCA – Herz-Kremenak-Saal",
  "trackTags": ["ART", "CLI", "DEM", "FIN", "SEC"], // Kurzcodes, siehe unten
  "format": "Content",                        // "Content" | "Rituals" | "Network"
  "language": "English",                      // Sprache der Session (nicht der UI)
  "description": "..."                        // Deutsch bevorzugt, sonst PDF-Fallback (englisch)
}
```

### `data/speakers.json`

```jsonc
{
  "name": "Othmar Karas",
  "role": "Präsident",
  "organization": "European Forum Alpbach",
  "bioLink": "https://www.alpbach.org/de/speakers/karas-othmar-4"
}
```

## Wie die Daten entstehen (wichtig für spätere Sessions!)

Die Alpbach-Website (`alpbach.org/de/event-de/programm-26`, serverseitig
gerendert via Craft CMS + HTMX/Sprig) zeigt **keine exakten Uhrzeiten** im
HTML — nur grobe Tageszeit-Kategorien (morgen/vormittag/mittag/nachmittag/abend)
und die Dauer in Minuten. Das wurde per Rohdaten-Analyse (curl + grep über das
komplette HTML) verifiziert, nicht geraten.

Der Nutzer hat daher die "Your personal schedule"-PDF von der Website
exportiert (`data/source/AlpbachPlan.pdf`, enthält den kompletten Zeitplan,
nicht nur eine persönliche Auswahl — 306 von 313 Sessions matchen 1:1) und ins
Projekt gelegt. Diese PDF hat exakte Start-/Endzeiten, Location und die volle
Beschreibung, aber **keine** IDs, Format-Codes oder Track-Kurzcodes — und ist
auf **Englisch**, während die Website-Titel für die App auf **Deutsch** sein
sollen (Zielgruppe: deutschsprachiger Club).

`scripts/scrape.js` kombiniert deshalb **drei** Quellen:

1. **Deutsche Programmseite** (`/de/event-de/programm-26`) → Anzeige-Felder:
   Titel, Kurzbeschreibung, Location, `format` (Content/Rituals/Network — steht
   wörtlich im HTML, keine Heuristik nötig), `trackTags` (Kurzcodes wie ART/FIN/SEC,
   stehen ebenfalls wörtlich im HTML), `language`, sowie die stabile `id` (URL-Slug).
2. **Englische Programmseite** (`/event/programme-26`) → dient NUR als Brücke:
   gleicher URL-Slug wie die deutsche Seite, aber englischer Titel — der exakt
   mit den PDF-Titeln übereinstimmt und so den Abgleich mit der PDF ermöglicht.
3. **PDF-Export** → exakte `startTime`/`endTime`, `location`, volle
   Beschreibung (Fallback falls die deutsche Kurzbeschreibung fehlt).

Abgleich-Logik: pro Kalendertag werden HTML-Sessions und PDF-Blöcke über einen
Titel-Vergleich gematcht (`matchTitleLineCount` in `scrape.js`) — nötig, weil
PDF-Titel manchmal über mehrere Zeilen umbrechen, ohne erkennbaren Marker.

**Bekannte Lücke:** 8 von 313 Events haben aktuell `startTime: null` (u. a.
die mehrtägigen "Labs", ein Hike mit Sonderzeichen im Titel, "Alpbach Pride") —
vermutlich Titel-Abweichungen zwischen Website und PDF, die nicht mehr
nachverfolgt wurden. Bei Bedarf in `data/events.json` nach `"startTime": null`
suchen und die PDF (`data/source/AlpbachPlan.pdf`) manuell dagegenhalten.

Die Speaker-Liste (`/de/speakers-efa26`) wird per Sprig/HTMX-Pagination
komplett abgerufen (12 Speaker pro "Seite", signierter `sprig:config`-Parameter
aus der ersten Seite wiederverwendet).

## Gesamtplan

- **Phase 1 — Setup + Daten** ✅ abgeschlossen
  - Projektstruktur, GitHub-Repo, GitHub Pages
  - `scripts/scrape.js` (Node, `cheerio` + `pdf-parse`)
  - `data/events.json` (314 Einträge, davon 306 mit exakter Uhrzeit)
  - `data/speakers.json` (385 Einträge)
- **Phase 2 — Kalender-UI** ✅ abgeschlossen (`app.js`, `index.html`, `style.css`)
  - Events aus `data/events.json` laden, nach Tag gruppiert anzeigen
  - Auswahl per Checkbox, persistiert in `localStorage`
    (Key `efa26-selected-events`, Array von Event-`id`s)
  - Filter: Tag, Format, Sprache (Dropdowns), Track (Mehrfachauswahl-Checkboxen)
  - "Nur ausgewählte anzeigen"-Umschalter + Zähler ("X von Y ausgewählt")
  - Beim Testen im Browser einen echten Datenbug gefunden und gefixt: sehr
    lange Dauern (mehrtägige Labs) wurden mit deutschem Tausenderpunkt
    angezeigt ("3.060") und dadurch faelschlich als `language` statt als
    `durationMinutes` erkannt — jetzt in `scrape.js` korrigiert.
  - Bekannte Grenze: `durationMinutes` wird zwar geparst, aber (noch) nirgends
    in der UI angezeigt/genutzt — nur `startTime`/`endTime`. Kein Bug, einfach
    ungenutztes Feld.
- **Phase 3 — ICS-Export**: Ausgewählte Events als `.ics`-Datei exportieren
  (Google/Apple/Outlook-kompatibel). Naheliegender Einstieg: Button neben dem
  Auswahl-Zähler in `index.html`/`app.js`, der aus `selection` + `allEvents`
  eine `.ics`-Datei baut (VEVENT pro Event, `DTSTART`/`DTEND` aus `day` +
  `startTime`/`endTime`, Events ohne `startTime` müssen behandelt werden —
  z. B. auslassen oder als ganztägig markieren, mit Nutzer absprechen).
- **Phase 4 — Sync via Google Sheet**: Auswahl der Club-Mitglieder in einem
  gemeinsamen Google Sheet ablegen/lesen, Übersicht wer was gewählt hat
- **Phase 5 — Alpbach-Design**: visuelles Feintuning
- **Phase 6 — optional**: durchsuchbare Liste aller Events & Speaker
  (nutzt `data/speakers.json`, inkl. `bioLink`)

Für die nächste Session reicht: **"mach weiter mit Phase 3"**.

## Setup-Hinweise (diese Maschine)

- Node.js ist NICHT über Homebrew installiert (Homebrew-Build schlug fehl,
  wollte `llvm` aus Source kompilieren wegen veralteter Command Line Tools).
  Stattdessen liegt ein offizielles Node-Binary unter `~/.local/node`,
  verlinkt nach `~/.local/bin/node` (bereits im `PATH`).
