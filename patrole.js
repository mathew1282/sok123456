// =====================================
// PATROLE
// =====================================

let selectedPatrolMembers = []; // indeksy w appState.dane.rows
let patrolePickOpen = false;

const PATROL_RANK_COLS = [
    { title: "Komendant", match: ["komendant"] },
    { title: "Dyżurny zmiany", match: ["dyzurn"] },
    { title: "Starszy przodownik", match: ["starszy przod"] },
    { title: "Przodownik", match: ["przodownik"] },
    { title: "Starszy strażnik", match: ["starszy straz"] },
    { title: "Strażnik", match: ["straznik"] }
];

function initPatrole() {
    selectedPatrolMembers = [];
    patrolePickOpen = false;
    renderPatrole();
}

function ensureDaneState() {
    if (!appState.dane || typeof appState.dane !== "object") {
        appState.dane = { columns: ["Stopień", "Nazwisko", "Imię", "Nr PLK"], rows: [] };
    }
    if (!Array.isArray(appState.dane.rows)) appState.dane.rows = [];
    if (!Array.isArray(appState.dane.columns)) appState.dane.columns = ["Stopień", "Nazwisko", "Imię", "Nr PLK"];
    if (!Array.isArray(appState.patrole)) appState.patrole = [];
    if (!Array.isArray(appState.dane.zmiany)) appState.dane.zmiany = [];
}

function getPersonName(osoba) {
    if (typeof getDanePersonLabel === "function") {
        const lab = getDanePersonLabel(osoba);
        if (lab) return lab;
    }
    return `${osoba["Stopień"] || ""} ${osoba["Nazwisko"] || ""} ${osoba["Imię"] || ""}`.trim() || "(bez nazwy)";
}

/** W kolumnach rankingu – tylko nazwisko + imię (stopień jest w nagłówku) */
function getPersonShortName(osoba) {
    if (!osoba) return "(bez nazwy)";
    let nazwisko = osoba["Nazwisko"] || "";
    let imie = osoba["Imię"] || "";
    if (typeof daneGetField === "function") {
        if (!nazwisko) nazwisko = daneGetField(osoba, "nazwisko") || "";
        if (!imie) imie = daneGetField(osoba, "imie") || "";
    }
    const s = `${nazwisko} ${imie}`.trim();
    return s || getPersonName(osoba) || "(bez nazwy)";
}

function getPersonNazwisko(osoba) {
    if (!osoba) return "";
    if (osoba["Nazwisko"]) return String(osoba["Nazwisko"]);
    if (typeof daneGetField === "function") return daneGetField(osoba, "nazwisko") || "";
    return "";
}

function patrolNormalizeRank(s) {
    return String(s || "").toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ł/g, "l").replace(/ą/g, "a").replace(/ę/g, "e")
        .replace(/ó/g, "o").replace(/ż/g, "z").replace(/ź/g, "z")
        .replace(/ć/g, "c").replace(/ń/g, "n").replace(/ś/g, "s");
}

function getPersonStopien(osoba) {
    if (!osoba) return "";
    if (osoba["Stopień"]) return String(osoba["Stopień"]);
    if (typeof daneGetField === "function") return daneGetField(osoba, "stopien") || "";
    const cols = appState.dane?.columns || [];
    for (const c of cols) {
        if (patrolNormalizeRank(c).indexOf("stopien") >= 0 || patrolNormalizeRank(c).indexOf("stopn") >= 0) {
            return String(osoba[c] || "");
        }
    }
    return "";
}

/** Przypisz osobę do jednej z 6 kolumn stopnia (pierwsze dopasowanie od najbardziej szczegółowego) */
function getPatrolRankColumnIndex(osoba) {
    const st = patrolNormalizeRank(getPersonStopien(osoba));
    for (let i = 0; i < PATROL_RANK_COLS.length; i++) {
        const m = PATROL_RANK_COLS[i].match;
        if (m.some(k => st.indexOf(k) >= 0)) return i;
    }
    // bez rozpoznanego stopnia → Strażnik (ostatnia)
    return PATROL_RANK_COLS.length - 1;
}

