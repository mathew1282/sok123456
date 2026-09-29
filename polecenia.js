// =====================================
// POLECENIA (Linia + Opis krótki + Opis pom + Opis)
// =====================================

let currentPolecenieEdit = null;
let poleceniaFilterLinia = "";
let poleceniaFilterQuery = "";
let polDeleteMode = false;
let polColFilters = { Linia: "", OpisKrotki: "", OpisPom: "" };
let polOpenFilterCol = null;

function initPolecenia() {
    if (appState.polecenia?.rows) {
        appState.polecenia.rows.forEach(row => {
            if (row.OpisKrotki === undefined) row.OpisKrotki = row.Opis || "";
            if (row.Opis === undefined) row.Opis = "";
            if (row.Linia === undefined) row.Linia = "";
            if (row.OpisPom === undefined) row.OpisPom = "";
            if (row.Rodzaj === undefined) row.Rodzaj = "Inne";
            if (row.Nazwa === undefined) row.Nazwa = row.NazwaSzlaku || "";
            if (row.KmOd === undefined) row.KmOd = row.Km || "";
            if (row.KmDo === undefined) row.KmDo = "";
        });
    }
    if (appState.polecenia) {
        appState.polecenia.columns = ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"];
    }
    renderPolecenia();
}

function sortLinesNatural(lines) {
    return [...lines].sort(compareLiniaNatural);
}

/** Najpierw linie zaczynające się od cyfry (numerycznie), potem alfabetycznie */
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

