// =====================================
// GENERATOR WPISÓW
// + 3 poziomy kafelków
// + UWAGI + @wybrani
// + logowanie sprawdzeń
// + tagi patrolowe SEKWENCYJNIE (1.→patrol1, 2.→patrol2, 3.→patrol3)
// =====================================

let selectedPatrols = [];
let selectedZgloszeniaIndexes = [];
let selectedPoleceniaIndexes = [];
let selectedZgloszeniaLine = null;
let selectedPoleceniaLine = null;
let selectedZgloszeniaOpisKrotki = null;
let selectedPoleceniaOpisKrotki = null;
let selectedWybrani = [];
let uwagiWybrane = "NIE";
let selectedUwagiTyp = null;

// { "zgl_12": [ [0], [1], [2] ] }
let patrolAssignments = {};

/** Tryb sekwencyjny: każde @patrol przełącza kontekst na wybrany patrol */
let sequentialPatrolMode = true;

const defaultUwagiSzablony = {
    "MKK": "Przeprowadzono kontrolę dokumentów. MKK: @MKK.",
    "Pouczony": "Osoba została pouczona o obowiązujących przepisach.",
    "Legitymowany": "Dokonywano legitymowania osób. Sprawdzono tożsamość.",
    "Inne": ""
};

const SEQUENTIAL_PATROL_TAGS = [
    "@patrol",
    "@sklad",
    "@dowodca",
    "@kierowca",
    "@wszyscy",
    "@wot",
    "@policjant"
];

// =====================================
// POMOCNICZE
// =====================================

function forceOneLine(items) {
    if (!items) return "";
    const arr = Array.isArray(items) ? items : String(items).split("\n");
    return arr
        .map(item => String(item || "").trim())
        .filter(item => item.length > 0)
        .join(", ");
}

function uniqueNonEmpty(arr) {
    return [...new Set((arr || []).map(x => String(x || "").trim()).filter(x => x.length > 0))];
}

