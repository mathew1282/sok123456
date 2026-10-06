// =====================================
// ZGŁOSZENIA – zwykłe lub PROCEDURA (start + koniec)
// Procedura: dwa opisy, wspólne: linia, opis krótki, rodzaj, nazwa, km
// Opis pom i pełny opis – osobno dla startu i końca
// =====================================

let currentZgloszenieEdit = null; // { mode: 'single'|'proc', index?, startIndex?, endIndex? }
let zgloszeniaFilterLinia = "";
let zgloszeniaFilterTyp = "wszystkie"; // wszystkie | pojedyncze | procedury
let zgloszeniaFilterQuery = "";
let zglDeleteMode = false;
/** Excel-like: { Linia?: string, Typ?: string, Nazwa?: string } partial match */
let zglColFilters = { Linia: "", Typ: "", OpisKrotki: "", OpisPom: "" };
let zglOpenFilterCol = null; // "Linia" | "Typ" | "OpisKrotki" | "OpisPom" | null

function initZgloszenia() {
    if (!appState.zgloszenia) {
        appState.zgloszenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis"], rows: [] };
    }
    if (!Array.isArray(appState.zgloszenia.rows)) appState.zgloszenia.rows = [];

    appState.zgloszenia.rows.forEach(row => {
        if (row.OpisKrotki === undefined) row.OpisKrotki = row.Opis || "";
        if (row.Opis === undefined) row.Opis = "";
        if (row.Linia === undefined) row.Linia = "";
        if (row.OpisPom === undefined) row.OpisPom = "";
        if (!row.id) row.id = zglNewId();
    });
    appState.zgloszenia.columns = ["Linia", "OpisKrotki", "OpisPom", "Opis"];
    currentZgloszenieEdit = null;
    zglDeleteMode = false;
    zglOpenFilterCol = null;
    renderZgloszenia();
}

function zglNewId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function sortLinesNatural(lines) {
    return [...lines].sort(compareLiniaNatural);
}

