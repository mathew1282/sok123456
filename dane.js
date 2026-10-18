// =====================================
// DANE FUNKCJONARIUSZY
// =====================================

/** Sort: null | { col, dir: "asc"|"desc" } – zapamiętane w appState.daneSort */
function ensureDaneSortState() {
    if (!appState.daneSort || typeof appState.daneSort !== "object") {
        try {
            const raw = localStorage.getItem("sok-dane-sort");
            if (raw) appState.daneSort = JSON.parse(raw);
        } catch (e) {}
    }
    if (!appState.daneSort || typeof appState.daneSort !== "object") {
        appState.daneSort = { col: null, dir: null };
    }
}

function isDaneNameColumn(name) {
    const n = String(name || "").toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // sortowalne: nazwisko, imię, stopień
    if (n === "imie" || n === "nazwisko" || n === "name" || n === "surname") return true;
    if (n.indexOf("imie") >= 0 || n.indexOf("nazwisk") >= 0) return true;
    if (n === "first name" || n === "last name") return true;
    if (n === "stopien" || n.indexOf("stopien") >= 0 || n.indexOf("stopn") >= 0) return true;
    return false;
}

function daneNormalizeColName(name) {
    return String(name || "").toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        // polskie znaki, które NFD nie rozbija (ł, ą, ę, ó, ż, ź, ć, ń, ś)
        .replace(/ł/g, "l").replace(/ą/g, "a").replace(/ę/g, "e")
        .replace(/ó/g, "o").replace(/ż/g, "z").replace(/ź/g, "z")
        .replace(/ć/g, "c").replace(/ń/g, "n").replace(/ś/g, "s")
        .replace(/[_\-./]+/g, " ")
        .replace(/\s+/g, " ");
}

function isDaneHiddenColumn(name) {
    const n = daneNormalizeColName(name);
    // Nr służbowy, numer służbowy, nr. służb., NrSłużbowy...
    if (n.indexOf("sluzbow") >= 0) return true;
    if (n.indexOf("nr sluzb") >= 0 || n.indexOf("numer sluzb") >= 0) return true;
    if (/\bnr\.?\s*sl/.test(n)) return true;
    if (n === "nr" || n === "numer") return false;
    return false;
}

function stripDaneHiddenColumnsFromState() {
    if (!appState.dane) return;
    if (!Array.isArray(appState.dane.columns)) appState.dane.columns = [];
    if (!Array.isArray(appState.dane.rows)) appState.dane.rows = [];
    appState.dane.columns = appState.dane.columns.filter(c => !isDaneHiddenColumn(c));
    appState.dane.rows.forEach(row => {
        if (!row || typeof row !== "object") return;
        Object.keys(row).forEach(k => {
            if (isDaneHiddenColumn(k)) delete row[k];
        });
    });
}


function getDaneVisibleColumns() {
    return (appState.dane?.columns || []).filter(c => !isDaneHiddenColumn(c));
}

const DANE_STD_COLS = ["Stopień", "Nazwisko", "Imię", "Nr PLK"];

function ensureDaneStandardColumns() {
    if (!appState.dane) appState.dane = { columns: [], rows: [] };
    if (!Array.isArray(appState.dane.columns)) appState.dane.columns = [];
    if (!Array.isArray(appState.dane.rows)) appState.dane.rows = [];
    stripDaneHiddenColumnsFromState();
    DANE_STD_COLS.forEach(col => {
        if (!appState.dane.columns.includes(col)) {
            appState.dane.columns.push(col);
            appState.dane.rows.forEach(r => {
                if (r && r[col] === undefined) r[col] = "";
            });
        }
    });
}

function daneFindCol(preds) {
    const cols = appState.dane?.columns || [];
    for (const c of cols) {
        const n = daneNormalizeColName(c);
        if (preds.some(p => n === p || n.indexOf(p) >= 0)) return c;
    }
    return null;
}

