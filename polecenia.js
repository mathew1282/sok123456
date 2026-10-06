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
            // Usuń pola szlaku / km – polecenia to tylko zwykłe wpisy
            delete row.Rodzaj;
            delete row.Nazwa;
            delete row.NazwaSzlaku;
            delete row.KmOd;
            delete row.KmDo;
            delete row.Km;
            delete row.procedureId;
            delete row.procedureRole;
        });
    }
    if (appState.polecenia) {
        appState.polecenia.columns = ["Linia", "OpisKrotki", "OpisPom", "Opis"];
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


function polUniqueValues(col) {
    const seen = new Set();
    const items = [];
    (appState.polecenia && appState.polecenia.rows ? appState.polecenia.rows : []).forEach(r => {
        if (!r) return;
        const s = String((col === "Linia" ? r.Linia : r.OpisKrotki) || "").trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        items.push(s);
    });
    if (col === "Linia" && typeof compareLiniaNatural === "function") items.sort(compareLiniaNatural);
    else items.sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base" }));
    return items;
}

function polCloseFilterPanel() {
    const panel = document.getElementById("polFilterPanel");
    if (panel) panel.remove();
    polOpenFilterCol = null;
}

function polApplyColFilter(col, value) {
    if (!polColFilters) polColFilters = { Linia: "", OpisKrotki: "", OpisPom: "" };
    polColFilters[col] = value == null ? "" : String(value);
    polCloseFilterPanel();
    renderPolecenia();
}

function polToggleColFilter(col, anchorEl) {
    if (polOpenFilterCol === col && document.getElementById("polFilterPanel")) {
        polCloseFilterPanel();
        return;
    }
    polOpenFilterCol = col;
    polShowFilterPanel(col, anchorEl);
}

function polShowFilterPanel(col, anchorEl) {
    polCloseFilterPanel();
    polOpenFilterCol = col;
    const active = (polColFilters[col] || "").trim();
    const vals = polUniqueValues(col);

    const panel = document.createElement("div");
    panel.id = "polFilterPanel";
    panel.style.cssText = [
        "position:fixed",
        "z-index:9999",
        "width:280px",
        "height:auto",
        "display:flex",
        "flex-direction:column",
        "background:var(--bg-input)",
        "color:var(--text)",
        "border:1px solid var(--border)",
        "border-radius:10px",
        "box-shadow:0 12px 40px rgba(0,0,0,.35)",
        "overflow:hidden"
    ].join(";");

    const list = document.createElement("div");
    list.style.cssText = "flex:1;overflow:auto;padding:6px;min-height:0;";
    if (!vals.length) {
        list.innerHTML = '<div style="padding:10px;color:var(--text-dim);font-size:13px;">Brak wartości</div>';
    } else {
        vals.forEach(v => {
            const row = document.createElement("div");
            row.textContent = v;
            row.style.cssText = "padding:8px 10px;cursor:pointer;border-radius:6px;font-size:13px;color:var(--text);"
                + (active === v ? "background:rgba(59,130,246,.22);font-weight:700;" : "");
            row.onmouseenter = () => { if (active !== v) row.style.background = "rgba(59,130,246,.12)"; };
            row.onmouseleave = () => { row.style.background = active === v ? "rgba(59,130,246,.22)" : "transparent"; };
            row.onclick = (e) => { e.stopPropagation(); polApplyColFilter(col, v); };
            list.appendChild(row);
        });
    }

    const foot = document.createElement("div");
    foot.style.cssText = "padding:8px;border-top:1px solid var(--border);background:var(--bg-light);flex-shrink:0;";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-primary";
    btn.textContent = "Wyczyść filtr";
    btn.style.cssText = "padding:6px 8px;font-size:12px;width:100%;";
    btn.onclick = (e) => { e.stopPropagation(); polApplyColFilter(col, ""); };
    foot.appendChild(btn);

    panel.appendChild(list);
    panel.appendChild(foot);
    document.body.appendChild(panel);

    // wysokość wg liczby pozycji (krótka lista = mały panel; dużo = max ~70vh)
    const rowH = 36;
    const footH = 52;
    const pad = 12;
    const n = Math.max(1, vals.length);
    let ph = pad + footH + n * rowH;
    const phMax = Math.min(Math.floor(window.innerHeight * 0.7), 520);
    const phMin = 100;
    if (ph > phMax) ph = phMax;
    if (ph < phMin) ph = phMin;

    const rect = (anchorEl && anchorEl.getBoundingClientRect) ? anchorEl.getBoundingClientRect() : { left: 40, bottom: 80, top: 80 };
    let left = rect.left;
    let top = rect.bottom + 4;
    const pw = 280;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 4);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.height = ph + "px";

    setTimeout(() => {
        const closer = (ev) => {
            if (panel.contains(ev.target)) return;
            if (ev.target.closest && ev.target.closest("[data-pol-filter-btn]")) return;
            document.removeEventListener("mousedown", closer, true);
            polCloseFilterPanel();
        };
        document.addEventListener("mousedown", closer, true);
    }, 0);
}