function sortPoleceniaRows(rows) {
    return [...rows].sort((ra, rb) => {
        const c = compareLiniaNatural(ra.Linia, rb.Linia);
        if (c !== 0) return c;
        const ak = String(ra.OpisKrotki || "").toLowerCase();
        const bk = String(rb.OpisKrotki || "").toLowerCase();
        return ak.localeCompare(bk, "pl", { sensitivity: "base" });
    });
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


function ensureRowId(row) {
    if (!row) return null;
    if (!row.id) row.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return row.id;
}

function getZgloszeniaForLinkSelect(selectedId) {
    const rows = appState.zgloszenia?.rows || [];
    let html = '<option value="">— brak powiązania —</option>';
    rows.forEach((r, i) => {
        ensureRowId(r);
        const label = ((r.Linia || "?") + " · " + (r.OpisKrotki || r.Opis || "(bez nazwy)")).substring(0, 80);
        const sel = selectedId && r.id === selectedId ? " selected" : "";
        html += `<option value="${r.id}"${sel}>${label.replace(/</g, "&lt;")}</option>`;
    });
    return html;
}

function findZgloszenieById(id) {
    if (!id) return null;
    const rows = appState.zgloszenia?.rows || [];
    return rows.find(r => r.id === id) || null;
}

function labelForZgloszenieId(id) {
    const r = findZgloszenieById(id);
    if (!r) return "";
    return (r.Linia || "?") + " · " + (r.OpisKrotki || "").substring(0, 40);
}

function renderPolecenia() {
    const container = document.getElementById("poleceniaContainer");
    if (!container) return;

    const allRows = appState.polecenia?.rows || [];
    let rows = allRows.map((row, index) => ({ ...row, _index: index }));

    const fLinia = (polColFilters.Linia || "").trim().toLowerCase();
    const fKrotki = (polColFilters.OpisKrotki || "").trim().toLowerCase();
    const fPom = (polColFilters.OpisPom || "").trim().toLowerCase();
    if (fLinia) rows = rows.filter(r => String(r.Linia || "").toLowerCase().includes(fLinia));
    if (fKrotki) rows = rows.filter(r => String(r.OpisKrotki || "").toLowerCase().includes(fKrotki));
    if (fPom) rows = rows.filter(r => String(r.OpisPom || "").toLowerCase().includes(fPom));

    // Autofiltr wyświetlania: najpierw numery linii, potem alfabet
    rows = sortPoleceniaRows(rows);

    const delMode = !!polDeleteMode;
    const usunStyle = delMode
        ? "background:#dc2626;border-color:#dc2626;color:#fff;"
        : "background:#16a34a;border-color:#16a34a;color:#fff;";

    function thFilter(col, label) {
        const active = (polColFilters[col] || "").trim();
        const open = polOpenFilterCol === col;
        const arrow = active ? "▼" : "▽";
        return `<th style="position:relative; user-select:none;">
            <span style="cursor:pointer; display:inline-flex; align-items:center; gap:4px;"
                  onclick="event.stopPropagation();polToggleColFilter('${col}')">
                ${label} <span style="font-size:10px;opacity:0.8;">${arrow}</span>
                ${active ? `<span style="font-size:10px;color:#60a5fa;">●</span>` : ""}
            </span>
            ${open ? `<div style="position:absolute;left:0;top:100%;z-index:50;min-width:180px;padding:8px;background:var(--bg,#0f172a);border:1px solid var(--border,#334155);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);"
                onclick="event.stopPropagation()">
                <input type="text" placeholder="Filtruj…" value="${escapeHtml(polColFilters[col] || "")}"
                       style="width:100%;padding:6px 8px;border-radius:6px;margin-bottom:6px;"
                       oninput="polColFilters['${col}']=this.value;renderPolecenia();"
                       onclick="event.stopPropagation()">
                <button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;width:100%;"
                        onclick="polColFilters['${col}']='';polOpenFilterCol=null;renderPolecenia();">Wyczyść</button>
            </div>` : ""}
        </th>`;
    }

    let body = "";
    if (rows.length === 0) {
        body = `<tr><td colspan="${delMode ? 6 : 5}" style="text-align:center; color:#94a3b8;">Brak poleceń</td></tr>`;
    } else {
        rows.forEach(row => {
            const index = row._index;
            const krotki = (row.OpisKrotki || "").substring(0, 50);
            const pom = (row.OpisPom || "").substring(0, 50);
            const opis = (row.Opis || "").substring(0, 60);
            const cb = delMode
                ? `<td><input type="checkbox" class="pol-sel" data-index="${index}" onclick="event.stopPropagation()"></td>`
                : "";
            body += `
            <tr>
                ${cb}
                <td>${escapeHtml(row.Linia || "")}</td>
                <td>${escapeHtml(krotki)}</td>
                <td>${escapeHtml(pom)}</td>
                <td style="white-space: pre-wrap; max-width: 320px;">${escapeHtml(opis)}${(row.Opis || "").length > 60 ? "…" : ""}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-primary" onclick="editPolecenie(${index})">Edytuj</button>
                </td>
            </tr>`;
        });
    }

    const thCb = delMode
        ? `<th style="width:36px;"><input type="checkbox" title="Zaznacz widoczne" onclick="polToggleSelectAll(this.checked)"></th>`
        : "";

    container.innerHTML = `
    <div class="card" onclick="if(polOpenFilterCol){polOpenFilterCol=null;renderPolecenia();}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div><h2 style="margin:0;">📌 Polecenia</h2></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button class="btn-success" onclick="openPolecenieModal()">Dodaj polecenie</button>
                <button class="btn-export" onclick="exportPoleceniaExcel()">📥 Eksport Excel</button>
                <button class="btn-import" onclick="document.getElementById('poleceniaExcelLoader').click()">📤 Import Excel</button>
                <input type="file" id="poleceniaExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importPoleceniaExcel(event)">
                <button type="button" style="padding:8px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;font-weight:600;${usunStyle}"
                        onclick="event.stopPropagation();polUsunZaznaczoneClick()">Usuń zaznaczone</button>
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    ${thCb}
                    ${thFilter("Linia", "Nr linii")}
                    ${thFilter("OpisKrotki", "Opis krótki")}
                    ${thFilter("OpisPom", "Opis pom")}
                    <th>Opis</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    </div>

    <div id="polecenieModal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:920px;">
            <h2 id="polecenieModalTitle">Polecenie</h2>
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                <div style="flex:1; min-width:140px;">
                    <label>Nr linii</label>
                    <input type="text" id="polecenieLinia" placeholder="np. 275" style="width:100%;">
                </div>
                <div style="flex:1; min-width:160px;">
                    <label>Opis krótki</label>
                    <input type="text" id="polecenieOpisKrotki" placeholder="Krótka nazwa" style="width:100%;">
                </div>
                <div style="flex:1; min-width:160px;">
                    <label>Opis pom</label>
                    <input type="text" id="polecenieOpisPom" placeholder="Opis pomocniczy" style="width:100%;">
                </div>
            </div>
            <label>Opis (tekst generowany do wpisu)</label>
            <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                <button type="button" class="btn-primary" style="padding:4px 12px;" onclick="formatPolecenieOpis('bold')"><b>B</b> Pogrub</button>
                <button type="button" class="btn-primary" style="padding:4px 12px;" onclick="formatPolecenieOpis('underline')"><u>U</u> Podkreśl</button>
            </div>
            <div id="polecenieOpis" class="rich-opis-editor" contenteditable="true"
                 style="width:100%; min-height:140px; padding:10px; font-family: monospace; margin-bottom:14px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; white-space:pre-wrap; outline:none;"></div>
            <h3>Dostępne znaczniki</h3>
            <div class="tag-buttons">
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@patrol')">@patrol</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@dowodca')">@dowodca</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@kierowca')">@kierowca</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@sklad')">@sklad</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@wszyscy')">@wszyscy</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@KZ')">@KZ</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@MKK')">@MKK</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@data')">@data</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@godzina')">@godzina</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@wot')">@wot</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@policjant')">@policjant</button>
                <button type="button" class="btn-primary" onclick="insertPolecenieTag('@wybrani')">@wybrani</button>
            </div>
            <div class="modal-actions">
                <button class="btn-success" onclick="savePolecenie()">Zapisz polecenie</button>
                <button class="btn-danger" onclick="closePolecenieModal()">Anuluj</button>
            </div>
        </div>
    </div>
    `;
}

function polToggleColFilter(col) {
    polOpenFilterCol = (polOpenFilterCol === col) ? null : col;
    renderPolecenia();
    setTimeout(() => {
        const inp = document.querySelector('#poleceniaContainer th input[placeholder="Filtruj…"]');
        if (inp) { inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (e) {} }
    }, 30);
}

function polUsunZaznaczoneClick() {
    if (!polDeleteMode) {
        polDeleteMode = true;
        renderPolecenia();
        if (typeof showToast === "function") showToast("Zaznacz pozycje do usunięcia");
        return;
    }
    const idxs = [...document.querySelectorAll(".pol-sel:checked")]
        .map(cb => parseInt(cb.getAttribute("data-index"), 10))
        .filter(i => !isNaN(i));
    if (!idxs.length) {
        polDeleteMode = false;
        renderPolecenia();
        return;
    }
    removeSelectedPolecenia().then((ok) => {
        if (ok) {
            polDeleteMode = false;
            renderPolecenia();
        }
    });
}

function setPoleceniaFilterLinia(line) {
    poleceniaFilterLinia = line || "";
    renderPolecenia();
}

function openPolecenieModal() {
    currentPolecenieEdit = null;
    document.getElementById("polecenieModalTitle").innerText = "Dodaj polecenie";
    document.getElementById("polecenieLinia").value = poleceniaFilterLinia || "";
    document.getElementById("polecenieOpisKrotki").value = "";
    document.getElementById("polecenieOpisPom").value = "";
    const opisEl = document.getElementById("polecenieOpis");
    if (opisEl) opisEl.innerHTML = "";
    document.getElementById("polecenieModal").style.display = "flex";
}

function closePolecenieModal() {
    document.getElementById("polecenieModal").style.display = "none";
    currentPolecenieEdit = null;
}

async function savePolecenie() {
    const linia = document.getElementById("polecenieLinia").value.trim();
    const opisKrotki = document.getElementById("polecenieOpisKrotki").value.trim();
    const opisPom = document.getElementById("polecenieOpisPom").value.trim();
    const opisEl = document.getElementById("polecenieOpis");
    const opis = opisEl ? (opisEl.innerHTML || "").trim() : "";
    if (!linia) { alert("Podaj nr linii"); return; }
    if (!opisKrotki) { alert("Podaj opis krótki"); return; }

    const item = {
        Linia: linia,
        OpisKrotki: opisKrotki,
        OpisPom: opisPom,
        Opis: opis
    };

    if (!appState.polecenia) {
        appState.polecenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis"], rows: [] };
    }
    if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];

    if (currentPolecenieEdit === null) {
        if (typeof ensureRowId === "function") ensureRowId(item);
        else item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        appState.polecenia.rows.push(item);
    } else {
        const prev = appState.polecenia.rows[currentPolecenieEdit] || {};
        item.id = prev.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
        appState.polecenia.rows[currentPolecenieEdit] = item;
    }

    await saveState();
    closePolecenieModal();
    renderPolecenia();
}

