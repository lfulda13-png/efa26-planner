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
  "description": "...",                       // Deutsch bevorzugt, sonst PDF-Fallback (englisch)
  "speakers": [                               // Panelist:innen, aus der PDF extrahiert (kann leer sein)
    { "name": "Othmar Karas", "role": "President", "organization": "European Forum Alpbach" }
  ],
  "hostedBy": null                            // Veranstaltende Gruppe bei Happenings/Ritualen (statt speakers), sonst null
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
- **Phase 3 — ICS-Export** ✅ abgeschlossen (`app.js`: `buildIcs`,
  `downloadIcsFile` + Button `#export-ics` in `index.html`)
  - Ein VEVENT pro ausgewähltem Event, Download als `efa26-mein-programm.ics`
  - Zeiten werden als UTC exportiert; Alpbach/Europe-Vienna ist im gesamten
    Konferenzzeitraum in der Sommerzeit (UTC+2), daher fest verdrahteter
    Offset (`VIENNA_UTC_OFFSET_HOURS`) statt vollem VTIMEZONE-Block — falls
    das Projekt mal eine Konferenz über den DST-Wechsel hinweg abbilden
    müsste, müsste das neu gebaut werden.
  - Die 8 Events ohne exakte Uhrzeit werden als ganztägige Termine exportiert
    (DTEND exklusiv = Folgetag), damit sie nicht komplett fehlen
  - Zeilenfaltung nach RFC 5545 ist byte-basiert (UTF-8), nicht zeichenbasiert
    — wichtig wegen Umlauten in den deutschen Titeln/Beschreibungen
  - Getestet: 314 Events durchgeneriert, alle UIDs nach RFC5545-Unfolding
    eindeutig, keine Zeile über 75 Bytes, Escaping von Kommas/Semikolons
    funktioniert. Noch nicht getestet: tatsächlicher Import in Google/Apple/
    Outlook Kalender (nur Struktur-Validierung, kein echter Import-Test)
- **Phase 4 — Sync via Google Sheet** ✅ abgeschlossen
  - `google-apps-script/Code.gs` (Backend, an Nutzer-eigenem Google Sheet
    deployt) + Setup-Anleitung in README.md
  - `app.js`: Name-Eingabe (localStorage `efa26-user-name`), Sync-Button,
    "Auch gewählt von"-Anzeige pro Event-Karte. POST als `text/plain` statt
    `application/json`, um den CORS-Preflight zu vermeiden, den Apps-Script-
    Web-Apps nicht beantworten.
  - `SHEET_API_URL` in `app.js` ist gesetzt (echte, deployte Web-App-URL).
    End-to-end getestet: POST/GET/Ersetzen-Logik gegen das echte Sheet.
  - **Wichtig zu wissen für später:** Der Endpunkt hat "Wer hat Zugriff:
    Alle" (kein Login) und die URL steht im öffentlichen Repo - technisch
    könnte also nicht nur der Club, sondern irgendwer im Internet Zeilen
    reinschreiben. Für einen Freundeskreis okay (siehe README.md), aber
    falls das Sheet je Probleme mit Spam/Missbrauch bekommt: Deployment auf
    "Nur ich" umstellen und einen einfachen Shared-Secret-Parameter
    einbauen, oder komplett neu denken.