function groupPeopleByRank() {
    const groups = PATROL_RANK_COLS.map(() => []);
    const rows = appState.dane.rows || [];
    rows.forEach((osoba, index) => {
        const gi = getPatrolRankColumnIndex(osoba);
        groups[gi].push({
            index,
            osoba,
            label: getPersonName(osoba),
            short: getPersonShortName(osoba)
        });
    });
    groups.forEach(g => g.sort((a, b) => {
        const na = getPersonNazwisko(a.osoba) || a.short || a.label || "";
        const nb = getPersonNazwisko(b.osoba) || b.short || b.label || "";
        const c = na.localeCompare(nb, "pl", { sensitivity: "base" });
        if (c !== 0) return c;
        return (a.short || a.label || "").localeCompare(b.short || b.label || "", "pl");
    }));
    return groups;
}

// =====================================
// RENDER
// =====================================

function renderPatrole() {
    const container = document.getElementById("patroleContainer");
    if (!container) return;

    ensureDaneState();

    // zachowaj wartości pól przy przerysowaniu
    const prev = {
        nazwa: document.getElementById("patrolName")?.value || "",
        dowodca: document.getElementById("dowodcaSelect")?.value || "",
        kierowca: document.getElementById("kierowcaSelect")?.value || "",
        wot1: document.getElementById("wot1Input")?.value || "",
        wot2: document.getElementById("wot2Input")?.value || "",
        policjant1: document.getElementById("policjant1Input")?.value || "",
        policjant2: document.getElementById("policjant2Input")?.value || "",
        zmiana: document.getElementById("patrolZmianaSelect")?.value || ""
    };

    const zmiany = appState.dane.zmiany || [];
    const selectedLabels = selectedPatrolMembers
        .map(i => appState.dane.rows[i] ? getPersonName(appState.dane.rows[i]) : "")
        .filter(Boolean);

    let html = `
    <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
            <div>
                <h2 style="margin:0 0 4px 0;">🚔 Patrole</h2>
                <div style="font-size:13px;color:var(--text-dim);">Wybierz ludzi (kolumny wg stopnia) albo wczytaj całą <strong>zmianę</strong>.</div>
            </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px;">
            <div style="flex:1;min-width:200px;">
                <label>Wczytaj zmianę</label>
                <select id="patrolZmianaSelect" style="width:100%;" onchange="loadPatrolFromZmiana(this.value)">
                    <option value="">-- wybierz zmianę --</option>
                    ${zmiany.map((z, zi) => {
                        const n = (z.osoby || []).length;
                        const lab = "Zmiana " + (zi + 1) + ": " + (z.dyzurny || "?") + " (+" + n + ")";
                        return `<option value="${zi}" ${String(prev.zmiana) === String(zi) ? "selected" : ""}>${escapeHtml(lab)}</option>`;
                    }).join("")}
                </select>
            </div>
            <button type="button" class="btn-primary" onclick="togglePatrolPeoplePicker()">
                ${patrolePickOpen ? "▲ Ukryj wybór ludzi" : "👥 Wybierz ludzi"}
            </button>
            ${selectedPatrolMembers.length ? `<button type="button" class="btn-danger" style="padding:8px 12px;" onclick="clearPatrolPeopleSelection()">Wyczyść skład</button>` : ""}
        </div>

        <div id="patrolPeoplePicker" style="display:${patrolePickOpen ? "block" : "none"};margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg);">
            ${renderPatrolRankColumns()}
        </div>

        <div style="margin-bottom:16px;">
            <div style="font-weight:600;margin-bottom:8px;">Wybrany skład (${selectedLabels.length})</div>
            ${selectedLabels.length
                ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${selectedLabels.map(l =>
                    `<span class="line-pill" style="cursor:default;padding:6px 12px;font-size:13px;">${escapeHtml(l)}</span>`
                  ).join("")}</div>`
                : `<div class="empty-state" style="padding:16px;"><strong>Brak osób</strong>Wczytaj zmianę lub kliknij „Wybierz ludzi”.</div>`}
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:flex-end; margin-bottom:15px;">
            <div style="flex:1; min-width:180px;">
                <label>Nazwa patrolu</label>
                <input type="text" id="patrolName" value="${escapeHtml(prev.nazwa).replace(/"/g, "&quot;")}">
            </div>
            <div style="flex:1; min-width:180px;">
                <label>Dowódca</label>
                <select id="dowodcaSelect"><option value="">-- brak --</option></select>
            </div>
            <div style="flex:1; min-width:180px;">
                <label>Kierowca</label>
                <select id="kierowcaSelect"><option value="">-- brak --</option></select>
            </div>
        </div>

        <div style="margin-bottom:16px; border:1px solid var(--border); border-radius:10px; overflow:hidden;">
            <button type="button" id="patroleWotToggleBtn"
                    onclick="togglePatroleWotSection()"
                    style="width:100%; display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 14px; background:var(--bg-input); border:none; color:var(--text-soft); cursor:pointer; font-size:14px; font-weight:600; text-align:left;">
                <span>WOT / Policjant</span>
                <span id="patroleWotToggleIcon" style="font-size:12px; color:var(--text-dim);">▼</span>
            </button>
            <div id="patroleWotSection" style="padding:12px 14px 14px 14px; border-top:1px solid var(--border);">
                <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:flex-end; margin-bottom:15px;">
                    <div style="flex:1; min-width:180px;">
                        <label>WOT 1</label>
                        <input type="text" id="wot1Input" placeholder="Imię i nazwisko" value="${escapeHtml(prev.wot1).replace(/"/g, "&quot;")}">
                    </div>
                    <div style="flex:1; min-width:180px;">
                        <label>WOT 2</label>
                        <input type="text" id="wot2Input" placeholder="Imię i nazwisko" value="${escapeHtml(prev.wot2).replace(/"/g, "&quot;")}">
                    </div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:flex-end;">
                    <div style="flex:1; min-width:180px;">
                        <label>Policjant 1</label>
                        <input type="text" id="policjant1Input" placeholder="Imię i nazwisko" value="${escapeHtml(prev.policjant1).replace(/"/g, "&quot;")}">
                    </div>
                    <div style="flex:1; min-width:180px;">
                        <label>Policjant 2</label>
                        <input type="text" id="policjant2Input" placeholder="Imię i nazwisko" value="${escapeHtml(prev.policjant2).replace(/"/g, "&quot;")}">
                    </div>
                </div>
            </div>
        </div>

        <button type="button" class="btn-success" onclick="createPatrol()">Stwórz patrol</button>
    </div>

    <div class="card">
        <h2 style="margin:0 0 12px 0;">Lista patroli</h2>
        <table class="data-table-opis">
            <thead>
                <tr>
                    <th class="col-meta">Nazwa</th>
                    <th class="col-meta">Skład</th>
                    <th class="col-meta">Dowódca</th>
                    <th class="col-meta">Kierowca</th>
                    <th class="col-meta">WOT</th>
                    <th class="col-meta">Policjant</th>
                    <th class="col-meta">Akcje</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (!(appState.patrole || []).length) {
        html += `<tr><td colspan="7"><div class="empty-state"><strong>Brak patroli</strong>Utwórz patrol powyżej.</div></td></tr>`;
    } else {
        appState.patrole.forEach((patrol, index) => {
            const wot = [patrol.wot1, patrol.wot2].filter(Boolean).join("<br>") || "—";
            const pol = [patrol.policjant1, patrol.policjant2].filter(Boolean).join("<br>") || "—";
            html += `
            <tr>
                <td class="col-meta">${escapeHtml(patrol.nazwa || "")}</td>
                <td class="col-meta">${(patrol.sklad || []).map(s => escapeHtml(s)).join("<br>") || "—"}</td>
                <td class="col-meta">${escapeHtml(patrol.dowodca || "") || "—"}</td>
                <td class="col-meta">${escapeHtml(patrol.kierowca || "") || "—"}</td>
                <td class="col-meta">${wot}</td>
                <td class="col-meta">${pol}</td>
                <td class="col-meta" style="white-space:nowrap;">
                    <button type="button" class="btn-primary" onclick="editPatrol(${index})">Edytuj</button>
                    <button type="button" class="btn-danger" onclick="removePatrol(${index})">Usuń</button>
                </td>
            </tr>`;
        });
    }

    html += `
            </tbody>
        </table>
    </div>`;

    container.innerHTML = html;
    updatePatrolLists(prev.dowodca, prev.kierowca);
    applyPatroleWotSection();
}