function uniqueIndexes(arr) {
    const out = [];
    const seen = new Set();
    (arr || []).forEach(x => {
        const n = Number(x);
        if (!Number.isFinite(n) || seen.has(n)) return;
        seen.add(n);
        out.push(n);
    });
    return out;
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

function escapeAttr(str) {
    return String(str || "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;");
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function getZglSearch() {
    return (document.getElementById("zglSearch")?.value || "").toLowerCase().trim();
}

function getPolSearch() {
    return (document.getElementById("polSearch")?.value || "").toLowerCase().trim();
}

function rowMatchesSearch(row, search) {
    if (!search) return true;
    const t = `${row.Linia || ""} ${row.OpisKrotki || ""} ${row.OpisPom || ""} ${row.Opis || ""} ${row.Nazwa || ""} ${row.NazwaSzlaku || ""} ${row.KmOd || ""} ${row.KmDo || ""} ${row.Km || ""} ${row.Rodzaj || ""}`.toLowerCase();
    return t.includes(search);
}

function sortByOpisKrotki(rows) {
    return rows.sort((a, b) => {
        const aLabel = (a.OpisKrotki || a.Opis || "").toLowerCase();
        const bLabel = (b.OpisKrotki || b.Opis || "").toLowerCase();
        return aLabel.localeCompare(bLabel, "pl", { sensitivity: "base", numeric: true });
    });
}

function nowHHMMSafe() {
    return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/** Zaokrąglenie matematyczne do pełnych 10 minut (0–4 w dół, 5–9 w górę) */
function roundTo10Minutes(date) {
    const d = new Date(date);
    let h = d.getHours();
    let m = d.getMinutes();
    const ones = m % 10;
    if (ones < 5) {
        m = m - ones;
    } else {
        m = m - ones + 10;
    }
    if (m >= 60) {
        h = (h + 1) % 24;
        m = 0;
    }
    d.setHours(h, m, 0, 0);
    return d;
}

function formatHHMM(date) {
    const d = date instanceof Date ? date : new Date(date);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function parseHHMM(str) {
    const m = String(str || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    return d;
}

function addHoursHHMM(hhmm, hours) {
    const d = parseHHMM(hhmm);
    if (!d) return hhmm;
    d.setHours(d.getHours() + hours);
    return formatHHMM(d);
}

function stripHtmlToText(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function countTagOccurrences(text, tag) {
    // Licz na tekście bez HTML, żeby nie gubić wystąpień w sformatowanym Opisie
    const plain = stripHtmlToText(text);
    const safe = String(tag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = plain.match(new RegExp(safe + "\\b", "gi"));
    return m ? m.length : 0;
}

function countPatrolTags(text) {
    return countTagOccurrences(text, "@patrol");
}

function hasAnyPatrolTagInSelection() {
    let total = 0;
    selectedZgloszeniaIndexes.forEach(i => {
        total += countPatrolTags(appState.zgloszenia?.rows?.[i]?.Opis || "");
    });
    selectedPoleceniaIndexes.forEach(i => {
        total += countPatrolTags(appState.polecenia?.rows?.[i]?.Opis || "");
    });
    return total > 0;
}

function countPatrolTagsInSelection() {
    let total = 0;
    selectedZgloszeniaIndexes.forEach(i => {
        total += countPatrolTags(appState.zgloszenia?.rows?.[i]?.Opis || "");
    });
    selectedPoleceniaIndexes.forEach(i => {
        total += countPatrolTags(appState.polecenia?.rows?.[i]?.Opis || "");
    });
    return total;
}

function isSequentialModeEnabled() {
    return !!sequentialPatrolMode;
}

function updateSequentialPatrolPill() {
    const pill = document.getElementById("sequentialPatrolPill");
    if (!pill) return;
    pill.classList.remove("sequential-pill-on", "sequential-pill-off", "active");
    if (sequentialPatrolMode) {
        pill.classList.add("sequential-pill-on", "active");
    } else {
        pill.classList.add("sequential-pill-off");
    }
}

function syncSequentialCheckbox() {
    // Domyślnie włączony; przy >1 @patrol utrzymujemy włączony, ale nie nadpisujemy ręcznego wyłączenia
    // tylko odświeżamy wygląd kafelka
    updateSequentialPatrolPill();
}

function toggleSequentialPatrolMode() {
    sequentialPatrolMode = !sequentialPatrolMode;
    patrolAssignments = {};
    updateSequentialPatrolPill();
    updateLiveEntry();
    showToast(sequentialPatrolMode ? "Tryb @patrol włączony" : "Tryb @patrol wyłączony");
}

function needsPatrolAssignmentModal() {
    if (!isSequentialModeEnabled()) return false;
    return countPatrolTagsInSelection() > 1 && selectedPatrols.length >= 1;
}

function getPatrolName(index) {
    const p = appState.patrole?.[index];
    return (p && p.nazwa) ? p.nazwa : ("Patrol " + (index + 1));
}

/** Tyle slotów, ile wystąpień @patrol (kontekst sekwencyjny) */
function buildSequentialOccurrenceList(text) {
    const n = countPatrolTags(text);
    const list = [];
    for (let i = 0; i < Math.max(n, 1); i++) {
        if (!selectedPatrols.length) list.push([]);
        else list.push([selectedPatrols[i % selectedPatrols.length]]);
    }
    return list;
}

function getOccurrenceListForKey(key, text) {
    if (patrolAssignments[key] && patrolAssignments[key].length) {
        const base = patrolAssignments[key];
        const need = Math.max(base.length, buildSequentialOccurrenceList(text).length);
        const out = [];
        for (let i = 0; i < need; i++) {
            if (base[i] && base[i].length) out.push([...base[i]]);
            else if (selectedPatrols.length) out.push([selectedPatrols[i % selectedPatrols.length]]);
            else out.push([]);
        }
        return out;
    }
    return buildSequentialOccurrenceList(text);
}

function resolvePatrolIndexesForSlot(list, slot) {
    let idxs = uniqueIndexes(list && list[slot]);
    if (!idxs.length && selectedPatrols.length) {
        idxs = [selectedPatrols[slot % selectedPatrols.length]];
    }
    return idxs;
}

// =====================================
// INICJALIZACJA
// =====================================

function initGenerator() {
    selectedPatrols = [];
    selectedZgloszeniaIndexes = [];
    selectedPoleceniaIndexes = [];
    selectedZgloszeniaLine = null;
    selectedPoleceniaLine = null;
    selectedZgloszeniaOpisKrotki = null;
    selectedPoleceniaOpisKrotki = null;
    selectedWybrani = [];
    uwagiWybrane = "NIE";
    selectedUwagiTyp = null;
    patrolAssignments = {};

    ensureUwagiState();

    if (!appState.zgloszenia) appState.zgloszenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "NazwaSzlaku", "Km"], rows: [] };
    if (!Array.isArray(appState.zgloszenia.rows)) appState.zgloszenia.rows = [];
    if (!appState.polecenia) appState.polecenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"], rows: [] };
    if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];
    if (!Array.isArray(appState.patrole)) appState.patrole = [];

    (appState.zgloszenia.rows || []).forEach(row => {
        if (row.OpisPom === undefined) row.OpisPom = "";
        if (row.NazwaSzlaku === undefined) row.NazwaSzlaku = "";
        if (row.Km === undefined) row.Km = "";
        if (row.OpisKrotki === undefined) row.OpisKrotki = row.Opis || "";
    });
    (appState.polecenia.rows || []).forEach(row => {
        if (row.OpisPom === undefined) row.OpisPom = "";
        if (row.Rodzaj === undefined) row.Rodzaj = "Inne";
        if (row.Nazwa === undefined) row.Nazwa = row.NazwaSzlaku || "";
        if (row.KmOd === undefined) row.KmOd = row.Km || "";
        if (row.KmDo === undefined) row.KmDo = "";
        if (row.OpisKrotki === undefined) row.OpisKrotki = row.Opis || "";
    });

    renderPatroleCards();
    renderZgloszeniaLines();
    renderPoleceniaLines();
    renderUwagiCards();

    const kzInput = document.getElementById("kzInput");
    const mkkInput = document.getElementById("mkkInput");
    if (kzInput) kzInput.value = appState.kz || "";
    if (mkkInput) mkkInput.value = appState.mkk || "";

    setupPersistentInputs();
    ensureWybraniModal();
    updateLiveEntry();
}

function setupPersistentInputs() {
    const kzInput = document.getElementById("kzInput");
    const mkkInput = document.getElementById("mkkInput");
    if (kzInput) {
        kzInput.oninput = () => {
            appState.kz = kzInput.value;
            saveState();
            updateLiveEntry();
        };
    }
    if (mkkInput) {
        mkkInput.oninput = () => {
            appState.mkk = mkkInput.value;
            saveState();
            updateLiveEntry();
        };
    }
}

// =====================================
// PATROLE
// =====================================

function renderPatroleCards() {
    const container = document.getElementById("patrolCards");
    if (!container) return;

    let html = "";
    (appState.patrole || []).forEach((patrol, index) => {
        const isSelected = selectedPatrols.includes(index) ? "active" : "";
        html += `
        <div class="line-pill ${isSelected}" onclick="togglePatrol(${index})">
            ${escapeHtml(patrol.nazwa || ("Patrol " + (index + 1)))}
        </div>`;
    });
    container.innerHTML = html || "<p>Brak patroli</p>";
}

function togglePatrol(index) {
    const pos = selectedPatrols.indexOf(index);
    if (pos > -1) selectedPatrols.splice(pos, 1);
    else selectedPatrols.push(index);
    selectedWybrani = [];
    patrolAssignments = {};
    renderPatroleCards();
    updateLiveEntry();
}

// =====================================
// ZGŁOSZENIA – 3 POZIOMY
// =====================================

function renderZgloszeniaLines() {
    const container = document.getElementById("zgloszeniaLinie");
    if (!container) return;

    const search = getZglSearch();
    const allRows = appState.zgloszenia?.rows || [];

    let lines = [...new Set(
        allRows.filter(row => rowMatchesSearch(row, search)).map(r => r.Linia).filter(Boolean)
    )];
    lines = sortLinesNatural(lines);

    if (selectedZgloszeniaLine && !lines.includes(selectedZgloszeniaLine)) {
        selectedZgloszeniaLine = null;
        selectedZgloszeniaOpisKrotki = null;
    }

    let html = "";
    lines.forEach(line => {
        const hasSelected = allRows.some((row, idx) =>
            row.Linia === line && selectedZgloszeniaIndexes.includes(idx)
        );
        let className = "line-pill";
        if (selectedZgloszeniaLine === line) className += " active";
        if (hasSelected) className += " has-selected";
        html += `<div class="${className}" onclick="selectZgloszeniaLine('${escapeAttr(line)}')">${escapeHtml(line)}</div>`;
    });

    container.innerHTML = html || "<p>Brak zgłoszeń</p>";
    renderZgloszeniaLevel2();
}

function selectZgloszeniaLine(line) {
    if (selectedZgloszeniaLine === line) {
        selectedZgloszeniaLine = null;
        selectedZgloszeniaOpisKrotki = null;
    } else {
        selectedZgloszeniaLine = line;
        selectedZgloszeniaOpisKrotki = null;
    }
    renderZgloszeniaLines();
}

function ensureZgloszeniaLevel3() {
    let level3 = document.getElementById("zgloszeniaLevel3");
    if (!level3) {
        const items = document.getElementById("zgloszeniaItems");
        if (!items || !items.parentNode) return null;
        level3 = document.createElement("div");
        level3.id = "zgloszeniaLevel3";
        level3.className = "card-grid";
        level3.style.marginTop = "12px";
        items.parentNode.insertBefore(level3, items.nextSibling);
    }
    return level3;
}

function renderZgloszeniaLevel2() {
    const container = document.getElementById("zgloszeniaItems");
    if (!container) return;
    const level3 = ensureZgloszeniaLevel3();

    const search = getZglSearch();
    const allRows = appState.zgloszenia?.rows || [];

    if (!selectedZgloszeniaLine && !search) {
        container.innerHTML = "";
        if (level3) level3.innerHTML = "";
        return;
    }

    let rows = allRows.map((row, index) => ({ ...row, _index: index }));
    if (selectedZgloszeniaLine) rows = rows.filter(r => r.Linia === selectedZgloszeniaLine);
    if (search) rows = rows.filter(r => rowMatchesSearch(r, search));

    let krotkie = [...new Set(rows.map(r => r.OpisKrotki || "(bez opisu)"))];
    krotkie.sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base", numeric: true }));

    let html = "";
    krotkie.forEach(k => {
        const hasSelected = rows.some(r => (r.OpisKrotki || "(bez opisu)") === k && selectedZgloszeniaIndexes.includes(r._index));
        let className = "item-card";
        if (selectedZgloszeniaOpisKrotki === k) className += " selected";
        if (hasSelected) className += " has-selected";
        html += `<div class="${className}" onclick="selectZgloszeniaOpisKrotki('${escapeAttr(k)}')">${escapeHtml(k)}</div>`;
    });

    container.innerHTML = html || "<p>Brak wyników</p>";
    renderZgloszeniaLevel3();
}

function selectZgloszeniaOpisKrotki(k) {
    selectedZgloszeniaOpisKrotki = (selectedZgloszeniaOpisKrotki === k) ? null : k;
    renderZgloszeniaLevel2();
}

function renderZgloszeniaLevel3() {
    const container = document.getElementById("zgloszeniaLevel3");
    if (!container) return;

    if (!selectedZgloszeniaOpisKrotki) {
        container.innerHTML = "";
        return;
    }

    const search = getZglSearch();
    const allRows = appState.zgloszenia?.rows || [];
    let rows = allRows.map((row, index) => ({ ...row, _index: index }));

    if (selectedZgloszeniaLine) rows = rows.filter(r => r.Linia === selectedZgloszeniaLine);
    rows = rows.filter(r => (r.OpisKrotki || "(bez opisu)") === selectedZgloszeniaOpisKrotki);
    if (search) rows = rows.filter(r => rowMatchesSearch(r, search));

    let html = "";
    rows.forEach(row => {
        const isSelected = selectedZgloszeniaIndexes.includes(row._index);
        const label = (row.OpisPom || "(brak opisu pom)").substring(0, 120);
        html += `
        <div class="item-card ${isSelected ? "selected" : ""}" onclick="toggleZgloszenie(${row._index})">
            ${escapeHtml(label)}
        </div>`;
    });
    container.innerHTML = html || "<p>Brak wyników</p>";
}

function toggleZgloszenie(index) {
    const pos = selectedZgloszeniaIndexes.indexOf(index);
    if (pos > -1) selectedZgloszeniaIndexes.splice(pos, 1);
    else selectedZgloszeniaIndexes.push(index);
    patrolAssignments = {};
    renderZgloszeniaLines();
    syncSequentialCheckbox();
    updateLiveEntry();
}

// =====================================
// POLECENIA – 3 POZIOMY
// =====================================

function renderPoleceniaLines() {
    const container = document.getElementById("poleceniaLinie");
    if (!container) return;

    const search = getPolSearch();
    const allRows = appState.polecenia?.rows || [];

    let lines = [...new Set(
        allRows.filter(row => rowMatchesSearch(row, search)).map(r => r.Linia).filter(Boolean)
    )];
    lines = sortLinesNatural(lines);

    if (selectedPoleceniaLine && !lines.includes(selectedPoleceniaLine)) {
        selectedPoleceniaLine = null;
        selectedPoleceniaOpisKrotki = null;
    }

    let html = "";
    lines.forEach(line => {
        const hasSelected = allRows.some((row, idx) =>
            row.Linia === line && selectedPoleceniaIndexes.includes(idx)
        );
        let className = "line-pill";
        if (selectedPoleceniaLine === line) className += " active";
        if (hasSelected) className += " has-selected";
        html += `<div class="${className}" onclick="selectPoleceniaLine('${escapeAttr(line)}')">${escapeHtml(line)}</div>`;
    });

    container.innerHTML = html || "<p>Brak poleceń</p>";
    renderPoleceniaLevel2();
}

function selectPoleceniaLine(line) {
    if (selectedPoleceniaLine === line) {
        selectedPoleceniaLine = null;
        selectedPoleceniaOpisKrotki = null;
    } else {
        selectedPoleceniaLine = line;
        selectedPoleceniaOpisKrotki = null;
    }
    renderPoleceniaLines();
}

function ensurePoleceniaLevel3() {
    let level3 = document.getElementById("poleceniaLevel3");
    if (!level3) {
        const items = document.getElementById("poleceniaItems");
        if (!items || !items.parentNode) return null;
        level3 = document.createElement("div");
        level3.id = "poleceniaLevel3";
        level3.className = "card-grid";
        level3.style.marginTop = "12px";
        items.parentNode.insertBefore(level3, items.nextSibling);
    }
    return level3;
}

function renderPoleceniaLevel2() {
    const container = document.getElementById("poleceniaItems");
    if (!container) return;
    const level3 = ensurePoleceniaLevel3();

    const search = getPolSearch();
    const allRows = appState.polecenia?.rows || [];

    if (!selectedPoleceniaLine && !search) {
        container.innerHTML = "";
        if (level3) level3.innerHTML = "";
        return;
    }

    let rows = allRows.map((row, index) => ({ ...row, _index: index }));
    if (selectedPoleceniaLine) rows = rows.filter(r => r.Linia === selectedPoleceniaLine);
    if (search) rows = rows.filter(r => rowMatchesSearch(r, search));

    let krotkie = [...new Set(rows.map(r => r.OpisKrotki || "(bez opisu)"))];
    krotkie.sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base", numeric: true }));

    let html = "";
    krotkie.forEach(k => {
        const hasSelected = rows.some(r => (r.OpisKrotki || "(bez opisu)") === k && selectedPoleceniaIndexes.includes(r._index));
        let className = "item-card";
        if (selectedPoleceniaOpisKrotki === k) className += " selected";
        if (hasSelected) className += " has-selected";
        html += `<div class="${className}" onclick="selectPoleceniaOpisKrotki('${escapeAttr(k)}')">${escapeHtml(k)}</div>`;
    });

    container.innerHTML = html || "<p>Brak wyników</p>";
    renderPoleceniaLevel3();
}

function selectPoleceniaOpisKrotki(k) {
    selectedPoleceniaOpisKrotki = (selectedPoleceniaOpisKrotki === k) ? null : k;
    renderPoleceniaLevel2();
}

function renderPoleceniaLevel3() {
    const container = document.getElementById("poleceniaLevel3");
    if (!container) return;

    if (!selectedPoleceniaOpisKrotki) {
        container.innerHTML = "";
        return;
    }

    const search = getPolSearch();
    const allRows = appState.polecenia?.rows || [];
    let rows = allRows.map((row, index) => ({ ...row, _index: index }));

    if (selectedPoleceniaLine) rows = rows.filter(r => r.Linia === selectedPoleceniaLine);
    rows = rows.filter(r => (r.OpisKrotki || "(bez opisu)") === selectedPoleceniaOpisKrotki);
    if (search) rows = rows.filter(r => rowMatchesSearch(r, search));

    let html = "";
    rows.forEach(row => {
        const isSelected = selectedPoleceniaIndexes.includes(row._index);
        const label = (row.OpisPom || "(brak opisu pom)").substring(0, 120);
        html += `
        <div class="item-card ${isSelected ? "selected" : ""}" onclick="togglePolecenie(${row._index})">
            ${escapeHtml(label)}
        </div>`;
    });
    container.innerHTML = html || "<p>Brak wyników</p>";
}

function togglePolecenie(index) {
    const pos = selectedPoleceniaIndexes.indexOf(index);
    if (pos > -1) selectedPoleceniaIndexes.splice(pos, 1);
    else selectedPoleceniaIndexes.push(index);
    patrolAssignments = {};
    renderPoleceniaLines();
    syncSequentialCheckbox();
    updateLiveEntry();
}

function onSequentialCheckboxChange() {
    // kompatybilność – używamy kafelka
    toggleSequentialPatrolMode();
}

function filterGeneratorTiles() {
    renderZgloszeniaLines();
    renderPoleceniaLines();
}

// =====================================
// LOGOWANIE SPRAWDZEŃ
// =====================================

function getSelectedPoleceniaDoSprawdzen() {
    const rows = appState.polecenia?.rows || [];
    const allowed = ["Szlak", "Stacja towarowa", "Stacja osobowa"];
    return selectedPoleceniaIndexes
        .map(i => ({ ...rows[i], _index: i }))
        .filter(r => r && allowed.includes(r.Rodzaj));
}

function openLogSprawdzenModal() {
    const items = getSelectedPoleceniaDoSprawdzen();
    if (items.length === 0) {
        showToast("Zaznacz polecenie typu Szlak / Stacja towarowa / Stacja osobowa");
        return;
    }

    let existing = document.getElementById("logSprawdzenModal");
    if (existing) existing.remove();

    const startRounded = formatHHMM(roundTo10Minutes(new Date()));
    const endDefault = addHoursHHMM(startRounded, 2);

    const overlay = document.createElement("div");
    overlay.id = "logSprawdzenModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    let body = items.map((it, idx) => `
        <div style="border:1px solid #334155; border-radius:10px; padding:12px; margin-bottom:12px;">
            <div style="font-weight:600; margin-bottom:8px;">${escapeHtml(it.Rodzaj)} – ${escapeHtml(it.Nazwa || it.OpisKrotki || "")}</div>
            <div style="font-size:13px; color:#94a3b8; margin-bottom:8px;">
                Linia: ${escapeHtml(it.Linia || "")} | Km: ${escapeHtml(it.KmOd || "")} – ${escapeHtml(it.KmDo || "")}
            </div>
            <label>Godzina rozpoczęcia</label>
            <input type="text" id="sprawdGodzOd_${idx}" value="${startRounded}" placeholder="gg:mm"
                   style="width:100%; margin-bottom:8px;"
                   oninput="onSprawdGodzOdChange(${idx})">
            <label>Szacunkowa godzina zakończenia (+2h, edytowalna)</label>
            <input type="text" id="sprawdGodzDo_${idx}" value="${endDefault}" placeholder="gg:mm" style="width:100%;">
        </div>
    `).join("");

    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <h2>Zaloguj sprawdzenie</h2>
            <p style="color:#94a3b8; font-size:14px;">
                Godzina rozpoczęcia zaokrąglona matematycznie do 10 min.
                Zakończenie domyślnie +2h (możesz zmienić).
            </p>
            ${body}
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmLogSprawdzen()">Zapisz do statystyk</button>
                <button class="btn-danger" onclick="closeLogSprawdzenModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function onSprawdGodzOdChange(idx) {
    const odEl = document.getElementById(`sprawdGodzOd_${idx}`);
    const doEl = document.getElementById(`sprawdGodzDo_${idx}`);
    if (!odEl || !doEl) return;
    const parsed = parseHHMM(odEl.value);
    if (!parsed) return;
    doEl.value = addHoursHHMM(formatHHMM(parsed), 2);
}

function closeLogSprawdzenModal() {
    const m = document.getElementById("logSprawdzenModal");
    if (m) m.remove();
}

async function confirmLogSprawdzen() {
    const items = getSelectedPoleceniaDoSprawdzen();
    if (!items.length) return;

    for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const godzOd = (document.getElementById(`sprawdGodzOd_${idx}`)?.value || "").trim();
        const godzDo = (document.getElementById(`sprawdGodzDo_${idx}`)?.value || "").trim();
        if (!godzOd || !godzDo) {
            showToast("Uzupełnij godziny (gg:mm)");
            return;
        }
        if (typeof logSprawdzenie === "function") {
            await logSprawdzenie({
                rodzaj: it.Rodzaj,
                nazwa: it.Nazwa || it.OpisKrotki || "",
                linia: it.Linia || "",
                kmOd: it.KmOd || "",
                kmDo: it.KmDo || "",
                godzOd,
                godzDo
            });
        }
    }

    closeLogSprawdzenModal();
    showToast("✅ Zapisano sprawdzenia w statystykach");
}

// =====================================
// UWAGI
// =====================================

function ensureUwagiState() {
    if (!appState.uwagiSzablony) {
        appState.uwagiSzablony = { ...defaultUwagiSzablony };
    }
    Object.keys(defaultUwagiSzablony).forEach(k => {
        if (appState.uwagiSzablony[k] === undefined) {
            appState.uwagiSzablony[k] = defaultUwagiSzablony[k];
        }
    });
}

function renderUwagiCards() {
    const nie = document.getElementById("uwagiNie");
    const tak = document.getElementById("uwagiTak");
    if (!nie || !tak) return;
    if (uwagiWybrane === "NIE") {
        nie.classList.add("active");
        tak.classList.remove("active");
    } else {
        tak.classList.add("active");
        nie.classList.remove("active");
    }
}

function setUwagi(val) {
    uwagiWybrane = val;
    renderUwagiCards();
    if (val === "TAK") openUwagiModal();
}

function ensureUwagiModal() {
    if (document.getElementById("uwagiModal")) return;
    const overlay = document.createElement("div");
    overlay.id = "uwagiModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
        <div class="modal" style="max-width:720px;">
            <h2>Uwagi</h2>
            <div style="margin-bottom:18px;">
                <div style="font-size:14px; color:#94a3b8; margin-bottom:10px;">Wybierz typ uwagi:</div>
                <div class="card-grid" id="uwagiTypy">
                    <div class="item-card" onclick="wybierzTypUwagi('MKK')">MKK</div>
                    <div class="item-card" onclick="wybierzTypUwagi('Pouczony')">Pouczony</div>
                    <div class="item-card" onclick="wybierzTypUwagi('Legitymowany')">Legitymowany</div>
                    <div class="item-card" onclick="wybierzTypUwagi('Inne')">Inne</div>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <button class="btn-primary" onclick="openUwagiSzablonyModal()">Szablony</button>
            </div>
            <label style="display:block; margin-bottom:6px;">Treść uwagi (możesz edytować):</label>
            <textarea id="uwagiTekst" rows="8" style="width:100%; font-family:inherit; margin-bottom:15px;"></textarea>
            <div class="modal-actions">
                <button class="btn-success" onclick="wstawUwagi()">Wstaw</button>
                <button class="btn-danger" onclick="closeUwagiModal()">Wyjdź</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function openUwagiModal() {
    ensureUwagiState();
    ensureUwagiModal();
    selectedUwagiTyp = null;
    document.getElementById("uwagiTekst").value = "";
    document.getElementById("uwagiModal").style.display = "flex";
}

function closeUwagiModal() {
    const m = document.getElementById("uwagiModal");
    if (m) m.style.display = "none";
}

function wybierzTypUwagi(typ) {
    ensureUwagiState();
    selectedUwagiTyp = typ;
    const tekst = appState.uwagiSzablony[typ] || "";
    const textarea = document.getElementById("uwagiTekst");
    if (!textarea) return;
    textarea.value = applyTextWithPatrolOccurrences(tekst, buildSequentialOccurrenceList(tekst));
}

function ensureUwagiSzablonyModal() {
    if (document.getElementById("uwagiSzablonyModal")) return;
    const overlay = document.createElement("div");
    overlay.id = "uwagiSzablonyModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
        <div class="modal" style="max-width:800px;">
            <h2>Szablony uwag</h2>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:15px;">
                Znaczniki: @patrol, @sklad, @dowodca, @kierowca, @wszyscy, @KZ, @MKK, @data, @godzina, @wybrani, @wot, @policjant
            </p>
            <label>MKK</label>
            <textarea id="szablonMKK" rows="3" style="width:100%; margin-bottom:12px;"></textarea>
            <label>Pouczony</label>
            <textarea id="szablonPouczony" rows="3" style="width:100%; margin-bottom:12px;"></textarea>
            <label>Legitymowany</label>
            <textarea id="szablonLegitymowany" rows="3" style="width:100%; margin-bottom:12px;"></textarea>
            <label>Inne</label>
            <textarea id="szablonInne" rows="3" style="width:100%; margin-bottom:12px;"></textarea>
            <div class="modal-actions">
                <button class="btn-success" onclick="saveUwagiSzablony()">Zapisz szablony</button>
                <button class="btn-danger" onclick="closeUwagiSzablonyModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function openUwagiSzablonyModal() {
    ensureUwagiState();
    ensureUwagiSzablonyModal();
    document.getElementById("szablonMKK").value = appState.uwagiSzablony["MKK"] || "";
    document.getElementById("szablonPouczony").value = appState.uwagiSzablony["Pouczony"] || "";
    document.getElementById("szablonLegitymowany").value = appState.uwagiSzablony["Legitymowany"] || "";
    document.getElementById("szablonInne").value = appState.uwagiSzablony["Inne"] || "";
    document.getElementById("uwagiSzablonyModal").style.display = "flex";
}

function closeUwagiSzablonyModal() {
    const m = document.getElementById("uwagiSzablonyModal");
    if (m) m.style.display = "none";
}

async function saveUwagiSzablony() {
    ensureUwagiState();
    appState.uwagiSzablony["MKK"] = document.getElementById("szablonMKK").value;
    appState.uwagiSzablony["Pouczony"] = document.getElementById("szablonPouczony").value;
    appState.uwagiSzablony["Legitymowany"] = document.getElementById("szablonLegitymowany").value;
    appState.uwagiSzablony["Inne"] = document.getElementById("szablonInne").value;
    await saveState();
    closeUwagiSzablonyModal();
    showToast("✅ Szablony zapisane");
}

function wstawUwagi() {
    let tekst = (document.getElementById("uwagiTekst")?.value || "").trim();
    if (!tekst) {
        showToast("Wpisz treść uwagi");
        return;
    }

    if (/@wybrani/i.test(tekst)) {
        const people = getSkladFromSelectedPatrols();
        if (people.length === 0) {
            showToast("Brak osób w składzie zaznaczonych patroli");
            return;
        }
        window._uwagiTekstDoWstawienia = tekst;
        closeUwagiModal();
        openWybraniModalForUwagi();
        return;
    }

    tekst = applyTextWithPatrolOccurrences(tekst, buildSequentialOccurrenceList(tekst));
    wstawTekstUwagiDoWpis(tekst);
}

function wstawTekstUwagiDoWpis(tekst) {
    const el = getGeneratedEntryEl();
    if (!el) return;

    let current = getGeneratedEntryPlain();
    const regex = /(brak wydarzeń|bez wydarzeń)/gi;

    if (regex.test(current)) {
        current = current.replace(regex, tekst);
    } else {
        current = current.trim() + (current.trim() ? " - " : "") + tekst;
    }

    setGeneratedEntryContent(plainTextToHtml(current));
    closeUwagiModal();

    if (typeof logInterwencja === "function") {
        logInterwencja(selectedUwagiTyp || "Inne");
    }
    selectedUwagiTyp = null;
    showToast("✅ Uwaga wstawiona");
}

function openWybraniModalForUwagi() {
    ensureWybraniModal();
    const people = getSkladFromSelectedPatrols();
    if (people.length === 0) {
        showToast("Brak osób w składzie zaznaczonych patroli");
        return;
    }

    selectedWybrani = selectedWybrani.filter(p => people.includes(p));

    const list = document.getElementById("wybraniList");
    let html = "";
    people.forEach((name, i) => {
        const isSelected = selectedWybrani.includes(name) ? "selected" : "";
        html += `<div class="item-card ${isSelected}" onclick="toggleWybranaOsobaUwagi(${i})">${escapeHtml(name)}</div>`;
    });
    list.innerHTML = html;

    updateUwagiLivePreview();

    const actions = document.querySelector("#wybraniModal .modal-actions");
    if (actions) {
        actions.innerHTML = `
            <button class="btn-success" onclick="confirmWybraniUwagi()">Zatwierdź i wstaw</button>
            <button class="btn-primary" onclick="selectAllWybraniUwagi()">Zaznacz wszystkich</button>
            <button class="btn-danger" onclick="closeWybraniModal()">Anuluj</button>
        `;
    }

    let preview = document.getElementById("uwagiLivePreview");
    if (!preview) {
        preview = document.createElement("div");
        preview.id = "uwagiLivePreview";
        preview.style.cssText = "margin-top:15px; padding:12px; background:#0f172a; border-radius:10px; font-size:14px; color:#e2e8f0; border:1px solid #334155;";
        const listEl = document.getElementById("wybraniList");
        if (listEl && listEl.parentNode) {
            listEl.parentNode.insertBefore(preview, actions);
        }
    }

    document.getElementById("wybraniModal").style.display = "flex";
}

function toggleWybranaOsobaUwagi(index) {
    const people = getSkladFromSelectedPatrols();
    const name = people[index];
    if (!name) return;
    const pos = selectedWybrani.indexOf(name);
    if (pos > -1) selectedWybrani.splice(pos, 1);
    else selectedWybrani.push(name);
    document.querySelectorAll("#wybraniList .item-card").forEach((card, i) => {
        if (selectedWybrani.includes(people[i])) card.classList.add("selected");
        else card.classList.remove("selected");
    });
    updateUwagiLivePreview();
}

function selectAllWybraniUwagi() {
    selectedWybrani = [...getSkladFromSelectedPatrols()];
    document.querySelectorAll("#wybraniList .item-card").forEach(card => card.classList.add("selected"));
    updateUwagiLivePreview();
}

function updateUwagiLivePreview() {
    const preview = document.getElementById("uwagiLivePreview");
    if (!preview) return;
    let tekst = window._uwagiTekstDoWstawienia || "";
    tekst = applyTextWithPatrolOccurrences(tekst, buildSequentialOccurrenceList(tekst));
    if (selectedWybrani.length > 0) {
        tekst = tekst.replace(/@wybrani/gi, forceOneLine(uniqueNonEmpty(selectedWybrani)));
    }
    preview.innerHTML = `<strong>Podgląd:</strong><br>${escapeHtml(tekst || "(brak tekstu)")}`;
}

function confirmWybraniUwagi() {
    if (selectedWybrani.length === 0) {
        showToast("Wybierz przynajmniej jedną osobę");
        return;
    }

    let tekst = window._uwagiTekstDoWstawienia || "";
    tekst = applyTextWithPatrolOccurrences(tekst, buildSequentialOccurrenceList(tekst));
    tekst = tekst.replace(/@wybrani/gi, forceOneLine(uniqueNonEmpty(selectedWybrani)));

    closeWybraniModal();
    closeUwagiModal();
    wstawTekstUwagiDoWpis(tekst);

    window._uwagiTekstDoWstawienia = "";
    selectedWybrani = [];

    const preview = document.getElementById("uwagiLivePreview");
    if (preview) preview.remove();

    const actions = document.querySelector("#wybraniModal .modal-actions");
    if (actions) {
        actions.innerHTML = `
            <button class="btn-success" onclick="confirmWybrani()">Zatwierdź i generuj</button>
            <button class="btn-primary" onclick="selectAllWybrani()">Zaznacz wszystkich</button>
            <button class="btn-danger" onclick="closeWybraniModal()">Anuluj</button>
        `;
    }
}

// =====================================
// GENEROWANIE – tagi SEKWENCYJNIE
// =====================================

function getSkladFromSelectedPatrols() {
    const allSklad = [];
    selectedPatrols.forEach(index => {
        const patrol = appState.patrole?.[index];
        if (!patrol || !Array.isArray(patrol.sklad)) return;
        patrol.sklad.forEach(p => { if (p) allSklad.push(p); });
    });
    return uniqueNonEmpty(allSklad);
}

/** Osoby do „Rozbij patrol”: skład + WOT + policjant */
function getRozbijPeopleFromSelectedPatrols() {
    const all = [];
    selectedPatrols.forEach(index => {
        const patrol = appState.patrole?.[index];
        if (!patrol) return;
        if (Array.isArray(patrol.sklad)) {
            patrol.sklad.forEach(p => { if (p) all.push(p); });
        }
        if (patrol.wot1) all.push(patrol.wot1);
        if (patrol.wot2) all.push(patrol.wot2);
        if (patrol.policjant1) all.push(patrol.policjant1);
        if (patrol.policjant2) all.push(patrol.policjant2);
    });
    return uniqueNonEmpty(all);
}

function hasWybraniTag() {
    const texts = [];
    selectedZgloszeniaIndexes.forEach(i => texts.push(appState.zgloszenia?.rows?.[i]?.Opis || ""));
    selectedPoleceniaIndexes.forEach(i => texts.push(appState.polecenia?.rows?.[i]?.Opis || ""));
    return /@wybrani/i.test(texts.join(" "));
}

function buildReplacementsForPatrols(patrolIndexes) {
    const idxs = uniqueIndexes(patrolIndexes);
    const kz = document.getElementById("kzInput")?.value || appState.kz || "";
    const mkk = document.getElementById("mkkInput")?.value || appState.mkk || "";

    const patrolNames = [];
    const allSklad = [];
    const allDowodcy = [];
    const allKierowcy = [];
    const allWot = [];
    const allPolicjanci = [];

    idxs.forEach(index => {
        const patrol = appState.patrole?.[index];
        if (!patrol) return;
        if (patrol.nazwa) patrolNames.push(patrol.nazwa);
        if (Array.isArray(patrol.sklad)) {
            patrol.sklad.forEach(p => { if (p) allSklad.push(p); });
        }
        if (patrol.dowodca) allDowodcy.push(patrol.dowodca);
        if (patrol.kierowca) allKierowcy.push(patrol.kierowca);
        if (patrol.wot1) allWot.push(patrol.wot1);
        if (patrol.wot2) allWot.push(patrol.wot2);
        if (patrol.policjant1) allPolicjanci.push(patrol.policjant1);
        if (patrol.policjant2) allPolicjanci.push(patrol.policjant2);
    });

    const now = new Date();
    const data = now.toLocaleDateString("pl-PL");
    const godzina = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    const wybraniValue = selectedWybrani.length > 0
        ? forceOneLine(uniqueNonEmpty(selectedWybrani))
        : "";

    return {
        "@patrol":    forceOneLine(uniqueNonEmpty(patrolNames)),
        "@dowodca":   forceOneLine(uniqueNonEmpty(allDowodcy)),
        "@kierowca":  forceOneLine(uniqueNonEmpty(allKierowcy)),
        "@sklad":     forceOneLine(uniqueNonEmpty(allSklad)),
        // @wszyscy = skład + WOT + policjant (po przecinku)
        "@wszyscy":   forceOneLine(uniqueNonEmpty([...allSklad, ...allWot, ...allPolicjanci])),
        "@wybrani":   wybraniValue,
        "@data":      data,
        "@godzina":   godzina,
        "@KZ":        kz,
        "@MKK":       mkk,
        "@wot":       forceOneLine(uniqueNonEmpty(allWot)),
        "@policjant": forceOneLine(uniqueNonEmpty(allPolicjanci))
    };
}

function buildReplacements() {
    return buildReplacementsForPatrols(selectedPatrols);
}

function applyTags(text, replacements) {
    let out = String(text || "");
    for (let pass = 0; pass < 2; pass++) {
        Object.entries(replacements).forEach(([tag, value]) => {
            const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            out = out.replace(new RegExp(safe + "\\b", "gi"), value || "");
        });
    }
    // Zachowaj nowe linie – nie zamieniaj \n na spacje
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim();
}

/**
 * Tryb zwykły: wszystkie tagi z wszystkich zaznaczonych patroli (przecinek).
 * Tryb sekwencyjny: każde @patrol przełącza kontekst; tagi po nim biorą dane z tego patrolu.
 */
function applyTextWithPatrolOccurrences(text, occurrenceList) {
    const raw = String(text || "");
    const sequential = isSequentialModeEnabled() && countPatrolTags(raw) > 0;

    if (!sequential) {
        // Zwykły tryb – połącz dane ze wszystkich zaznaczonych patroli
        const rep = buildReplacementsForPatrols(selectedPatrols);
        return applyTags(raw, rep);
    }

    const list = Array.isArray(occurrenceList) && occurrenceList.length
        ? occurrenceList
        : buildSequentialOccurrenceList(raw);

    // Idziemy od lewej: @patrol przełącza aktywny patrol, reszta tagów bierze z aktywnego
    const tagPattern = /@(?:patrol|sklad|dowodca|kierowca|wszyscy|wot|policjant)\b/gi;
    let result = "";
    let lastIndex = 0;
    let patrolOcc = 0;
    let activeIdxs = resolvePatrolIndexesForSlot(list, 0);

    // Tekst przed pierwszym @patrol – użyj pierwszego slotu (lub selected)
    if (!countPatrolTags(raw)) {
        activeIdxs = selectedPatrols.length ? selectedPatrols : activeIdxs;
    }

    let match;
    const re = new RegExp(tagPattern.source, "gi");
    while ((match = re.exec(raw)) !== null) {
        // fragment tekstu przed tagiem
        result += raw.slice(lastIndex, match.index);
        const tag = match[0].toLowerCase();
        const tagKey = tag.startsWith("@") ? tag : ("@" + tag);

        if (tagKey === "@patrol") {
            activeIdxs = resolvePatrolIndexesForSlot(list, patrolOcc);
            patrolOcc++;
            const rep = buildReplacementsForPatrols(activeIdxs);
            result += rep["@patrol"] || "";
        } else {
            const rep = buildReplacementsForPatrols(activeIdxs);
            result += rep[tagKey] || "";
        }
        lastIndex = match.index + match[0].length;
    }
    result += raw.slice(lastIndex);

    // Globalne tagi (@KZ, @MKK, @data, @godzina, @wybrani)
    const globalRep = buildReplacementsForPatrols(selectedPatrols);
    SEQUENTIAL_PATROL_TAGS.forEach(t => { delete globalRep[t]; });
    result = applyTags(result, globalRep);
    return result;
}

/**
 * Duża litera:
 * - na początku całego tekstu
 * - na początku nowej linii
 * - po kropce / ! / ? / …
 * NIE po dwukropku ":", średniku, przecinku.
 */
function capitalizeSentences(text) {
    let s = String(text || "");
    if (!s) return s;
    // początek tekstu oraz początek linii
    s = s.replace(/(^|[\n\r]+)([ \t]*)([a-ząćęłńóśźż])/gi, (_, br, sp, ch) =>
        br + sp + ch.toLocaleUpperCase("pl-PL")
    );
    // tylko po . ! ? … — celowo BEZ dwukropka
    s = s.replace(/([.!?…]+["»”']?)([ \t\n\r]+)([a-ząćęłńóśźż])/gi, (_, punct, sp, ch) =>
        punct + sp + ch.toLocaleUpperCase("pl-PL")
    );
    return s;
}

/**
 * HTML: nie traktuj każdego fragmentu po tagu jak nowego zdania
 * (wcześniej dawało wielką literę np. po </b> albo „Opis: tekst”).
 */
function capitalizeSentencesHtml(html) {
    const raw = String(html || "");
    if (!raw) return raw;
    if (!/<[^>]+>/.test(raw)) return capitalizeSentences(raw);

    let firstDone = false;
    return raw.replace(/(^|>)([^<]*)/g, (full, boundary, text) => {
        if (!text) return full;
        // po . ! ? wewnątrz segmentu
        let t = text.replace(/([.!?…]+["»”']?)([ \t\n\r]+)([a-ząćęłńóśźż])/gi, (_, punct, sp, ch) =>
            punct + sp + ch.toLocaleUpperCase("pl-PL")
        );
        // początek linii wewnątrz segmentu
        t = t.replace(/([\n\r]+)([ \t]*)([a-ząćęłńóśźż])/gi, (_, br, sp, ch) =>
            br + sp + ch.toLocaleUpperCase("pl-PL")
        );
        // pierwsza litera CAŁEGO dokumentu – tylko raz
        if (!firstDone) {
            t = t.replace(/^([ \t]*)([a-ząćęłńóśźż])/i, (_, sp, ch) => {
                firstDone = true;
                return sp + ch.toLocaleUpperCase("pl-PL");
            });
            if (/[a-ząćęłńóśźż]/i.test(text)) firstDone = true;
        }
        return boundary + t;
    });
}

function plainTextToHtml(text) {
    // Najpierw wielkie litery (szablon może być małymi)
    const s0 = capitalizeSentences(String(text || ""));
    // Biała kropka tylko wizualnie (klasa entry-bullet – nie trafia do schowka)
    const bulletHtml = '<span class="entry-bullet" style="color:#ffffff; font-weight:700; margin-right:6px;">•</span> ';
    const withBullets = s0.replace(/^• /gm, bulletHtml);
    if (/<(?:b|strong|u|i|br|div|p|span)\b/i.test(withBullets)) {
        return capitalizeSentencesHtml(withBullets.replace(/\n/g, "<br>"));
    }
    return escapeHtml(s0)
        .replace(/^• /gm, bulletHtml)
        .replace(/\n/g, "<br>");
}

function getGeneratedEntryEl() {
    return document.getElementById("generatedEntry");
}

function setGeneratedEntryContent(htmlOrText) {
    const el = getGeneratedEntryEl();
    if (!el) return;
    const fixed = capitalizeSentencesHtml(htmlOrText);
    if (el.getAttribute("contenteditable") === "true") {
        el.innerHTML = fixed;
    } else {
        el.value = capitalizeSentences(
            String(fixed).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
        );
    }
}

function getGeneratedEntryPlain() {
    const el = getGeneratedEntryEl();
    if (!el) return "";
    if (el.getAttribute("contenteditable") === "true") {
        const clone = el.cloneNode(true);
        // Usuń kropki – mają być tylko na ekranie, nie w schowku
        clone.querySelectorAll(".entry-bullet").forEach(n => n.remove());
        clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
        clone.querySelectorAll("div,p").forEach(d => {
            if (d.previousSibling) d.insertAdjacentText("beforebegin", "\n");
        });
        let text = (clone.textContent || "").replace(/\n{3,}/g, "\n\n");
        // Na wszelki wypadek usuń też same znaki • na początku linii
        text = text.replace(/^[\s•]+/gm, (m) => m.replace(/•/g, "").replace(/^\s+/, "") ? m.replace(/•/g, "") : "");
        text = text.split("\n").map(line => line.replace(/^•\s*/, "")).join("\n");
        return text.trim();
    }
    return (el.value || "").split("\n").map(line => line.replace(/^•\s*/, "")).join("\n").trim();
}

function getGeneratedEntryHtml() {
    const el = getGeneratedEntryEl();
    if (!el) return "";
    if (el.getAttribute("contenteditable") === "true") return el.innerHTML || "";
    return plainTextToHtml(el.value || "");
}

function updateLiveEntry() {
    const el = getGeneratedEntryEl();
    const banner = document.getElementById("wybraniHintBanner");
    if (!el) return;

    syncSequentialCheckbox();

    const needsWybraniHint = hasWybraniTag() && selectedWybrani.length === 0;
    const hintPlain = "⚠ KLIKNIJ „GENERUJ WPIS”, ABY WYBRAĆ OSOBY";
    const parts = [];

    const handle = (prefix, indexes, rows) => {
        indexes.forEach(i => {
            const t = rows?.[i]?.Opis;
            if (!t) return;
            const key = `${prefix}_${i}`;
            let text = applyTextWithPatrolOccurrences(t, getOccurrenceListForKey(key, t));
            if (needsWybraniHint) text = text.replace(/@wybrani/gi, hintPlain);
            else if (selectedWybrani.length > 0) {
                text = text.replace(/@wybrani/gi, forceOneLine(uniqueNonEmpty(selectedWybrani)));
            }
            parts.push(text);
        });
    };

    handle("zgl", selectedZgloszeniaIndexes, appState.zgloszenia?.rows);
    handle("pol", selectedPoleceniaIndexes, appState.polecenia?.rows);

    // Każde zgłoszenie/polecenie od nowej linii z białą kropką
    const items = parts.filter(Boolean).map(p => String(p).trim()).filter(Boolean);
    const joined = items.map(p => "• " + p).join("\n");
    setGeneratedEntryContent(plainTextToHtml(joined));
    if (banner) banner.style.display = needsWybraniHint ? "block" : "none";
}

function updateLiveEntryWithAssignments() {
    updateLiveEntry();
}

// =====================================
// MODAL @patrol
// =====================================

function ensurePatrolAssignModal() {
    if (document.getElementById("patrolAssignModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "patrolAssignModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
        <div class="modal" style="max-width:820px;">
            <h2>Przypisz patrole do @patrol</h2>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:15px;">
                Każde wystąpienie <strong>@patrol</strong> przełącza kontekst.
                Tagi po nim (@dowodca, @sklad, @kierowca…) biorą dane z wybranego patrolu.
                Klik = jeden patrol. Shift+klik = kilka.
            </p>
            <div id="patrolAssignCount" style="font-size:14px; color:#94a3b8; margin-bottom:10px;"></div>
            <div id="patrolAssignList" style="max-height:55vh; overflow:auto;"></div>
            <div id="patrolAssignPreview" style="margin-top:14px; padding:12px; background:#0f172a; border-radius:10px; border:1px solid #334155; font-size:14px; color:#e2e8f0; white-space:pre-wrap; max-height:22vh; overflow:auto;">
                <strong>Podgląd na żywo:</strong><br><span id="patrolAssignPreviewBody">(wybierz patrole)</span>
            </div>
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmPatrolAssignments()">Zatwierdź i generuj</button>
                <button class="btn-danger" onclick="closePatrolAssignModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function updatePatrolAssignPreview() {
    const body = document.getElementById("patrolAssignPreviewBody");
    if (!body) return;
    const parts = [];
    const handle = (prefix, indexes, rows) => {
        indexes.forEach(i => {
            const t = rows?.[i]?.Opis;
            if (!t) return;
            const key = `${prefix}_${i}`;
            parts.push(applyTextWithPatrolOccurrences(t, getOccurrenceListForKey(key, t)));
        });
    };
    handle("zgl", selectedZgloszeniaIndexes, appState.zgloszenia?.rows);
    handle("pol", selectedPoleceniaIndexes, appState.polecenia?.rows);
    const items = parts.filter(Boolean).map(p => String(p).trim()).filter(Boolean);
    body.textContent = items.map(p => "• " + p).join("\n") || "(brak tekstu)";
}

function openPatrolAssignModal() {
    ensurePatrolAssignModal();
    patrolAssignments = {};

    const list = document.getElementById("patrolAssignList");
    let html = "";
    let globalOcc = 0;

    const addSource = (prefix, indexes, rows, labelPrefix) => {
        indexes.forEach(i => {
            const row = rows?.[i];
            if (!row) return;
            const text = row.Opis || "";
            const count = countPatrolTags(text);
            if (count === 0) return;

            const key = `${prefix}_${i}`;
            // sloty wg @patrol (nazwy); skład dobierze się po tym samym indeksie wystąpienia
            patrolAssignments[key] = [];
            for (let occ = 0; occ < count; occ++) {
                patrolAssignments[key][occ] = selectedPatrols.length
                    ? [selectedPatrols[occ % selectedPatrols.length]]
                    : [];
            }

            const short = (row.OpisKrotki || row.OpisPom || text).substring(0, 90);
            html += `
            <div style="border:1px solid #334155; border-radius:12px; padding:14px; margin-bottom:14px;">
                <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(labelPrefix)}: ${escapeHtml(short)}</div>
                <div style="font-size:12px; color:#94a3b8; margin-bottom:12px;">${escapeHtml(text.substring(0, 160))}${text.length > 160 ? "…" : ""}</div>
            `;

            for (let occ = 0; occ < count; occ++) {
                globalOcc++;
                const rowId = `assign_${key}_${occ}`;
                html += `
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:10px;">
                    <div style="min-width:90px; font-weight:600; color:#e2e8f0;">${globalOcc}. @patrol</div>
                    <div class="card-grid" style="margin:0;" id="${rowId}">
                        ${selectedPatrols.map(pIdx => {
                            const name = getPatrolName(pIdx);
                            const active = (patrolAssignments[key][occ] || []).includes(pIdx) ? "active" : "";
                            return `<div class="line-pill ${active}" data-pidx="${pIdx}" onclick="togglePatrolOccurrence('${key}', ${occ}, ${pIdx}, event)">${escapeHtml(name)}</div>`;
                        }).join("")}
                    </div>
                </div>`;
            }

            html += `</div>`;
        });
    };

    addSource("zgl", selectedZgloszeniaIndexes, appState.zgloszenia?.rows, "Zgłoszenie");
    addSource("pol", selectedPoleceniaIndexes, appState.polecenia?.rows, "Polecenie");

    if (!html) html = "<p>Brak wystąpień @patrol.</p>";

    list.innerHTML = html;

    const countEl = document.getElementById("patrolAssignCount");
    if (countEl) {
        countEl.textContent = globalOcc > 0
            ? `Liczba znaczników @patrol do przypisania: ${globalOcc}`
            : "Brak znaczników @patrol w zaznaczeniu";
    }

    document.getElementById("patrolAssignModal").style.display = "flex";
    updatePatrolAssignPreview();
}

function togglePatrolOccurrence(key, occ, patrolIndex, evt) {
    if (!patrolAssignments[key]) patrolAssignments[key] = [];
    if (!Array.isArray(patrolAssignments[key][occ])) {
        patrolAssignments[key][occ] = [];
    }

    const shift = !!(evt && evt.shiftKey);
    const arr = patrolAssignments[key][occ];
    const pos = arr.indexOf(patrolIndex);

    if (shift) {
        if (pos > -1) arr.splice(pos, 1);
        else arr.push(patrolIndex);
    } else {
        if (pos > -1 && arr.length === 1) {
            patrolAssignments[key][occ] = [];
        } else {
            patrolAssignments[key][occ] = [patrolIndex];
        }
    }

    const container = document.getElementById(`assign_${key}_${occ}`);
    if (!container) return;

    const current = patrolAssignments[key][occ] || [];
    container.querySelectorAll(".line-pill").forEach(el => {
        const pIdx = Number(el.getAttribute("data-pidx"));
        if (current.includes(pIdx)) el.classList.add("active");
        else el.classList.remove("active");
    });
    updatePatrolAssignPreview();
}

function closePatrolAssignModal() {
    const m = document.getElementById("patrolAssignModal");
    if (m) m.style.display = "none";
}

function confirmPatrolAssignments() {
    for (const key of Object.keys(patrolAssignments)) {
        const list = patrolAssignments[key] || [];
        for (let occ = 0; occ < list.length; occ++) {
            if (!list[occ] || list[occ].length === 0) {
                showToast("Przy każdym @patrol wybierz przynajmniej jeden patrol");
                return;
            }
        }
    }

    patrolAssignments = JSON.parse(JSON.stringify(patrolAssignments));
    console.log("PRZYPISANIA @patrol:", patrolAssignments);

    closePatrolAssignModal();

    if (hasWybraniTag()) {
        const opened = openWybraniModal();
        if (!opened) {
            selectedWybrani = [];
            updateLiveEntry();
        }
        return;
    }

    updateLiveEntry();
    showToast("✅ Wpis wygenerowany");
}

// =====================================
// MODAL @wybrani
// =====================================

function ensureWybraniModal() {
    if (document.getElementById("wybraniModal")) return;
    const overlay = document.createElement("div");
    overlay.id = "wybraniModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
        <div class="modal" style="max-width:640px;">
            <h2>Wybierz osoby ze składu patrolu</h2>
            <p style="margin-bottom:15px; color:#94a3b8; font-size:14px;">
                Zaznacz osoby dla <strong>@wybrani</strong>.
            </p>
            <div id="wybraniList" class="card-grid" style="max-height:50vh; overflow:auto;"></div>
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmWybrani()">Zatwierdź i generuj</button>
                <button class="btn-primary" onclick="selectAllWybrani()">Zaznacz wszystkich</button>
                <button class="btn-danger" onclick="closeWybraniModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function openWybraniModal() {
    ensureWybraniModal();
    const people = getSkladFromSelectedPatrols();
    if (people.length === 0) {
        showToast("Brak osób w składzie zaznaczonych patroli");
        return false;
    }
    selectedWybrani = selectedWybrani.filter(p => people.includes(p));
    const list = document.getElementById("wybraniList");
    let html = "";
    people.forEach((name, i) => {
        const isSelected = selectedWybrani.includes(name) ? "selected" : "";
        html += `
        <div class="item-card ${isSelected}" onclick="toggleWybranaOsoba(${i})" data-name="${escapeAttr(name)}">
            ${escapeHtml(name)}
        </div>`;
    });
    list.innerHTML = html;
    document.getElementById("wybraniModal").style.display = "flex";
    return true;
}

function toggleWybranaOsoba(index) {
    const people = getSkladFromSelectedPatrols();
    const name = people[index];
    if (!name) return;
    const pos = selectedWybrani.indexOf(name);
    if (pos > -1) selectedWybrani.splice(pos, 1);
    else selectedWybrani.push(name);
    document.querySelectorAll("#wybraniList .item-card").forEach((card, i) => {
        if (selectedWybrani.includes(people[i])) card.classList.add("selected");
        else card.classList.remove("selected");
    });
}

function selectAllWybrani() {
    selectedWybrani = [...getSkladFromSelectedPatrols()];
    document.querySelectorAll("#wybraniList .item-card").forEach(card => card.classList.add("selected"));
}

function closeWybraniModal() {
    const modal = document.getElementById("wybraniModal");
    if (modal) modal.style.display = "none";
}

function confirmWybrani() {
    if (selectedWybrani.length === 0) {
        showToast("Wybierz przynajmniej jedną osobę");
        return;
    }
    closeWybraniModal();
    updateLiveEntry();
    showToast("✅ Wpis wygenerowany z wybranymi osobami");
}

// =====================================
// ROZBIJ PATROL – wpis na wybrane osoby
// =====================================

let _rozbij = {
    persons: [],       // zaznaczone osoby (stringi Stopień Nazwisko Imię)
    zglIndexes: [],
    polIndexes: [],
    zglLine: null,
    zglOpis: null,
    polLine: null,
    polOpis: null,
    zglSearch: "",
    polSearch: ""
};

function openRozbijPatrolModal() {
    if (!selectedPatrols.length) {
        if (typeof showToast === "function") showToast("Najpierw zaznacz patrol");
        else alert("Najpierw zaznacz patrol");
        return;
    }
    const people = getRozbijPeopleFromSelectedPatrols();
    if (!people.length) {
        if (typeof showToast === "function") showToast("Zaznaczony patrol nie ma osób (skład / WOT / policjant)");
        else alert("Zaznaczony patrol nie ma osób (skład / WOT / policjant)");
        return;
    }

    _rozbij.persons = [];
    _rozbij.zglIndexes = [...(selectedZgloszeniaIndexes || [])];
    _rozbij.polIndexes = [...(selectedPoleceniaIndexes || [])];
    _rozbij.zglLine = null;
    _rozbij.zglOpis = null;
    _rozbij.polLine = null;
    _rozbij.polOpis = null;
    _rozbij.zglSearch = "";
    _rozbij.polSearch = "";

    const old = document.getElementById("rozbijPatrolModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "rozbijPatrolModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:stretch; justify-content:center; padding:12px; z-index:10040;";
    overlay.innerHTML = `
        <div class="modal" style="width:min(1000px,96vw); height:min(90vh,880px); max-width:none; max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                <h2 style="margin:0;">👥 Rozbij patrol</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-success" onclick="confirmRozbijPatrol()">Wstaw do wpisu</button>
                    <button class="btn-danger" onclick="closeRozbijPatrolModal()">Zamknij</button>
                </div>
            </div>
            <p style="margin:0 0 12px 0; font-size:13px; color:var(--text-dim);">
                Wybierz <strong>osobę lub osoby</strong> (skład, WOT, policjant) z zaznaczonego patrolu oraz
                <strong>zgłoszenia / polecenia</strong>. Program wstawi stopień, nazwisko i imię
                zamiast danych całego patrolu (tagi @patrol, @sklad, @dowodca itd.).
            </p>

            <div style="flex:1; overflow:auto; min-height:0; display:flex; flex-direction:column; gap:14px;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                        <div style="font-weight:600;">Osoby (skład + WOT + policjant)</div>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="btn-primary" style="padding:4px 10px; font-size:12px;" onclick="rozbijSelectAllPersons(true)">Zaznacz wszystkich</button>
                            <button type="button" class="btn-primary" style="padding:4px 10px; font-size:12px;" onclick="rozbijSelectAllPersons(false)">Odznacz</button>
                        </div>
                    </div>
                    <div id="rozbijPersons" class="card-grid" style="gap:8px;"></div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                    <div>
                        <div style="font-weight:600; margin-bottom:6px;">Zgłoszenia</div>
                        <input type="text" id="rozbijZglSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:8px;"
                               oninput="_rozbij.zglSearch=this.value; renderRozbijZgl();">
                        <div id="rozbijZglLinie" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                        <div id="rozbijZglItems" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                        <div id="rozbijZglLevel3" class="card-grid" style="gap:6px;"></div>
                    </div>
                    <div>
                        <div style="font-weight:600; margin-bottom:6px;">Polecenia</div>
                        <input type="text" id="rozbijPolSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:8px;"
                               oninput="_rozbij.polSearch=this.value; renderRozbijPol();">
                        <div id="rozbijPolLinie" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                        <div id="rozbijPolItems" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                        <div id="rozbijPolLevel3" class="card-grid" style="gap:6px;"></div>
                    </div>
                </div>

                <div>
                    <div style="font-weight:600; margin-bottom:6px;">Podgląd</div>
                    <div id="rozbijPreview" style="background:var(--bg-input); border:1px solid var(--border); border-radius:10px; padding:12px; min-height:80px; max-height:180px; overflow:auto; font-size:14px; line-height:1.5; white-space:pre-wrap; color:var(--text-soft);"></div>
                </div>
            </div>

            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px; border-top:1px solid var(--border); padding-top:12px; flex-wrap:wrap;">
                <button class="btn-success" onclick="confirmRozbijPatrol()">Wstaw do wpisu</button>
                <button class="btn-danger" onclick="closeRozbijPatrolModal()">Zamknij</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    renderRozbijPersons();
    renderRozbijZgl();
    renderRozbijPol();
    updateRozbijPreview();
}

function closeRozbijPatrolModal() {
    const m = document.getElementById("rozbijPatrolModal");
    if (m) m.remove();
}

function renderRozbijPersons() {
    const el = document.getElementById("rozbijPersons");
    if (!el) return;
    const people = getRozbijPeopleFromSelectedPatrols();
    el.innerHTML = people.map((name, i) => {
        const sel = _rozbij.persons.includes(name) ? "selected" : "";
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="toggleRozbijPerson(${i})">${escapeHtml(name)}</div>`;
    }).join("") || `<span style="color:var(--text-dim);">Brak osób</span>`;
}

function toggleRozbijPerson(index) {
    const people = getRozbijPeopleFromSelectedPatrols();
    const name = people[index];
    if (!name) return;
    const pos = _rozbij.persons.indexOf(name);
    if (pos > -1) _rozbij.persons.splice(pos, 1);
    else _rozbij.persons.push(name);
    renderRozbijPersons();
    updateRozbijPreview();
}

function rozbijSelectAllPersons(on) {
    _rozbij.persons = on ? [...getRozbijPeopleFromSelectedPatrols()] : [];
    renderRozbijPersons();
    updateRozbijPreview();
}

function _rozbijRowMatch(row, search) {
    if (!search) return true;
    const t = `${row.Linia || ""} ${row.OpisKrotki || ""} ${row.OpisPom || ""} ${row.Opis || ""} ${row.Nazwa || ""}`.toLowerCase();
    return t.includes(String(search).toLowerCase().trim());
}

function _rozbijEsc(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderRozbijZgl() {
    const linieEl = document.getElementById("rozbijZglLinie");
    const itemsEl = document.getElementById("rozbijZglItems");
    const lvl3El = document.getElementById("rozbijZglLevel3");
    if (!linieEl || !itemsEl || !lvl3El) return;

    const allRows = (appState.zgloszenia?.rows || []).map((r, i) => ({ ...r, _index: i }));
    let rows = _rozbij.zglSearch ? allRows.filter(r => _rozbijRowMatch(r, _rozbij.zglSearch)) : allRows;
    const lines = [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl"));

    linieEl.innerHTML = lines.map(line => {
        const hasSel = _rozbij.zglIndexes.some(i => {
            const r = appState.zgloszenia?.rows?.[i];
            return r && (r.Linia || "(brak)") === line;
        });
        let cls = "line-pill";
        if (_rozbij.zglLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="rozbijSelectZglLine('${_rozbijEsc(line)}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:var(--text-dim);font-size:12px;'>Brak</span>";

    if (!_rozbij.zglLine && !_rozbij.zglSearch) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        return;
    }
    let filtered = rows;
    if (_rozbij.zglLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === _rozbij.zglLine);

    const krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl"));
    itemsEl.innerHTML = krotkie.map(k => {
        const hasSel = _rozbij.zglIndexes.some(i => {
            const r = appState.zgloszenia?.rows?.[i];
            return r && (r.OpisKrotki || "(bez opisu)") === k && (r.Linia || "(brak)") === (_rozbij.zglLine || r.Linia || "(brak)");
        });
        let cls = "item-card";
        if (_rozbij.zglOpis === k) cls += " selected";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="rozbijSelectZglOpis('${_rozbijEsc(k)}')">${escapeHtml(k)}</div>`;
    }).join("");

    if (!_rozbij.zglOpis) {
        lvl3El.innerHTML = "";
        return;
    }
    const level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === _rozbij.zglOpis);
    lvl3El.innerHTML = level3.map(r => {
        const sel = _rozbij.zglIndexes.includes(r._index) ? "selected" : "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 100);
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="rozbijToggleZgl(${r._index})">${escapeHtml(label)}</div>`;
    }).join("");
}

function renderRozbijPol() {
    const linieEl = document.getElementById("rozbijPolLinie");
    const itemsEl = document.getElementById("rozbijPolItems");
    const lvl3El = document.getElementById("rozbijPolLevel3");
    if (!linieEl || !itemsEl || !lvl3El) return;

    const allRows = (appState.polecenia?.rows || []).map((r, i) => ({ ...r, _index: i }));
    let rows = _rozbij.polSearch ? allRows.filter(r => _rozbijRowMatch(r, _rozbij.polSearch)) : allRows;
    const lines = [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl"));

    linieEl.innerHTML = lines.map(line => {
        const hasSel = _rozbij.polIndexes.some(i => {
            const r = appState.polecenia?.rows?.[i];
            return r && (r.Linia || "(brak)") === line;
        });
        let cls = "line-pill";
        if (_rozbij.polLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="rozbijSelectPolLine('${_rozbijEsc(line)}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:var(--text-dim);font-size:12px;'>Brak</span>";

    if (!_rozbij.polLine && !_rozbij.polSearch) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        return;
    }
    let filtered = rows;
    if (_rozbij.polLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === _rozbij.polLine);

    const krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl"));
    itemsEl.innerHTML = krotkie.map(k => {
        const hasSel = _rozbij.polIndexes.some(i => {
            const r = appState.polecenia?.rows?.[i];
            return r && (r.OpisKrotki || "(bez opisu)") === k;
        });
        let cls = "item-card";
        if (_rozbij.polOpis === k) cls += " selected";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="rozbijSelectPolOpis('${_rozbijEsc(k)}')">${escapeHtml(k)}</div>`;
    }).join("");

    if (!_rozbij.polOpis) {
        lvl3El.innerHTML = "";
        return;
    }
    const level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === _rozbij.polOpis);
    lvl3El.innerHTML = level3.map(r => {
        const sel = _rozbij.polIndexes.includes(r._index) ? "selected" : "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 100);
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="rozbijTogglePol(${r._index})">${escapeHtml(label)}</div>`;
    }).join("");
}

function rozbijSelectZglLine(line) {
    _rozbij.zglLine = (_rozbij.zglLine === line) ? null : line;
    _rozbij.zglOpis = null;
    renderRozbijZgl();
}
function rozbijSelectZglOpis(k) {
    _rozbij.zglOpis = (_rozbij.zglOpis === k) ? null : k;
    renderRozbijZgl();
}
function rozbijToggleZgl(i) {
    const pos = _rozbij.zglIndexes.indexOf(i);
    if (pos > -1) _rozbij.zglIndexes.splice(pos, 1);
    else _rozbij.zglIndexes.push(i);
    renderRozbijZgl();
    updateRozbijPreview();
}
function rozbijSelectPolLine(line) {
    _rozbij.polLine = (_rozbij.polLine === line) ? null : line;
    _rozbij.polOpis = null;
    renderRozbijPol();
}
function rozbijSelectPolOpis(k) {
    _rozbij.polOpis = (_rozbij.polOpis === k) ? null : k;
    renderRozbijPol();
}
function rozbijTogglePol(i) {
    const pos = _rozbij.polIndexes.indexOf(i);
    if (pos > -1) _rozbij.polIndexes.splice(pos, 1);
    else _rozbij.polIndexes.push(i);
    renderRozbijPol();
    updateRozbijPreview();
}

/** Zamiana tagów na dane WYBRANYCH OSÓB (nie całego patrolu) */
function buildReplacementsForPersons(personNames) {
    const names = typeof uniqueNonEmpty === "function"
        ? uniqueNonEmpty(personNames)
        : [...new Set((personNames || []).filter(Boolean))];
    const line = typeof forceOneLine === "function" ? forceOneLine(names) : names.join(", ");
    const kz = document.getElementById("kzInput")?.value || appState.kz || "";
    const mkk = document.getElementById("mkkInput")?.value || appState.mkk || "";
    const now = new Date();
    const data = now.toLocaleDateString("pl-PL");
    const godzina = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    return {
        "@patrol": line,
        "@dowodca": line,
        "@kierowca": line,
        "@sklad": line,
        "@wszyscy": line,
        "@wybrani": line,
        "@data": data,
        "@godzina": godzina,
        "@KZ": kz,
        "@MKK": mkk,
        "@wot": "",
        "@policjant": ""
    };
}

function buildRozbijPlainText() {
    if (!_rozbij.persons.length) return "";
    const rep = buildReplacementsForPersons(_rozbij.persons);
    const parts = [];
    _rozbij.zglIndexes.forEach(i => {
        const t = appState.zgloszenia?.rows?.[i]?.Opis;
        if (t) parts.push(typeof applyTags === "function" ? applyTags(t, rep) : String(t));
    });
    _rozbij.polIndexes.forEach(i => {
        const t = appState.polecenia?.rows?.[i]?.Opis;
        if (t) parts.push(typeof applyTags === "function" ? applyTags(t, rep) : String(t));
    });
    return parts.filter(Boolean).map(p => String(p).trim()).filter(Boolean).join("\n\n");
}

function updateRozbijPreview() {
    const box = document.getElementById("rozbijPreview");
    if (!box) return;
    if (!_rozbij.persons.length) {
        box.textContent = "Zaznacz przynajmniej jedną osobę…";
        return;
    }
    if (!_rozbij.zglIndexes.length && !_rozbij.polIndexes.length) {
        box.textContent = "Zaznacz zgłoszenie lub polecenie…\n\nOsoby: " + _rozbij.persons.join(", ");
        return;
    }
    const text = buildRozbijPlainText();
    box.textContent = (typeof capitalizeSentences === "function" ? capitalizeSentences(text) : text) || "—";
}

function confirmRozbijPatrol() {
    if (!_rozbij.persons.length) {
        if (typeof showToast === "function") showToast("Zaznacz przynajmniej jedną osobę");
        else alert("Zaznacz przynajmniej jedną osobę");
        return;
    }
    if (!_rozbij.zglIndexes.length && !_rozbij.polIndexes.length) {
        if (typeof showToast === "function") showToast("Zaznacz zgłoszenie lub polecenie");
        else alert("Zaznacz zgłoszenie lub polecenie");
        return;
    }

    let text = buildRozbijPlainText();
    if (typeof capitalizeSentences === "function") text = capitalizeSentences(text);

    // Wstaw do pola wygenerowanego wpisu (jak po „Generuj wpis”)
    if (typeof plainTextToHtml === "function" && typeof setGeneratedEntryContent === "function") {
        const items = text.split(/\n\n+/).filter(Boolean);
        const withBullets = items.map(p => "• " + p.replace(/^•\s*/, "")).join("\n");
        setGeneratedEntryContent(plainTextToHtml(withBullets));
    } else {
        const el = document.getElementById("generatedEntry");
        if (el) {
            if (el.getAttribute("contenteditable") === "true") el.innerText = text;
            else el.value = text;
        }
    }

    closeRozbijPatrolModal();
    if (typeof showToast === "function") {
        showToast("✅ Wpis na osoby: " + _rozbij.persons.join(", "));
    }
}

// =====================================
// PRZYCISKI
// =====================================

function generateEntry() {
    if (needsPatrolAssignmentModal()) {
        openPatrolAssignModal();
        return;
    }

    patrolAssignments = {};

    if (hasWybraniTag()) {
        const opened = openWybraniModal();
        if (!opened) {
            selectedWybrani = [];
            updateLiveEntry();
        }
        return;
    }

    selectedWybrani = [];
    updateLiveEntry();
}

function copyEntry() {
    const plain = getGeneratedEntryPlain();
    if (!plain) {
        showToast("Najpierw wygeneruj wpis");
        return;
    }
    navigator.clipboard.writeText(plain).then(() => {
        showToast("✅ Skopiowano do schowka");
    }).catch(() => showToast("Nie udało się skopiować"));
}

function clearEntry() {
    setGeneratedEntryContent("");

    const banner = document.getElementById("wybraniHintBanner");
    if (banner) banner.style.display = "none";

    selectedPatrols = [];
    selectedZgloszeniaIndexes = [];
    selectedPoleceniaIndexes = [];
    selectedZgloszeniaLine = null;
    selectedPoleceniaLine = null;
    selectedZgloszeniaOpisKrotki = null;
    selectedPoleceniaOpisKrotki = null;
    selectedWybrani = [];
    uwagiWybrane = "NIE";
    selectedUwagiTyp = null;
    patrolAssignments = {};

    const zSearch = document.getElementById("zglSearch");
    const pSearch = document.getElementById("polSearch");
    if (zSearch) zSearch.value = "";
    if (pSearch) pSearch.value = "";

    renderPatroleCards();
    renderZgloszeniaLines();
    renderPoleceniaLines();
    renderUwagiCards();
    updateLiveEntry();
    showToast("Odznaczono wszystko");
}

function showToast(message) {
    const old = document.getElementById("toastMsg");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.id = "toastMsg";
    toast.innerText = message;
    toast.style.cssText = `
        position: fixed; bottom: 30px; right: 30px;
        background: #16a34a; color: white;
        padding: 14px 22px; border-radius: 10px;
        font-size: 15px; font-weight: 600; z-index: 9999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        opacity: 0; transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "1"; }, 10);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// =====================================
// EXPOSE
// =====================================
window.generateEntry = generateEntry;
window.copyEntry = copyEntry;
window.clearEntry = clearEntry;
window.togglePatrol = togglePatrol;
window.selectZgloszeniaLine = selectZgloszeniaLine;
window.selectZgloszeniaOpisKrotki = selectZgloszeniaOpisKrotki;
window.toggleZgloszenie = toggleZgloszenie;
window.selectPoleceniaLine = selectPoleceniaLine;
window.selectPoleceniaOpisKrotki = selectPoleceniaOpisKrotki;
window.togglePolecenie = togglePolecenie;
window.updateLiveEntry = updateLiveEntry;
window.filterGeneratorTiles = filterGeneratorTiles;
window.showToast = showToast;
window.initGenerator = initGenerator;
window.toggleWybranaOsoba = toggleWybranaOsoba;
window.selectAllWybrani = selectAllWybrani;
window.confirmWybrani = confirmWybrani;
window.closeWybraniModal = closeWybraniModal;

window.setUwagi = setUwagi;
window.wybierzTypUwagi = wybierzTypUwagi;
window.openUwagiSzablonyModal = openUwagiSzablonyModal;
window.closeUwagiSzablonyModal = closeUwagiSzablonyModal;
window.saveUwagiSzablony = saveUwagiSzablony;
window.wstawUwagi = wstawUwagi;
window.closeUwagiModal = closeUwagiModal;
window.toggleWybranaOsobaUwagi = toggleWybranaOsobaUwagi;
window.selectAllWybraniUwagi = selectAllWybraniUwagi;
window.confirmWybraniUwagi = confirmWybraniUwagi;

window.openLogSprawdzenModal = openLogSprawdzenModal;
window.closeLogSprawdzenModal = closeLogSprawdzenModal;
window.confirmLogSprawdzen = confirmLogSprawdzen;

window.togglePatrolOccurrence = togglePatrolOccurrence;
window.confirmPatrolAssignments = confirmPatrolAssignments;
window.closePatrolAssignModal = closePatrolAssignModal;
window.onSprawdGodzOdChange = onSprawdGodzOdChange;
window.onSequentialCheckboxChange = onSequentialCheckboxChange;
window.toggleSequentialPatrolMode = toggleSequentialPatrolMode;
window.updateSequentialPatrolPill = updateSequentialPatrolPill;
window.updatePatrolAssignPreview = updatePatrolAssignPreview;

window.openRozbijPatrolModal = openRozbijPatrolModal;
window.closeRozbijPatrolModal = closeRozbijPatrolModal;
window.toggleRozbijPerson = toggleRozbijPerson;
window.rozbijSelectAllPersons = rozbijSelectAllPersons;
window.rozbijSelectZglLine = rozbijSelectZglLine;
window.rozbijSelectZglOpis = rozbijSelectZglOpis;
window.rozbijToggleZgl = rozbijToggleZgl;
window.rozbijSelectPolLine = rozbijSelectPolLine;
window.rozbijSelectPolOpis = rozbijSelectPolOpis;
window.rozbijTogglePol = rozbijTogglePol;
window.confirmRozbijPatrol = confirmRozbijPatrol;
window.renderRozbijZgl = renderRozbijZgl;
window.renderRozbijPol = renderRozbijPol;