- **Phase 5 — Alpbach-Design** ✅ abgeschlossen, ein Detail unverifiziert
  - Farben aus dem echten `alpbach.org`-CSS extrahiert (nicht geraten):
    Basis Schwarz/Weiss/Grau, drei gedeckte Alpin-Akzente (Violett
    `#7e5585`, Salbeigruen `#9fc17b`, Creme `#e4d9c6`) als CSS Custom
    Properties in `style.css` (`:root` + `prefers-color-scheme: dark`)
  - Fonts: Alpbach nutzt "Antique Olive Nord" + "Degular" ueber ein
    kostenpflichtiges Adobe-Fonts-Kit - **nicht** mitbenutzbar. Stattdessen
    freie Google Fonts mit aehnlichem Charakter: Space Grotesk (Headings),
    Inter (Text)
  - Format-Badges (Content/Rituals/Network) je in einer der drei
    Akzentfarben, Track-Tags Schwarz/Weiss wie im Original, Auswahl-
    Highlight in Salbeigruen, grosse fette Ueberschriften, Track-Filter als
    Pill-Buttons
  - Track-Filter-Pill-Faerbung vom Nutzer im echten Browser bestaetigt
    (die Test-Umgebung konnte es wegen eines `document.hidden`-Render-
    Throttlings nicht selbst verifizieren, siehe Git-Historie).
- **Phase 6 — Panelisten pro Event + Kalenderansicht** ✅ abgeschlossen
  (Nutzer-Prioritaet, "Suche" aus der urspruenglichen Phase-6-Idee bewusst
  zurueckgestellt fuer spaeter)
  - `scrape.js` extrahiert jetzt `speakers` (Name/Rolle/Organisation) und
    `hostedBy` pro Event aus der PDF, angezeigt in der Event-Karte
    (`app.js`). Zwei echte Bugs beim Verifizieren gefunden+gefixt (falsch
    positionierte "Hosted by"-Zeile, zu lockeres Speaker-Namen-Muster hat
    vereinzelt Beschreibungssaetze als Namen eingelesen) - siehe Git-Log
    Commit "Panelisten pro Event akkurat extrahieren". Gegen den vollen
    Datensatz verifiziert: 687 Speaker-Eintraege, 0 Anomalien.
  - **Bewusst NICHT gemacht:** Kein automatischer Abgleich mit
    `data/speakers.json` fuer `bioLink` pro Event-Speaker - Risiko von
    Namens-Fehlzuordnungen (z.B. Duplikate ueber mehrere Jahre) wurde
    hoeher eingeschaetzt als der Nutzen, angesichts der Nutzer-Prioritaet
    "sehr akkurat". Bei Bedarf spaeter mit vorsichtiger Matching-Strategie
    nachruesten.
  - Neue Kalenderansicht (Tag/Woche) fuer die eigene Auswahl, siehe
    "Ansicht-Umschalter" in `index.html`/`app.js` (Abschnitt "Kalenderansicht
    (Phase 6)"). Details und bekannte Vereinfachung (Mitternachts-
    ueberschreitende Events werden am Tagesende gekappt) im Commit
    "Kalenderansicht (Tag/Woche) fuer die eigene Auswahl".
  - **Verwandter Bug, noch nicht gefixt:** Derselbe Mitternachts-Fall
    betrifft auch den ICS-Export (Phase 3) - `buildIcs` geht von
    gleichem Kalendertag fuer `startTime`/`endTime` aus. Betrifft aktuell
    nur 1 Event ("European Echoes - Academy Days Abschlussfeier",
    21:00–01:00). Bei Bedarf fixen: `toIcsDateTimeUtc` muesste erkennen,
    wenn `endTime < startTime`, und dann `event.day` fuer das Ende um
    einen Tag verschieben.
- **Weitere "Gadgets" (nach Nutzer-Ansage besprechen, bevor gebaut wird):**
  durchsuchbare Liste aller Events & Speaker (Volltextsuche), Speaker-
  bioLink-Abgleich (siehe oben), Mitternachts-Bug im ICS-Export

Für die nächste Session: einfach fragen, was als naechstes drankommt -
es gibt keine feste "Phase 7", siehe "Weitere Gadgets" oben.

## Setup-Hinweise (diese Maschine)

- Node.js ist NICHT über Homebrew installiert (Homebrew-Build schlug fehl,
  wollte `llvm` aus Source kompilieren wegen veralteter Command Line Tools).
  Stattdessen liegt ein offizielles Node-Binary unter `~/.local/node`,
  verlinkt nach `~/.local/bin/node` (bereits im `PATH`).