function renderPatrolRankColumns() {
    const groups = groupPeopleByRank();
    let html = `<div style="display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;overflow-x:auto;">`;
    PATROL_RANK_COLS.forEach((col, ci) => {
        const list = groups[ci] || [];
        html += `
        <div style="min-width:120px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:8px;">
            <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:var(--text);text-align:center;">${escapeHtml(col.title)}</div>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;">
                ${list.length ? list.map(p => {
                    const on = selectedPatrolMembers.includes(p.index);
                    return `<div class="item-card ${on ? "selected" : ""}" style="min-height:0;padding:8px 6px;font-size:12px;"
                        onclick="togglePatrolPerson(${p.index})">${escapeHtml(p.short || p.label)}</div>`;
                }).join("") : `<div style="font-size:11px;color:var(--text-dim);text-align:center;padding:8px;">—</div>`}
            </div>
        </div>`;
    });
    html += `</div>
    <p style="font-size:12px;color:var(--text-dim);margin:10px 0 0 0;">Kliknij kafelkę, aby dodać / usunąć osobę ze składu patrolu.</p>`;
    return html;
}

function togglePatrolPeoplePicker() {
    patrolePickOpen = !patrolePickOpen;
    renderPatrole();
}

function clearPatrolPeopleSelection() {
    selectedPatrolMembers = [];
    const sel = document.getElementById("patrolZmianaSelect");
    if (sel) sel.value = "";
    renderPatrole();
}