function daneGetField(row, kind) {
    if (!row) return "";
    const map = {
        stopien: ["stopien", "stopn"],
        nazwisko: ["nazwisk", "surname", "last"],
        imie: ["imie", "first"],
        nrplk: ["nr plk", "nrplk", "plk"]
    };
    const preds = map[kind] || [];
    const col = daneFindCol(preds);
    if (col) return String(row[col] || "").trim();
    // fallback exact std names
    const std = { stopien: "Stopień", nazwisko: "Nazwisko", imie: "Imię", nrplk: "Nr PLK" }[kind];
    return std && row[std] != null ? String(row[std]).trim() : "";
}

function daneSetField(row, kind, value) {
    ensureDaneStandardColumns();
    const map = {
        stopien: ["stopien", "stopn"],
        nazwisko: ["nazwisk", "surname", "last"],
        imie: ["imie", "first"],
        nrplk: ["nr plk", "nrplk", "plk"]
    };
    let col = daneFindCol(map[kind] || []);
    if (!col) {
        col = { stopien: "Stopień", nazwisko: "Nazwisko", imie: "Imię", nrplk: "Nr PLK" }[kind];
        if (col && !appState.dane.columns.includes(col)) appState.dane.columns.push(col);
    }
    if (col) row[col] = value;
}

let currentDaneEdit = null; // { index: null|number }


let daneDeleteMode = false;
let danePeopleCollapsed = false;
try {
    danePeopleCollapsed = localStorage.getItem("sok-dane-people-collapsed") === "1";
} catch (e) {}


/** Zmiany służbowe: { id, dyzurny, osoby: [] } */
function ensureDaneZmiany() {
    if (!appState.dane) appState.dane = { columns: [], rows: [] };
    if (!Array.isArray(appState.dane.zmiany)) appState.dane.zmiany = [];
}