function renderPolecenia() {
    const container = document.getElementById("poleceniaContainer");
    if (!container) return;

    const allRows = appState.polecenia?.rows || [];
    let rows = allRows.map((row, index) => ({ ...row, _index: index }));

    const fLinia = (polColFilters.Linia || "").trim();
    const fKrotki = (polColFilters.OpisKrotki || "").trim();
    if (fLinia) rows = rows.filter(r => String(r.Linia || "") === fLinia);
    if (fKrotki) rows = rows.filter(r => String(r.OpisKrotki || "") === fKrotki);

    // Autofiltr wyświetlania: najpierw numery linii, potem alfabet
    rows = sortPoleceniaRows(rows);

    const delMode = !!polDeleteMode;
    const usunStyle = delMode
        ? "background:#dc2626;border-color:#dc2626;color:#fff;"
        : "background:#16a34a;border-color:#16a34a;color:#fff;";

    function thFilter(col, label) {
        const active = (polColFilters[col] || "").trim();
        const arrow = active ? "▼" : "▽";
        return `<th style="position:relative; user-select:none; white-space:nowrap;" onclick="event.stopPropagation()">
            <span data-pol-filter-btn="1" style="cursor:pointer; display:inline-flex; align-items:center; gap:4px; flex-wrap:wrap; color:inherit;"
                  onclick="event.stopPropagation();polToggleColFilter('${col}', this)">
                ${label} <span style="font-size:10px;opacity:0.85;">${arrow}</span>
                ${active ? `<span style="font-size:11px;opacity:0.95;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(active)}">● ${escapeHtml(active)}</span>` : ""}
            </span>
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
    <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div><h2 style="margin:0;">📌 Polecenia</h2></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button class="btn-success" onclick="openPolecenieModal()">Dodaj polecenie</button>
                <button class="btn-primary" onclick="openPolSortowanieModal()">⇅ Sortowanie</button>
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
                    <th>Opis pom</th>
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

/* polToggle moved */


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

const POLECENIA_EXCEL_COLUMNS = ["Linia", "OpisKrotki", "OpisPom", "Opis"];

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
                Opis: get("Opis", "Opis pełny")
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



// =====================================
// SORTOWANIE KAFELKÓW – Polecenia (2. i 3. poziom, drag & drop)
// 1. poziom (linie): stały – liczby, potem alfabet
// =====================================

let _polSort = {
    line: null,
    opisKrotki: null,
    level2Order: [],
    level3Order: []
};

function polLiniaNaturalCmp(a, b) {
    if (typeof zglLiniaNaturalCmp === "function") return zglLiniaNaturalCmp(a, b);
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

function polSortedLines(rows) {
    const lines = [...new Set((rows || []).map(r => r.Linia || "(brak)"))];
    return lines.sort(polLiniaNaturalCmp);
}

function polSortedOpisKrotkiForLine(line, rows) {
    const all = rows || appState.polecenia?.rows || [];
    const filtered = all
        .map((r, i) => ({ r, i }))
        .filter(x => (x.r.Linia || "(brak)") === line);
    const map = new Map();
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

function polSortedRowsForGroup(line, opisKrotki, rows) {
    const all = rows || appState.polecenia?.rows || [];
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

function openPolSortowanieModal() {
    if (!appState.polecenia) appState.polecenia = { columns: [], rows: [] };
    if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];

    _polSort.line = null;
    _polSort.opisKrotki = null;
    _polSort.level2Order = [];
    _polSort.level3Order = [];

    const old = document.getElementById("polSortModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "polSortModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;align-items:stretch;justify-content:center;padding:12px;z-index:10050;";
    overlay.innerHTML = `
        <div class="modal" style="width:min(960px,96vw);height:min(90vh,880px);max-width:none;max-height:none;display:flex;flex-direction:column;padding:16px 18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <h2 style="margin:0;">⇅ Sortowanie kafelków – Polecenia</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn-success" onclick="polSortZapisz()">💾 Zapisz kolejność</button>
                    <button class="btn-danger" onclick="closePolSortowanieModal()">Zamknij</button>
                </div>
            </div>
            <p style="margin:0 0 12px 0;font-size:13px;color:var(--text-dim);">
                <strong>1. rząd (linie)</strong> – stały układ: liczby, potem alfabet (bez przeciągania).<br>
                <strong>2. i 3. rząd</strong> – złap kafelek i upuść. Najpierw wybierz linię, potem opis krótki.
            </p>
            <div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:14px;min-height:0;">
                <div>
                    <div style="font-weight:600;margin-bottom:6px;font-size:14px;">1. Nr linii <span style="font-weight:400;color:var(--text-dim);">(tylko wybór)</span></div>
                    <div id="polSortLines" class="card-grid" style="gap:6px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--bg-light);"></div>
                </div>
                <div>
                    <div style="font-weight:600;margin-bottom:6px;font-size:14px;">2. Opis krótki <span style="font-weight:400;color:var(--text-dim);">(przeciągnij)</span></div>
                    <div id="polSortLevel2" class="card-grid" style="gap:6px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--bg-light);min-height:48px;"></div>
                </div>
                <div>
                    <div style="font-weight:600;margin-bottom:6px;font-size:14px;">3. Opis / kafelki <span style="font-weight:400;color:var(--text-dim);">(przeciągnij)</span></div>
                    <div id="polSortLevel3" class="card-grid" style="gap:6px;min-height:48px;"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    polSortRenderLines();
    polSortRenderLevel2();
    polSortRenderLevel3();
}

function closePolSortowanieModal() {
    const m = document.getElementById("polSortModal");
    if (m) m.remove();
}

function polSortRenderLines() {
    const el = document.getElementById("polSortLines");
    if (!el) return;
    const lines = polSortedLines(appState.polecenia?.rows || []);
    if (!lines.length) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Brak poleceń</span>";
        return;
    }
    el.innerHTML = lines.map(line => {
        const active = _polSort.line === line ? " active" : "";
        const safe = String(line).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return `<div class="line-pill${active}" style="cursor:pointer;" onclick="polSortSelectLine('${safe}')">${escapeHtml(line)}</div>`;
    }).join("");
}

