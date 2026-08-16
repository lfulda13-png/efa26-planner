# EFA26 Planner

Kleine, framework-freie Web-App (HTML/CSS/JS, kein Build-Step) zur Koordination
des European Forum Alpbach 2026 mit Freund:innen aus dem Club:

- Kalender-Builder: Events auswählen, als `.ics` exportieren
- Übersicht, welche Events andere Club-Mitglieder gewählt haben (Sync via Google Sheet)
- Optional: durchsuchbare Liste aller Events & Speaker

Der Gesamtplan und das Datenmodell stehen in [`CLAUDE.md`](./CLAUDE.md).

## Projektstruktur

```
index.html, style.css, app.js   Die App selbst (kein Build-Step, direkt im Browser)
data/events.json                Alle EFA26-Sessions
data/speakers.json              Alle EFA26-Speaker
data/source/AlpbachPlan.pdf     Personal-Schedule-PDF-Export der Website (Datenquelle fuer exakte Uhrzeiten)
scripts/scrape.js               Node-Skript, das events.json/speakers.json erzeugt
```

## Daten neu scrapen

```bash
cd scripts
npm install
node scrape.js
```

Erzeugt `data/events.json` und `data/speakers.json` neu. Details zur
Datenquellen-Logik (warum zwei Quellen kombiniert werden) stehen in
`scripts/scrape.js` (Kommentar am Dateianfang) und in `CLAUDE.md`.

## App lokal öffnen

`index.html` direkt im Browser öffnen, oder z. B. mit
`npx serve .` lokal servieren.
