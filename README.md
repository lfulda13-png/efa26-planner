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

## Club-Sync einrichten (Phase 4)

Damit alle Club-Mitglieder sehen können, wer welche Events ausgewählt hat,
schreibt die App in ein gemeinsames Google Sheet. Da die App komplett
statisch ist (kein eigener Server), läuft das über ein **Google Apps
Script**, das an das Sheet gebunden und als Web-App veröffentlicht wird.
Einmaliges Setup (macht am besten, wer das Sheet "besitzt"):

1. **Google Sheet erstellen**: Neues leeres Sheet auf
   [sheets.google.com](https://sheets.google.com) anlegen (Name z. B.
   "EFA26 Planner - Auswahl"). Das Skript legt sich sein eigenes Tabellenblatt
   ("Selections") automatisch an, es muss also nichts vorbereitet werden.
2. **Apps Script öffnen**: Im Sheet oben auf **Erweiterungen → Apps Script**.
3. **Code einfügen**: Den kompletten Inhalt von
   [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) in den Editor
   kopieren (vorhandenen Beispielcode ersetzen) und speichern (Diskette-Symbol
   oder Cmd/Ctrl+S).
4. **Deployen**: Oben rechts auf **Bereitstellen → Neue Bereitstellung**.
   - Typ auswählen: **Web-App**
   - "Ausführen als": **Ich** (dein Google-Account)
   - "Wer hat Zugriff": **Alle**
   - Auf **Bereitstellen** klicken
5. Google fragt nach **Berechtigungen** (Zugriff auf das Sheet) - bestätigen
   ("Erweitert" → "Zu [Projektname] (unsicher) wechseln" ist normal, weil das
   Skript nicht von Google geprüft ist; es ist dein eigenes Skript, das nur
   auf dein eigenes Sheet zugreift).
6. Am Ende zeigt Google eine **Web-App-URL** (endet auf `/exec`). Diese URL
   kopieren.
7. Die URL in `app.js` eintragen: `SHEET_API_URL` am Dateianfang setzen, dann
   committen und pushen - fertig, alle, die die App öffnen, nutzen ab dann
   dasselbe Sheet.

**Wichtig:** Jede Person, die synchronisiert, sieht/schreibt in dasselbe
Sheet. Es gibt keinen Login - der eingegebene Name ist der einzige
"Identifikator". Für einen Freundeskreis-Club ist das ok, für sensible Daten
wäre es das nicht.