function polSortSelectLine(line) {
    _polSort.line = line;
    _polSort.opisKrotki = null;
    _polSort.level2Order = polSortedOpisKrotkiForLine(line, appState.polecenia?.rows || []);
    _polSort.level3Order = [];
    polSortRenderLines();
    polSortRenderLevel2();
    polSortRenderLevel3();
}

function polSortRenderLevel2() {
    const el = document.getElementById("polSortLevel2");
    if (!el) return;
    if (!_polSort.line) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Wybierz linię powyżej…</span>";
        return;
    }
    if (!_polSort.level2Order.length) {
        _polSort.level2Order = polSortedOpisKrotkiForLine(_polSort.line, appState.polecenia?.rows || []);
    }
    if (!_polSort.level2Order.length) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Brak opisów krótkich</span>";
        return;
    }
    el.innerHTML = _polSort.level2Order.map((k, idx) => {
        const sel = _polSort.opisKrotki === k ? " selected" : "";
        return `<div class="item-card${sel}" draggable="true" data-sort-level="2" data-sort-idx="${idx}"
            style="cursor:grab;"
            ondragstart="polSortDragStart(event,2,${idx})"
            ondragover="polSortDragOver(event)"
            ondrop="polSortDrop(event,2,${idx})"
            onclick="polSortSelectOpisKrotki(${idx})">${escapeHtml(k)}</div>`;
    }).join("");
}

function polSortSelectOpisKrotki(idx) {
    const k = _polSort.level2Order[idx];
    if (!k) return;
    _polSort.opisKrotki = k;
    const rows = polSortedRowsForGroup(_polSort.line, k, appState.polecenia?.rows || []);
    _polSort.level3Order = rows.map(x => x.i);
    polSortRenderLevel2();
    polSortRenderLevel3();
}