function compareLiniaNatural(a, b) {
    const aStr = String(a || "").trim();
    const bStr = String(b || "").trim();
    const aIsNum = /^\d/.test(aStr);
    const bIsNum = /^\d/.test(bStr);
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (aIsNum && bIsNum) {
        const aNum = parseInt(aStr, 10);
        const bNum = parseInt(bStr, 10);
        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    }
    return aStr.localeCompare(bStr, "pl", { numeric: true, sensitivity: "base" });
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function zglPlain(html) {
    return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Lista do tabeli: pojedyncze + pary procedur */
function getZgloszeniaDisplayList() {
    const rows = appState.zgloszenia.rows || [];
    const used = new Set();
    const items = [];

    // procedury: group by procedureId
    const byProc = {};
    rows.forEach((row, index) => {
        if (row.procedureId && (row.procedureRole === "start" || row.procedureRole === "end")) {
            if (!byProc[row.procedureId]) byProc[row.procedureId] = {};
            byProc[row.procedureId][row.procedureRole] = { row, index };
        }
    });

    Object.keys(byProc).forEach(pid => {
        const g = byProc[pid];
        if (g.start) used.add(g.start.index);
        if (g.end) used.add(g.end.index);
        const main = g.start?.row || g.end?.row || {};
        items.push({
            typ: "procedura",
            linia: main.Linia || "",
            tytul: main.OpisKrotki || "(procedura)",
            startIndex: g.start?.index ?? null,
            endIndex: g.end?.index ?? null,
            start: g.start?.row || null,
            end: g.end?.row || null,
            procedureId: pid
        });
    });

    rows.forEach((row, index) => {
        if (used.has(index)) return;
        items.push({
            typ: "zgloszenie",
            linia: row.Linia || "",
            tytul: row.OpisKrotki || "(bez nazwy)",
            index,
            row
        });
    });

    let list = items;
    if (zgloszeniaFilterTyp === "procedury") list = list.filter(i => i.typ === "procedura");
    if (zgloszeniaFilterTyp === "pojedyncze") list = list.filter(i => i.typ === "zgloszenie");
    if (zgloszeniaFilterLinia) {
        list = list.filter(i => String(i.linia) === String(zgloszeniaFilterLinia));
    }
    // Excel-like: tylko wybór z listy (dokładne dopasowanie)
    const fLinia = (zglColFilters.Linia || "").trim();
    const fTyp = (zglColFilters.Typ || "").trim().toLowerCase();
    const fKrotki = (zglColFilters.OpisKrotki || "").trim();
    if (fLinia) list = list.filter(i => String(i.linia || "") === fLinia);
    if (fTyp) {
        list = list.filter(i => {
            const typ = i.typ === "procedura" ? "procedura" : "zgłoszenie";
            return typ === fTyp;
        });
    }
    if (fKrotki) {
        list = list.filter(i => {
            const k = i.typ === "procedura"
                ? (i.start?.OpisKrotki || i.end?.OpisKrotki || i.tytul || "")
                : (i.row?.OpisKrotki || i.tytul || "");
            return String(k) === fKrotki;
        });
    }

    // Autofiltr wyświetlania: najpierw numery linii, potem alfabet
    list.sort((a, b) => {
        const c = compareLiniaNatural(a.linia, b.linia);
        if (c !== 0) return c;
        return String(a.tytul || "").localeCompare(String(b.tytul || ""), "pl", { sensitivity: "base" });
    });
    return list;
}


function zglUniqueValues(col) {
    const seen = new Set();
    const items = [];
    function add(v) {
        const s = String(v == null ? "" : v).trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        items.push(s);
    }
    if (col === "Typ") {
        add("procedura");
        add("zgłoszenie");
        return items;
    }
    (appState.zgloszenia && appState.zgloszenia.rows ? appState.zgloszenia.rows : []).forEach(r => {
        if (!r) return;
        if (col === "Linia") add(r.Linia);
        if (col === "OpisKrotki") add(r.OpisKrotki);
    });
    if (col === "Linia" && typeof compareLiniaNatural === "function") items.sort(compareLiniaNatural);
    else items.sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base" }));
    return items;
}

function zglApplyColFilter(col, value) {
    if (!zglColFilters) zglColFilters = { Linia: "", Typ: "", OpisKrotki: "", OpisPom: "" };
    zglColFilters[col] = value == null ? "" : String(value);
    zglOpenFilterCol = null;
    renderZgloszenia();
}

function zglToggleColFilter(col) {
    zglOpenFilterCol = (zglOpenFilterCol === col) ? null : col;
    renderZgloszenia();
}

function renderZgloszenia() {
    const container = document.getElementById("zgloszeniaContainer");
    if (!container) return;

    const list = getZgloszeniaDisplayList();
    const delMode = !!zglDeleteMode;
    const usunStyle = delMode
        ? "background:#dc2626;border-color:#dc2626;color:#fff;"
        : "background:#16a34a;border-color:#16a34a;color:#fff;";
    const usunLabel = delMode ? "Usuń zaznaczone" : "Usuń zaznaczone";

    function thFilter(col, label) {
        const active = (zglColFilters[col] || "").trim();
        const open = zglOpenFilterCol === col;
        const arrow = active ? "▼" : "▽";
        let dropdown = "";
        if (open) {
            const vals = zglUniqueValues(col);
            const opts = vals.map((v, vi) => {
                const sel = active === v;
                return `<div data-zgl-fcol="${col}" data-zgl-fval="${escapeHtml(v).replace(/"/g, "&quot;")}"
                    onclick="event.stopPropagation();zglApplyColFilter(this.getAttribute('data-zgl-fcol'), this.getAttribute('data-zgl-fval'));"
                    style="padding:6px 8px;cursor:pointer;border-radius:6px;font-size:13px;color:var(--text);${sel ? "background:rgba(59,130,246,.2);font-weight:700;" : ""}">
                    ${escapeHtml(v)}
                </div>`;
            }).join("") || `<div style="padding:6px;color:var(--text-dim);font-size:12px;">Brak wartości</div>`;
            dropdown = `<div style="position:absolute;left:0;top:100%;z-index:50;min-width:200px;max-height:260px;overflow:auto;padding:6px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);"
                onclick="event.stopPropagation()">
                ${opts}
                <button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;width:100%;margin-top:6px;"
                        onclick="event.stopPropagation();zglApplyColFilter('${col}', '');">Wyczyść</button>
            </div>`;
        }
        return `<th style="position:relative; user-select:none;" onclick="event.stopPropagation()">
            <span style="cursor:pointer; display:inline-flex; align-items:center; gap:4px; flex-wrap:wrap;"
                  onclick="event.stopPropagation();zglToggleColFilter('${col}')">
                ${label} <span style="font-size:10px;opacity:0.8;">${arrow}</span>
                ${active ? `<span style="font-size:11px;color:#93c5fd;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(active)}">● ${escapeHtml(active)}</span>` : ""}
            </span>
            ${active ? `<button type="button" title="Wyczyść filtr" onclick="event.stopPropagation();zglApplyColFilter('${col}', '');"
                style="margin-left:4px;border:none;background:transparent;color:#f87171;font-weight:800;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;">×</button>` : ""}
            ${dropdown}
        </th>`;
    }

    const body = list.length === 0
        ? `<tr><td colspan="${delMode ? 7 : 6}" style="text-align:center;color:var(--text-dim);padding:20px;">Brak zgłoszeń.</td></tr>`
        : list.map(item => {
            if (item.typ === "procedura") {
                const krotki = item.start?.OpisKrotki || item.end?.OpisKrotki || item.tytul || "";
                const pom = [item.start?.OpisPom, item.end?.OpisPom].filter(Boolean).join(" / ");
                const preview = "▶ " + zglPlain(item.start?.Opis).slice(0, 50) + " → ■ " + zglPlain(item.end?.Opis).slice(0, 50);
                const key = "p:" + (item.startIndex ?? "") + ":" + (item.endIndex ?? "");
                const cb = delMode
                    ? `<td style="width:36px;"><input type="checkbox" class="zgl-sel" data-key="${key}" onclick="event.stopPropagation()"></td>`
                    : "";
                return `<tr>
                    ${cb}
                    <td>${escapeHtml(item.linia)}</td>
                    <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(168,85,247,.2);color:#d8b4fe;">Procedura</span></td>
                    <td style="font-weight:600;">${escapeHtml(krotki)}</td>
                    <td style="font-size:13px;color:var(--text-dim);">${escapeHtml((pom || "").substring(0, 60))}${(pom || "").length > 60 ? "…" : ""}</td>
                    <td style="font-size:12px;color:var(--text-dim);max-width:280px;">${escapeHtml(preview)}${preview.length >= 100 ? "…" : ""}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-primary" onclick="editProceduraZgl(${item.startIndex}, ${item.endIndex})">Edytuj</button>
                    </td>
                </tr>`;
            }
            const r = item.row || {};
            const key = "s:" + item.index;
            const cb = delMode
                ? `<td style="width:36px;"><input type="checkbox" class="zgl-sel" data-key="${key}" onclick="event.stopPropagation()"></td>`
                : "";
            const opisPrev = zglPlain(r.Opis).slice(0, 100);
            return `<tr>
                ${cb}
                <td>${escapeHtml(item.linia)}</td>
                <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;">Zgłoszenie</span></td>
                <td style="font-weight:600;">${escapeHtml(r.OpisKrotki || item.tytul || "")}</td>
                <td style="font-size:13px;color:var(--text-dim);">${escapeHtml((r.OpisPom || "").substring(0, 60))}${(r.OpisPom || "").length > 60 ? "…" : ""}</td>
                <td style="font-size:12px;color:var(--text-dim);max-width:280px;">${escapeHtml(opisPrev)}${(r.Opis || "").length > 100 ? "…" : ""}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-primary" onclick="editZgloszenie(${item.index})">Edytuj</button>
                </td>
            </tr>`;
        }).join("");

    const thCb = delMode
        ? `<th style="width:36px;"><input type="checkbox" title="Zaznacz widoczne" onclick="zglToggleSelectAll(this.checked)"></th>`
        : "";

    container.innerHTML = `
    <div class="card" onclick="if(zglOpenFilterCol){zglOpenFilterCol=null;renderZgloszenia();}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div>
                <h2 style="margin:0 0 4px 0;">📋 Zgłoszenia</h2>
                <div style="font-size:13px;color:var(--text-dim);">Zwykłe zgłoszenie albo <strong>procedura</strong> (start + koniec)</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="openZgloszenieModal()">+ Zgłoszenie</button>
                <button class="btn-success" onclick="openProceduraZglModal()">+ Procedura</button>
                <button class="btn-primary" onclick="openZglSortowanieModal()">⇅ Sortowanie</button>
                <button class="btn-export" onclick="exportZgloszeniaExcel()">📥 Eksport Excel</button>
                <button class="btn-import" onclick="document.getElementById('zgloszeniaExcelLoader').click()">📤 Import Excel</button>
                <input type="file" id="zgloszeniaExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importZgloszeniaExcel(event)">
                <button type="button" style="padding:8px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;font-weight:600;${usunStyle}"
                        onclick="event.stopPropagation();zglUsunZaznaczoneClick()">${usunLabel}</button>
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    ${thCb}
                    ${thFilter("Linia", "Nr linii")}
                    ${thFilter("Typ", "Typ")}
                    ${thFilter("OpisKrotki", "Opis krótki")}
                    <th>Opis pom</th>
                    <th>Opis</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    </div>
    <div id="zglModalRoot"></div>
    `;
}

/* zglToggleColFilter redefined with helpers */


function zglUsunZaznaczoneClick() {
    if (!zglDeleteMode) {
        zglDeleteMode = true;
        renderZgloszenia();
        if (typeof showToast === "function") showToast("Zaznacz pozycje do usunięcia");
        return;
    }
    const keys = [...document.querySelectorAll(".zgl-sel:checked")].map(cb => cb.getAttribute("data-key")).filter(Boolean);
    if (!keys.length) {
        zglDeleteMode = false;
        renderZgloszenia();
        return;
    }
    removeSelectedZgloszenia().then((ok) => {
        if (ok) {
            zglDeleteMode = false;
            renderZgloszenia();
        }
    });
}

function setZgloszeniaFilterLinia(line) {
    zgloszeniaFilterLinia = line || "";
    renderZgloszenia();
}
function setZgloszeniaFilterTyp(t) {
    zgloszeniaFilterTyp = t || "wszystkie";
    renderZgloszenia();
}

function zglOpisHtml(raw) {
    raw = raw || "";
    if (/<(?:b|strong|u|i|br|div|p)\b/i.test(raw)) return raw;
    return escapeHtml(raw).replace(/\n/g, "<br>");
}

function zglSideEditor(prefix, data, opts) {
    const d = data || {};
    const title = opts?.title || "";
    const showShared = !!opts?.showShared;
    const shared = showShared ? `
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <div style="flex:1;min-width:100px;">
                <label>Nr linii</label>
                <input type="text" id="${prefix}Linia" value="${escapeHtml(d.Linia || zgloszeniaFilterLinia || "")}" style="width:100%;"
                       oninput="zglSyncShared('${prefix}')">
            </div>
            <div style="flex:1.3;min-width:120px;">
                <label>Opis krótki</label>
                <input type="text" id="${prefix}OpisKrotki" value="${escapeHtml(d.OpisKrotki || "")}" style="width:100%;"
                       oninput="zglSyncShared('${prefix}')">
            </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <div style="flex:1;min-width:120px;">
                <label>Rodzaj</label>
                <select id="${prefix}Rodzaj" style="width:100%;padding:8px;border-radius:8px;" onchange="zglSyncShared('${prefix}')">
                    <option value="Inne"${(d.Rodzaj || "Inne") === "Inne" ? " selected" : ""}>Inne</option>
                    <option value="Szlak"${d.Rodzaj === "Szlak" ? " selected" : ""}>Szlak</option>
                    <option value="Stacja towarowa"${d.Rodzaj === "Stacja towarowa" ? " selected" : ""}>Stacja towarowa</option>
                    <option value="Stacja osobowa"${d.Rodzaj === "Stacja osobowa" ? " selected" : ""}>Stacja osobowa</option>
                </select>
            </div>
            <div style="flex:1.2;min-width:120px;">
                <label>Nazwa stacji / szlaku</label>
                <input type="text" id="${prefix}Nazwa" value="${escapeHtml(d.Nazwa || "")}" style="width:100%;" oninput="zglSyncShared('${prefix}')">
            </div>
            <div style="flex:0.7;min-width:80px;">
                <label>Km od</label>
                <input type="text" id="${prefix}KmOd" value="${escapeHtml(d.KmOd || d.Km || "")}" style="width:100%;" oninput="zglSyncShared('${prefix}')">
            </div>
            <div style="flex:0.7;min-width:80px;">
                <label>Km do</label>
                <input type="text" id="${prefix}KmDo" value="${escapeHtml(d.KmDo || "")}" style="width:100%;" oninput="zglSyncShared('${prefix}')">
            </div>
        </div>
    ` : `
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <div style="flex:1;min-width:100px;">
                <label>Nr linii</label>
                <input type="text" id="${prefix}Linia" value="${escapeHtml(d.Linia || zgloszeniaFilterLinia || "")}" style="width:100%;">
            </div>
            <div style="flex:1.3;min-width:120px;">
                <label>Opis krótki</label>
                <input type="text" id="${prefix}OpisKrotki" value="${escapeHtml(d.OpisKrotki || "")}" style="width:100%;">
            </div>
            <div style="flex:1;min-width:120px;">
                <label>Opis pom</label>
                <input type="text" id="${prefix}OpisPom" value="${escapeHtml(d.OpisPom || "")}" style="width:100%;">
            </div>
        </div>
    `;

    // przy procedurze opis pom tylko lokalny (nie shared)
    const pomLocal = showShared ? `
        <div style="margin-bottom:10px;">
            <label>Opis pom (tylko ta strona)</label>
            <input type="text" id="${prefix}OpisPom" value="${escapeHtml(d.OpisPom || "")}" style="width:100%;">
        </div>
    ` : "";

    return `
        ${title ? `<div style="font-weight:700;margin-bottom:10px;">${title}</div>` : ""}
        ${shared}
        ${pomLocal}
        <label>Opis (tekst do wpisu)</label>
        <div style="display:flex;gap:6px;margin:4px 0 6px;flex-wrap:wrap;">
            <button type="button" class="btn-primary" style="padding:3px 10px;" onclick="zglFormat('${prefix}Opis','bold')"><b>B</b></button>
            <button type="button" class="btn-primary" style="padding:3px 10px;" onclick="zglFormat('${prefix}Opis','underline')"><u>U</u></button>
        </div>
        <div id="${prefix}Opis" contenteditable="true" class="rich-opis-editor"
             style="width:100%;min-height:110px;padding:10px;margin-bottom:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);white-space:pre-wrap;outline:none;">${zglOpisHtml(d.Opis)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${["@patrol","@dowodca","@kierowca","@sklad","@wszyscy","@KZ","@MKK","@data","@godzina","@wot","@policjant","@wybrani"]
                .map(t => `<button type="button" class="btn-primary" style="padding:2px 7px;font-size:11px;" onclick="zglInsertTag('${prefix}Opis','${t}')">${t}</button>`).join("")}
        </div>
    `;
}

/** Sync linia / krotki / rodzaj / nazwa / km między lewą a prawą stroną procedury */
function zglSyncShared(fromPrefix) {
    const other = fromPrefix === "zglStart" ? "zglEnd" : "zglStart";
    ["Linia", "OpisKrotki", "Rodzaj", "Nazwa", "KmOd", "KmDo"].forEach(field => {
        const src = document.getElementById(fromPrefix + field);
        const dst = document.getElementById(other + field);
        if (src && dst) dst.value = src.value;
    });
}

function zglFormat(id, cmd) {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, null);
}
function zglInsertTag(id, tag) {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    try { document.execCommand("insertText", false, tag); }
    catch (e) { el.innerHTML += tag; }
}

function openZgloszenieModal() {
    currentZgloszenieEdit = { mode: "single", index: null };
    showZglModal("Nowe zgłoszenie", zglSideEditor("zgl", {}, { showShared: false }), false);
}

function editZgloszenie(index) {
    const row = appState.zgloszenia.rows[index];
    if (!row) return;
    currentZgloszenieEdit = { mode: "single", index };
    showZglModal("Edytuj zgłoszenie", zglSideEditor("zgl", row, { showShared: false }), false);
}

function openProceduraZglModal() {
    currentZgloszenieEdit = { mode: "proc", startIndex: null, endIndex: null };
    const body = `
        <p style="font-size:13px;color:var(--text-dim);margin:0 0 12px 0;">
            Wspólne: <strong>linia, opis krótki, rodzaj, nazwa, km</strong> — wpiszesz w jednym, skopiuje się na drugą stronę.
            <strong>Opis pom</strong> i pełny opis — osobno (start / koniec).
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg);">
                ${zglSideEditor("zglStart", {}, { showShared: true, title: "▶ Rozpoczęcie (start)" })}
            </div>
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg);">
                ${zglSideEditor("zglEnd", {}, { showShared: true, title: "■ Zakończenie (koniec)" })}
            </div>
        </div>`;
    showZglModal("Nowa procedura", body, true);
}

function editProceduraZgl(startIndex, endIndex) {
    const start = startIndex != null ? appState.zgloszenia.rows[startIndex] : null;
    const end = endIndex != null ? appState.zgloszenia.rows[endIndex] : null;
    currentZgloszenieEdit = { mode: "proc", startIndex, endIndex };
    const body = `
        <p style="font-size:13px;color:var(--text-dim);margin:0 0 12px 0;">
            Wspólne pola synchronizują się automatycznie. Opis pom i treść — osobno.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg);">
                ${zglSideEditor("zglStart", start || {}, { showShared: true, title: "▶ Rozpoczęcie (start)" })}
            </div>
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg);">
                ${zglSideEditor("zglEnd", end || start || {}, { showShared: true, title: "■ Zakończenie (koniec)" })}
            </div>
        </div>`;
    showZglModal("Edytuj procedurę", body, true);
}

function showZglModal(title, bodyHtml, wide) {
    const root = document.getElementById("zglModalRoot");
    if (!root) return;
    root.innerHTML = `
    <div class="modal-overlay" style="display:flex;z-index:10050;" onclick="if(event.target===this)closeZgloszenieModal()">
        <div class="modal" style="width:min(${wide ? "1100px" : "920px"},96vw);max-height:94vh;overflow:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                <h2 style="margin:0;">${escapeHtml(title)}</h2>
                <div style="display:flex;gap:8px;">
                    <button class="btn-success" onclick="saveZgloszenie()">Zapisz</button>
                    <button class="btn-danger" onclick="closeZgloszenieModal()">Anuluj</button>
                </div>
            </div>
            ${bodyHtml}
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button class="btn-success" onclick="saveZgloszenie()">Zapisz</button>
                <button class="btn-danger" onclick="closeZgloszenieModal()">Anuluj</button>
            </div>
        </div>
    </div>`;
}

function closeZgloszenieModal() {
    const root = document.getElementById("zglModalRoot");
    if (root) root.innerHTML = "";
    currentZgloszenieEdit = null;
}

function readZglPrefix(prefix, withMeta) {
    const opisEl = document.getElementById(prefix + "Opis");
    const item = {
        Linia: (document.getElementById(prefix + "Linia")?.value || "").trim(),
        OpisKrotki: (document.getElementById(prefix + "OpisKrotki")?.value || "").trim(),
        OpisPom: (document.getElementById(prefix + "OpisPom")?.value || "").trim(),
        Opis: opisEl ? (opisEl.innerHTML || "").trim() : ""
    };
    if (withMeta) {
        item.Rodzaj = document.getElementById(prefix + "Rodzaj")?.value || "Inne";
        item.Nazwa = (document.getElementById(prefix + "Nazwa")?.value || "").trim();
        item.KmOd = (document.getElementById(prefix + "KmOd")?.value || "").trim();
        item.KmDo = (document.getElementById(prefix + "KmDo")?.value || "").trim();
    }
    return item;
}

async function saveZgloszenie() {
    if (!currentZgloszenieEdit) return;
    const edit = currentZgloszenieEdit;

    if (edit.mode === "single") {
        const item = readZglPrefix("zgl", false);
        if (!item.Linia) { alert("Podaj nr linii"); return; }
        if (!item.OpisKrotki) { alert("Podaj opis krótki"); return; }
        if (edit.index == null) {
            item.id = zglNewId();
            appState.zgloszenia.rows.push(item);
        } else {
            const prev = appState.zgloszenia.rows[edit.index] || {};
            item.id = prev.id || zglNewId();
            // zachowaj meta jeśli było
            if (prev.Rodzaj) item.Rodzaj = prev.Rodzaj;
            if (prev.Nazwa) item.Nazwa = prev.Nazwa;
            appState.zgloszenia.rows[edit.index] = item;
        }
    } else {
        const start = readZglPrefix("zglStart", true);
        const end = readZglPrefix("zglEnd", true);
        // wspólne z lewej (start) mają pierwszeństwo po sync
        end.Linia = start.Linia;
        end.OpisKrotki = start.OpisKrotki;
        end.Rodzaj = start.Rodzaj;
        end.Nazwa = start.Nazwa;
        end.KmOd = start.KmOd;
        end.KmDo = start.KmDo;

        if (!start.Linia) { alert("Podaj nr linii"); return; }
        if (!start.OpisKrotki) { alert("Podaj opis krótki"); return; }
        if (!zglPlain(start.Opis)) { alert("Podaj opis rozpoczęcia"); return; }
        if (!zglPlain(end.Opis)) { alert("Podaj opis zakończenia"); return; }

        let procId = null;
        if (edit.startIndex != null) {
            procId = appState.zgloszenia.rows[edit.startIndex]?.procedureId;
        }
        if (edit.endIndex != null && !procId) {
            procId = appState.zgloszenia.rows[edit.endIndex]?.procedureId;
        }
        if (!procId) procId = zglNewId();

        start.procedureId = procId;
        start.procedureRole = "start";
        end.procedureId = procId;
        end.procedureRole = "end";

        if (edit.startIndex == null) {
            start.id = zglNewId();
            appState.zgloszenia.rows.push(start);
        } else {
            start.id = appState.zgloszenia.rows[edit.startIndex]?.id || zglNewId();
            appState.zgloszenia.rows[edit.startIndex] = start;
        }
        if (edit.endIndex == null) {
            end.id = zglNewId();
            appState.zgloszenia.rows.push(end);
        } else {
            end.id = appState.zgloszenia.rows[edit.endIndex]?.id || zglNewId();
            appState.zgloszenia.rows[edit.endIndex] = end;
        }
    }

    if (typeof saveState === "function") await saveState();
    closeZgloszenieModal();
    renderZgloszenia();
    if (typeof showToast === "function") showToast("✅ Zapisano");
}

async function removeZgloszenie(index) {
    if (!confirm("Usunąć zgłoszenie?")) return;
    appState.zgloszenia.rows.splice(index, 1);
    if (typeof saveState === "function") await saveState();
    renderZgloszenia();
}

async function removeProceduraZgl(startIndex, endIndex) {
    if (!confirm("Usunąć całą procedurę (start i koniec)?")) return;
    const idxs = [startIndex, endIndex].filter(i => i != null && i >= 0).sort((a, b) => b - a);
    idxs.forEach(i => appState.zgloszenia.rows.splice(i, 1));
    if (typeof saveState === "function") await saveState();
    renderZgloszenia();
}

// =====================================
// EXCEL – eksport / import zgłoszeń
// =====================================
const ZGLOSZENIA_EXCEL_COLUMNS = [
    "Linia", "OpisKrotki", "OpisPom", "Opis",
    "Rodzaj", "Nazwa", "KmOd", "KmDo",
    "procedureId", "procedureRole"
];

function ensureZglXlsxLib() {
    if (typeof XLSX !== "undefined") return true;
    alert("Brak biblioteki Excel (SheetJS). Sprawdź index.html – skrypt xlsx.");
    return false;
}

function exportZgloszeniaExcel() {
    if (!ensureZglXlsxLib()) return;
    const rows = appState.zgloszenia?.rows || [];
    if (!rows.length) {
        alert("Brak zgłoszeń do eksportu");
        return;
    }
    const data = rows.map(r => {
        const o = {};
        ZGLOSZENIA_EXCEL_COLUMNS.forEach(col => {
            let v = r[col];
            if (col === "Opis" && v) v = String(v).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
            o[col] = v != null ? String(v) : "";
        });
        return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: ZGLOSZENIA_EXCEL_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Zgloszenia");
    XLSX.writeFile(wb, "zgloszenia.xlsx");
    if (typeof showToast === "function") showToast("📥 Wyeksportowano " + rows.length + " wierszy");
}

async function importZgloszeniaExcel(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!ensureZglXlsxLib()) return;

    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!json.length) {
            alert("Plik Excel jest pusty");
            return;
        }

        const mapped = json.map(row => {
            const get = (...keys) => {
                for (const k of keys) {
                    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
                }
                const lower = {};
                Object.keys(row).forEach(k => { lower[k.toLowerCase()] = row[k]; });
                for (const k of keys) {
                    const v = lower[k.toLowerCase()];
                    if (v != null && String(v).trim() !== "") return String(v).trim();
                }
                return "";
            };
            const item = {
                Linia: get("Linia", "Nr linii", "linia"),
                OpisKrotki: get("OpisKrotki", "Opis krótki", "Opis krotki"),
                OpisPom: get("OpisPom", "Opis pom", "Opis pomocniczy"),
                Opis: get("Opis", "Opis pełny"),
                Rodzaj: get("Rodzaj") || "Inne",
                Nazwa: get("Nazwa", "NazwaSzlaku"),
                KmOd: get("KmOd", "Km od", "Km"),
                KmDo: get("KmDo", "Km do")
            };
            const pid = get("procedureId", "ProcedureId");
            const role = get("procedureRole", "ProcedureRole");
            if (pid) item.procedureId = pid;
            if (role === "start" || role === "end") item.procedureRole = role;
            if (!item.id) item.id = (typeof zglNewId === "function") ? zglNewId() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
            return item;
        }).filter(r => r.Linia || r.OpisKrotki || r.Opis);

        if (!mapped.length) {
            alert("Nie znaleziono poprawnych wierszy");
            return;
        }

        const mode = confirm(
            `Znaleziono ${mapped.length} wierszy.\n\nOK = ZASTĄP wszystkie zgłoszenia\nAnuluj = DODAJ do istniejących`
        );

        if (!appState.zgloszenia) {
            appState.zgloszenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis"], rows: [] };
        }
        if (mode) {
            appState.zgloszenia.rows = mapped;
        } else {
            appState.zgloszenia.rows = (appState.zgloszenia.rows || []).concat(mapped);
        }
        if (typeof saveState === "function") await saveState();
        renderZgloszenia();
        if (typeof showToast === "function") showToast("✅ Zaimportowano " + mapped.length + " wierszy");
    } catch (err) {
        console.error(err);
        alert("Błąd importu Excel: " + (err.message || err));
    }
}