function getDanePersonLabel(row) {
    if (!row || typeof row !== "object") return "";
    const cols = appState.dane?.columns || [];
    const pick = (preds) => {
        for (const c of cols) {
            const n = String(c || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (preds.some(p => n.indexOf(p) >= 0 || n === p)) {
                const v = String(row[c] || "").trim();
                if (v) return v;
            }
        }
        return "";
    };
    const stopien = pick(["stopien", "stopn"]);
    const nazwisko = pick(["nazwisk", "surname", "last"]);
    const imie = pick(["imie", "name", "first"]);
    const parts = [stopien, nazwisko, imie].filter(Boolean);
    if (parts.length) return parts.join(" ");
    // fallback: pierwsza niepusta komórka
    for (const c of cols) {
        if (isDaneHiddenColumn(c)) continue;
        const v = String(row[c] || "").trim();
        if (v) return v;
    }
    return "(bez nazwy)";
}

function getDanePeopleList() {
    const rows = appState.dane?.rows || [];
    return rows.map((row, index) => ({
        index,
        label: getDanePersonLabel(row),
        row
    })).filter(p => p.label);
}

/** Etykiety osób już przypisanych do którejkolwiek zmiany (dyżurny + skład) */
function getDanePeopleAssignedLabels() {
    ensureDaneZmiany();
    const set = new Set();
    (appState.dane.zmiany || []).forEach(z => {
        if (!z) return;
        if (z.dyzurny) set.add(String(z.dyzurny).trim());
        (z.osoby || []).forEach(o => {
            if (o) set.add(String(o).trim());
        });
    });
    return set;
}

/** Osoby wolne (nie są w żadnej zmianie) – do wyboru przy tworzeniu nowej */
function getDanePeopleAvailableForZmiana() {
    const assigned = getDanePeopleAssignedLabels();
    return getDanePeopleList().filter(p => !assigned.has(p.label));
}

let _daneZmianaDraft = null; // { dyzurny, osoby: [] }


function getDaneSortedRows() {
    ensureDaneSortState();
    const columns = appState.dane.columns || [];
    const rows = appState.dane.rows || [];
    // indeksy w kolejności oryginalnej
    const indices = rows.map((_, i) => i);
    const sort = appState.daneSort;
    if (!sort || !sort.col || !sort.dir) return indices;
    const col = sort.col;
    if (!columns.includes(col)) return indices;
    indices.sort((ia, ib) => {
        const a = String(rows[ia][col] || "").toLowerCase();
        const b = String(rows[ib][col] || "").toLowerCase();
        const c = a.localeCompare(b, "pl", { sensitivity: "base" });
        return sort.dir === "desc" ? -c : c;
    });
    return indices;
}

async function cycleDaneSort(col) {
    ensureDaneSortState();
    if (!isDaneNameColumn(col)) return;
    const s = appState.daneSort;
    if (s.col !== col) {
        s.col = col;
        s.dir = "asc";
    } else if (s.dir === "asc") {
        s.dir = "desc";
    } else {
        s.col = null;
        s.dir = null;
    }
    try { localStorage.setItem("sok-dane-sort", JSON.stringify(s)); } catch (e) {}
    if (typeof saveState === "function") await saveState();
    renderDane();
}

function initDane() {
    const container = document.getElementById("daneContainer");
    if (!container) return;
    ensureDaneSortState();
    daneDeleteMode = false;
    const before = JSON.stringify((appState.dane && appState.dane.columns) || []);
    stripDaneHiddenColumnsFromState();
    const after = JSON.stringify((appState.dane && appState.dane.columns) || []);
    if (before !== after && typeof saveState === "function") {
        Promise.resolve(saveState()).catch(() => {});
    }
    ensureDaneStandardColumns();
    renderDane();
}

// =====================================
// RENDER
// =====================================

function renderDane() {
    const container = document.getElementById("daneContainer");
    if (!container) return;
    ensureDaneSortState();
    if (!appState.dane) appState.dane = { columns: [], rows: [] };
    if (!Array.isArray(appState.dane.columns)) appState.dane.columns = [];
    if (!Array.isArray(appState.dane.rows)) appState.dane.rows = [];

    stripDaneHiddenColumnsFromState();

    const columns = getDaneVisibleColumns();
    const rows = appState.dane.rows;
    const order = getDaneSortedRows();
    const sort = appState.daneSort || {};
    const delMode = !!daneDeleteMode;
    const usunStyle = delMode
        ? "background:#dc2626;border-color:#dc2626;color:#fff;"
        : "background:#16a34a;border-color:#16a34a;color:#fff;";

    let html = `
    <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div>
                <h2 style="margin:0 0 4px 0;">👤 Dane funkcjonariuszy</h2>
                <div style="font-size:13px;color:var(--text-dim);">Sortowanie: kliknij <strong>Nazwisko</strong> / <strong>Stopień</strong> (A→Z → Z→A → kolejność wpisu)</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="btn-primary" onclick="openDanePersonModal()">+ Dodaj funkcjonariusza</button>
                <button type="button" class="btn-export" onclick="exportDaneExcel()">📥 Eksport Excel</button>
                <button type="button" class="btn-import" onclick="document.getElementById('daneExcelLoader').click()">📤 Import Excel</button>
                <input type="file" id="daneExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importDaneExcel(event)">
                <button type="button" style="padding:8px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;font-weight:600;${usunStyle}"
                        onclick="event.stopPropagation();daneUsunZaznaczoneClick()">Usuń zaznaczone</button>
            </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:8px 0 10px 0;">
            <div style="font-weight:600;font-size:14px;">Lista funkcjonariuszy (${rows.length})</div>
            <button type="button" class="btn-primary" style="padding:6px 12px;font-size:12px;"
                    onclick="toggleDanePeopleList()">${danePeopleCollapsed ? "▼ Rozwiń listę" : "▲ Zminimalizuj listę"}</button>
        </div>
        <div id="danePeopleListWrap" style="${danePeopleCollapsed ? "display:none;" : ""}">
        <table class="data-table-opis">
            <thead>
                <tr>
    `;

    if (delMode) {
        html += `<th class="col-meta" style="width:36px;"><input type="checkbox" title="Zaznacz widoczne" onclick="daneToggleSelectAll(this.checked)"></th>`;
    }

    columns.forEach(column => {
        const canSort = isDaneNameColumn(column);
        let sortMark = "";
        if (canSort && sort.col === column) {
            sortMark = sort.dir === "asc" ? " ▲" : (sort.dir === "desc" ? " ▼" : "");
        } else if (canSort) {
            sortMark = " ▽";
        }
        const titleAttrs = canSort
            ? `style="cursor:pointer;user-select:none;" data-dane-sort-col="${String(column).replace(/"/g, "&quot;")}" onclick="cycleDaneSort(this.getAttribute('data-dane-sort-col'))" title="Sortuj: A→Z / Z→A / kolejność wpisu"`
            : "";
        html += `<th class="col-meta"><span ${titleAttrs}>${escapeHtml(String(column))}${sortMark}</span></th>`;
    });

    if (!delMode) {
        html += `<th class="col-meta">Akcje</th>`;
    }

    html += `
                </tr>
            </thead>
            <tbody>
    `;

    if (order.length === 0) {
        const cols = columns.length + (delMode ? 1 : 1);
        html += `<tr><td colspan="${Math.max(cols, 1)}"><div class="empty-state"><strong>Brak funkcjonariuszy</strong>Dodaj osobę lub zaimportuj Excel.</div></td></tr>`;
    } else {
        order.forEach(rowIndex => {
            const row = rows[rowIndex] || {};
            html += `<tr>`;
            if (delMode) {
                html += `<td class="col-meta"><input type="checkbox" class="dane-sel" data-index="${rowIndex}" onclick="event.stopPropagation()"></td>`;
            }
            columns.forEach(column => {
                const raw = row[column] == null ? "" : String(row[column]);
                html += `<td class="col-meta" style="vertical-align:middle;">${escapeHtml(raw) || "—"}</td>`;
            });
            if (!delMode) {
                html += `<td class="col-meta" style="white-space:nowrap;vertical-align:middle;">
                    <button type="button" class="btn-primary" onclick="openDanePersonModal(${rowIndex})">Edytuj</button>
                </td>`;
            }
            html += `</tr>`;
        });
    }

    html += `</tbody></table></div>`;

    // --- Zmiany ---
    ensureDaneZmiany();
    const zmiany = appState.dane.zmiany || [];
    html += `
        <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                <h3 style="margin:0;">Zmiany</h3>
                <button type="button" class="btn-success" onclick="openDaneStworzZmianeModal()">➕ Stwórz zmianę</button>
            </div>
    `;
    if (!zmiany.length) {
        html += `<div class="empty-state"><strong>Brak zmian</strong>Utwórz zmianę: wybierz dyżurnego, potem skład.</div>`;
    } else {
        html += `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:stretch;">`;
        zmiany.forEach((z, zi) => {
            const osoby = (z.osoby || []).map(o => `<div style="font-size:13px;line-height:1.35;color:var(--text-soft);">${escapeHtml(o)}</div>`).join("")
                || `<div style="font-size:12px;color:var(--text-dim);">Brak składu</div>`;
            html += `
            <div style="flex:1;min-width:180px;max-width:280px;background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:12px 14px;">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;text-transform:uppercase;letter-spacing:.03em;">Zmiana ${zi + 1}</div>
                <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:var(--text);">Dyżurny: ${escapeHtml(z.dyzurny || "—")}</div>
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Skład</div>
                ${osoby}
                <div style="margin-top:10px;">
                    <button type="button" class="btn-danger" style="padding:4px 10px;font-size:12px;" onclick="usunDaneZmiane(${zi})">Usuń zmianę</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    html += `</div></div>`;
    container.innerHTML = html;
}

function openDaneStworzZmianeModal() {
    ensureDaneZmiany();
    const all = getDanePeopleList();
    if (!all.length) {
        alert("Brak funkcjonariuszy w tabeli – najpierw dodaj osoby.");
        return;
    }
    const people = getDanePeopleAvailableForZmiana();
    if (!people.length) {
        alert("Wszystkie osoby są już przypisane do zmian.\nUsuń zmianę albo dodaj nowych funkcjonariuszy.");
        return;
    }
    _daneZmianaDraft = { step: "dyzurny", dyzurny: "", osoby: [] };

    const rootId = "daneZmianaModalRoot";
    let root = document.getElementById(rootId);
    if (!root) {
        root = document.createElement("div");
        root.id = rootId;
        document.body.appendChild(root);
    }
    renderDaneZmianaModal();
}

function renderDaneZmianaModal() {
    const root = document.getElementById("daneZmianaModalRoot");
    if (!root || !_daneZmianaDraft) return;
    const draft = _daneZmianaDraft;
    const people = getDanePeopleAvailableForZmiana();
    const step = draft.step || "dyzurny";
    const assignedCount = getDanePeopleAssignedLabels().size;

    let body = "";
    if (step === "dyzurny") {
        body = `
            <p style="color:var(--text-dim);font-size:13px;margin:0 0 12px 0;">
                Wybierz <strong>dyżurnego</strong> zmiany (jedna osoba).
                Osoby już w innych zmianach są ukryte${assignedCount ? " (" + assignedCount + ")" : ""}.
            </p>
            <div class="card-grid" style="max-height:50vh;overflow:auto;">
                ${people.map(p => {
                    const on = draft.dyzurny === p.label;
                    const lab = escapeHtml(p.label).replace(/"/g, "&quot;");
                    return `<div class="item-card ${on ? "selected" : ""}" style="min-width:140px;" data-lab="${lab}"
                        onclick="daneZmianaPickDyzurny(this.getAttribute('data-lab'))">${escapeHtml(p.label)}</div>`;
                }).join("") || "<div class='empty-state'>Brak wolnych osób</div>"}
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button type="button" class="btn-primary" onclick="daneZmianaGoOsoby()" ${draft.dyzurny ? "" : "disabled style='opacity:.5;'"}>Dalej – skład →</button>
                <button type="button" class="btn-danger" onclick="closeDaneZmianaModal()">Anuluj</button>
            </div>`;
    } else {
        const rest = people.filter(p => p.label !== draft.dyzurny);
        body = `
            <p style="color:var(--text-dim);font-size:13px;margin:0 0 8px 0;">
                Dyżurny: <strong>${escapeHtml(draft.dyzurny)}</strong> – zaznacz osoby w zmianie (kafelki).
            </p>
            <div class="card-grid" style="max-height:50vh;overflow:auto;">
                ${rest.map(p => {
                    const on = (draft.osoby || []).includes(p.label);
                    const lab = escapeHtml(p.label).replace(/"/g, "&quot;");
                    return `<div class="item-card ${on ? "selected" : ""}" style="min-width:140px;" data-lab="${lab}"
                        onclick="daneZmianaToggleOsoba(this.getAttribute('data-lab'))">${escapeHtml(p.label)}</div>`;
                }).join("") || "<div class='empty-state'>Brak innych osób</div>"}
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
                <button type="button" class="btn-primary" onclick="daneZmianaBackDyzurny()">← Wróć</button>
                <button type="button" class="btn-success" onclick="saveDaneZmiana()">💾 Zapisz zmianę</button>
                <button type="button" class="btn-danger" onclick="closeDaneZmianaModal()">Anuluj</button>
            </div>`;
    }

    root.innerHTML = `
    <div class="modal-overlay" style="display:flex;z-index:10050;" onclick="if(event.target===this)closeDaneZmianaModal()">
        <div class="modal" style="width:min(720px,96vw);max-height:92vh;overflow:auto;" onclick="event.stopPropagation()">
            <h2 style="margin:0 0 12px 0;">Stwórz zmianę</h2>
            ${body}
        </div>
    </div>`;
}

function daneZmianaPickDyzurny(label) {
    if (!_daneZmianaDraft) return;
    _daneZmianaDraft.dyzurny = label;
    // nie może być jednocześnie w składzie
    _daneZmianaDraft.osoby = (_daneZmianaDraft.osoby || []).filter(o => o !== label);
    renderDaneZmianaModal();
}

function daneZmianaGoOsoby() {
    if (!_daneZmianaDraft || !_daneZmianaDraft.dyzurny) {
        alert("Wybierz dyżurnego");
        return;
    }
    _daneZmianaDraft.step = "osoby";
    renderDaneZmianaModal();
}

function daneZmianaBackDyzurny() {
    if (!_daneZmianaDraft) return;
    _daneZmianaDraft.step = "dyzurny";
    renderDaneZmianaModal();
}

function daneZmianaToggleOsoba(label) {
    if (!_daneZmianaDraft) return;
    const arr = _daneZmianaDraft.osoby || [];
    const i = arr.indexOf(label);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(label);
    _daneZmianaDraft.osoby = arr;
    renderDaneZmianaModal();
}

async function saveDaneZmiana() {
    ensureDaneZmiany();
    if (!_daneZmianaDraft || !_daneZmianaDraft.dyzurny) {
        alert("Wybierz dyżurnego");
        return;
    }
    appState.dane.zmiany.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        dyzurny: _daneZmianaDraft.dyzurny,
        osoby: [...(_daneZmianaDraft.osoby || [])]
    });
    if (typeof saveState === "function") await saveState();
    closeDaneZmianaModal();
    renderDane();
    if (typeof showToast === "function") showToast("✅ Zapisano zmianę");
}

function closeDaneZmianaModal() {
    _daneZmianaDraft = null;
    const root = document.getElementById("daneZmianaModalRoot");
    if (root) root.innerHTML = "";
}

async function usunDaneZmiane(index) {
    ensureDaneZmiany();
    if (!confirm("Usunąć tę zmianę?")) return;
    appState.dane.zmiany.splice(index, 1);
    if (typeof saveState === "function") await saveState();
    renderDane();
}


function toggleDanePeopleList() {
    danePeopleCollapsed = !danePeopleCollapsed;
    try { localStorage.setItem("sok-dane-people-collapsed", danePeopleCollapsed ? "1" : "0"); } catch (e) {}
    renderDane();
}

function daneToggleSelectAll(checked) {
    document.querySelectorAll(".dane-sel").forEach(cb => { cb.checked = !!checked; });
}

function daneUsunZaznaczoneClick() {
    if (!daneDeleteMode) {
        daneDeleteMode = true;
        renderDane();
        if (typeof showToast === "function") showToast("Zaznacz pozycje do usunięcia");
        return;
    }
    const idxs = [...document.querySelectorAll(".dane-sel:checked")]
        .map(cb => parseInt(cb.getAttribute("data-index"), 10))
        .filter(n => Number.isFinite(n));
    if (!idxs.length) {
        daneDeleteMode = false;
        renderDane();
        return;
    }
    if (!confirm("Usunąć zaznaczonych funkcjonariuszy (" + idxs.length + ")?")) return;
    // od największego indeksu, żeby splice nie psuł kolejności
    idxs.sort((a, b) => b - a).forEach(i => {
        if (i >= 0 && i < appState.dane.rows.length) appState.dane.rows.splice(i, 1);
    });
    daneDeleteMode = false;
    Promise.resolve(typeof saveState === "function" ? saveState() : null).then(() => {
        renderDane();
        if (typeof showToast === "function") showToast("🗑️ Usunięto " + idxs.length);
    });
}


// =====================================
// FUNKCJE Z ZAPISEM NA SERWERZE
// =====================================

async function addDaneColumn() {
    const columnName = prompt("Podaj nazwę kolumny");
    if (!columnName) return;

    appState.dane.columns.push(columnName);
    appState.dane.rows.forEach(row => row[columnName] = "");

    await saveState();
    renderDane();
}

async function renameDaneColumn(index) {
    const oldName = appState.dane.columns[index];
    const newName = prompt("Nowa nazwa kolumny", oldName);
    if (!newName) return;

    appState.dane.columns[index] = newName;
    appState.dane.rows.forEach(row => {
        row[newName] = row[oldName];
        delete row[oldName];
    });

    await saveState();
    renderDane();
}

async function removeDaneColumn(index) {
    const columnName = appState.dane.columns[index];
    if (!confirm(`Usunąć kolumnę "${columnName}"?`)) return;

    appState.dane.columns.splice(index, 1);
    appState.dane.rows.forEach(row => delete row[columnName]);

    await saveState();
    renderDane();
}

function openDanePersonModal(index) {
    ensureDaneStandardColumns();
    currentDaneEdit = { index: (index == null || index === "" ? null : Number(index)) };
    const row = currentDaneEdit.index != null ? (appState.dane.rows[currentDaneEdit.index] || {}) : {};
    const isEdit = currentDaneEdit.index != null && !Number.isNaN(currentDaneEdit.index);
    const title = isEdit ? "Edytuj funkcjonariusza" : "Nowy funkcjonariusz";

    const imie = daneGetField(row, "imie");
    const nazwisko = daneGetField(row, "nazwisko");
    const stopien = daneGetField(row, "stopien");
    const nrplk = daneGetField(row, "nrplk");

    let root = document.getElementById("danePersonModalRoot");
    if (!root) {
        root = document.createElement("div");
        root.id = "danePersonModalRoot";
        document.body.appendChild(root);
    }
    root.innerHTML = `
    <div class="modal-overlay" style="display:flex;z-index:10050;" onclick="if(event.target===this)closeDanePersonModal()">
        <div class="modal" style="width:min(520px,96vw);max-height:94vh;overflow:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                <h2 style="margin:0;">${escapeHtml(title)}</h2>
                <div style="display:flex;gap:8px;">
                    <button type="button" class="btn-success" onclick="saveDanePerson()">Zapisz</button>
                    <button type="button" class="btn-danger" onclick="closeDanePersonModal()">Anuluj</button>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div>
                    <label>Stopień</label>
                    <input type="text" id="daneFieldStopien" value="${escapeHtml(stopien).replace(/"/g, "&quot;")}" style="width:100%;" placeholder="np. st. aspirant">
                </div>
                <div>
                    <label>Nazwisko</label>
                    <input type="text" id="daneFieldNazwisko" value="${escapeHtml(nazwisko).replace(/"/g, "&quot;")}" style="width:100%;" placeholder="Nazwisko">
                </div>
                <div>
                    <label>Imię</label>
                    <input type="text" id="daneFieldImie" value="${escapeHtml(imie).replace(/"/g, "&quot;")}" style="width:100%;" placeholder="Imię">
                </div>
                <div>
                    <label>Nr PLK</label>
                    <input type="text" id="daneFieldNrPlk" value="${escapeHtml(nrplk).replace(/"/g, "&quot;")}" style="width:100%;" placeholder="Nr PLK">
                </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button type="button" class="btn-success" onclick="saveDanePerson()">Zapisz</button>
                <button type="button" class="btn-danger" onclick="closeDanePersonModal()">Anuluj</button>
            </div>
        </div>
    </div>`;
    setTimeout(() => document.getElementById("daneFieldNazwisko")?.focus(), 50);
}

function closeDanePersonModal() {
    currentDaneEdit = null;
    const root = document.getElementById("danePersonModalRoot");
    if (root) root.innerHTML = "";
}

async function saveDanePerson() {
    ensureDaneStandardColumns();
    const stopien = (document.getElementById("daneFieldStopien")?.value || "").trim();
    const nazwisko = (document.getElementById("daneFieldNazwisko")?.value || "").trim();
    const imie = (document.getElementById("daneFieldImie")?.value || "").trim();
    const nrplk = (document.getElementById("daneFieldNrPlk")?.value || "").trim();

    if (!nazwisko && !imie) {
        alert("Podaj nazwisko lub imię");
        return;
    }

    const isEdit = currentDaneEdit && currentDaneEdit.index != null && !Number.isNaN(currentDaneEdit.index);
    let row;
    if (isEdit) {
        row = appState.dane.rows[currentDaneEdit.index] || {};
        appState.dane.rows[currentDaneEdit.index] = row;
    } else {
        row = {};
        appState.dane.columns.forEach(c => { row[c] = ""; });
        appState.dane.rows.push(row);
    }
    daneSetField(row, "stopien", stopien);
    daneSetField(row, "nazwisko", nazwisko);
    daneSetField(row, "imie", imie);
    daneSetField(row, "nrplk", nrplk);

    if (typeof saveState === "function") await saveState();
    closeDanePersonModal();
    renderDane();
    if (typeof showToast === "function") showToast(isEdit ? "✅ Zapisano" : "✅ Dodano funkcjonariusza");
}

async function addDaneRow() {
    openDanePersonModal();
}

async function removeDaneRow(index) {
    if (!confirm("Usunąć funkcjonariusza?")) return;
    appState.dane.rows.splice(index, 1);
    await saveState();
    renderDane();
}

async function updateDaneCell(rowIndex, columnName, value) {
    appState.dane.rows[rowIndex][columnName] = value;
    await saveState();
}

// =====================================
// EXCEL – eksport / import
// =====================================

function ensureXlsxLibDane() {
    if (typeof XLSX !== "undefined") return true;
    alert("Brak biblioteki Excel (SheetJS). Dodaj w index.html:\n<script src=\"https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js\"></script>");
    return false;
}

function exportDaneExcel() {
    if (!ensureXlsxLibDane()) return;

    const columns = (appState.dane?.columns || []).filter(c => !isDaneHiddenColumn(c));
    const rows = appState.dane?.rows || [];

    if (!rows.length) {
        alert("Brak danych do eksportu");
        return;
    }

    const data = rows.map(r => {
        const o = {};
        columns.forEach(col => {
            o[col] = r[col] != null ? String(r[col]) : "";
        });
        return o;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dane");
    XLSX.writeFile(wb, "dane_funkcjonariuszy.xlsx");
}

async function importDaneExcel(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!ensureXlsxLibDane()) return;

    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!json.length) {
            alert("Plik Excel jest pusty");
            return;
        }

        // Pobierz nagłówki z pierwszego wiersza (klucze obiektów)
        const excelColumns = Object.keys(json[0]);

        const mapped = json.map(row => {
            const o = {};
            excelColumns.forEach(col => {
                o[col] = row[col] != null ? String(row[col]).trim() : "";
            });
            return o;
        }).filter(r => Object.values(r).some(v => v !== ""));

        if (!mapped.length) {
            alert("Nie znaleziono poprawnych wierszy");
            return;
        }

        const mode = confirm(
            `Znaleziono ${mapped.length} wierszy.\n\nOK = ZASTĄP wszystkie dane\nAnuluj = DODAJ do istniejących`
        );

        if (!appState.dane) {
            appState.dane = { columns: [], rows: [] };
        }

        if (mode) {
            // Zastąp – weź kolumny z Excela (bez nr służbowego)
            appState.dane.columns = excelColumns.filter(c => !isDaneHiddenColumn(c));
            appState.dane.rows = mapped.map(row => {
                const o = {};
                appState.dane.columns.forEach(c => { o[c] = row[c] != null ? row[c] : ""; });
                return o;
            });
        } else {
            // Dodaj – zachowaj istniejące kolumny + dodaj nowe z Excela (bez nr służbowego)
            excelColumns.filter(c => !isDaneHiddenColumn(c)).forEach(col => {
                if (!appState.dane.columns.includes(col)) {
                    appState.dane.columns.push(col);
                    appState.dane.rows.forEach(r => r[col] = "");
                }
            });
            mapped.forEach(row => {
                const o = {};
                appState.dane.columns.forEach(col => {
                    o[col] = row[col] !== undefined ? row[col] : "";
                });
                appState.dane.rows.push(o);
            });
        }
        stripDaneHiddenColumnsFromState();

        await saveState();
        renderDane();
        alert(`Zaimportowano ${mapped.length} wierszy`);
    } catch (err) {
        console.error(err);
        alert("Błąd importu Excel: " + (err.message || err));
    }
}

// =====================================
// EXPOSE
// =====================================
window.addDaneColumn = addDaneColumn;
window.renameDaneColumn = renameDaneColumn;
window.removeDaneColumn = removeDaneColumn;
window.addDaneRow = addDaneRow;
window.openDanePersonModal = openDanePersonModal;
window.closeDanePersonModal = closeDanePersonModal;
window.saveDanePerson = saveDanePerson;
window.removeDaneRow = removeDaneRow;
window.updateDaneCell = updateDaneCell;
window.exportDaneExcel = exportDaneExcel;
window.importDaneExcel = importDaneExcel;

window.cycleDaneSort = cycleDaneSort;
window.initDane = initDane;
window.renderDane = renderDane;
window.daneUsunZaznaczoneClick = daneUsunZaznaczoneClick;
window.daneToggleSelectAll = daneToggleSelectAll;
window.toggleDanePeopleList = toggleDanePeopleList;
