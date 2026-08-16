// EFA26 Planner - Scraping-Skript
//
// Kombiniert zwei Quellen, weil keine davon allein alle Felder liefert:
//  - Die Programmseite (HTML) hat Format (Content/Rituals/Network), Track-Kurzcodes
//    (ART/FIN/...), Sprache und eine stabile Session-ID (URL-Slug), aber KEINE
//    exakten Uhrzeiten (nur grobe Tageszeit-Kategorien wie "vormittag").
//  - Die vom Nutzer exportierte "Your personal schedule" PDF hat exakte Start-/
//    Endzeiten, Location und die volle Beschreibung, aber keine IDs/Format-Codes.
//
// Beide Listen werden über den normalisierten Titel (+ Reihenfolge bei
// Duplikaten) gemerged. Ergebnis: data/events.json, data/speakers.json.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import pdfParse from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const PDF_PATH = path.join(DATA_DIR, "source", "AlpbachPlan.pdf");

// Deutsche Seite liefert die Anzeige-Felder (Titel, Beschreibung, Location).
// Die PDF ist aber englisch -> die englische Programmseite dient nur als
// Bruecke: gleicher URL-Slug wie die deutsche Seite, englischer Titel zum
// Abgleich mit der PDF (siehe matchTitleLineCount / main()).
const PROGRAM_URL_DE = "https://www.alpbach.org/de/event-de/programm-26";
const PROGRAM_URL_EN = "https://www.alpbach.org/event/programme-26";
const SPEAKERS_URL = "https://www.alpbach.org/de/speakers-efa26";
const SPRIG_ENDPOINT =
  "https://www.alpbach.org/index.php?p=actions/sprig-core/components/render";
const USER_AGENT = "Mozilla/5.0 (compatible; efa26-planner-scraper/1.0)";