function zglToggleSelectAll(checked) {
    document.querySelectorAll(".zgl-sel").forEach(cb => { cb.checked = !!checked; });
}

async function removeSelectedZgloszenia() {
    const keys = [...document.querySelectorAll(".zgl-sel:checked")].map(cb => cb.getAttribute("data-key")).filter(Boolean);
    if (!keys.length) return false;
    if (!confirm("Usunąć zaznaczone pozycje (" + keys.length + ")?")) return false;

    // zbierz indeksy wierszy do usunięcia (od największego)
    const toRemove = new Set();
    keys.forEach(k => {
        if (k.startsWith("p:")) {
            const parts = k.slice(2).split(":");
            const si = parseInt(parts[0], 10);
            const ei = parseInt(parts[1], 10);
            if (!isNaN(si) && si >= 0) toRemove.add(si);
            if (!isNaN(ei) && ei >= 0) toRemove.add(ei);
        } else if (k.startsWith("s:")) {
            const i = parseInt(k.slice(2), 10);
            if (!isNaN(i) && i >= 0) toRemove.add(i);
        }
    });
    const idxs = [...toRemove].sort((a, b) => b - a);
    idxs.forEach(i => {
        if (i >= 0 && i < (appState.zgloszenia.rows || []).length) {
            appState.zgloszenia.rows.splice(i, 1);
        }
    });
    if (typeof saveState === "function") await saveState();
    if (typeof showToast === "function") showToast("Usunięto " + idxs.length + " pozycji");
    return true;
}