/** Wczytaj całą zmianę (dyżurny + skład) do patrolu – można potem ręcznie zmieniać */
function loadPatrolFromZmiana(value) {
    ensureDaneState();
    if (value === "" || value == null) return;
    const zi = parseInt(value, 10);
    const z = (appState.dane.zmiany || [])[zi];
    if (!z) return;

    const labels = new Set();
    if (z.dyzurny) labels.add(String(z.dyzurny).trim());
    (z.osoby || []).forEach(o => { if (o) labels.add(String(o).trim()); });

    const rows = appState.dane.rows || [];
    const indices = [];
    rows.forEach((row, i) => {
        const lab = getPersonName(row);
        if (labels.has(lab)) indices.push(i);
    });

    // scal z już wybranymi (można dodać ludzi z kolumn)
    const set = new Set(selectedPatrolMembers);
    indices.forEach(i => set.add(i));
    selectedPatrolMembers = [...set];

    patrolePickOpen = true;
    renderPatrole();
    if (typeof showToast === "function") {
        showToast("Wczytano zmianę (" + indices.length + " os.) – możesz dodać / usunąć z kolumn");
    }
}

const PATROLE_WOT_COLLAPSED_KEY = "sok-patrole-wot-collapsed";

function isPatroleWotCollapsed() {
    try {
        return localStorage.getItem(PATROLE_WOT_COLLAPSED_KEY) === "1";
    } catch (e) {
        return false;
    }
}

function applyPatroleWotSection() {
    const section = document.getElementById("patroleWotSection");
    const icon = document.getElementById("patroleWotToggleIcon");
    if (!section) return;
    const collapsed = isPatroleWotCollapsed();
    section.style.display = collapsed ? "none" : "block";
    if (icon) icon.textContent = collapsed ? "▶" : "▼";
}

function togglePatroleWotSection() {
    const next = !isPatroleWotCollapsed();
    try {
        localStorage.setItem(PATROLE_WOT_COLLAPSED_KEY, next ? "1" : "0");
    } catch (e) { /* ignore */ }
    applyPatroleWotSection();
}

function togglePatrolPerson(index) {
    const pos = selectedPatrolMembers.indexOf(index);
    if (pos > -1) {
        selectedPatrolMembers.splice(pos, 1);
    } else {
        selectedPatrolMembers.push(index);
    }
    renderPatrole();
}

