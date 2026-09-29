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
let zglColFilters = { Linia: "", Typ: "", Nazwa: "" };
let zglOpenFilterCol = null; // "Linia" | "Typ" | "Nazwa" | null

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
    return [...lines].sort((a, b) => {
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
    });
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
    // Excel-like filtry kolumn
    const fLinia = (zglColFilters.Linia || "").trim().toLowerCase();
    const fTyp = (zglColFilters.Typ || "").trim().toLowerCase();
    const fNazwa = (zglColFilters.Nazwa || "").trim().toLowerCase();
    if (fLinia) list = list.filter(i => String(i.linia || "").toLowerCase().includes(fLinia));
    if (fTyp) {
        list = list.filter(i => {
            const typ = i.typ === "procedura" ? "procedura" : "zgłoszenie";
            return typ.includes(fTyp) || (i.typ || "").toLowerCase().includes(fTyp);
        });
    }
    if (fNazwa) list = list.filter(i => String(i.tytul || "").toLowerCase().includes(fNazwa));

    list.sort((a, b) => String(a.linia).localeCompare(String(b.linia), "pl", { numeric: true })
        || String(a.tytul).localeCompare(String(b.tytul), "pl"));
    return list;
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
        return `<th style="position:relative; user-select:none;">
            <span style="cursor:pointer; display:inline-flex; align-items:center; gap:4px;"
                  onclick="event.stopPropagation();zglToggleColFilter('${col}')">
                ${label} <span style="font-size:10px;opacity:0.8;">${arrow}</span>
                ${active ? `<span style="font-size:10px;color:#60a5fa;">●</span>` : ""}
            </span>
            ${open ? `<div style="position:absolute;left:0;top:100%;z-index:50;min-width:180px;padding:8px;background:var(--bg,#0f172a);border:1px solid var(--border,#334155);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);"
                onclick="event.stopPropagation()">
                <input type="text" placeholder="Filtruj…" value="${escapeHtml(zglColFilters[col] || "")}"
                       style="width:100%;padding:6px 8px;border-radius:6px;margin-bottom:6px;"
                       oninput="zglColFilters['${col}']=this.value;renderZgloszenia();"
                       onclick="event.stopPropagation()">
                <button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;width:100%;"
                        onclick="zglColFilters['${col}']='';zglOpenFilterCol=null;renderZgloszenia();">Wyczyść</button>
            </div>` : ""}
        </th>`;
    }

    const body = list.length === 0
        ? `<tr><td colspan="${delMode ? 6 : 5}" style="text-align:center;color:var(--text-dim);padding:20px;">Brak zgłoszeń.</td></tr>`
        : list.map(item => {
            if (item.typ === "procedura") {
                const meta = [item.start?.Rodzaj, item.start?.Nazwa || item.end?.Nazwa].filter(Boolean).join(" · ");
                const preview = "▶ " + zglPlain(item.start?.Opis).slice(0, 40) + " → ■ " + zglPlain(item.end?.Opis).slice(0, 40);
                const key = "p:" + (item.startIndex ?? "") + ":" + (item.endIndex ?? "");
                const cb = delMode
                    ? `<td style="width:36px;"><input type="checkbox" class="zgl-sel" data-key="${key}" onclick="event.stopPropagation()"></td>`
                    : "";
                return `<tr>
                    ${cb}
                    <td>${escapeHtml(item.linia)}</td>
                    <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(168,85,247,.2);color:#d8b4fe;">Procedura</span></td>
                    <td style="font-weight:600;">${escapeHtml(item.tytul)}${meta ? `<div style="font-size:11px;color:var(--text-dim);font-weight:400;">${escapeHtml(meta)}</div>` : ""}</td>
                    <td style="font-size:12px;color:var(--text-dim);max-width:260px;">${escapeHtml(preview)}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-primary" onclick="editProceduraZgl(${item.startIndex}, ${item.endIndex})">Edytuj</button>
                    </td>
                </tr>`;
            }
            const r = item.row;
            const key = "s:" + item.index;
            const cb = delMode
                ? `<td style="width:36px;"><input type="checkbox" class="zgl-sel" data-key="${key}" onclick="event.stopPropagation()"></td>`
                : "";
            return `<tr>
                ${cb}
                <td>${escapeHtml(item.linia)}</td>
                <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;">Zgłoszenie</span></td>
                <td style="font-weight:600;">${escapeHtml(item.tytul)}</td>
                <td style="font-size:12px;color:var(--text-dim);max-width:260px;">${escapeHtml(zglPlain(r.Opis).slice(0, 80))}</td>
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
                <button type="button" style="padding:8px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;font-weight:600;${usunStyle}"
                        onclick="event.stopPropagation();zglUsunZaznaczoneClick()">${usunLabel}</button>
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    ${thCb}
                    ${thFilter("Linia", "Linia")}
                    ${thFilter("Typ", "Typ")}
                    ${thFilter("Nazwa", "Nazwa")}
                    <th>Podgląd</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    </div>
    <div id="zglModalRoot"></div>
    `;
}

function zglToggleColFilter(col) {
    zglOpenFilterCol = (zglOpenFilterCol === col) ? null : col;
    renderZgloszenia();
    // fokus w input filtr
    setTimeout(() => {
        const inp = document.querySelector(`th input[placeholder="Filtruj…"]`);
        if (inp) { inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (e) {} }
    }, 30);
}

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

// Excel import – keep simple compatibility
const ZGLOSZENIA_EXCEL_COLUMNS = ["Linia", "OpisKrotki", "OpisPom", "Opis"];


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