function polSortRenderLevel3() {
    const el = document.getElementById("polSortLevel3");
    if (!el) return;
    if (!_polSort.line || !_polSort.opisKrotki) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Wybierz opis krótki (2. rząd)…</span>";
        return;
    }
    if (!_polSort.level3Order.length) {
        const rows = polSortedRowsForGroup(_polSort.line, _polSort.opisKrotki, appState.polecenia?.rows || []);
        _polSort.level3Order = rows.map(x => x.i);
    }
    const all = appState.polecenia?.rows || [];
    if (!_polSort.level3Order.length) {
        el.innerHTML = "<span style='color:var(--text-dim);font-size:13px;'>Brak kafelków</span>";
        return;
    }
    el.innerHTML = _polSort.level3Order.map((rowIdx, idx) => {
        const r = all[rowIdx];
        if (!r) return "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 120);
        return `<div class="item-card" draggable="true" data-sort-level="3" data-sort-idx="${idx}"
            style="cursor:grab;"
            ondragstart="polSortDragStart(event,3,${idx})"
            ondragover="polSortDragOver(event)"
            ondrop="polSortDrop(event,3,${idx})">${escapeHtml(label)}</div>`;
    }).join("");
}

function polSortDragStart(e, level, idx) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ level, idx }));
    e.dataTransfer.effectAllowed = "move";
}

function polSortDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function polSortDrop(e, level, toIdx) {
    e.preventDefault();
    e.stopPropagation();
    let data;
    try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (err) { return; }
    if (!data || data.level !== level) return;
    const fromIdx = data.idx;
    if (fromIdx === toIdx || fromIdx == null || toIdx == null) return;

    if (level === 2) {
        const arr = _polSort.level2Order;
        if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return;
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
        polSortRenderLevel2();
    } else if (level === 3) {
        const arr = _polSort.level3Order;
        if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return;
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
        polSortRenderLevel3();
    }
}

async function polSortZapisz() {
    const rows = appState.polecenia?.rows;
    if (!Array.isArray(rows)) return;

    if (_polSort.line && _polSort.level2Order.length) {
        _polSort.level2Order.forEach((opisK, groupIdx) => {
            const members = rows
                .map((r, i) => ({ r, i }))
                .filter(x =>
                    (x.r.Linia || "(brak)") === _polSort.line &&
                    (x.r.OpisKrotki || "(bez opisu)") === opisK
                );
            if (_polSort.opisKrotki === opisK && _polSort.level3Order.length) {
                _polSort.level3Order.forEach((rowIdx, j) => {
                    if (rows[rowIdx]) rows[rowIdx].tileOrder = groupIdx * 1000 + j;
                });
            } else {
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
    } else if (_polSort.line && _polSort.opisKrotki && _polSort.level3Order.length) {
        _polSort.level3Order.forEach((rowIdx, j) => {
            if (rows[rowIdx]) rows[rowIdx].tileOrder = j;
        });
    }

    if (typeof saveState === "function") await saveState();
    if (typeof showToast === "function") showToast("✅ Zapisano kolejność kafelków (polecenia)");
    else alert("Zapisano kolejność kafelków (polecenia)");
    renderPolecenia();
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
window.openPolSortowanieModal = openPolSortowanieModal;
window.closePolSortowanieModal = closePolSortowanieModal;
window.polSortSelectLine = polSortSelectLine;
window.polSortSelectOpisKrotki = polSortSelectOpisKrotki;
window.polSortDragStart = polSortDragStart;
window.polSortDragOver = polSortDragOver;
window.polSortDrop = polSortDrop;
window.polSortZapisz = polSortZapisz;
window.polSortedLines = polSortedLines;
window.polSortedOpisKrotkiForLine = polSortedOpisKrotkiForLine;
window.polSortedRowsForGroup = polSortedRowsForGroup;
window.polLiniaNaturalCmp = polLiniaNaturalCmp;

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


window.polApplyColFilter = polApplyColFilter;
window.polShowFilterPanel = polShowFilterPanel;
window.polCloseFilterPanel = polCloseFilterPanel;
window.polToggleColFilter = polToggleColFilter;
window.polUniqueValues = polUniqueValues;