function updatePatrolLists(keepDowodca, keepKierowca) {
    const dowodca = document.getElementById("dowodcaSelect");
    const kierowca = document.getElementById("kierowcaSelect");
    if (!dowodca || !kierowca) return;

    let options = `<option value="">-- brak --</option>`;
    selectedPatrolMembers.forEach(index => {
        const osoba = appState.dane.rows[index];
        if (!osoba) return;
        const nazwa = getPersonName(osoba);
        options += `<option value="${escapeHtml(nazwa).replace(/"/g, "&quot;")}">${escapeHtml(nazwa)}</option>`;
    });

    const dVal = keepDowodca || "";
    const kVal = keepKierowca || "";
    dowodca.innerHTML = options;
    kierowca.innerHTML = options;
    if (dVal) dowodca.value = dVal;
    if (kVal) kierowca.value = kVal;
}

async function createPatrol() {
    const nazwa = (document.getElementById("patrolName")?.value || "").trim();
    if (!nazwa) {
        alert("Podaj nazwę patrolu");
        return;
    }
    if (!selectedPatrolMembers.length) {
        alert("Wybierz przynajmniej jedną osobę do składu");
        return;
    }

    const sklad = selectedPatrolMembers.map(index => getPersonName(appState.dane.rows[index])).filter(Boolean);
    const dowodca = document.getElementById("dowodcaSelect")?.value || "";
    const kierowca = document.getElementById("kierowcaSelect")?.value || "";
    const wot1 = document.getElementById("wot1Input")?.value.trim() || "";
    const wot2 = document.getElementById("wot2Input")?.value.trim() || "";
    const policjant1 = document.getElementById("policjant1Input")?.value.trim() || "";
    const policjant2 = document.getElementById("policjant2Input")?.value.trim() || "";

    appState.patrole.push({
        nazwa,
        sklad,
        dowodca,
        kierowca,
        wot1,
        wot2,
        policjant1,
        policjant2
    });

    await saveState();
    selectedPatrolMembers = [];
    patrolePickOpen = false;
    renderPatrole();
    if (typeof showToast === "function") showToast("✅ Utworzono patrol");
}

async function editPatrol(index) {
    const patrol = appState.patrole[index];

    const nowaNazwa = prompt("Nazwa patrolu", patrol.nazwa);
    if (nowaNazwa === null) return;

    const nowyDowodca = prompt("Dowódca", patrol.dowodca || "");
    if (nowyDowodca === null) return;

    const nowyKierowca = prompt("Kierowca", patrol.kierowca || "");
    if (nowyKierowca === null) return;

    const nowyWot1 = prompt("WOT 1", patrol.wot1 || "");
    if (nowyWot1 === null) return;

    const nowyWot2 = prompt("WOT 2", patrol.wot2 || "");
    if (nowyWot2 === null) return;

    const nowyPolicjant1 = prompt("Policjant 1", patrol.policjant1 || "");
    if (nowyPolicjant1 === null) return;

    const nowyPolicjant2 = prompt("Policjant 2", patrol.policjant2 || "");
    if (nowyPolicjant2 === null) return;

    patrol.nazwa = nowaNazwa;
    patrol.dowodca = nowyDowodca;
    patrol.kierowca = nowyKierowca;
    patrol.wot1 = nowyWot1;
    patrol.wot2 = nowyWot2;
    patrol.policjant1 = nowyPolicjant1;
    patrol.policjant2 = nowyPolicjant2;

    await saveState();
    renderPatrole();
}

async function removePatrol(index) {
    if (!confirm("Usunąć patrol?")) return;
    appState.patrole.splice(index, 1);
    await saveState();
    renderPatrole();
}

// escapeHtml fallback
if (typeof escapeHtml !== "function") {
    window.escapeHtml = function (str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    };
}

// =====================================
// EXPOSE
// =====================================
window.initPatrole = initPatrole;
window.renderPatrole = renderPatrole;
window.togglePatrolPerson = togglePatrolPerson;
window.createPatrol = createPatrol;
window.editPatrol = editPatrol;
window.removePatrol = removePatrol;
window.togglePatroleWotSection = togglePatroleWotSection;
window.applyPatroleWotSection = applyPatroleWotSection;
window.togglePatrolPeoplePicker = togglePatrolPeoplePicker;
window.clearPatrolPeopleSelection = clearPatrolPeopleSelection;
window.loadPatrolFromZmiana = loadPatrolFromZmiana;
