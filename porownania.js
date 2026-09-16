// =====================================
// PORÓWNANIA – książka lokalna vs firmowa
// =====================================

function escapeHtmlPor(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function stripHtmlToPlain(html) {
    const s = String(html || "");
    if (!/<[^>]+>/.test(s)) return s;
    const tmp = document.createElement("div");
    tmp.innerHTML = s;
    return (tmp.innerText || tmp.textContent || "").trim();
}

function normalizeTimePor(t) {
    const m = String(t || "").trim().match(/(\d{1,2})[:\.](\d{2})/);
    if (!m) return "";
    const h = Math.min(23, parseInt(m[1], 10));
    const min = Math.min(59, parseInt(m[2], 10));
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

function normalizeTextPor(t) {
    return String(t || "")
        .replace(/[•·●▪▫○◦‣⁃∙]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/[.,;:!?]+$/g, "");
}

function textsSimilarPor(a, b) {
    const na = normalizeTextPor(a);
    const nb = normalizeTextPor(b);
    if (!na && !nb) return true;
    if (!na || !nb) return false;
    if (na === nb) return true;
    // jeden zawiera drugi (częste przy skrótach)
    if (na.includes(nb) || nb.includes(na)) return true;
    // proste podobieństwo tokenów
    const ta = new Set(na.split(" ").filter(w => w.length > 2));
    const tb = new Set(nb.split(" ").filter(w => w.length > 2));
    if (!ta.size || !tb.size) return false;
    let inter = 0;
    ta.forEach(w => { if (tb.has(w)) inter++; });
    const ratio = inter / Math.min(ta.size, tb.size);
    return ratio >= 0.55;
}

/**
 * Parsuje wklejony tekst z książki firmowej.
 * Obsługuje m.in.:
 * - _dd.mm.rrrr_ *HH:MM*\n opis
 * - HH:MM opis / HH.MM opis
 * - linie z godziną na początku
 * - proste tabele HTML (td)
 * - bloki oddzielone pustą linią
 */
function parseFirmowyTekst(raw) {
    let text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Jeśli HTML – wyciągnij tekst z tabel / całego HTML
    if (/<\s*(table|tr|td|div|p|br)\b/i.test(text)) {
        const tmp = document.createElement("div");
        tmp.innerHTML = text;
        // tabele: każdy wiersz = godzina + opis
        const rows = [];
        tmp.querySelectorAll("tr").forEach(tr => {
            const cells = [...tr.querySelectorAll("td,th")].map(c => (c.innerText || "").trim()).filter(Boolean);
            if (cells.length >= 2) {
                const godz = normalizeTimePor(cells[0]);
                if (godz) {
                    rows.push({ godzina: godz, tekst: cells.slice(1).join(" ").trim(), data: "" });
                }
            } else if (cells.length === 1) {
                const m = cells[0].match(/(\d{1,2}[:\.]\d{2})\s+([\s\S]+)/);
                if (m) rows.push({ godzina: normalizeTimePor(m[1]), tekst: m[2].trim(), data: "" });
            }
        });
        if (rows.length) return rows;
        text = (tmp.innerText || tmp.textContent || "").replace(/\r\n/g, "\n");
    }

    const entries = [];
    // Format eksportu: _data_ *godzina*\nopis  (bloki \n\n)
    const blockRe = /_([^_\n]+)_\s*\*([^*\n]+)\*\s*\n([\s\S]*?)(?=\n\n_|\n*$)/g;
    let bm;
    let foundBlocks = false;
    while ((bm = blockRe.exec(text + "\n\n")) !== null) {
        foundBlocks = true;
        const godz = normalizeTimePor(bm[2]);
        if (!godz) continue;
        entries.push({
            data: String(bm[1] || "").trim(),
            godzina: godz,
            tekst: String(bm[3] || "").replace(/[•·●]/g, "").trim()
        });
    }
    if (foundBlocks && entries.length) return entries;

    // Linie: godzina na początku
    const lines = text.split("\n");
    let current = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // *HH:MM* lub HH:MM na początku
        let m = line.match(/^\s*\*?(\d{1,2}[:\.]\d{2})\*?\s*(.*)$/);
        if (!m) {
            // _data_ *HH:MM*
            m = line.match(/_([^_]+)_\s*\*?(\d{1,2}[:\.]\d{2})\*?\s*(.*)$/);
            if (m) {
                if (current) entries.push(current);
                current = {
                    data: m[1].trim(),
                    godzina: normalizeTimePor(m[2]),
                    tekst: (m[3] || "").trim()
                };
                continue;
            }
        } else {
            if (current) entries.push(current);
            current = {
                data: "",
                godzina: normalizeTimePor(m[1]),
                tekst: (m[2] || "").trim()
            };
            continue;
        }
        // kontynuacja opisu
        if (current && line.trim()) {
            current.tekst = (current.tekst ? current.tekst + "\n" : "") + line.trim();
        }
    }
    if (current) entries.push(current);

    return entries.filter(e => e.godzina);
}

function getLokalnaKsiazkaEntries() {
    const list = Array.isArray(appState?.ksiazkaWydarzen) ? appState.ksiazkaWydarzen : [];
    const sorted = typeof sortEntriesOldestFirst === "function"
        ? sortEntriesOldestFirst(list)
        : [...list].sort((a, b) => String(a.godzinaStart || "").localeCompare(String(b.godzinaStart || "")));

    return sorted.map(e => {
        let tekst = stripHtmlToPlain(e.tekst || "");
        tekst = tekst.replace(/[•·●]/g, "").trim();
        return {
            id: e.id,
            data: e.data || "",
            godzina: normalizeTimePor(e.godzinaStart || ""),
            tekst,
            raw: e
        };
    }).filter(e => e.godzina || e.tekst);
}

/**
 * Porównanie 1:1 po godzinie (kolejność), potem wolne dopasowanie.
 * status: match | diff | onlyLocal | onlyFirm
 */
function compareEntries(localList, firmList) {
    const usedFirm = new Set();
    const usedLocal = new Set();
    const pairs = [];

    // 1) dokładne dopasowanie godzina + podobny tekst
    localList.forEach((loc, li) => {
        let best = -1;
        let bestScore = 0;
        firmList.forEach((fir, fi) => {
            if (usedFirm.has(fi)) return;
            if (loc.godzina && fir.godzina && loc.godzina === fir.godzina) {
                const sim = textsSimilarPor(loc.tekst, fir.tekst);
                const score = sim ? 3 : 1;
                if (score > bestScore) {
                    bestScore = score;
                    best = fi;
                }
            }
        });
        if (best >= 0 && bestScore >= 3) {
            usedFirm.add(best);
            usedLocal.add(li);
            pairs.push({ local: loc, firm: firmList[best], status: "match" });
        } else if (best >= 0) {
            usedFirm.add(best);
            usedLocal.add(li);
            pairs.push({ local: loc, firm: firmList[best], status: "diff" });
        }
    });

    // 2) pozostałe lokalne – spróbuj po samej godzinie
    localList.forEach((loc, li) => {
        if (usedLocal.has(li)) return;
        let best = -1;
        firmList.forEach((fir, fi) => {
            if (usedFirm.has(fi)) return;
            if (loc.godzina && fir.godzina && loc.godzina === fir.godzina) {
                best = fi;
            }
        });
        if (best >= 0) {
            usedFirm.add(best);
            usedLocal.add(li);
            pairs.push({
                local: loc,
                firm: firmList[best],
                status: textsSimilarPor(loc.tekst, firmList[best].tekst) ? "match" : "diff"
            });
        } else {
            usedLocal.add(li);
            pairs.push({ local: loc, firm: null, status: "onlyLocal" });
        }
    });

    // 3) firmowe bez pary
    firmList.forEach((fir, fi) => {
        if (usedFirm.has(fi)) return;
        pairs.push({ local: null, firm: fir, status: "onlyFirm" });
    });

    // sortuj wg godziny (preferuj lokalną, potem firmową)
    pairs.sort((a, b) => {
        const ga = (a.local || a.firm || {}).godzina || "";
        const gb = (b.local || b.firm || {}).godzina || "";
        return ga.localeCompare(gb);
    });

    return pairs;
}

function initPorownania() {
    const container = document.getElementById("porownaniaContainer");
    if (!container) return;

    container.innerHTML = `
    <div class="card" style="max-width:100%;">
        <h2 style="margin-top:0;">🔍 Porównania książek</h2>
        <p style="color:var(--text-dim); font-size:14px; margin-bottom:14px;">
            Wklej treść z <strong>książki firmowej</strong> (skopiowaną ze strony).
            Program wyciągnie godziny i opisy, porówna z Twoją <strong>Książką wydarzeń</strong>
            i zaznaczy na <span style="color:#dc2626; font-weight:700;">czerwono</span> różnice / braki.
        </p>

        <label style="font-weight:600;">Wklej tekst z książki firmowej</label>
        <textarea id="porFirmowyTekst" rows="8" placeholder="Wklej tutaj skopiowaną treść z firmowej książki wydarzeń…"
            style="width:100%; margin:8px 0 12px 0; font-family:inherit; font-size:13px; line-height:1.4;"></textarea>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
            <button class="btn-success" onclick="uruchomPorownanie()">🔍 Porównaj</button>
            <button class="btn-primary" onclick="document.getElementById('porFirmowyTekst').value=''; document.getElementById('porResult').innerHTML='';">Wyczyść</button>
        </div>

        <div id="porResult"></div>
    </div>
    `;
}

function uruchomPorownanie() {
    const raw = document.getElementById("porFirmowyTekst")?.value || "";
    const firm = parseFirmowyTekst(raw);
    const local = getLokalnaKsiazkaEntries();
    const resultEl = document.getElementById("porResult");
    if (!resultEl) return;

    if (!firm.length && !local.length) {
        resultEl.innerHTML = `<p style="color:var(--text-dim);">Brak wpisów po obu stronach.</p>`;
        return;
    }
    if (!firm.length) {
        resultEl.innerHTML = `<p style="color:#dc2626;">Nie rozpoznano godzin w wklejonym tekście. Wklej tekst z godzinami (np. 08:30 …) albo format eksportu.</p>`;
        return;
    }

    const pairs = compareEntries(local, firm);
    const stats = {
        match: pairs.filter(p => p.status === "match").length,
        diff: pairs.filter(p => p.status === "diff").length,
        onlyLocal: pairs.filter(p => p.status === "onlyLocal").length,
        onlyFirm: pairs.filter(p => p.status === "onlyFirm").length
    };

    const rowStyle = (status) => {
        if (status === "match") return "border-left:4px solid #22c55e; background:var(--bg-input);";
        // różnice i braki – czerwone
        return "border-left:4px solid #dc2626; background:rgba(220,38,38,0.10);";
    };

    const statusLabel = (status) => {
        if (status === "match") return `<span style="color:#16a34a; font-size:11px; font-weight:700;">OK</span>`;
        if (status === "diff") return `<span style="color:#dc2626; font-size:11px; font-weight:700;">RÓŻNICA</span>`;
        if (status === "onlyLocal") return `<span style="color:#dc2626; font-size:11px; font-weight:700;">BRAK W FIRMOWEJ</span>`;
        return `<span style="color:#dc2626; font-size:11px; font-weight:700;">BRAK U CIEBIE</span>`;
    };

    const cell = (entry, emptyHint) => {
        if (!entry) {
            return `<div style="color:var(--text-dim); font-size:13px; font-style:italic;">${escapeHtmlPor(emptyHint)}</div>`;
        }
        return `
            <div style="font-weight:700; font-size:15px; color:var(--primary-light); margin-bottom:4px;">
                ${escapeHtmlPor(entry.godzina || "—")}
                ${entry.data ? `<span style="font-weight:500; font-size:12px; color:var(--text-dim);"> · ${escapeHtmlPor(entry.data)}</span>` : ""}
            </div>
            <div style="font-size:13px; line-height:1.4; color:var(--text-soft); white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;">
                ${escapeHtmlPor(entry.tekst || "—")}
            </div>`;
    };

    const rows = pairs.map(p => `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
            <div style="${rowStyle(p.status)} border-radius:10px; padding:10px 12px; border:1px solid var(--border); min-width:0;">
                <div style="margin-bottom:4px;">${statusLabel(p.status)}</div>
                ${cell(p.local, "— brak wpisu w Twojej książce —")}
            </div>
            <div style="${rowStyle(p.status)} border-radius:10px; padding:10px 12px; border:1px solid var(--border); min-width:0;">
                <div style="margin-bottom:4px;">${statusLabel(p.status)}</div>
                ${cell(p.firm, "— brak wpisu w firmowej —")}
            </div>
        </div>
    `).join("");

    resultEl.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:14px; font-size:14px;">
            <span><strong>Lokalna:</strong> ${local.length}</span>
            <span><strong>Firmowa:</strong> ${firm.length}</span>
            <span style="color:#16a34a;"><strong>Zgodne:</strong> ${stats.match}</span>
            <span style="color:#dc2626;"><strong>Różnice:</strong> ${stats.diff}</span>
            <span style="color:#dc2626;"><strong>Tylko u Ciebie:</strong> ${stats.onlyLocal}</span>
            <span style="color:#dc2626;"><strong>Tylko firmowa:</strong> ${stats.onlyFirm}</span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px; position:sticky; top:0; z-index:5; background:var(--bg-light); padding:8px 0; border-bottom:1px solid var(--border);">
            <div style="font-weight:700; font-size:15px;">📖 Twoja książka</div>
            <div style="font-weight:700; font-size:15px;">🏢 Książka firmowa</div>
        </div>

        <div style="max-height:calc(100vh - 280px); overflow:auto; padding-right:4px;">
            ${rows}
        </div>
    `;
}

window.initPorownania = initPorownania;
window.uruchomPorownanie = uruchomPorownanie;
window.parseFirmowyTekst = parseFirmowyTekst;