async function editPolecenie(index) {
    currentPolecenieEdit = index;
    const row = appState.polecenia.rows[index];
    if (!row) return;

    document.getElementById("polecenieModalTitle").innerText = "Edytuj polecenie";
    document.getElementById("polecenieLinia").value = row.Linia || "";
    document.getElementById("polecenieOpisKrotki").value = row.OpisKrotki || "";
    document.getElementById("polecenieOpisPom").value = row.OpisPom || "";
    const opisEl = document.getElementById("polecenieOpis");
    if (opisEl) {
        const raw = row.Opis || "";
        // Jeśli plain text z \n – pokaż z <br>, jeśli HTML – wstaw jak jest
        if (/<(?:b|strong|u|i|br|div|p)\b/i.test(raw)) opisEl.innerHTML = raw;
        else opisEl.innerHTML = String(raw).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    }
    document.getElementById("polecenieModal").style.display = "flex";
}

async function removePolecenie(index) {
    if (!confirm("Usunąć polecenie?")) return;
    const row = appState.polecenia.rows[index];
    if (row?.linkedZgloszenieId) {
        const z = findZgloszenieById(row.linkedZgloszenieId);
        if (z && z.linkedPolecenieId === row.id) z.linkedPolecenieId = null;
    }
    appState.polecenia.rows.splice(index, 1);
    await saveState();
    renderPolecenia();
}