// =====================================
// SORTOWANIE KAFELKÓW (2. i 3. poziom – drag & drop)
// 1. poziom (linie): zawsze naturalnie (liczby, potem alfabet)
// Kolejność zapisywana w row.tileOrder
// =====================================

let _zglSort = {
    line: null,       // wybrana linia (1. poziom)
    opisKrotki: null, // wybrany opis krótki (2. poziom)
    level2Order: [],  // string[] OpisKrotki
    level3Order: []   // number[] indeksy wierszy w appState.zgloszenia.rows
};

function zglLiniaNaturalCmp(a, b) {
    const aStr = String(a || "").trim();
    const bStr = String(b || "").trim();
    const aIsNum = /^\d/.test(aStr);
    const bIsNum = /^\d/.test(bStr);
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (aIsNum && bIsNum) {
        const aNum = parseInt(aStr, 10);
        const bNum = parseInt(bStr, 10);
        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    }
    return aStr.localeCompare(bStr, "pl", { numeric: true, sensitivity: "base" });
}

/** Unikalne linie posortowane naturalnie */
function zglSortedLines(rows) {
    const lines = [...new Set((rows || []).map(r => r.Linia || "(brak)"))];
    return lines.sort(zglLiniaNaturalCmp);
}

/** Klucze 2. poziomu (OpisKrotki) dla linii – wg tileOrder, potem alfabet */
function zglSortedOpisKrotkiForLine(line, rows) {
    const all = rows || appState.zgloszenia?.rows || [];
    const filtered = all
        .map((r, i) => ({ r, i }))
        .filter(x => (x.r.Linia || "(brak)") === line);
    const map = new Map(); // opisKrotki -> min tileOrder
    filtered.forEach(({ r }) => {
        const k = r.OpisKrotki || "(bez opisu)";
        const ord = (r.tileOrder != null && !isNaN(Number(r.tileOrder))) ? Number(r.tileOrder) : Infinity;
        if (!map.has(k) || ord < map.get(k)) map.set(k, ord);
    });
    const keys = [...map.keys()];
    keys.sort((a, b) => {
        const oa = map.get(a);
        const ob = map.get(b);
        if (oa !== ob) {
            if (oa === Infinity && ob === Infinity) return a.localeCompare(b, "pl", { sensitivity: "base", numeric: true });
            if (oa === Infinity) return 1;
            if (ob === Infinity) return -1;
            return oa - ob;
        }
        return a.localeCompare(b, "pl", { sensitivity: "base", numeric: true });
    });
    return keys;
}

