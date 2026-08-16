/**
 * EFA26 Planner - Club-Sync Backend
 *
 * Läuft als Google Apps Script Web App, an ein Google Sheet gebunden.
 * Speichert pro Person, welche Event-IDs sie ausgewählt hat (eine Zeile pro
 * Person+Event). Bei jeder Synchronisierung wird die komplette Auswahl einer
 * Person ersetzt (alte Zeilen löschen, neue schreiben) - so bleiben
 * De-Selektionen korrekt.
 *
 * Setup: siehe README.md, Abschnitt "Club-Sync einrichten (Phase 4)".
 */

const SHEET_NAME = "Selections";

function doGet(e) {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues().slice(1); // Header überspringen
  const selections = rows.map((row) => ({
    name: row[0],
    eventId: row[1],
    selectedAt: row[2],
  }));
  return jsonResponse({ selections });
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: "Ungültiges JSON" });
  }

  const name = String(payload.name || "").trim();
  const eventIds = Array.isArray(payload.eventIds) ? payload.eventIds : [];

  if (!name) {
    return jsonResponse({ error: "name fehlt" });
  }

  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  // Bestehende Zeilen dieser Person entfernen (von unten nach oben löschen,
  // damit sich die Zeilennummern der noch zu löschenden Zeilen nicht verschieben).
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === name) sheet.deleteRow(i + 1);
  }

  const now = new Date().toISOString();
  const newRows = eventIds.map((id) => [name, id, now]);
  if (newRows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, newRows.length, 3)
      .setValues(newRows);
  }

  return jsonResponse({ ok: true, count: newRows.length });
}

function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(["Name", "EventId", "SelectedAt"]);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