function insertPolecenieTag(tag) {
    const el = document.getElementById("polecenieOpis");
    if (!el) return;
    el.focus();
    try {
        document.execCommand("insertText", false, tag);
    } catch (e) {
        el.innerHTML += tag;
    }
}

function formatPolecenieOpis(cmd) {
    const el = document.getElementById("polecenieOpis");
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, null);
}

// =====================================
// EXCEL – eksport / import
// =====================================

const POLECENIA_EXCEL_COLUMNS = ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"];

function ensureXlsxLib() {
    if (typeof XLSX !== "undefined") return true;
    alert("Brak biblioteki Excel (SheetJS). Dodaj w index.html:\n<script src=\"https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js\"></script>");
    return false;
}

function exportPoleceniaExcel() {
    if (!ensureXlsxLib()) return;
    const rows = appState.polecenia?.rows || [];
    if (!rows.length) {
        alert("Brak poleceń do eksportu");
        return;
    }
    const data = rows.map(r => {
        const o = {};
        POLECENIA_EXCEL_COLUMNS.forEach(col => {
            o[col] = r[col] != null ? String(r[col]) : "";
        });
        return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: POLECENIA_EXCEL_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Polecenia");
    XLSX.writeFile(wb, "polecenia.xlsx");
}

async function importPoleceniaExcel(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!ensureXlsxLib()) return;

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

        const mapped = json.map(row => {
            const get = (...keys) => {
                for (const k of keys) {
                    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
                }
                // case-insensitive
                const lower = {};
                Object.keys(row).forEach(k => { lower[k.toLowerCase()] = row[k]; });
                for (const k of keys) {
                    const v = lower[k.toLowerCase()];
                    if (v != null && String(v).trim() !== "") return String(v).trim();
                }
                return "";
            };
            return {
                Linia: get("Linia", "Nr linii", "linia"),
                OpisKrotki: get("OpisKrotki", "Opis krótki", "Opis krotki"),
                OpisPom: get("OpisPom", "Opis pom", "Opis pomocniczy"),
                Opis: get("Opis", "Opis pełny"),
                Rodzaj: get("Rodzaj") || "Inne",
                Nazwa: get("Nazwa", "NazwaSzlaku"),
                KmOd: get("KmOd", "Km od", "Km"),
                KmDo: get("KmDo", "Km do")
            };
        }).filter(r => r.Linia || r.OpisKrotki || r.Opis);

        if (!mapped.length) {
            alert("Nie znaleziono poprawnych wierszy (potrzebna kolumna Linia / Opis)");
            return;
        }

        const mode = confirm(
            `Znaleziono ${mapped.length} wierszy.\n\nOK = ZASTĄP wszystkie polecenia\nAnuluj = DODAJ do istniejących`
        );

        if (!appState.polecenia) {
            appState.polecenia = { columns: POLECENIA_EXCEL_COLUMNS.slice(), rows: [] };
        }
        appState.polecenia.columns = POLECENIA_EXCEL_COLUMNS.slice();

        if (mode) {
            appState.polecenia.rows = mapped;
        } else {
            if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];
            appState.polecenia.rows.push(...mapped);
        }

        await saveState();
        renderPolecenia();
        alert(`Zaimportowano ${mapped.length} poleceń`);
    } catch (err) {
        console.error(err);
        alert("Błąd importu Excel: " + (err.message || err));
    }
}