const TRACK_CODE_BY_NAME = {
  art: "ART",
  climate: "CLI",
  democracy: "DEM",
  finance: "FIN",
  lab: "LAB",
  security: "SEC",
  seminar: "SEM",
  studio: "STU",
};

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function normalizeTitle(title) {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

// ---------- HTML (Programmseite) ----------

async function fetchProgramHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Programmseite (${url}): HTTP ${res.status}`);
  }
  return res.text();
}

function dayIdToIsoDate(dayId) {
  // z.B. "monday-24-august" -> "2026-08-24"
  const match = dayId.match(/-(\d{1,2})-([a-z]+)$/i);
  if (!match) return null;
  const [, day, monthName] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `2026-${month}-${day.padStart(2, "0")}`;
}

function parseProgramHtml(html) {
  const $ = cheerio.load(html);
  const events = [];

  $(".schedule-accordion").each((_, accordion) => {
    const dayId = $(accordion).find(".accordion-head[id]").attr("id");
    const isoDay = dayId ? dayIdToIsoDate(dayId) : null;

    $(accordion)
      .find("a.session-card")
      .each((__, el) => {
        const card = $(el);
        const href = card.attr("href") || "";
        const slug = href.split("/sessions/")[1]?.replace(/\/$/, "") || null;

        const trackTags = [
          ...new Set(
            card
              .find(".cat-short-container span")
              .map((i, e) => $(e).text().trim())
              .get()
              .filter(Boolean)
          ),
        ];

        const format = card.find(".formatcode").text().trim() || null;
        const title = card.find(".session-name").text().trim();

        let language = null;
        let durationMinutes = null;
        card
          .find(".lang-time-labels span")
          .each((i, e) => {
            const text = $(e).text().trim();
            // Lange Dauern (z.B. mehrtaegige Labs) werden mit deutschem
            // Tausenderpunkt angezeigt, z.B. "3.060" (Minuten).
            if (/^[\d.]+$/.test(text)) {
              durationMinutes = Number(text.replace(/\./g, ""));
            } else if (text) {
              language = text;
            }
          });

        const locationParts = card
          .find(".location .block")
          .map((i, e) => $(e).text().replace(/\s+/g, " ").trim())
          .get()
          .map((s) => s.replace(/,$/, "").trim())
          .filter(Boolean);
        const location = locationParts.join(", ") || null;

        const description =
          card.find(".session-description").text().trim() || null;

        if (!title || !slug) return;

        events.push({
          slug,
          title,
          normalizedTitle: normalizeTitle(title),
          dayId,
          isoDay,
          trackTags,
          format,
          language,
          durationMinutes,
          location,
          description,
        });
      });
  });

  return events;
}

// ---------- PDF (persönlicher Zeitplan-Export) ----------

const HEADER_RE =
  /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}) - \d{2}\.\d{2}\.\d{4} (\d{2}:\d{2}) \| ([^|]+) \| (.+)$/gm;
const SPEAKER_LINE_RE = /^[\p{L}][\p{L} .'’-]*,\s[\p{L}][\p{L} .'’-]*:(\s|$)/u;
const HOSTED_BY_RE = /^Hosted by:/;

// Titel in der PDF koennen ueber mehrere Zeilen umbrechen, ohne erkennbaren
// Zeilenumbruch-Marker. normalizeForCompare gleicht Anfuehrungszeichen/
// Gedankenstriche zwischen HTML- und PDF-Quelle an, damit ein exakter
// Textvergleich (nicht nur Substring) moeglich ist.
// Fuegt PDF-Zeilen zu einem String zusammen. Endet eine Zeile mit "-", wird
// ohne Leerzeichen angehaengt, da das i.d.R. ein Wort ist, das am Zeilenende
// umgebrochen wurde (z.B. "problem-" + "solving" -> "problem-solving").
function joinPdfLines(lines) {
  let result = "";
  for (const line of lines) {
    if (result.endsWith("-")) result += line;
    else if (result) result += ` ${line}`;
    else result = line;
  }
  return result;
}

function normalizeForCompare(s) {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Findet heraus, wie viele der ersten bodyLines zusammen den (bekannten)
// Titel ergeben, indem Zeilen akkumuliert werden, bis der normalisierte
// Text exakt dem erwarteten Titel entspricht. Gibt 0 zurueck, wenn kein Match.
function matchTitleLineCount(bodyLines, expectedTitle) {
  const target = normalizeForCompare(expectedTitle);
  for (let k = 0; k < Math.min(bodyLines.length, 6); k++) {
    const accumulated = joinPdfLines(bodyLines.slice(0, k + 1));
    if (normalizeForCompare(accumulated) === target) return k + 1;
  }
  return 0;
}

function splitTrackAndDescription(remainderLines) {
  let idx = 0;
  let trackFull = [];
  if (remainderLines[idx]?.startsWith("Track: ")) {
    trackFull = remainderLines[idx]
      .slice("Track: ".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    idx++;
  }
  const descriptionLines = [];
  while (
    idx < remainderLines.length &&
    !SPEAKER_LINE_RE.test(remainderLines[idx]) &&
    !HOSTED_BY_RE.test(remainderLines[idx])
  ) {
    descriptionLines.push(remainderLines[idx]);
    idx++;
  }
  return {
    trackFull,
    description: joinPdfLines(descriptionLines).replace(/\s+/g, " ").trim(),
  };
}

// Liefert PDF-"Bloecke" (noch nicht in title/track/description zerlegt) -
// die Zerlegung passiert erst beim Merge, sobald der echte Titel aus dem
// HTML feststeht (siehe matchTitleLineCount).
async function parsePdfBlocks() {
  const buffer = await fs.readFile(PDF_PATH);
  const data = await pdfParse(buffer);
  const text = data.text;

  const headers = [...text.matchAll(HEADER_RE)];
  const blocks = [];

  for (let i = 0; i < headers.length; i++) {
    const m = headers[i];
    const [, dd, mm, yyyy, startTime, endTime, headerType, location] = m;
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const bodyLines = text
      .slice(bodyStart, bodyEnd)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (bodyLines.length === 0) continue;

    blocks.push({
      isoDay: `${yyyy}-${mm}-${dd}`,
      startTime,
      endTime,
      headerType: headerType.trim(),
      location: location.trim(),
      bodyLines,
      used: false,
    });
  }

  return blocks;
}

// ---------- Format-Mapping (PDF-Feintyp -> Content/Rituals/Network) ----------
// Fallback nur falls kein HTML-Match existiert (Regelfall liefert die
// Programmseite direkt "Content"/"Rituals"/"Network").
function formatFromHeaderType(headerType) {
  if (headerType === "Ritual") return "Rituals";
  if (["Happening", "Open Network", "Closed Network"].includes(headerType))
    return "Network";
  return "Content";
}

function trackCodesFromFullNames(names) {
  return [
    ...new Set(
      names
        .map((n) => TRACK_CODE_BY_NAME[n.toLowerCase()])
        .filter(Boolean)
    ),
  ];
}

// ---------- Merge ----------

function groupByDay(list, dayKey) {
  const map = new Map();
  for (const item of list) {
    const day = item[dayKey];
    if (!day) continue;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(item);
  }
  return map;
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Matcht HTML-Sessions und PDF-Bloecke pro Tag ueber einen Titel-Abgleich
// (statt globaler Titelgruppierung), weil Reihenfolge/Sprache/Zeilenumbrueche
// zwischen den Quellen variieren koennen. Siehe matchTitleLineCount.
function mergeEvents(htmlEvents, pdfBlocks) {
  const htmlByDay = groupByDay(htmlEvents, "isoDay");
  const pdfByDay = groupByDay(pdfBlocks, "isoDay");
  const allDays = new Set([...htmlByDay.keys(), ...pdfByDay.keys()]);

  const events = [];
  const unmatchedHtml = [];
  const unmatchedPdf = [];

  for (const day of allDays) {
    const htmlList = htmlByDay.get(day) || [];
    const pdfList = pdfByDay.get(day) || [];

    for (const h of htmlList) {
      let matchedBlock = null;
      let titleLineCount = 0;
      for (const p of pdfList) {
        if (p.used) continue;
        const n = matchTitleLineCount(p.bodyLines, h.matchTitle || h.title);
        if (n > 0) {
          matchedBlock = p;
          titleLineCount = n;
          break;
        }
      }

      if (matchedBlock) {
        matchedBlock.used = true;
        const remainder = matchedBlock.bodyLines.slice(titleLineCount);
        const { trackFull, description } = splitTrackAndDescription(remainder);

        const trackTags =
          h.trackTags.length > 0 ? h.trackTags : trackCodesFromFullNames(trackFull);

        events.push({
          id: h.slug,
          title: h.title,
          day: matchedBlock.isoDay,
          startTime: matchedBlock.startTime,
          endTime: matchedBlock.endTime,
          location: matchedBlock.location || h.location,
          trackTags,
          format: h.format || formatFromHeaderType(matchedBlock.headerType),
          language: h.language,
          // Deutsche Kurzbeschreibung bevorzugt (Sprachkonsistenz mit dem
          // deutschen Titel), volle PDF-Beschreibung (englisch) nur als Fallback.
          description: h.description || description,
        });
      } else {
        unmatchedHtml.push(h);
        events.push({
          id: h.slug,
          title: h.title,
          day: h.isoDay,
          startTime: null,
          endTime: null,
          location: h.location,
          trackTags: h.trackTags,
          format: h.format,
          language: h.language,
          description: h.description,
        });
      }
    }

    for (const p of pdfList) {
      if (p.used) continue;
      unmatchedPdf.push(p);
      const { trackFull, description } = splitTrackAndDescription(
        p.bodyLines.slice(1)
      );
      const title = p.bodyLines[0];
      events.push({
        id: `${slugify(title)}-${p.isoDay}`,
        title,
        day: p.isoDay,
        startTime: p.startTime,
        endTime: p.endTime,
        location: p.location,
        trackTags: trackCodesFromFullNames(trackFull),
        format: formatFromHeaderType(p.headerType),
        language: null,
        description,
      });
    }
  }

  events.sort((a, b) => {
    const at = `${a.day}T${a.startTime || "00:00"}`;
    const bt = `${b.day}T${b.startTime || "00:00"}`;
    return at.localeCompare(bt);
  });

  return { events, unmatchedHtml, unmatchedPdf };
}

// ---------- Speaker (Sprig-Pagination) ----------

function extractSprigConfig($) {
  const container = $(".sprig-component").first();
  const raw = container.attr("data-hx-vals");
  if (!raw) throw new Error("sprig:config nicht gefunden - Seitenstruktur geaendert?");
  const parsed = JSON.parse(raw);
  return parsed["sprig:config"];
}

function parseSpeakerCards($, root) {
  const speakers = [];
  root.find(".speaker").each((_, el) => {
    const card = $(el);
    const name = card
      .find("h3")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const paragraphs = card
      .find("p")
      .map((i, e) => $(e).text().trim())
      .get()
      .filter(Boolean);
    const role = paragraphs[0] || null;
    const organization = paragraphs[1] || null;
    const bioLink = card.find("a[href*='/speakers/']").attr("href") || null;
    if (name) speakers.push({ name, role, organization, bioLink });
  });
  return speakers;
}

async function fetchAllSpeakers() {
  const res = await fetch(SPEAKERS_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Speakerseite: HTTP ${res.status}`);
  const firstHtml = await res.text();
  const $ = cheerio.load(firstHtml);

  const sprigConfig = extractSprigConfig($);
  const speakers = parseSpeakerCards($, $("#speakers"));

  let pageoffset = speakers.length;
  while (true) {
    const params = new URLSearchParams({
      "sprig:config": sprigConfig,
      pageoffset: String(pageoffset),
      eventid: "7992176",
      randomfield: "title",
      randomorder: "asc",
    });
    const pageRes = await fetch(`${SPRIG_ENDPOINT}&${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        "HX-Request": "true",
        Accept: "text/html",
        Referer: SPEAKERS_URL,
      },
    });
    if (!pageRes.ok) break;
    const pageHtml = await pageRes.text();
    const $$ = cheerio.load(pageHtml);
    const batch = parseSpeakerCards($$, $$.root());
    if (batch.length === 0) break;
    speakers.push(...batch);
    pageoffset += batch.length;
    if (batch.length < 12) break;
  }

  // Deduplizieren (gleicher bioLink kann bei Rand-Faellen doppelt vorkommen)
  const seen = new Set();
  return speakers.filter((s) => {
    const key = s.bioLink || s.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Main ----------

async function main() {
  console.log("Lade Programmseite (DE, fuer Anzeige-Felder) ...");
  const htmlDe = await fetchProgramHtml(PROGRAM_URL_DE);
  const htmlEvents = parseProgramHtml(htmlDe);
  console.log(`  -> ${htmlEvents.length} Sessions in HTML (DE) gefunden`);

  console.log("Lade Programmseite (EN, nur als Bruecke zur PDF) ...");
  const htmlEn = await fetchProgramHtml(PROGRAM_URL_EN);
  const enTitleBySlug = new Map(
    parseProgramHtml(htmlEn).map((e) => [e.slug, e.title])
  );
  for (const h of htmlEvents) {
    h.matchTitle = enTitleBySlug.get(h.slug) || h.title;
  }

  console.log("Parse PDF-Export ...");
  const pdfBlocks = await parsePdfBlocks();
  console.log(`  -> ${pdfBlocks.length} Sessions in PDF gefunden`);

  const { events, unmatchedHtml, unmatchedPdf } = mergeEvents(
    htmlEvents,
    pdfBlocks
  );
  if (unmatchedHtml.length > 0) {
    console.log(
      `  Warnung: ${unmatchedHtml.length} Sessions nur in HTML gefunden (keine exakte Zeit verfuegbar)`
    );
  }
  if (unmatchedPdf.length > 0) {
    console.log(
      `  Warnung: ${unmatchedPdf.length} Sessions nur in PDF gefunden (kein Format/Track-Code aus Website)`
    );
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, "events.json"),
    JSON.stringify(events, null, 2)
  );
  console.log(`Geschrieben: data/events.json (${events.length} Events)`);

  console.log("Lade Speaker-Liste ...");
  const speakers = await fetchAllSpeakers();
  await fs.writeFile(
    path.join(DATA_DIR, "speakers.json"),
    JSON.stringify(speakers, null, 2)
  );
  console.log(`Geschrieben: data/speakers.json (${speakers.length} Speaker)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