/** Wiersze 3. poziomu dla linia+opisKrotki – wg tileOrder */
function zglSortedRowsForGroup(line, opisKrotki, rows) {
    const all = rows || appState.zgloszenia?.rows || [];
    const filtered = all
        .map((r, i) => ({ r, i }))
        .filter(x =>
            (x.r.Linia || "(brak)") === line &&
            (x.r.OpisKrotki || "(bez opisu)") === opisKrotki
        );
    filtered.sort((a, b) => {
        const oa = (a.r.tileOrder != null && !isNaN(Number(a.r.tileOrder))) ? Number(a.r.tileOrder) : Infinity;
        const ob = (b.r.tileOrder != null && !isNaN(Number(b.r.tileOrder))) ? Number(b.r.tileOrder) : Infinity;
        if (oa !== ob) {
            if (oa === Infinity && ob === Infinity) return a.i - b.i;
            if (oa === Infinity) return 1;
            if (ob === Infinity) return -1;
            return oa - ob;
        }
        return a.i - b.i;
    });
    return filtered;
}

function openZglSortowanieModal() {
    if (!appState.zgloszenia) appState.zgloszenia = { columns: [], rows: [] };
    if (!Array.isArray(appState.zgloszenia.rows)) appState.zgloszenia.rows = [];

    _zglSort.line = null;
    _zglSort.opisKrotki = null;
    _zglSort.level2Order = [];
    _zglSort.level3Order = [];

    const old = document.getElementById("zglSortModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "zglSortModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;align-items:stretch;justify-content:center;padding:12px;z-index:10050;";
    overlay.innerHTML = `
        <div class="modal" style="width:min(960px,96vw);height:min(90vh,880px);max-width:none;max-height:none;display:flex;flex-direction:column;padding:16px 18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <h2 style="margin:0;">⇅ Sortowanie kafelków – Zgłoszenia</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn-success" onclick="zglSortZapisz()">💾 Zapisz kolejność</button>
                    <button class="btn-danger" onclick="closeZglSortowanieModal()">Zamknij</button>
                </div>
            </div>
            <p style="margin:0 0 12px 0;font-size:13px;color:var(--text-dim);">
                <strong>1. rząd (linie)</strong> – stały układ: liczby, potem alfabet (bez przeciągania).<br>
                <strong>2. i 3. rząd</strong> – złap kafelek i upuść w wybranym miejscu. Najpierw wybierz linię, potem opis krótki.
            </p>
            <div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:14px;min-height:0;">
                <div>
                    <div style="font-weight:600;margin-bottom:6px;font-size:14px;">1. Nr linii <span style="font-weight:400;color:var(--text-dim);">(tylko wybór)</span></div>
                    <div id="zglSortLines" class="ks-add-level-frame card-grid" style="gap:6px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--bg-light);"></div>
                </div>
                <div>
                    <div style="font-weight:600;margin-bottom:6px;font-size:14px;">2. Opis krótki <span style="font-weight:400;color:var(--text-dim);">(przeciągnij)</span></div>
                    <div id="zglSortLevel2" class="ks-add-level-frame card-grid" style="gap:6px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--bg-light);min-height:48px;"></div>
                </div>
                <div>
                    <div style="font-weight:600;margin-bottom:6px;font-size:14px;">3. Opis / kafelki <span style="font-weight:400;color:var(--text-dim);">(przeciągnij)</span></div>
                    <div id="zglSortLevel3" class="card-grid" style="gap:6px;min-height:48px;"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    zglSortRenderLines();
    zglSortRenderLevel2();
    zglSortRenderLevel3();
}

function closeZglSortowanieModal() {
    const m = document.getElementById("zglSortModal");
    if (m) m.remove();
}

function zglSortRenderLines() {
    const el = document.getElementById("zglSortLines");
    if (!el) return;
    const lines = zglSortedLines(appState.zgloszenia?.rows || []);
    if (!lines.length) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Brak zgłoszeń</span>";
        return;
    }
    el.innerHTML = lines.map(line => {
        const active = _zglSort.line === line ? " active" : "";
        const safe = String(line).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return `<div class="line-pill${active}" style="cursor:pointer;" onclick="zglSortSelectLine('${safe}')">${escapeHtml(line)}</div>`;
    }).join("");
}

function zglSortSelectLine(line) {
    _zglSort.line = line;
    _zglSort.opisKrotki = null;
    _zglSort.level2Order = zglSortedOpisKrotkiForLine(line, appState.zgloszenia?.rows || []);
    _zglSort.level3Order = [];
    zglSortRenderLines();
    zglSortRenderLevel2();
    zglSortRenderLevel3();
}

function zglSortRenderLevel2() {
    const el = document.getElementById("zglSortLevel2");
    if (!el) return;
    if (!_zglSort.line) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Wybierz linię powyżej…</span>";
        return;
    }
    if (!_zglSort.level2Order.length) {
        _zglSort.level2Order = zglSortedOpisKrotkiForLine(_zglSort.line, appState.zgloszenia?.rows || []);
    }
    if (!_zglSort.level2Order.length) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Brak opisów krótkich</span>";
        return;
    }
    el.innerHTML = _zglSort.level2Order.map((k, idx) => {
        const sel = _zglSort.opisKrotki === k ? " selected" : "";
        return `<div class="item-card${sel}" draggable="true" data-sort-level="2" data-sort-idx="${idx}"
            style="cursor:grab;"
            ondragstart="zglSortDragStart(event,2,${idx})"
            ondragover="zglSortDragOver(event)"
            ondrop="zglSortDrop(event,2,${idx})"
            onclick="zglSortSelectOpisKrotki(${idx})">${escapeHtml(k)}</div>`;
    }).join("");
}

function zglSortSelectOpisKrotki(idx) {
    const k = _zglSort.level2Order[idx];
    if (!k) return;
    _zglSort.opisKrotki = k;
    const rows = zglSortedRowsForGroup(_zglSort.line, k, appState.zgloszenia?.rows || []);
    _zglSort.level3Order = rows.map(x => x.i);
    zglSortRenderLevel2();
    zglSortRenderLevel3();
}

function zglSortRenderLevel3() {
    const el = document.getElementById("zglSortLevel3");
    if (!el) return;
    if (!_zglSort.line || !_zglSort.opisKrotki) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Wybierz opis krótki (2. rząd)…</span>";
        return;
    }
    if (!_zglSort.level3Order.length) {
        const rows = zglSortedRowsForGroup(_zglSort.line, _zglSort.opisKrotki, appState.zgloszenia?.rows || []);
        _zglSort.level3Order = rows.map(x => x.i);
    }
    const all = appState.zgloszenia?.rows || [];
    if (!_zglSort.level3Order.length) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Brak kafelków</span>";
        return;
    }
    el.innerHTML = _zglSort.level3Order.map((rowIdx, idx) => {
        const r = all[rowIdx];
        if (!r) return "";
        const role = r.procedureRole === "start" ? "▶ start · " : (r.procedureRole === "end" ? "■ koniec · " : "");
        const label = role + (r.OpisPom || r.Opis || "(brak)").substring(0, 120);
        return `<div class="item-card" draggable="true" data-sort-level="3" data-sort-idx="${idx}"
            style="cursor:grab;"
            ondragstart="zglSortDragStart(event,3,${idx})"
            ondragover="zglSortDragOver(event)"
            ondrop="zglSortDrop(event,3,${idx})">${escapeHtml(label)}</div>`;
    }).join("");
}

function zglSortDragStart(e, level, idx) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ level, idx }));
    e.dataTransfer.effectAllowed = "move";
}

function zglSortDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function zglSortDrop(e, level, toIdx) {
    e.preventDefault();
    e.stopPropagation();
    let data;
    try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (err) { return; }
    if (!data || data.level !== level) return;
    const fromIdx = data.idx;
    if (fromIdx === toIdx || fromIdx == null || toIdx == null) return;

    if (level === 2) {
        const arr = _zglSort.level2Order;
        if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return;
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
        // jeśli przeniesiono aktywny opis – odśwież level3 indeksy w nowej kolejności grupy
        if (_zglSort.opisKrotki) {
            const rows = zglSortedRowsForGroup(_zglSort.line, _zglSort.opisKrotki, appState.zgloszenia?.rows || []);
            // keep current level3Order if same group still selected
        }
        zglSortRenderLevel2();
    } else if (level === 3) {
        const arr = _zglSort.level3Order;
        if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return;
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
        zglSortRenderLevel3();
    }
}

async function zglSortZapisz() {
    const rows = appState.zgloszenia?.rows;
    if (!Array.isArray(rows)) return;

    // Zapisz aktualny widok 2. poziomu (dla wybranej linii)
    if (_zglSort.line && _zglSort.level2Order.length) {
        // Każda grupa OpisKrotki dostaje bazę kolejności * 1000, wewnątrz zachowaj względne tileOrder lub indeks
        _zglSort.level2Order.forEach((opisK, groupIdx) => {
            const members = rows
                .map((r, i) => ({ r, i }))
                .filter(x =>
                    (x.r.Linia || "(brak)") === _zglSort.line &&
                    (x.r.OpisKrotki || "(bez opisu)") === opisK
                );
            // jeśli to aktywna grupa i mamy level3Order – użyj tej kolejności
            if (_zglSort.opisKrotki === opisK && _zglSort.level3Order.length) {
                _zglSort.level3Order.forEach((rowIdx, j) => {
                    if (rows[rowIdx]) rows[rowIdx].tileOrder = groupIdx * 1000 + j;
                });
            } else {
                // posortuj istniejące wg tileOrder / indeksu i przypisz
                members.sort((a, b) => {
                    const oa = (a.r.tileOrder != null) ? Number(a.r.tileOrder) : a.i;
                    const ob = (b.r.tileOrder != null) ? Number(b.r.tileOrder) : b.i;
                    return oa - ob;
                });
                members.forEach((m, j) => {
                    m.r.tileOrder = groupIdx * 1000 + j;
                });
            }
        });
    } else if (_zglSort.line && _zglSort.opisKrotki && _zglSort.level3Order.length) {
        _zglSort.level3Order.forEach((rowIdx, j) => {
            if (rows[rowIdx]) rows[rowIdx].tileOrder = j;
        });
    }

    if (typeof saveState === "function") await saveState();
    if (typeof showToast === "function") showToast("✅ Zapisano kolejność kafelków");
    else alert("Zapisano kolejność kafelków");
    renderZgloszenia();
}


window.initZgloszenia = initZgloszenia;
window.renderZgloszenia = renderZgloszenia;
window.setZgloszeniaFilterLinia = setZgloszeniaFilterLinia;
window.setZgloszeniaFilterTyp = setZgloszeniaFilterTyp;
window.openZgloszenieModal = openZgloszenieModal;
window.openProceduraZglModal = openProceduraZglModal;
window.editZgloszenie = editZgloszenie;
window.editProceduraZgl = editProceduraZgl;
window.closeZgloszenieModal = closeZgloszenieModal;
window.saveZgloszenie = saveZgloszenie;
window.removeZgloszenie = removeZgloszenie;
window.removeProceduraZgl = removeProceduraZgl;
window.removeSelectedZgloszenia = removeSelectedZgloszenia;
window.zglToggleSelectAll = zglToggleSelectAll;
window.zglSyncShared = zglSyncShared;
window.zglFormat = zglFormat;
window.zglInsertTag = zglInsertTag;
window.exportZgloszeniaExcel = exportZgloszeniaExcel;
window.importZgloszeniaExcel = importZgloszeniaExcel;
window.zglToggleColFilter = zglToggleColFilter;
window.zglUsunZaznaczoneClick = zglUsunZaznaczoneClick;
window.openZglSortowanieModal = openZglSortowanieModal;
window.closeZglSortowanieModal = closeZglSortowanieModal;
window.zglSortSelectLine = zglSortSelectLine;
window.zglSortSelectOpisKrotki = zglSortSelectOpisKrotki;
window.zglSortDragStart = zglSortDragStart;
window.zglSortDragOver = zglSortDragOver;
window.zglSortDrop = zglSortDrop;
window.zglSortZapisz = zglSortZapisz;
window.zglSortedLines = zglSortedLines;
window.zglSortedOpisKrotkiForLine = zglSortedOpisKrotkiForLine;
window.zglSortedRowsForGroup = zglSortedRowsForGroup;
window.zglLiniaNaturalCmp = zglLiniaNaturalCmp;


window.zglApplyColFilter = zglApplyColFilter;
window.zglToggleColFilter = zglToggleColFilter;
window.zglUniqueValues = zglUniqueValues;