window.openPolecenieModal = openPolecenieModal;
window.closePolecenieModal = closePolecenieModal;
window.savePolecenie = savePolecenie;
window.editPolecenie = editPolecenie;
window.removePolecenie = removePolecenie;
window.removeSelectedPolecenia = removeSelectedPolecenia;
window.polToggleSelectAll = polToggleSelectAll;
window.insertPolecenieTag = insertPolecenieTag;
window.formatPolecenieOpis = formatPolecenieOpis;
window.setPoleceniaFilterLinia = setPoleceniaFilterLinia;
window.exportPoleceniaExcel = exportPoleceniaExcel;
window.importPoleceniaExcel = importPoleceniaExcel;

function polToggleSelectAll(checked) {
    document.querySelectorAll(".pol-sel").forEach(cb => { cb.checked = !!checked; });
}

async function removeSelectedPolecenia() {
    const idxs = [...document.querySelectorAll(".pol-sel:checked")]
        .map(cb => parseInt(cb.getAttribute("data-index"), 10))
        .filter(i => !isNaN(i) && i >= 0)
        .sort((a, b) => b - a);
    if (!idxs.length) return false;
    if (!confirm("Usunąć zaznaczone polecenia (" + idxs.length + ")?")) return false;
    idxs.forEach(i => {
        if (i >= 0 && i < (appState.polecenia.rows || []).length) {
            appState.polecenia.rows.splice(i, 1);
        }
    });
    if (typeof saveState === "function") await saveState();
    if (typeof showToast === "function") showToast("Usunięto " + idxs.length + " pozycji");
    return true;
}

