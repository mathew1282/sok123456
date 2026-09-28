// =====================================
// POLECENIA (Rodzaj + Nazwa + Km od/do + 3 poziomy)
// =====================================

let currentPolecenieEdit = null;
let poleceniaFilterLinia = "";

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
    let lines = [...new Set(allRows.map(r => r.Linia).filter(Boolean))];
    lines = sortLinesNatural(lines);

    let rows = allRows.map((row, index) => ({ ...row, _index: index }));
    if (poleceniaFilterLinia) {
        rows = rows.filter(r => r.Linia === poleceniaFilterLinia);
    }

    let html = `
    <div class="card">
        <h2>Polecenia</h2>
        <br>
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            <button class="btn-success" onclick="openPolecenieModal()">Dodaj polecenie</button>
            <button class="btn-export" onclick="exportPoleceniaExcel()">📥 Eksport Excel</button>
            <button class="btn-import" onclick="document.getElementById('poleceniaExcelLoader').click()">📤 Import Excel</button>
            <input type="file" id="poleceniaExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importPoleceniaExcel(event)">
        </div>
        <br>

        <div style="margin-bottom:15px;">
            <div style="font-size:14px; color:#94a3b8; margin-bottom:8px;">Filtr linii (kliknij):</div>
            <div class="card-grid">
                <div class="line-pill ${poleceniaFilterLinia === "" ? "active" : ""}"
                     onclick="setPoleceniaFilterLinia('')">Wszystkie</div>
    `;

    lines.forEach(line => {
        const active = poleceniaFilterLinia === line ? "active" : "";
        html += `
            <div class="line-pill ${active}" onclick="setPoleceniaFilterLinia('${String(line).replace(/'/g, "\\'")}')">
                ${escapeHtml(line)}
            </div>`;
    });

    html += `
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Nr linii</th>
                    <th>Opis krótki</th>
                    <th>Opis pom</th>
                    <th>Opis</th>
                    <th>Rodzaj</th>
                    <th>Nazwa</th>
                    <th>Km od</th>
                    <th>Km do</th>
                    <th>Powiązane zgłoszenie</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(row => {
        const index = row._index;
        const krotki = (row.OpisKrotki || "").substring(0, 50);
        const pom = (row.OpisPom || "").substring(0, 50);
        const opis = (row.Opis || "").substring(0, 60);

        html += `
        <tr>
            <td>${escapeHtml(row.Linia || "")}</td>
            <td>${escapeHtml(krotki)}</td>
            <td>${escapeHtml(pom)}</td>
            <td style="white-space: pre-wrap; max-width: 220px;">${escapeHtml(opis)}${(row.Opis || "").length > 60 ? "…" : ""}</td>
            <td>${escapeHtml(row.Rodzaj || "Inne")}</td>
            <td>${escapeHtml(row.Nazwa || "")}</td>
            <td>${escapeHtml(row.KmOd || "")}</td>
            <td>${escapeHtml(row.KmDo || "")}</td>
            <td style="font-size:12px; max-width:180px;">${row.linkedZgloszenieId ? "🔗 " + escapeHtml(labelForZgloszenieId(row.linkedZgloszenieId)) : "<span style=\"color:#94a3b8;\">—</span>"}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" onclick="editPolecenie(${index})">Edytuj</button>
                <button class="btn-danger" onclick="removePolecenie(${index})">Usuń</button>
            </td>
        </tr>`;
    });

    if (rows.length === 0) {
        html += `<tr><td colspan="10" style="text-align:center; color:#94a3b8;">Brak poleceń</td></tr>`;
    }

    html += `
            </tbody>
        </table>
    </div>

    <div id="polecenieModal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:920px;">
            <h2 id="polecenieModalTitle">Polecenie</h2>

            <!-- Rząd 1: Nr linii | Opis krótki | Opis pom -->
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

            <!-- Opis – pełna szerokość + formatowanie -->
            <label>Opis (tekst generowany do wpisu)</label>
            <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                <button type="button" class="btn-primary" style="padding:4px 12px;" onclick="formatPolecenieOpis('bold')"><b>B</b> Pogrub</button>
                <button type="button" class="btn-primary" style="padding:4px 12px;" onclick="formatPolecenieOpis('underline')"><u>U</u> Podkreśl</button>
            </div>
            <div id="polecenieOpis" class="rich-opis-editor" contenteditable="true"
                 style="width:100%; min-height:140px; padding:10px; font-family: monospace; margin-bottom:14px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; white-space:pre-wrap; outline:none;"
                 data-placeholder="Pełny opis z znacznikami..."></div>

            <!-- Rząd 2: Rodzaj | Nazwa | Km od | Km do -->
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                <div style="flex:1; min-width:150px;">
                    <label>Rodzaj</label>
                    <select id="polecenieRodzaj" style="width:100%; padding:8px; border-radius:8px;">
                        <option value="Inne">Inne (nie do statystyk)</option>
                        <option value="Szlak">Szlak</option>
                        <option value="Stacja towarowa">Stacja towarowa</option>
                        <option value="Stacja osobowa">Stacja osobowa</option>
                    </select>
                </div>
                <div style="flex:1.4; min-width:160px;">
                    <label>Nazwa (szlaku / stacji)</label>
                    <input type="text" id="polecenieNazwa" placeholder="np. Legnica" style="width:100%;">
                </div>
                <div style="flex:0.8; min-width:110px;">
                    <label>Km od</label>
                    <input type="text" id="polecenieKmOd" placeholder="12,450" style="width:100%;">
                </div>
                <div style="flex:0.8; min-width:110px;">
                    <label>Km do</label>
                    <input type="text" id="polecenieKmDo" placeholder="18,200" style="width:100%;">
                </div>
            </div>

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

            <div style="margin:16px 0 10px 0; padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--bg-input);">
                <label style="font-weight:600;">🔗 Powiązane zgłoszenie (zakończenie procedury)</label>
                <p style="font-size:12px; color:var(--text-dim); margin:4px 0 8px 0;">
                    Polecenie = start, zgłoszenie = koniec (np. patrol szlaku → zakończenie patrolu).
                </p>
                <select id="polecenieLinkedZgl" style="width:100%; padding:8px; border-radius:8px;"></select>
            </div>

            <div class="modal-actions">
                <button class="btn-success" onclick="savePolecenie()">Zapisz polecenie</button>
                <button class="btn-danger" onclick="closePolecenieModal()">Anuluj</button>
            </div>
        </div>
    </div>
    `;

    container.innerHTML = html;
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
    document.getElementById("polecenieRodzaj").value = "Inne";
    document.getElementById("polecenieNazwa").value = "";
    document.getElementById("polecenieKmOd").value = "";
    document.getElementById("polecenieKmDo").value = "";
    const linkSel = document.getElementById("polecenieLinkedZgl");
    if (linkSel) linkSel.innerHTML = getZgloszeniaForLinkSelect("");
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
    const rodzaj = document.getElementById("polecenieRodzaj").value || "Inne";
    const nazwa = document.getElementById("polecenieNazwa").value.trim();
    const kmOd = document.getElementById("polecenieKmOd").value.trim();
    const kmDo = document.getElementById("polecenieKmDo").value.trim();

    if (!linia) { alert("Podaj nr linii"); return; }
    if (!opisKrotki) { alert("Podaj opis krótki"); return; }

    const linkedZgl = (document.getElementById("polecenieLinkedZgl")?.value || "").trim();

    const item = {
        Linia: linia,
        OpisKrotki: opisKrotki,
        OpisPom: opisPom,
        Opis: opis,
        Rodzaj: rodzaj,
        Nazwa: nazwa,
        KmOd: kmOd,
        KmDo: kmDo,
        linkedZgloszenieId: linkedZgl || null
    };

    if (!appState.polecenia) {
        appState.polecenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"], rows: [] };
    }
    if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];

    if (currentPolecenieEdit === null) {
        ensureRowId(item);
        appState.polecenia.rows.push(item);
    } else {
        const prev = appState.polecenia.rows[currentPolecenieEdit] || {};
        item.id = prev.id || ensureRowId(item);
        // odłącz stare zgłoszenie
        if (prev.linkedZgloszenieId && prev.linkedZgloszenieId !== item.linkedZgloszenieId) {
            const oldZ = findZgloszenieById(prev.linkedZgloszenieId);
            if (oldZ && oldZ.linkedPolecenieId === prev.id) oldZ.linkedPolecenieId = null;
        }
        appState.polecenia.rows[currentPolecenieEdit] = item;
    }

    // dwukierunkowo: zgłoszenie wie o poleceniu
    if (item.linkedZgloszenieId) {
        const z = findZgloszenieById(item.linkedZgloszenieId);
        if (z) z.linkedPolecenieId = item.id;
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
    document.getElementById("polecenieRodzaj").value = row.Rodzaj || "Inne";
    document.getElementById("polecenieNazwa").value = row.Nazwa || row.NazwaSzlaku || "";
    document.getElementById("polecenieKmOd").value = row.KmOd || row.Km || "";
    document.getElementById("polecenieKmDo").value = row.KmDo || "";
    ensureRowId(row);
    const linkSel = document.getElementById("polecenieLinkedZgl");
    if (linkSel) linkSel.innerHTML = getZgloszeniaForLinkSelect(row.linkedZgloszenieId || "");
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
window.insertPolecenieTag = insertPolecenieTag;
window.formatPolecenieOpis = formatPolecenieOpis;
window.setPoleceniaFilterLinia = setPoleceniaFilterLinia;
window.exportPoleceniaExcel = exportPoleceniaExcel;
window.importPoleceniaExcel = importPoleceniaExcel;
