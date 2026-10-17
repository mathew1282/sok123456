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

function isDaneHiddenColumn(name) {
    const n = String(name || "").toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.indexOf("sluzbow") >= 0 || n.indexOf("nr sluzb") >= 0) return true;
    if (n === "nr sluzbowy" || n === "numer sluzbowy") return true;
    return false;
}

function getDaneVisibleColumns() {
    return (appState.dane?.columns || []).filter(c => !isDaneHiddenColumn(c));
}

let daneDeleteMode = false;


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

    // usuń kolumnę nr służbowy z modelu (jeśli była)
    const before = appState.dane.columns.length;
    appState.dane.columns = appState.dane.columns.filter(c => !isDaneHiddenColumn(c));
    if (appState.dane.columns.length !== before) {
        appState.dane.rows.forEach(row => {
            Object.keys(row || {}).forEach(k => {
                if (isDaneHiddenColumn(k)) delete row[k];
            });
        });
    }

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
                <button type="button" class="btn-primary" onclick="addDaneRow()">Dodaj funkcjonariusza</button>
                <button type="button" class="btn-export" onclick="exportDaneExcel()">📥 Eksport Excel</button>
                <button type="button" class="btn-import" onclick="document.getElementById('daneExcelLoader').click()">📤 Import Excel</button>
                <input type="file" id="daneExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importDaneExcel(event)">
                <button type="button" style="padding:8px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;font-weight:600;${usunStyle}"
                        onclick="event.stopPropagation();daneUsunZaznaczoneClick()">Usuń zaznaczone</button>
            </div>
        </div>
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

    html += `
                </tr>
            </thead>
            <tbody>
    `;

    if (order.length === 0) {
        const cols = columns.length + (delMode ? 1 : 0);
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
                const val = raw.replace(/"/g, "&quot;");
                const colEsc = String(column).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                html += `
                <td>
                    <input type="text" value="${val}"
                           onchange="updateDaneCell(${rowIndex}, '${colEsc}', this.value)">
                </td>`;
            });
            html += `</tr>`;
        });
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
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

async function addDaneRow() {
    const newRow = {};
    appState.dane.columns.forEach(col => newRow[col] = "");
    appState.dane.rows.push(newRow);

    await saveState();
    renderDane();
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

    const columns = appState.dane?.columns || [];
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
            // Zastąp – weź kolumny z Excela
            appState.dane.columns = excelColumns.slice();
            appState.dane.rows = mapped;
        } else {
            // Dodaj – zachowaj istniejące kolumny + dodaj nowe z Excela
            excelColumns.forEach(col => {
                if (!appState.dane.columns.includes(col)) {
                    appState.dane.columns.push(col);
                    appState.dane.rows.forEach(r => r[col] = "");
                }
            });
            // Uzupełnij brakujące kolumny w nowych wierszach
            mapped.forEach(row => {
                appState.dane.columns.forEach(col => {
                    if (row[col] === undefined) row[col] = "";
                });
            });
            if (!Array.isArray(appState.dane.rows)) appState.dane.rows = [];
            appState.dane.rows.push(...mapped);
        }

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
window.removeDaneRow = removeDaneRow;
window.updateDaneCell = updateDaneCell;
window.exportDaneExcel = exportDaneExcel;
window.importDaneExcel = importDaneExcel;

window.cycleDaneSort = cycleDaneSort;
window.initDane = initDane;
window.renderDane = renderDane;
window.daneUsunZaznaczoneClick = daneUsunZaznaczoneClick;
window.daneToggleSelectAll = daneToggleSelectAll;
