// =====================================
// PATROLE
// =====================================

let selectedPatrolMembers = [];

function initPatrole() {
    selectedPatrolMembers = [];
    renderPatrole();
}

// =====================================
// RENDER
// =====================================

function ensureDaneState() {
    if (!appState.dane || typeof appState.dane !== "object") {
        appState.dane = { columns: ["Imię", "Nazwisko"], rows: [] };
    }
    if (!Array.isArray(appState.dane.rows)) appState.dane.rows = [];
    if (!Array.isArray(appState.dane.columns)) appState.dane.columns = ["Imię", "Nazwisko"];
    if (!Array.isArray(appState.patrole)) appState.patrole = [];
}

function renderPatrole() {
    const container = document.getElementById("patroleContainer");
    if (!container) return;

    ensureDaneState();

    const funkcjonariusze = [...(appState.dane.rows || [])]
        .sort((a, b) => (a["Nazwisko"] || "").localeCompare(b["Nazwisko"] || "", "pl"));

    let html = `
    <div class="card">
        <h2>Patrole</h2>
        <br>
        <h3>Wybierz ludzi</h3>
        <br>
        <div class="card-grid">
    `;

    funkcjonariusze.forEach(osoba => {
        const nazwa = getPersonName(osoba);
        const originalIndex = appState.dane.rows.indexOf(osoba);
        const selected = selectedPatrolMembers.includes(originalIndex) ? "selected" : "";

        html += `
        <div class="item-card ${selected}" onclick="togglePatrolPerson(${originalIndex})">
            ${nazwa}
        </div>`;
    });

    html += `
        </div>
        <br><br>

        <!-- Linia 1: Nazwa, Dowódca, Kierowca -->
        <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:flex-end; margin-bottom:15px;">
            <div style="flex:1; min-width:180px;">
                <label>Nazwa patrolu</label>
                <input type="text" id="patrolName">
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

        <!-- WOT + Policjanci – zwijane, zapamiętane w localStorage -->
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
                        <input type="text" id="wot1Input" placeholder="Imię i nazwisko">
                    </div>
                    <div style="flex:1; min-width:180px;">
                        <label>WOT 2</label>
                        <input type="text" id="wot2Input" placeholder="Imię i nazwisko">
                    </div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:flex-end;">
                    <div style="flex:1; min-width:180px;">
                        <label>Policjant 1</label>
                        <input type="text" id="policjant1Input" placeholder="Imię i nazwisko">
                    </div>
                    <div style="flex:1; min-width:180px;">
                        <label>Policjant 2</label>
                        <input type="text" id="policjant2Input" placeholder="Imię i nazwisko">
                    </div>
                </div>
            </div>
        </div>

        <button class="btn-success" onclick="createPatrol()">Stwórz patrol</button>
    </div>

    <div class="card">
        <h2>Lista patroli</h2>
        <br>
        <table>
            <thead>
                <tr>
                    <th>Nazwa</th>
                    <th>Skład</th>
                    <th>Dowódca</th>
                    <th>Kierowca</th>
                    <th>WOT 1</th>
                    <th>WOT 2</th>
                    <th>Policjant 1</th>
                    <th>Policjant 2</th>
                    <th>Edytuj</th>
                    <th>Usuń</th>
                </tr>
            </thead>
            <tbody>
    `;

    appState.patrole.forEach((patrol, index) => {
        html += `
        <tr>
            <td>${patrol.nazwa}</td>
            <td>${(patrol.sklad || []).join("<br>")}</td>
            <td>${patrol.dowodca || ""}</td>
            <td>${patrol.kierowca || ""}</td>
            <td>${patrol.wot1 || ""}</td>
            <td>${patrol.wot2 || ""}</td>
            <td>${patrol.policjant1 || ""}</td>
            <td>${patrol.policjant2 || ""}</td>
            <td><button class="btn-primary" onclick="editPatrol(${index})">Edytuj</button></td>
            <td><button class="btn-danger" onclick="removePatrol(${index})">Usuń</button></td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    updatePatrolLists();
    applyPatroleWotSection();
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

// =====================================
// POMOCNICZE
// =====================================

function getPersonName(osoba) {
    return `${osoba["Stopień"] || ""} ${osoba["Nazwisko"] || ""} ${osoba["Imię"] || ""}`.trim();
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

function updatePatrolLists() {
    const dowodca = document.getElementById("dowodcaSelect");
    const kierowca = document.getElementById("kierowcaSelect");
    if (!dowodca || !kierowca) return;

    let options = `<option value="">-- brak --</option>`;

    selectedPatrolMembers.forEach(index => {
        const osoba = appState.dane.rows[index];
        const nazwa = getPersonName(osoba);
        options += `<option value="${nazwa}">${nazwa}</option>`;
    });

    dowodca.innerHTML = options;
    kierowca.innerHTML = options;
}

// =====================================
// TWORZENIE / EDYCJA / USUWANIE
// =====================================

async function createPatrol() {
    const nazwa = document.getElementById("patrolName").value.trim();
    if (!nazwa) {
        alert("Podaj nazwę patrolu");
        return;
    }
    if (selectedPatrolMembers.length === 0) {
        alert("Wybierz funkcjonariuszy");
        return;
    }

    const sklad = selectedPatrolMembers.map(index => getPersonName(appState.dane.rows[index]));
    const dowodca = document.getElementById("dowodcaSelect").value;
    const kierowca = document.getElementById("kierowcaSelect").value;
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
    renderPatrole();
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
