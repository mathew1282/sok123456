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
    const n = String(name || "").toLowerCase().trim();
    return /^(imi[eę]|nazwisko|name|surname|first\s*name|last\s*name)$/i.test(n)
        || n === "imie" || n === "imię" || n === "nazwisko";
}

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
    renderDane();
}

// =====================================
// RENDER
// =====================================

function renderDane() {
    const container = document.getElementById("daneContainer");
    if (!container) return;
    ensureDaneSortState();

    const columns = appState.dane.columns;
    const rows = appState.dane.rows;
    const order = getDaneSortedRows();
    const sort = appState.daneSort || {};

    let html = `
    <div class="card">
        <h2>Dane funkcjonariuszy</h2>
        <br>
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            <button class="btn-success" onclick="addDaneColumn()">Dodaj kolumnę</button>
            <button class="btn-primary" onclick="addDaneRow()">Dodaj funkcjonariusza</button>
            <button class="btn-export" onclick="exportDaneExcel()">📥 Eksport Excel</button>
            <button class="btn-import" onclick="document.getElementById('daneExcelLoader').click()">📤 Import Excel</button>
            <input type="file" id="daneExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importDaneExcel(event)">
        </div>
        <br><br>
        <table>
            <thead>
                <tr>
    `;

    columns.forEach((column, index) => {
        const canSort = isDaneNameColumn(column);
        let sortMark = "";
        if (canSort && sort.col === column) {
            sortMark = sort.dir === "asc" ? " ▲" : (sort.dir === "desc" ? " ▼" : "");
        } else if (canSort) {
            sortMark = " ▽";
        }
        const titleAttrs = canSort
            ? `style="cursor:pointer;user-select:none;" onclick="cycleDaneSort(${JSON.stringify(column)})" title="Sortuj: A→Z / Z→A / kolejność wpisu"`
            : "";
        html += `
            <th>
                <span ${titleAttrs}>${column}${sortMark}</span>
                <br><br>
                <button class="btn-primary" onclick="event.stopPropagation();renameDaneColumn(${index})">Zmień</button>
                <button class="btn-danger" onclick="event.stopPropagation();removeDaneColumn(${index})">Usuń</button>
            </th>
        `;
    });

    html += `
            <th>Akcje</th>
        </tr>
    </thead>
    <tbody>
    `;

    order.forEach(rowIndex => {
        const row = rows[rowIndex];
        html += `<tr>`;
        columns.forEach(column => {
            const val = (row[column] || "").replace(/"/g, "&quot;");
            html += `
            <td>
                <input type="text" value="${val}" 
                       onchange="updateDaneCell(${rowIndex}, '${String(column).replace(/'/g, "\\'")}', this.value)">
            </td>`;
        });
        html += `
            <td>
                <button class="btn-danger" onclick="removeDaneRow(${rowIndex})">Usuń</button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
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
