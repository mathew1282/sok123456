// =====================================
// ZGŁOSZENIA (4 kolumny + 3 poziomy w generatorze)
// Nr linii | Opis krótki | Opis pom | Opis
// =====================================

let currentZgloszenieEdit = null;
let zgloszeniaFilterLinia = "";

function initZgloszenia() {
    if (appState.zgloszenia?.rows) {
        appState.zgloszenia.rows.forEach(row => {
            if (row.OpisKrotki === undefined) row.OpisKrotki = row.Opis || "";
            if (row.Opis === undefined) row.Opis = "";
            if (row.Linia === undefined) row.Linia = "";
            if (row.OpisPom === undefined) row.OpisPom = "";
        });
    }
    if (appState.zgloszenia) {
        appState.zgloszenia.columns = ["Linia", "OpisKrotki", "OpisPom", "Opis"];
    }
    renderZgloszenia();
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


function ensureZglRowId(row) {
    if (!row) return null;
    if (!row.id) row.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return row.id;
}

function getPoleceniaForLinkSelect(selectedId) {
    const rows = appState.polecenia?.rows || [];
    let html = '<option value="">— brak powiązania —</option>';
    rows.forEach((r) => {
        if (typeof ensureRowId === "function") ensureRowId(r);
        else ensureZglRowId(r);
        const label = ((r.Linia || "?") + " · " + (r.OpisKrotki || r.Opis || "(bez nazwy)")).substring(0, 80);
        const sel = selectedId && r.id === selectedId ? " selected" : "";
        html += `<option value="${r.id}"${sel}>${label.replace(/</g, "&lt;")}</option>`;
    });
    return html;
}

function findPolecenieById(id) {
    if (!id) return null;
    const rows = appState.polecenia?.rows || [];
    return rows.find(r => r.id === id) || null;
}

function labelForPolecenieId(id) {
    const r = findPolecenieById(id);
    if (!r) return "";
    return (r.Linia || "?") + " · " + (r.OpisKrotki || "").substring(0, 40);
}

function renderZgloszenia() {
    const container = document.getElementById("zgloszeniaContainer");
    if (!container) return;

    const allRows = appState.zgloszenia?.rows || [];
    let lines = [...new Set(allRows.map(r => r.Linia).filter(Boolean))];
    lines = sortLinesNatural(lines);

    let rows = allRows.map((row, index) => ({ ...row, _index: index }));
    if (zgloszeniaFilterLinia) {
        rows = rows.filter(r => r.Linia === zgloszeniaFilterLinia);
    }

    let html = `
    <div class="card">
        <h2>Zgłoszenia</h2>
        <br>
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            <button class="btn-success" onclick="openZgloszenieModal()">Dodaj zgłoszenie</button>
            <button class="btn-export" onclick="exportZgloszeniaExcel()">📥 Eksport Excel</button>
            <button class="btn-import" onclick="document.getElementById('zgloszeniaExcelLoader').click()">📤 Import Excel</button>
            <input type="file" id="zgloszeniaExcelLoader" accept=".xlsx,.xls,.csv" hidden onchange="importZgloszeniaExcel(event)">
        </div>
        <br>

        <div style="margin-bottom:15px;">
            <div style="font-size:14px; color:#94a3b8; margin-bottom:8px;">Filtr linii (kliknij):</div>
            <div class="card-grid">
                <div class="line-pill ${zgloszeniaFilterLinia === "" ? "active" : ""}"
                     onclick="setZgloszeniaFilterLinia('')">Wszystkie</div>
    `;

    lines.forEach(line => {
        const active = zgloszeniaFilterLinia === line ? "active" : "";
        html += `
            <div class="line-pill ${active}" onclick="setZgloszeniaFilterLinia('${String(line).replace(/'/g, "\\'")}')">
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
                    <th>Powiązane polecenie</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(row => {
        const index = row._index;
        const krotki = (row.OpisKrotki || "").substring(0, 80);
        const pom = (row.OpisPom || "").substring(0, 80);
        const opis = (row.Opis || "").substring(0, 120);

        html += `
        <tr>
            <td>${escapeHtml(row.Linia || "")}</td>
            <td>${escapeHtml(krotki)}</td>
            <td>${escapeHtml(pom)}</td>
            <td style="white-space: pre-wrap; max-width: 360px;">${escapeHtml(opis)}${(row.Opis || "").length > 120 ? "…" : ""}</td>
            <td style="font-size:12px; max-width:180px;">${row.linkedPolecenieId ? "🔗 " + escapeHtml(labelForPolecenieId(row.linkedPolecenieId)) : "<span style=\"color:#94a3b8;\">—</span>"}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" onclick="editZgloszenie(${index})">Edytuj</button>
                <button class="btn-danger" onclick="removeZgloszenie(${index})">Usuń</button>
            </td>
        </tr>`;
    });

    if (rows.length === 0) {
        html += `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Brak zgłoszeń</td></tr>`;
    }

    html += `
            </tbody>
        </table>
    </div>

    <div id="zgloszenieModal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:920px;">
            <h2 id="zgloszenieModalTitle">Zgłoszenie</h2>

            <!-- Rząd: Nr linii | Opis krótki | Opis pom -->
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                <div style="flex:1; min-width:140px;">
                    <label>Nr linii</label>
                    <input type="text" id="zgloszenieLinia" placeholder="np. 275" style="width:100%;">
                </div>
                <div style="flex:1; min-width:160px;">
                    <label>Opis krótki</label>
                    <input type="text" id="zgloszenieOpisKrotki" placeholder="Krótka nazwa" style="width:100%;">
                </div>
                <div style="flex:1; min-width:160px;">
                    <label>Opis pom</label>
                    <input type="text" id="zgloszenieOpisPom" placeholder="Opis pomocniczy" style="width:100%;">
                </div>
            </div>

            <!-- Opis – pełna szerokość + formatowanie -->
            <label>Opis (tekst generowany do wpisu)</label>
            <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                <button type="button" class="btn-primary" style="padding:4px 12px;" onclick="formatZgloszenieOpis('bold')"><b>B</b> Pogrub</button>
                <button type="button" class="btn-primary" style="padding:4px 12px;" onclick="formatZgloszenieOpis('underline')"><u>U</u> Podkreśl</button>
            </div>
            <div id="zgloszenieOpis" class="rich-opis-editor" contenteditable="true"
                 style="width:100%; min-height:160px; padding:10px; font-family: monospace; margin-bottom:14px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; white-space:pre-wrap; outline:none;"
                 data-placeholder="Pełny opis z możliwością znaczników..."></div>

            <h3>Dostępne znaczniki</h3>
            <div class="tag-buttons">
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@patrol')">@patrol</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@dowodca')">@dowodca</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@kierowca')">@kierowca</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@sklad')">@sklad</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@wszyscy')">@wszyscy</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@KZ')">@KZ</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@MKK')">@MKK</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@data')">@data</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@godzina')">@godzina</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@wot')">@wot</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@policjant')">@policjant</button>
                <button type="button" class="btn-primary" onclick="insertZgloszenieTag('@wybrani')">@wybrani</button>
            </div>

            <div style="margin:16px 0 10px 0; padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--bg-input);">
                <label style="font-weight:600;">🔗 Powiązane polecenie (start procedury)</label>
                <p style="font-size:12px; color:var(--text-dim); margin:4px 0 8px 0;">
                    Zgłoszenie = zakończenie; polecenie = rozpoczęcie (np. zakończenie patrolu ↔ polecono patrol).
                </p>
                <select id="zgloszenieLinkedPol" style="width:100%; padding:8px; border-radius:8px;"></select>
            </div>

            <div class="modal-actions">
                <button class="btn-success" onclick="saveZgloszenie()">Zapisz zgłoszenie</button>
                <button class="btn-danger" onclick="closeZgloszenieModal()">Anuluj</button>
            </div>
        </div>
    </div>
    `;

    container.innerHTML = html;
}

function setZgloszeniaFilterLinia(line) {
    zgloszeniaFilterLinia = line || "";
    renderZgloszenia();
}

function openZgloszenieModal() {
    currentZgloszenieEdit = null;
    document.getElementById("zgloszenieModalTitle").innerText = "Dodaj zgłoszenie";
    document.getElementById("zgloszenieLinia").value = zgloszeniaFilterLinia || "";
    document.getElementById("zgloszenieOpisKrotki").value = "";
    document.getElementById("zgloszenieOpisPom").value = "";
    const opisEl = document.getElementById("zgloszenieOpis");
    if (opisEl) opisEl.innerHTML = "";
    const linkSel = document.getElementById("zgloszenieLinkedPol");
    if (linkSel) linkSel.innerHTML = getPoleceniaForLinkSelect("");
    document.getElementById("zgloszenieModal").style.display = "flex";
}

function closeZgloszenieModal() {
    document.getElementById("zgloszenieModal").style.display = "none";
    currentZgloszenieEdit = null;
}

async function saveZgloszenie() {
    const linia = document.getElementById("zgloszenieLinia").value.trim();
    const opisKrotki = document.getElementById("zgloszenieOpisKrotki").value.trim();
    const opisPom = document.getElementById("zgloszenieOpisPom").value.trim();
    const opisEl = document.getElementById("zgloszenieOpis");
    const opis = opisEl ? (opisEl.innerHTML || "").trim() : "";

    if (!linia) {
        alert("Podaj nr linii");
        return;
    }
    if (!opisKrotki) {
        alert("Podaj opis krótki (będzie widoczny na kafelku)");
        return;
    }

    const linkedPol = (document.getElementById("zgloszenieLinkedPol")?.value || "").trim();

    const item = {
        Linia: linia,
        OpisKrotki: opisKrotki,
        OpisPom: opisPom,
        Opis: opis,
        linkedPolecenieId: linkedPol || null
    };

    if (!appState.zgloszenia) {
        appState.zgloszenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis"], rows: [] };
    }
    if (!Array.isArray(appState.zgloszenia.rows)) {
        appState.zgloszenia.rows = [];
    }

    if (currentZgloszenieEdit === null) {
        ensureZglRowId(item);
        appState.zgloszenia.rows.push(item);
    } else {
        const prev = appState.zgloszenia.rows[currentZgloszenieEdit] || {};
        item.id = prev.id || ensureZglRowId(item);
        if (prev.linkedPolecenieId && prev.linkedPolecenieId !== item.linkedPolecenieId) {
            const oldP = findPolecenieById(prev.linkedPolecenieId);
            if (oldP && oldP.linkedZgloszenieId === prev.id) oldP.linkedZgloszenieId = null;
        }
        appState.zgloszenia.rows[currentZgloszenieEdit] = item;
    }

    if (item.linkedPolecenieId) {
        const pol = findPolecenieById(item.linkedPolecenieId);
        if (pol) pol.linkedZgloszenieId = item.id;
    }

    await saveState();
    closeZgloszenieModal();
    renderZgloszenia();
}

async function editZgloszenie(index) {
    currentZgloszenieEdit = index;
    const row = appState.zgloszenia.rows[index];
    if (!row) return;

    document.getElementById("zgloszenieModalTitle").innerText = "Edytuj zgłoszenie";
    document.getElementById("zgloszenieLinia").value = row.Linia || "";
    document.getElementById("zgloszenieOpisKrotki").value = row.OpisKrotki || row.Opis || "";
    document.getElementById("zgloszenieOpisPom").value = row.OpisPom || "";
    const opisEl = document.getElementById("zgloszenieOpis");
    if (opisEl) {
        const raw = row.Opis || "";
        if (/<(?:b|strong|u|i|br|div|p)\b/i.test(raw)) opisEl.innerHTML = raw;
        else opisEl.innerHTML = String(raw).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    }
    document.getElementById("zgloszenieModal").style.display = "flex";
}

async function removeZgloszenie(index) {
    if (!confirm("Usunąć zgłoszenie?")) return;
    appState.zgloszenia.rows.splice(index, 1);
    await saveState();
    renderZgloszenia();
}

function insertZgloszenieTag(tag) {
    const el = document.getElementById("zgloszenieOpis");
    if (!el) return;
    el.focus();
    try {
        document.execCommand("insertText", false, tag);
    } catch (e) {
        el.innerHTML += tag;
    }
}

function formatZgloszenieOpis(cmd) {
    const el = document.getElementById("zgloszenieOpis");
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, null);
}

// =====================================
// EXCEL – eksport / import
// =====================================

const ZGLOSZENIA_EXCEL_COLUMNS = ["Linia", "OpisKrotki", "OpisPom", "Opis"];

function ensureXlsxLibZgl() {
    if (typeof XLSX !== "undefined") return true;
    alert("Brak biblioteki Excel (SheetJS). Dodaj w index.html:\n<script src=\"https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js\"></script>");
    return false;
}

function exportZgloszeniaExcel() {
    if (!ensureXlsxLibZgl()) return;
    const rows = appState.zgloszenia?.rows || [];
    if (!rows.length) {
        alert("Brak zgłoszeń do eksportu");
        return;
    }
    const data = rows.map(r => {
        const o = {};
        ZGLOSZENIA_EXCEL_COLUMNS.forEach(col => {
            o[col] = r[col] != null ? String(r[col]) : "";
        });
        return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: ZGLOSZENIA_EXCEL_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Zgloszenia");
    XLSX.writeFile(wb, "zgloszenia.xlsx");
}

async function importZgloszeniaExcel(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!ensureXlsxLibZgl()) return;

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
                Opis: get("Opis", "Opis pełny")
            };
        }).filter(r => r.Linia || r.OpisKrotki || r.Opis);

        if (!mapped.length) {
            alert("Nie znaleziono poprawnych wierszy (potrzebna kolumna Linia / Opis)");
            return;
        }

        const mode = confirm(
            `Znaleziono ${mapped.length} wierszy.\n\nOK = ZASTĄP wszystkie zgłoszenia\nAnuluj = DODAJ do istniejących`
        );

        if (!appState.zgloszenia) {
            appState.zgloszenia = { columns: ZGLOSZENIA_EXCEL_COLUMNS.slice(), rows: [] };
        }
        appState.zgloszenia.columns = ZGLOSZENIA_EXCEL_COLUMNS.slice();

        if (mode) {
            appState.zgloszenia.rows = mapped;
        } else {
            if (!Array.isArray(appState.zgloszenia.rows)) appState.zgloszenia.rows = [];
            appState.zgloszenia.rows.push(...mapped);
        }

        await saveState();
        renderZgloszenia();
        alert(`Zaimportowano ${mapped.length} zgłoszeń`);
    } catch (err) {
        console.error(err);
        alert("Błąd importu Excel: " + (err.message || err));
    }
}

window.openZgloszenieModal = openZgloszenieModal;
window.closeZgloszenieModal = closeZgloszenieModal;
window.saveZgloszenie = saveZgloszenie;
window.formatZgloszenieOpis = formatZgloszenieOpis;
window.editZgloszenie = editZgloszenie;
window.removeZgloszenie = removeZgloszenie;
window.insertZgloszenieTag = insertZgloszenieTag;
window.setZgloszeniaFilterLinia = setZgloszeniaFilterLinia;
window.exportZgloszeniaExcel = exportZgloszeniaExcel;
window.importZgloszeniaExcel = importZgloszeniaExcel;
