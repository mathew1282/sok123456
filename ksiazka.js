// =====================================
// KSIĄŻKA WYDARZEŃ
// =====================================

function ensureKsiazkaState() {
    if (!Array.isArray(appState.ksiazkaWydarzen)) {
        appState.ksiazkaWydarzen = [];
    }
}

function nowHHMM() {
    return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function todayPL() {
    return new Date().toLocaleDateString("pl-PL");
}

function tomorrowPL() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("pl-PL");
}

/** Parsuje "HH:MM" → {h, m} lub null */
function parseTimeParts(str) {
    const m = String(str || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, m: min };
}

/** Buduje Date z daty PL (dd.mm.rrrr) + HH:MM */
function entryToDate(entry) {
    const parts = parseTimeParts(entry.godzinaStart);
    if (!parts) return null;

    let day = new Date();
    if (entry.data) {
        const dm = String(entry.data).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (dm) {
            day = new Date(parseInt(dm[3], 10), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10));
        }
    }
    day.setHours(parts.h, parts.m, 0, 0);
    return day;
}

function isOverdue(entry) {
    if (entry.zrobione) return false;
    const dt = entryToDate(entry);
    if (!dt) return false;
    return new Date() > dt;
}

function getPatrolName(index) {
    const p = appState.patrole?.[index];
    return (p && p.nazwa) ? p.nazwa : ("Patrol " + (index + 1));
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Usuwa kropki / bullet-y z początku linii (zwykły tekst) */
function stripBulletsPlain(text) {
    return String(text || "")
        .split("\n")
        .map(line => line.replace(/^[\s•·.\-–—]+/, "").trimStart())
        .join("\n")
        .trim();
}

/** Duża litera na początku i po kropce (używa funkcji z generator.js jeśli jest) */
function capitalizeSentencesKs(text) {
    if (typeof capitalizeSentences === "function") return capitalizeSentences(text);
    let s = String(text || "");
    if (!s) return s;
    s = s.replace(/(^|[\n\r]+)([ \t]*)([a-ząćęłńóśźż])/gi, (_, br, sp, ch) =>
        br + sp + ch.toLocaleUpperCase("pl-PL")
    );
    s = s.replace(/([.!?…]+["»”']?)([ \t\n\r]+)([a-ząćęłńóśźż])/gi, (_, punct, sp, ch) =>
        punct + sp + ch.toLocaleUpperCase("pl-PL")
    );
    return s;
}

function capitalizeSentencesHtmlKs(html) {
    if (typeof capitalizeSentencesHtml === "function") return capitalizeSentencesHtml(html);
    const raw = String(html || "");
    if (!/<[^>]+>/.test(raw)) return capitalizeSentencesKs(raw);
    return raw.replace(/(^|>)([^<]*)/g, (full, boundary, text) => {
        if (!text) return full;
        return boundary + capitalizeSentencesKs(text);
    });
}

/**
 * Bezpieczne HTML do wyświetlenia w Książce:
 * - zachowuje <b> <strong> <u> <i> <br>
 * - usuwa kropki / bullet-y
 * - resztę escapuje
 */
function formatKsiazkaTekstHtml(raw) {
    let s = String(raw || "");

    // Jeśli to zwykły tekst bez tagów – escapuj i zamień enter na <br>
    if (!/<(?:b|strong|u|i|br|div|p|span)\b/i.test(s)) {
        s = escapeHtml(s).replace(/\n/g, "<br>");
    }

    // Usuń wizualne bullet-y z generatora
    s = s.replace(/<span[^>]*class=["'][^"']*entry-bullet[^"']*["'][^>]*>.*?<\/span>\s*/gi, "");
    // Usuń same znaki • na początku linii / po <br>
    s = s.replace(/(^|<br\s*\/?>)\s*[•·]\s*/gi, "$1");

    // Zostaw tylko bezpieczne tagi
    s = s.replace(/<(?!\/?(?:b|strong|u|i|br)\b)[^>]*>/gi, "");

    return s;
}

/** Sortuje wpisy od najstarszych do najmłodszych */
function sortEntriesOldestFirst(entries) {
    return [...entries].sort((a, b) => {
        const da = entryToDate(a) || new Date(0);
        const db = entryToDate(b) || new Date(0);
        return da - db;
    });
}

// =====================================
// MODAL PO GENERUJ WPIS (tylko godzina rozpoczęcia)
// =====================================

function openKsiazkaSaveModal(tekst, patrolIndexes) {
    ensureKsiazkaState();

    const old = document.getElementById("ksiazkaSaveModal");
    if (old) old.remove();

    const now = nowHHMM();
    const patrolNames = (patrolIndexes || []).map(i => getPatrolName(i)).join(", ") || "Brak patrolu";

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaSaveModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    overlay.innerHTML = `
        <div class="modal" style="max-width:480px;">
            <h2 style="margin-top:0;">Zapisz do Książki wydarzeń</h2>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:16px;">
                Patrol: <strong>${escapeHtml(patrolNames)}</strong>
            </p>

            <div style="margin-bottom:14px;">
                <label>Godzina rozpoczęcia</label>
                <input type="time" id="ksiazkaGodzStart" value="${now}" style="width:100%;">
                <div style="font-size:12px; color:#94a3b8; margin-top:6px;">
                    Po 18:00 godziny 0:00–11:59 → następny dzień (noc).
                    Wcześniejsze godziny wieczorem (np. 22 przy 23) → dziś.
                </div>
            </div>

            <div style="margin-bottom:16px;">
                <label>Podgląd wpisu</label>
                <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:12px; max-height:160px; overflow:auto; font-size:13px; white-space:pre-wrap; color:#e2e8f0;">
${formatKsiazkaTekstHtml(tekst)}
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-success" onclick="confirmSaveToKsiazka()">Zapisz</button>
                <button class="btn-danger" onclick="closeKsiazkaSaveModal()">Anuluj</button>
            </div>
        </div>
    `;

    overlay._tekst = tekst;
    overlay._patrolIndexes = patrolIndexes || [];

    document.body.appendChild(overlay);
}

function closeKsiazkaSaveModal() {
    const m = document.getElementById("ksiazkaSaveModal");
    if (m) m.remove();
}

async function confirmSaveToKsiazka() {
    const modal = document.getElementById("ksiazkaSaveModal");
    if (!modal) return;

    const tekst = modal._tekst || "";
    const patrolIndexes = modal._patrolIndexes || [];
    const godzStart = document.getElementById("ksiazkaGodzStart")?.value || nowHHMM();

    // Po 18:00: tylko godziny 0:00–11:59 (noc/poranek) → następny dzień.
    // Wcześniejsza godzina wieczorem (np. 22:00 przy 23:00) → dziś.
    // Przed 18:00: zawsze dziś (uzupełnianie wstecz).
    const parts = parseTimeParts(godzStart);
    let dataWpisu = todayPL();
    if (parts) {
        const now = new Date();
        const chosen = new Date();
        chosen.setHours(parts.h, parts.m, 0, 0);
        if (chosen < now && now.getHours() >= 18 && parts.h < 12) {
            dataWpisu = tomorrowPL();
        }
    }

    ensureKsiazkaState();

    appState.ksiazkaWydarzen.push({
        id: Date.now() + Math.random().toString(36).slice(2),
        data: dataWpisu,
        godzinaStart: godzStart,
        tekst: capitalizeSentencesHtmlKs(tekst),
        patrole: [...patrolIndexes],
        zrobione: false,
        createdAt: new Date().toISOString()
    });

    await saveState();
    closeKsiazkaSaveModal();

    if (typeof showToast === "function") {
        showToast("✅ Zapisano do Książki wydarzeń");
    } else {
        alert("Zapisano do Książki wydarzeń");
    }

    if (document.getElementById("ksiazkaContainer")) {
        renderKsiazka();
    }
}

// =====================================
// PODPIĘCIE DO GENERATORA
// =====================================

function getGeneratedEntryPlainForKsiazka() {
    const el = document.getElementById("generatedEntry");
    if (!el) return "";

    // Weź HTML z formatowaniem (pogrubienie itd.), bez kropek
    if (el.getAttribute("contenteditable") === "true") {
        const clone = el.cloneNode(true);
        clone.querySelectorAll(".entry-bullet").forEach(n => n.remove());
        let html = clone.innerHTML || "";
        html = html.replace(/(^|<br\s*\/?>)\s*[•·]\s*/gi, "$1");
        return html.trim();
    }

    return stripBulletsPlain(el.value || el.innerText || "");
}

(function patchGenerateEntry() {
    const original = window.generateEntry;

    window.generateEntry = function () {
        if (typeof original === "function") {
            original.apply(this, arguments);
        }

        setTimeout(() => {
            const tekst = getGeneratedEntryPlainForKsiazka();
            if (!tekst) return;

            const patrols = (typeof selectedPatrols !== "undefined" && Array.isArray(selectedPatrols))
                ? [...selectedPatrols]
                : [];

            openKsiazkaSaveModal(tekst, patrols);
        }, 150);
    };
})();

// =====================================
// RENDER KSIĄŻKI
// =====================================

let ksiazkaFilterPatrole = [];
let ksiazkaFilterInne = false; // filtr "Inne" = wpisy bez patroli

function initKsiazka() {
    ensureKsiazkaState();
    ksiazkaFilterPatrole = [];
    ksiazkaFilterInne = false;
    renderKsiazka();

    if (window._ksiazkaInterval) clearInterval(window._ksiazkaInterval);
    window._ksiazkaInterval = setInterval(() => {
        if (document.getElementById("ksiazkaContainer")) {
            renderKsiazka();
        }
    }, 20000);
}

function toggleKsiazkaFilter(patrolIndex) {
    ksiazkaFilterInne = false;
    const pos = ksiazkaFilterPatrole.indexOf(patrolIndex);
    if (pos > -1) ksiazkaFilterPatrole.splice(pos, 1);
    else ksiazkaFilterPatrole.push(patrolIndex);
    renderKsiazka();
}

function toggleKsiazkaFilterInne() {
    ksiazkaFilterPatrole = [];
    ksiazkaFilterInne = !ksiazkaFilterInne;
    renderKsiazka();
}

function clearKsiazkaFilter() {
    ksiazkaFilterPatrole = [];
    ksiazkaFilterInne = false;
    renderKsiazka();
}

function renderKsiazka() {
    const container = document.getElementById("ksiazkaContainer");
    if (!container) return;
    ensureKsiazkaState();

    const allEntries = sortEntriesOldestFirst(appState.ksiazkaWydarzen);

    // Patrole faktycznie obecne w książce (unikalne indeksy)
    const usedPatrolSet = new Set();
    let hasInne = false;
    allEntries.forEach(e => {
        const pats = e.patrole || [];
        if (!pats.length) hasInne = true;
        else pats.forEach(p => {
            if (p != null && p !== "") usedPatrolSet.add(Number(p));
        });
    });
    const usedPatrole = [...usedPatrolSet].filter(n => Number.isFinite(n)).sort((a, b) => a - b);

    // Wyczyść filtr, jeśli wybrany patrol już nie występuje w książce
    ksiazkaFilterPatrole = ksiazkaFilterPatrole.filter(i => usedPatrolSet.has(i));
    if (ksiazkaFilterInne && !hasInne) ksiazkaFilterInne = false;

    let filtered = allEntries;
    if (ksiazkaFilterInne) {
        filtered = allEntries.filter(e => !e.patrole || e.patrole.length === 0);
    } else if (ksiazkaFilterPatrole.length > 0) {
        filtered = allEntries.filter(e =>
            (e.patrole || []).some(p => ksiazkaFilterPatrole.includes(p))
        );
    }

    const noPatrolFilter = !ksiazkaFilterInne && ksiazkaFilterPatrole.length === 0;

    const patrolFilterPills = usedPatrole.map(idx => `
                    <div class="line-pill ${ksiazkaFilterPatrole.includes(idx) ? "active" : ""}"
                         onclick="toggleKsiazkaFilter(${idx})" style="cursor:pointer;">
                        ${escapeHtml(getPatrolName(idx))}
                    </div>`).join("");

    const innePill = hasInne ? `
                    <div class="line-pill ${ksiazkaFilterInne ? "active" : ""}" onclick="toggleKsiazkaFilterInne()" style="cursor:pointer;">
                        Inne
                    </div>` : "";

    let html = `
    <div class="card ksiazka-card">
        <div class="ksiazka-sticky-bar">
            <div class="ksiazka-sticky-left">
                <h2 style="margin:0; white-space:nowrap;">📖 Książka wydarzeń</h2>
                <div class="ksiazka-filters">
                    <div class="line-pill ${noPatrolFilter ? "active" : ""}" onclick="clearKsiazkaFilter()" style="cursor:pointer;">
                        Wszystkie
                    </div>
                    ${patrolFilterPills}
                    ${innePill}
                </div>
            </div>
            <div class="ksiazka-sticky-right">
                <button class="btn-success" onclick="openKsiazkaAddModal()">➕ Dodaj wpis</button>
                <button class="btn-primary" onclick="openPlanSluzbyModal()">📋 Planowanie</button>
                <button class="btn-primary" onclick="openZapiszKsiazkeJakoSzablon()">💾 Zapisz książkę jako szablon</button>
                <button class="btn-primary" onclick="openKsiazkaUwagiPicker()">Uwagi</button>
                <button class="btn-success" onclick="openKsiazkaSprawdzenieModal()">Sprawdzenie</button>
                <button class="btn-primary" onclick="exportKsiazkaFiltered()">📋 Eksport (kopiuj)</button>
                <button class="btn-danger" onclick="clearAllKsiazka()">Kasuj wszystkie</button>
            </div>
        </div>
    `;

    // Lista gdy brak filtrów / 1 patrol / Inne; kolumny tylko przy 2+ patrolach
    if (ksiazkaFilterInne || ksiazkaFilterPatrole.length <= 1) {
        html += renderKsiazkaListView(filtered);
    } else {
        html += renderKsiazkaColumnsView(filtered);
    }

    html += `</div>`;
    container.innerHTML = html;
}

/** Widok listy: 3 kolumny (Godzina | Informacje | Akcje) */
function renderKsiazkaListView(entries) {
    if (entries.length === 0) {
        return `<div style="color:#64748b; padding:20px 0;">Brak wpisów</div>`;
    }

    let html = `
    <div class="ksiazka-list">
        <div class="ksiazka-row ksiazka-header">
            <div class="ksiazka-col-time">Godzina</div>
            <div class="ksiazka-col-info">Informacje</div>
            <div class="ksiazka-col-actions">Akcje</div>
        </div>
    `;

    entries.forEach(entry => {
        const globalIdx = appState.ksiazkaWydarzen.findIndex(e => e.id === entry.id);
        const overdue = isOverdue(entry);
        const done = !!entry.zrobione;

        let rowClass = "ksiazka-row";
        if (done) rowClass += " ksiazka-done";
        else if (overdue) rowClass += " ksiazka-overdue";

        const patrolLabel = (entry.patrole || []).map(i => getPatrolName(i)).join(", ");

        html += `
        <div class="${rowClass}">
            <div class="ksiazka-col-time">
                <div class="ksiazka-time">${escapeHtml(entry.godzinaStart || "—")}</div>
                <div class="ksiazka-date">${escapeHtml(entry.data || "")}</div>
                ${patrolLabel ? `<div class="ksiazka-patrol">${escapeHtml(patrolLabel)}</div>` : ""}
            </div>
            <div class="ksiazka-col-info">
                <div class="ksiazka-text">${formatKsiazkaTekstHtml(entry.tekst)}</div>
            </div>
            <div class="ksiazka-col-actions">
                ${!done ? `
                    <button class="btn-success" style="padding:5px 10px; font-size:12px;" onclick="oznaczZrobione(${globalIdx})">Zrobione</button>
                ` : `
                    <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="odznaczZrobione(${globalIdx})">Cofnij</button>
                `}
                <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="kopiujWpisKsiazki(${globalIdx})">Kopiuj</button>
                <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="edytujWpisKsiazki(${globalIdx})">Edytuj</button>
                <button class="btn-danger" style="padding:5px 10px; font-size:12px;" onclick="usunWpisKsiazki(${globalIdx})">Kasuj</button>
            </div>
        </div>
        `;
    });

    html += `</div>`;
    return html;
}

/** Widok kolumn (gdy wybrano 2+ patrole) */
function renderKsiazkaColumnsView(filtered) {
    const columns = ksiazkaFilterPatrole.map(idx => ({
        key: idx,
        name: getPatrolName(idx),
        entries: filtered.filter(e => (e.patrole || []).includes(idx))
    }));

    let html = `<div style="display:flex; gap:16px; overflow-x:auto; align-items:flex-start;">`;

    columns.forEach(col => {
        html += `
        <div style="min-width:280px; max-width:380px; flex:1; background:#1e293b; border:1px solid #334155; border-radius:12px; padding:14px;">
            <div style="font-weight:700; font-size:16px; margin-bottom:12px; color:#60a5fa; border-bottom:1px solid #334155; padding-bottom:8px;">
                ${escapeHtml(col.name)} <span style="color:#94a3b8; font-weight:500; font-size:13px;">(${col.entries.length})</span>
            </div>
        `;

        if (col.entries.length === 0) {
            html += `<div style="color:#64748b; font-size:13px; padding:10px 0;">Brak wpisów</div>`;
        } else {
            col.entries.forEach(entry => {
                const globalIdx = appState.ksiazkaWydarzen.findIndex(e => e.id === entry.id);
                const overdue = isOverdue(entry);
                const done = !!entry.zrobione;

                let boxStyle = "background:#0f172a; border:1px solid #334155;";
                let extraClass = "";
                if (done) {
                    boxStyle = "background:rgba(34,197,94,0.15); border:1px solid #22c55e;";
                } else if (overdue) {
                    boxStyle = "background:rgba(220,38,38,0.18); border:1px solid #dc2626;";
                    extraClass = "ksiazka-overdue-box";
                }

                html += `
                <div class="${extraClass}" style="${boxStyle} border-radius:10px; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px;">
                        <span style="color:#94a3b8;">${escapeHtml(entry.data)} · <strong style="color:#e2e8f0;">${escapeHtml(entry.godzinaStart || "—")}</strong></span>
                        ${done ? "<span style='color:#4ade80;'>✅</span>" : (overdue ? "<span style='color:#f87171;'>⚠</span>" : "")}
                    </div>
                    <div style="font-size:13.5px; line-height:1.45; white-space:pre-wrap; color:#e2e8f0; margin-bottom:10px;">
                        ${formatKsiazkaTekstHtml(entry.tekst)}
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${!done ? `
                            <button class="btn-success" style="padding:5px 10px; font-size:12px;" onclick="oznaczZrobione(${globalIdx})">Zrobione</button>
                        ` : `
                            <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="odznaczZrobione(${globalIdx})">Cofnij</button>
                        `}
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="kopiujWpisKsiazki(${globalIdx})">Kopiuj</button>
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="edytujWpisKsiazki(${globalIdx})">Edytuj</button>
                        <button class="btn-danger" style="padding:5px 10px; font-size:12px;" onclick="usunWpisKsiazki(${globalIdx})">Kasuj</button>
                    </div>
                </div>
                `;
            });
        }
        html += `</div>`;
    });

    html += `</div>`;
    return html;
}

// =====================================
// AKCJE
// =====================================

async function oznaczZrobione(index) {
    ensureKsiazkaState();
    if (!appState.ksiazkaWydarzen[index]) return;
    appState.ksiazkaWydarzen[index].zrobione = true;
    await saveState();
    renderKsiazka();
}

async function odznaczZrobione(index) {
    ensureKsiazkaState();
    if (!appState.ksiazkaWydarzen[index]) return;
    appState.ksiazkaWydarzen[index].zrobione = false;
    await saveState();
    renderKsiazka();
}

async function usunWpisKsiazki(index) {
    ensureKsiazkaState();
    if (!appState.ksiazkaWydarzen[index]) return;
    if (!confirm("Na pewno usunąć ten wpis?")) return;
    appState.ksiazkaWydarzen.splice(index, 1);
    await saveState();
    renderKsiazka();
}

async function clearAllKsiazka() {
    ensureKsiazkaState();
    if (appState.ksiazkaWydarzen.length === 0) {
        alert("Brak wpisów do usunięcia");
        return;
    }
    if (!confirm("Na pewno usunąć WSZYSTKIE wpisy z Książki wydarzeń?")) return;
    appState.ksiazkaWydarzen = [];
    await saveState();
    renderKsiazka();
}

async function kopiujWpisKsiazki(index) {
    ensureKsiazkaState();
    const e = appState.ksiazkaWydarzen[index];
    if (!e) return;

    let text = String(e.tekst || "");
    // HTML → zwykły tekst
    if (/<[^>]+>/.test(text)) {
        const tmp = document.createElement("div");
        tmp.innerHTML = text;
        text = tmp.innerText || tmp.textContent || "";
    }
    text = stripBulletsPlain(text);

    try {
        await navigator.clipboard.writeText(text);
        if (typeof showToast === "function") showToast("✅ Skopiowano");
        else alert("Skopiowano");
    } catch (err) {
        alert("Nie udało się skopiować");
    }
}

// =====================================
// EDYCJA WPISU (kafelki + ręcznie)
// =====================================

function edytujWpisKsiazki(index) {
    ensureKsiazkaState();
    const entry = appState.ksiazkaWydarzen[index];
    if (!entry) return;

    const old = document.getElementById("ksiazkaEditModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaEditModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay._editIndex = index;

    const poleceniaPills = (appState.polecenia?.rows || []).map((r, i) => {
        const label = (r.OpisKrotki || r.Opis || ("Polecenie " + (i + 1))).slice(0, 40);
        return `<div class="line-pill" style="cursor:pointer; font-size:13px;" onclick="insertTileToEdit('pol', ${i})">${escapeHtml(label)}</div>`;
    }).join("") || "<span style='color:#64748b; font-size:13px;'>Brak poleceń</span>";

    const zgloszeniaPills = (appState.zgloszenia?.rows || []).map((r, i) => {
        const label = (r.OpisKrotki || r.Opis || ("Zgłoszenie " + (i + 1))).slice(0, 40);
        return `<div class="line-pill" style="cursor:pointer; font-size:13px;" onclick="insertTileToEdit('zgl', ${i})">${escapeHtml(label)}</div>`;
    }).join("") || "<span style='color:#64748b; font-size:13px;'>Brak zgłoszeń</span>";

    const szablonyPills = (appState.szablony || []).map((s, i) => {
        const label = (s.nazwa || s.tekst || ("Szablon " + (i + 1))).slice(0, 40);
        return `<div class="line-pill" style="cursor:pointer; font-size:13px;" onclick="insertTileToEdit('szab', ${i})">${escapeHtml(label)}</div>`;
    }).join("");

    overlay.innerHTML = `
        <div class="modal" style="max-width:720px;">
            <h2 style="margin-top:0;">Edytuj wpis</h2>

            <div style="margin-bottom:14px;">
                <label>Godzina rozpoczęcia</label>
                <input type="time" id="editGodzStart" value="${escapeHtml(entry.godzinaStart || "")}" style="width:160px;">
            </div>

            <div style="margin-bottom:12px;">
                <label>Treść wpisu (możesz edytować ręcznie)</label>
                <textarea id="editTekst" rows="8" style="width:100%; font-size:14px; line-height:1.5;">${escapeHtml(entry.tekst || "")}</textarea>
            </div>

            <div style="margin-bottom:10px;">
                <div style="font-size:13px; color:#94a3b8; margin-bottom:6px;">Wstaw z Poleceń (klik = dopisz na końcu):</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:90px; overflow:auto;">
                    ${poleceniaPills}
                </div>
            </div>

            <div style="margin-bottom:10px;">
                <div style="font-size:13px; color:#94a3b8; margin-bottom:6px;">Wstaw ze Zgłoszeń (klik = dopisz na końcu):</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:90px; overflow:auto;">
                    ${zgloszeniaPills}
                </div>
            </div>

            ${szablonyPills ? `
            <div style="margin-bottom:14px;">
                <div style="font-size:13px; color:#94a3b8; margin-bottom:6px;">Szablony:</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:70px; overflow:auto;">
                    ${szablonyPills}
                </div>
            </div>
            ` : ""}

            <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
                <button class="btn-primary" style="font-size:13px;" onclick="replaceAllFromTile()">Zastąp całość ostatnim kaflem</button>
                <button class="btn-danger" style="font-size:13px;" onclick="document.getElementById('editTekst').value=''">Wyczyść treść</button>
            </div>

            <div class="modal-actions">
                <button class="btn-success" onclick="confirmEditKsiazka()">Zapisz zmiany</button>
                <button class="btn-danger" onclick="closeKsiazkaEditModal()">Anuluj</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    window._lastTileText = null;
}

function insertTileToEdit(typ, index) {
    let text = "";
    if (typ === "pol") {
        const row = appState.polecenia?.rows?.[index];
        text = row?.Opis || row?.OpisKrotki || "";
    } else if (typ === "zgl") {
        const row = appState.zgloszenia?.rows?.[index];
        text = row?.Opis || row?.OpisKrotki || "";
    } else if (typ === "szab") {
        const s = appState.szablony?.[index];
        text = s?.tekst || s?.nazwa || "";
    }
    if (!text) return;

    window._lastTileText = text;
    const ta = document.getElementById("editTekst");
    if (!ta) return;

    const cur = ta.value || "";
    if (cur.trim()) {
        ta.value = cur.trimEnd() + "\n\n" + text;
    } else {
        ta.value = text;
    }
    ta.focus();
}

function replaceAllFromTile() {
    if (!window._lastTileText) {
        alert("Najpierw kliknij jakiś kafelek");
        return;
    }
    const ta = document.getElementById("editTekst");
    if (ta) ta.value = window._lastTileText;
}

function closeKsiazkaEditModal() {
    const m = document.getElementById("ksiazkaEditModal");
    if (m) m.remove();
}

async function confirmEditKsiazka() {
    const modal = document.getElementById("ksiazkaEditModal");
    if (!modal) return;
    const index = modal._editIndex;
    ensureKsiazkaState();
    if (!appState.ksiazkaWydarzen[index]) return;

    const newTekst = document.getElementById("editTekst")?.value || "";
    const newGodz = document.getElementById("editGodzStart")?.value || appState.ksiazkaWydarzen[index].godzinaStart;

    appState.ksiazkaWydarzen[index].tekst = capitalizeSentencesHtmlKs(newTekst);
    appState.ksiazkaWydarzen[index].godzinaStart = newGodz;

    await saveState();
    closeKsiazkaEditModal();
    renderKsiazka();

    if (typeof showToast === "function") showToast("✅ Zapisano zmiany");
}

// =====================================
// PLANOWANIE SŁUŻBY (szablony względne)
// =====================================

/** Draft: [{ offsetMin, tekst, patrolIndexes: number[] }]
 *  patrolIndexes = abstrakcyjne sloty 0..N-1 (Patrol 1..N), pusta tablica = bez patrolu
 *  Można zaznaczyć kilka patroli na jeden punkt.
 *  Mapowanie na prawdziwe patrole (też wiele) przy zapisie do Książki.
 */
let _planDraft = [];
let _planEditTemplateId = null; // null = nowy
let _planNumPatroli = 2; // ile abstrakcyjnych patroli (Patrol 1, Patrol 2, …)
let _planAddPatrolIndexes = []; // wybór przy „Dodaj punkt”
let _planCycPatrolIndexes = []; // wybór przy cyklicznych

function planNormalizeIndexes(val) {
    if (Array.isArray(val)) {
        return [...new Set(val.map(Number).filter(n => Number.isFinite(n) && n >= 0))];
    }
    if (val == null || val === "") return [];
    // stary format: pojedynczy patrolIndex
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? [n] : [];
}

function planIndexesKey(idxs) {
    const a = planNormalizeIndexes(idxs).slice().sort((x, y) => x - y);
    return a.length ? a.join(",") : "none";
}

function planAbstractPatrolName(idx) {
    if (idx == null || idx === "") return "bez patrolu";
    const n = Number(idx);
    if (!Number.isFinite(n) || n < 0) return "bez patrolu";
    return "Patrol " + (n + 1);
}

function planAbstractPatrolsLabel(idxs) {
    const a = planNormalizeIndexes(idxs);
    if (!a.length) return "bez patrolu";
    return a.map(i => planAbstractPatrolName(i)).join(", ");
}

/** Kafelki wielokrotnego wyboru – abstrakcyjne patrole */
function planBuildAbstractPatrolPills(selectedIndexes, onToggleFnName, dataIdx) {
    const n = Math.max(1, Math.min(12, Number(_planNumPatroli) || 2));
    const selected = planNormalizeIndexes(selectedIndexes);
    let html = "";
    for (let i = 0; i < n; i++) {
        const active = selected.includes(i) ? "active" : "";
        const arg = (dataIdx == null) ? `${i}` : `${dataIdx}, ${i}`;
        html += `<div class="line-pill ${active}" style="cursor:pointer;" onclick="${onToggleFnName}(${arg})">${escapeHtml(planAbstractPatrolName(i))}</div>`;
    }
    return html || `<span style="color:var(--text-dim); font-size:12px;">Brak</span>`;
}

function planBuildAbstractPatrolOpts(selectedVal) {
    // legacy (select) – zostawione na wszelki wypadek
    const n = Math.max(1, Math.min(12, Number(_planNumPatroli) || 2));
    const selected = planNormalizeIndexes(selectedVal);
    let html = `<option value="">— bez patrolu —</option>`;
    for (let i = 0; i < n; i++) {
        const sel = selected.includes(i) ? " selected" : "";
        html += `<option value="${i}"${sel}>Patrol ${i + 1}</option>`;
    }
    return html;
}

function planEnsureDraftShape(r) {
    if (!r) return r;
    if (!Array.isArray(r.patrolIndexes)) {
        r.patrolIndexes = planNormalizeIndexes(r.patrolIndex);
    } else {
        r.patrolIndexes = planNormalizeIndexes(r.patrolIndexes);
    }
    delete r.patrolIndex;
    return r;
}

function ensurePlanSzablonyState() {
    if (!Array.isArray(appState.planSzablony)) {
        appState.planSzablony = [];
    }
}

function timeToMinutes(hhmm) {
    const p = parseTimeParts(hhmm);
    if (!p) return 0;
    return p.h * 60 + p.m;
}

function minutesToHHMM(mins) {
    let m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(m / 60);
    const min = m % 60;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

/** Data wpisu wg reguły nocnej (po 18:00 + godzina 0–11 → jutro) */
function resolveDataForGodzina(godzHHMM) {
    const parts = parseTimeParts(godzHHMM);
    let dataWpisu = todayPL();
    if (parts) {
        const now = new Date();
        const chosen = new Date();
        chosen.setHours(parts.h, parts.m, 0, 0);
        if (chosen < now && now.getHours() >= 18 && parts.h < 12) {
            dataWpisu = tomorrowPL();
        }
    }
    return dataWpisu;
}

function stripHtmlPlain(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

/** Stan kafelków 3-poziomowych w „Dodaj punkt” planu */
let _planAddTiles = {
    zglLine: null, zglOpis: null, zglIndex: null,
    polLine: null, polOpis: null, polIndex: null,
    zglSearch: "", polSearch: ""
};

function resetPlanAddTiles() {
    _planAddTiles = {
        zglLine: null, zglOpis: null, zglIndex: null,
        polLine: null, polOpis: null, polIndex: null,
        zglSearch: "", polSearch: ""
    };
}

function openPlanSluzbyModal() {
    ensurePlanSzablonyState();
    _planDraft = [];
    _planEditTemplateId = null;
    resetPlanAddTiles();

    const old = document.getElementById("planSluzbyModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "planSluzbyModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:stretch; justify-content:center; padding:12px;";
    document.body.appendChild(overlay);
    renderPlanSluzbyModal();
}

/** Style zależne od motywu (jasny/ciemny) – bez sztywnego czarnego tła */
function planThemeBoxStyle(extra) {
    return `background:var(--bg-input); border:1px solid var(--border); color:var(--text-soft); border-radius:10px; ${extra || ""}`;
}

function closePlanSluzbyModal() {
    const m = document.getElementById("planSluzbyModal");
    if (m) m.remove();
    _planDraft = [];
    _planEditTemplateId = null;
}

function renderPlanSluzbyModal() {
    const overlay = document.getElementById("planSluzbyModal");
    if (!overlay) return;
    ensurePlanSzablonyState();

    const szablony = appState.planSzablony || [];
    const nPat = Math.max(1, Math.min(12, Number(_planNumPatroli) || 2));
    _planNumPatroli = nPat;
    const patrolOpts = planBuildAbstractPatrolOpts(null);

    let draftHtml = "";
    if (_planDraft.length === 0) {
        draftHtml = `<div style="color:var(--text-dim); padding:12px 0;">Brak punktów – dodaj rekord lub wczytaj szablon.</div>`;
    } else {
        let acc = 0;
        draftHtml = _planDraft.map((r, idx) => {
            acc += (idx === 0 ? 0 : (Number(r.offsetMin) || 0));
            const godzPreview = minutesToHHMM(acc);
            return `
            <div style="${planThemeBoxStyle("padding:10px; margin-bottom:8px;")}">
                <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                    <div style="font-weight:600; color:var(--primary-light);">
                        #${idx + 1}
                        ${idx === 0 ? "(start)" : ("+" + (Number(r.offsetMin) || 0) + " min")}
                        <span style="color:var(--text-dim); font-weight:500; font-size:12px;"> · od startu ~${godzPreview}</span>
                    </div>
                    <button type="button" class="btn-danger" style="padding:3px 8px; font-size:12px;" onclick="planDraftUsun(${idx})">Usuń</button>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                    ${idx === 0 ? `<input type="hidden" class="plan-offset" data-idx="${idx}" value="0">` : `
                    <div style="min-width:100px;">
                        <label style="font-size:12px;">+ min od poprzedniego</label>
                        <input type="number" class="plan-offset" data-idx="${idx}" value="${Number(r.offsetMin) || 0}" min="0" step="5"
                               style="width:100%;" onchange="planDraftUpdateOffset(${idx}, this.value)">
                    </div>`}
                    <div style="flex:1; min-width:180px;">
                        <label style="font-size:12px;">Patrole (klik = zaznacz kilka)</label>
                        <div class="card-grid" style="gap:6px; margin-top:4px;">
                            ${planBuildAbstractPatrolPills(planEnsureDraftShape(r).patrolIndexes, "planDraftTogglePatrol", idx)}
                        </div>
                        <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${escapeHtml(planAbstractPatrolsLabel(r.patrolIndexes))}</div>
                    </div>
                </div>
                <label style="font-size:12px;">Treść</label>
                <textarea class="plan-tekst" data-idx="${idx}" rows="2" style="width:100%; font-size:13px;"
                          onchange="planDraftUpdateTekst(${idx}, this.value)">${escapeHtml(r.tekst || "")}</textarea>
            </div>`;
        }).join("");
    }

    overlay.innerHTML = `
        <div class="modal" style="width:min(1100px,96vw); height:min(90vh,900px); max-width:none; max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
                <h2 style="margin:0;">📋 Planowanie służby</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-success" onclick="planZapiszDoKsiazki()">Zapisz do Książki</button>
                    <button class="btn-danger" onclick="closePlanSluzbyModal()">Zamknij</button>
                </div>
            </div>
            <p style="color:var(--text-dim); font-size:13px; margin:0 0 10px 0;">
                Szablon = kolejne rekordy z offsetem <strong>od poprzedniego</strong>.
                Przy starcie podajesz godzinę – reszta się przelicza. Treść: ręcznie lub z 3 poziomów kafelków.
            </p>

            <div style="flex:1; overflow:auto; min-height:0; display:flex; flex-direction:column; gap:12px;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                        <label style="margin:0; font-weight:600;">Szablony (${szablony.length})</label>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button type="button" class="btn-success" style="padding:5px 10px; font-size:13px;" onclick="planZapiszJakoSzablon()">+ Zapisz bieżący jako szablon</button>
                            <button type="button" class="btn-primary" style="padding:5px 10px; font-size:13px;" onclick="planWyczyscDraft()">Nowy / pusty</button>
                        </div>
                    </div>
                    <div id="planSzablonyList" style="${planThemeBoxStyle("max-height:140px; overflow:auto; padding:6px;")}">
                        ${szablony.length === 0
                            ? `<div style="color:var(--text-dim); padding:10px; font-size:13px;">Brak zapisanych szablonów</div>`
                            : szablony.map((s, i) => {
                                const active = _planEditTemplateId && s.id === _planEditTemplateId;
                                return `
                                <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; margin-bottom:4px; background:${active ? "rgba(59,130,246,0.15)" : "transparent"}; border:1px solid ${active ? "var(--primary)" : "transparent"};">
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-weight:600; color:var(--text-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.nazwa || ("Szablon " + (i + 1)))}</div>
                                        <div style="font-size:12px; color:var(--text-dim);">${(s.rekordy || []).length} pkt</div>
                                    </div>
                                    <button type="button" class="btn-primary" style="padding:4px 8px; font-size:12px; white-space:nowrap;" onclick="planWczytajSzablonPoIndex(${i})">Wczytaj</button>
                                    <button type="button" class="btn-primary" style="padding:4px 8px; font-size:12px;" onclick="planZmienNazweSzablonu(${i})" title="Zmień nazwę">✎</button>
                                    <button type="button" class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="planUsunSzablonPoIndex(${i})">Usuń</button>
                                </div>`;
                            }).join("")
                        }
                    </div>
                </div>

                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
                    <div style="min-width:140px;">
                        <label>Ilość patroli w planie</label>
                        <input type="number" id="planNumPatroli" value="${nPat}" min="1" max="12" step="1" style="width:100%;"
                               onchange="planSetNumPatroli(this.value)">
                        <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">Patrol 1 … N (mapowanie przy zapisie)</div>
                    </div>
                    <div style="min-width:140px;">
                        <label>Godzina startu planu</label>
                        <input type="time" id="planStartGodz" value="07:00" style="width:100%;">
                    </div>
                    <button type="button" class="btn-primary" onclick="planPodglad()">Podgląd godzin</button>
                </div>

                <div id="planPodgladBox" style="display:none; ${planThemeBoxStyle("padding:10px; max-height:140px; overflow:auto; font-size:13px; white-space:pre-wrap;")}"></div>

                <h3 style="margin:4px 0 0;">Punkty planu (${_planDraft.length})</h3>
                <div id="planDraftList">${draftHtml}</div>

                <div style="border:1px dashed var(--border); border-radius:10px; padding:12px;">
                    <div style="font-weight:600; margin-bottom:8px;">Dodaj punkt</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                        <div style="min-width:100px;">
                            <label style="font-size:12px;">+ min (0 = start / od poprz.)</label>
                            <input type="number" id="planAddOffset" value="${_planDraft.length === 0 ? 0 : 60}" min="0" step="5" style="width:100%;">
                        </div>
                        <div style="flex:1; min-width:200px;">
                            <label style="font-size:12px;">Patrole (można kilka)</label>
                            <div id="planAddPatrolPills" class="card-grid" style="gap:6px; margin-top:4px;">
                                ${planBuildAbstractPatrolPills(_planAddPatrolIndexes, "planAddTogglePatrol", null)}
                            </div>
                        </div>
                    </div>
                    <div style="margin-bottom:8px;">
                        <label style="font-size:12px;">Treść (ręcznie)</label>
                        <textarea id="planAddTekst" rows="2" style="width:100%;" placeholder="Wpisz treść ręcznie…" oninput="planUpdateAddPreviewFromTiles()"></textarea>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:8px;">
                        <div>
                            <div style="font-size:12px; font-weight:600; margin-bottom:4px;">Zgłoszenia (3 poziomy)</div>
                            <input type="text" id="planAddZglSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:6px;"
                                   oninput="_planAddTiles.zglSearch=this.value; planRenderAddTilesZgl();">
                            <div id="planAddZglLinie" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                            <div id="planAddZglItems" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                            <div id="planAddZglLevel3" class="card-grid" style="gap:6px;"></div>
                        </div>
                        <div>
                            <div style="font-size:12px; font-weight:600; margin-bottom:4px;">Polecenia (3 poziomy)</div>
                            <input type="text" id="planAddPolSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:6px;"
                                   oninput="_planAddTiles.polSearch=this.value; planRenderAddTilesPol();">
                            <div id="planAddPolLinie" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                            <div id="planAddPolItems" class="card-grid" style="gap:6px; margin-bottom:6px;"></div>
                            <div id="planAddPolLevel3" class="card-grid" style="gap:6px;"></div>
                        </div>
                    </div>
                    <div id="planAddPreview" style="display:none; ${planThemeBoxStyle("padding:10px; margin-bottom:8px; max-height:120px; overflow:auto; font-size:13px; white-space:pre-wrap;")}"></div>
                    <button type="button" class="btn-success" onclick="planDraftDodaj()">+ Dodaj punkt</button>
                </div>

                <div style="border:1px dashed var(--border); border-radius:10px; padding:12px;">
                    <div style="font-weight:600; margin-bottom:8px;">Cykliczne zgłoszenia</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                        <div style="min-width:90px;">
                            <label style="font-size:12px;">Pierwszy +min</label>
                            <input type="number" id="planCycOffset" value="60" min="0" step="5" style="width:100%;">
                        </div>
                        <div style="min-width:90px;">
                            <label style="font-size:12px;">Co ile min</label>
                            <input type="number" id="planCycInterwal" value="60" min="5" step="5" style="width:100%;">
                        </div>
                        <div style="min-width:90px;">
                            <label style="font-size:12px;">Ile razy</label>
                            <input type="number" id="planCycIle" value="8" min="1" max="48" style="width:100%;">
                        </div>
                        <div style="flex:1; min-width:200px;">
                            <label style="font-size:12px;">Patrole (można kilka)</label>
                            <div id="planCycPatrolPills" class="card-grid" style="gap:6px; margin-top:4px;">
                                ${planBuildAbstractPatrolPills(_planCycPatrolIndexes, "planCycTogglePatrol", null)}
                            </div>
                        </div>
                    </div>
                    <textarea id="planCycTekst" rows="2" style="width:100%; margin-bottom:8px;" placeholder="Treść cykliczna (ręcznie)…" oninput="planUpdateAddPreview('Cyc')"></textarea>
                    <div id="planCycPreview" style="display:none; ${planThemeBoxStyle("padding:10px; margin-bottom:8px; max-height:120px; overflow:auto; font-size:13px; white-space:pre-wrap;")}"></div>
                    <button type="button" class="btn-primary" onclick="planDraftDodajCykliczne()">+ Dodaj serię cykliczną</button>
                </div>
            </div>

            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap; border-top:1px solid var(--border); padding-top:12px;">
                <button class="btn-success" onclick="planZapiszDoKsiazki()">Zapisz do Książki</button>
                <button class="btn-danger" onclick="closePlanSluzbyModal()">Zamknij</button>
            </div>
        </div>
    `;

    // Po renderze – kafelki 3-poziomowe
    planRenderAddTilesZgl();
    planRenderAddTilesPol();
}

function planDraftSyncFromUI() {
    // offsets/teksty already updated via onchange; ensure array consistency
}

function planDraftUpdateOffset(idx, val) {
    if (!_planDraft[idx]) return;
    _planDraft[idx].offsetMin = Math.max(0, parseInt(val, 10) || 0);
    if (idx === 0) _planDraft[idx].offsetMin = 0;
}

function planDraftUpdatePatrol(idx, val) {
    // legacy single-value
    if (!_planDraft[idx]) return;
    planEnsureDraftShape(_planDraft[idx]);
    if (val === "" || val == null) _planDraft[idx].patrolIndexes = [];
    else _planDraft[idx].patrolIndexes = [parseInt(val, 10)];
}

function planDraftTogglePatrol(draftIdx, abstractIdx) {
    const r = _planDraft[draftIdx];
    if (!r) return;
    planEnsureDraftShape(r);
    const pos = r.patrolIndexes.indexOf(abstractIdx);
    if (pos > -1) r.patrolIndexes.splice(pos, 1);
    else r.patrolIndexes.push(abstractIdx);
    r.patrolIndexes = planNormalizeIndexes(r.patrolIndexes);
    renderPlanSluzbyModal();
}

function planAddTogglePatrol(abstractIdx) {
    const pos = _planAddPatrolIndexes.indexOf(abstractIdx);
    if (pos > -1) _planAddPatrolIndexes.splice(pos, 1);
    else _planAddPatrolIndexes.push(abstractIdx);
    _planAddPatrolIndexes = planNormalizeIndexes(_planAddPatrolIndexes);
    const el = document.getElementById("planAddPatrolPills");
    if (el) el.innerHTML = planBuildAbstractPatrolPills(_planAddPatrolIndexes, "planAddTogglePatrol", null);
}

function planCycTogglePatrol(abstractIdx) {
    const pos = _planCycPatrolIndexes.indexOf(abstractIdx);
    if (pos > -1) _planCycPatrolIndexes.splice(pos, 1);
    else _planCycPatrolIndexes.push(abstractIdx);
    _planCycPatrolIndexes = planNormalizeIndexes(_planCycPatrolIndexes);
    const el = document.getElementById("planCycPatrolPills");
    if (el) el.innerHTML = planBuildAbstractPatrolPills(_planCycPatrolIndexes, "planCycTogglePatrol", null);
}

function planSetNumPatroli(val) {
    const n = Math.max(1, Math.min(12, parseInt(val, 10) || 2));
    _planNumPatroli = n;
    _planDraft.forEach(r => {
        planEnsureDraftShape(r);
        r.patrolIndexes = r.patrolIndexes.filter(i => i < n);
    });
    _planAddPatrolIndexes = _planAddPatrolIndexes.filter(i => i < n);
    _planCycPatrolIndexes = _planCycPatrolIndexes.filter(i => i < n);
    renderPlanSluzbyModal();
}

function planDraftUpdateTekst(idx, val) {
    if (!_planDraft[idx]) return;
    _planDraft[idx].tekst = val;
}

function planDraftUsun(idx) {
    _planDraft.splice(idx, 1);
    if (_planDraft.length) _planDraft[0].offsetMin = 0;
    renderPlanSluzbyModal();
}

function planRowMatches(row, search) {
    if (!search) return true;
    const t = `${row.Linia || ""} ${row.OpisKrotki || ""} ${row.OpisPom || ""} ${row.Opis || ""} ${row.Nazwa || ""}`.toLowerCase();
    return t.includes(String(search).toLowerCase().trim());
}

function planEscapeAttr(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function planRenderAddTilesZgl() {
    const linieEl = document.getElementById("planAddZglLinie");
    const itemsEl = document.getElementById("planAddZglItems");
    const lvl3El = document.getElementById("planAddZglLevel3");
    if (!linieEl || !itemsEl || !lvl3El) return;

    const allRows = (appState.zgloszenia?.rows || []).map((r, i) => ({ ...r, _index: i }));
    const search = _planAddTiles.zglSearch;
    let rows = search ? allRows.filter(r => planRowMatches(r, search)) : allRows;

    const lines = [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl"));
    linieEl.innerHTML = lines.map(line => {
        const hasSel = _planAddTiles.zglIndex != null && rows.some(r => (r.Linia || "(brak)") === line && r._index === _planAddTiles.zglIndex);
        let cls = "line-pill";
        if (_planAddTiles.zglLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="planAddSelectZglLine('${planEscapeAttr(line)}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:var(--text-dim);font-size:12px;'>Brak</span>";

    if (!_planAddTiles.zglLine && !search) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        return;
    }
    let filtered = rows;
    if (_planAddTiles.zglLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === _planAddTiles.zglLine);

    const krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl"));
    itemsEl.innerHTML = krotkie.map(k => {
        const hasSel = _planAddTiles.zglIndex != null && filtered.some(r => (r.OpisKrotki || "(bez opisu)") === k && r._index === _planAddTiles.zglIndex);
        let cls = "item-card";
        if (_planAddTiles.zglOpis === k) cls += " selected";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="planAddSelectZglOpis('${planEscapeAttr(k)}')">${escapeHtml(k)}</div>`;
    }).join("") || "";

    if (!_planAddTiles.zglOpis) {
        lvl3El.innerHTML = "";
        return;
    }
    const level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === _planAddTiles.zglOpis);
    lvl3El.innerHTML = level3.map(r => {
        const sel = _planAddTiles.zglIndex === r._index ? "selected" : "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 100);
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="planAddToggleZgl(${r._index})">${escapeHtml(label)}</div>`;
    }).join("") || "";
}

function planRenderAddTilesPol() {
    const linieEl = document.getElementById("planAddPolLinie");
    const itemsEl = document.getElementById("planAddPolItems");
    const lvl3El = document.getElementById("planAddPolLevel3");
    if (!linieEl || !itemsEl || !lvl3El) return;

    const allRows = (appState.polecenia?.rows || []).map((r, i) => ({ ...r, _index: i }));
    const search = _planAddTiles.polSearch;
    let rows = search ? allRows.filter(r => planRowMatches(r, search)) : allRows;

    const lines = [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl"));
    linieEl.innerHTML = lines.map(line => {
        const hasSel = _planAddTiles.polIndex != null && rows.some(r => (r.Linia || "(brak)") === line && r._index === _planAddTiles.polIndex);
        let cls = "line-pill";
        if (_planAddTiles.polLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="planAddSelectPolLine('${planEscapeAttr(line)}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:var(--text-dim);font-size:12px;'>Brak</span>";

    if (!_planAddTiles.polLine && !search) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        return;
    }
    let filtered = rows;
    if (_planAddTiles.polLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === _planAddTiles.polLine);

    const krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl"));
    itemsEl.innerHTML = krotkie.map(k => {
        const hasSel = _planAddTiles.polIndex != null && filtered.some(r => (r.OpisKrotki || "(bez opisu)") === k && r._index === _planAddTiles.polIndex);
        let cls = "item-card";
        if (_planAddTiles.polOpis === k) cls += " selected";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="planAddSelectPolOpis('${planEscapeAttr(k)}')">${escapeHtml(k)}</div>`;
    }).join("") || "";

    if (!_planAddTiles.polOpis) {
        lvl3El.innerHTML = "";
        return;
    }
    const level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === _planAddTiles.polOpis);
    lvl3El.innerHTML = level3.map(r => {
        const sel = _planAddTiles.polIndex === r._index ? "selected" : "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 100);
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="planAddTogglePol(${r._index})">${escapeHtml(label)}</div>`;
    }).join("") || "";
}

function planAddSelectZglLine(line) {
    if (_planAddTiles.zglLine === line) {
        _planAddTiles.zglLine = null;
        _planAddTiles.zglOpis = null;
    } else {
        _planAddTiles.zglLine = line;
        _planAddTiles.zglOpis = null;
    }
    planRenderAddTilesZgl();
}

function planAddSelectZglOpis(k) {
    _planAddTiles.zglOpis = (_planAddTiles.zglOpis === k) ? null : k;
    planRenderAddTilesZgl();
}

function planAddToggleZgl(i) {
    _planAddTiles.zglIndex = (_planAddTiles.zglIndex === i) ? null : i;
    planRenderAddTilesZgl();
    planUpdateAddPreviewFromTiles();
}

function planAddSelectPolLine(line) {
    if (_planAddTiles.polLine === line) {
        _planAddTiles.polLine = null;
        _planAddTiles.polOpis = null;
    } else {
        _planAddTiles.polLine = line;
        _planAddTiles.polOpis = null;
    }
    planRenderAddTilesPol();
}

function planAddSelectPolOpis(k) {
    _planAddTiles.polOpis = (_planAddTiles.polOpis === k) ? null : k;
    planRenderAddTilesPol();
}

function planAddTogglePol(i) {
    _planAddTiles.polIndex = (_planAddTiles.polIndex === i) ? null : i;
    planRenderAddTilesPol();
    planUpdateAddPreviewFromTiles();
}

/** Treść z ręki + kafelków (3 poziomy) */
function planResolveAddTekstFromTiles() {
    const manual = (document.getElementById("planAddTekst")?.value || "").trim();
    const parts = [];
    if (manual) parts.push(manual);

    if (_planAddTiles.zglIndex != null) {
        const row = appState.zgloszenia?.rows?.[_planAddTiles.zglIndex];
        if (row) {
            const t = stripHtmlPlain(row.Opis || row.OpisKrotki || "");
            if (t) parts.push(t);
        }
    }
    if (_planAddTiles.polIndex != null) {
        const row = appState.polecenia?.rows?.[_planAddTiles.polIndex];
        if (row) {
            const t = stripHtmlPlain(row.Opis || row.OpisKrotki || "");
            if (t) parts.push(t);
        }
    }
    return parts.join("\n\n");
}

function planUpdateAddPreviewFromTiles() {
    const box = document.getElementById("planAddPreview");
    if (!box) return;
    const tekst = planResolveAddTekstFromTiles();
    if (!tekst) {
        box.style.display = "none";
        box.textContent = "";
        return;
    }
    box.style.display = "block";
    box.textContent = tekst;
}

function planUpdateAddPreview(prefix) {
    // Cykl: tylko ręczna treść
    if (prefix === "Cyc") {
        const box = document.getElementById("planCycPreview");
        if (!box) return;
        const tekst = (document.getElementById("planCycTekst")?.value || "").trim();
        if (!tekst) {
            box.style.display = "none";
            box.textContent = "";
            return;
        }
        box.style.display = "block";
        box.textContent = tekst;
        return;
    }
    planUpdateAddPreviewFromTiles();
}

function planDraftDodaj() {
    const offset = _planDraft.length === 0 ? 0 : Math.max(0, parseInt(document.getElementById("planAddOffset")?.value || "0", 10) || 0);
    const patrolIndexes = planNormalizeIndexes(_planAddPatrolIndexes);
    const tekst = planResolveAddTekstFromTiles();
    if (!tekst) {
        if (typeof showToast === "function") showToast("Podaj treść ręcznie lub wybierz kafelek (zgłoszenie/polecenie)");
        else alert("Podaj treść ręcznie lub wybierz kafelek");
        return;
    }
    _planDraft.push({
        offsetMin: _planDraft.length === 0 ? 0 : offset,
        tekst,
        patrolIndexes: [...patrolIndexes]
    });
    resetPlanAddTiles();
    const ta = document.getElementById("planAddTekst");
    if (ta) ta.value = "";
    // zostaw wybrane patrole – wygodnie przy kolejnych punktach
    renderPlanSluzbyModal();
}

function planDraftDodajCykliczne() {
    const firstOff = Math.max(0, parseInt(document.getElementById("planCycOffset")?.value || "0", 10) || 0);
    const interwal = Math.max(5, parseInt(document.getElementById("planCycInterwal")?.value || "60", 10) || 60);
    const ile = Math.min(48, Math.max(1, parseInt(document.getElementById("planCycIle")?.value || "1", 10) || 1));
    const patrolIndexes = planNormalizeIndexes(_planCycPatrolIndexes);
    let tekst = (document.getElementById("planCycTekst")?.value || "").trim();
    if (!tekst) tekst = "Zgłoszenie sytuacji / lokalizacji";

    for (let i = 0; i < ile; i++) {
        const off = (_planDraft.length === 0 && i === 0) ? 0 : (i === 0 ? firstOff : interwal);
        _planDraft.push({ offsetMin: off, tekst, patrolIndexes: [...patrolIndexes] });
    }
    renderPlanSluzbyModal();
}

function planWczytajSzablon() {
    ensurePlanSzablonyState();
    const sel = document.getElementById("planSzablonSelect")?.value;
    if (sel === "" || sel == null) {
        _planDraft = [];
        _planEditTemplateId = null;
        renderPlanSluzbyModal();
        return;
    }
    const i = parseInt(sel, 10);
    const s = appState.planSzablony[i];
    if (!s) return;
    _planEditTemplateId = s.id;
    _planNumPatroli = Math.max(1, Math.min(12, Number(s.numPatroli) || 2));
    (s.rekordy || []).forEach(r => {
        const idxs = planNormalizeIndexes(r.patrolIndexes != null ? r.patrolIndexes : r.patrolIndex);
        idxs.forEach(pi => {
            if (pi + 1 > _planNumPatroli) _planNumPatroli = pi + 1;
        });
    });
    _planDraft = (s.rekordy || []).map(r => planEnsureDraftShape({
        offsetMin: Number(r.offsetMin) || 0,
        tekst: r.tekst || "",
        patrolIndexes: planNormalizeIndexes(r.patrolIndexes != null ? r.patrolIndexes : r.patrolIndex)
    }));
    if (_planDraft.length) _planDraft[0].offsetMin = 0;
    renderPlanSluzbyModal();
    if (typeof showToast === "function") showToast("Wczytano: " + (s.nazwa || "szablon"));
}

async function planZapiszJakoSzablon() {
    ensurePlanSzablonyState();
    if (!_planDraft.length) {
        if (typeof showToast === "function") showToast("Brak punktów do zapisania");
        else alert("Brak punktów do zapisania");
        return;
    }
    document.querySelectorAll(".plan-tekst").forEach(ta => {
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.value;
    });

    let nazwa = prompt("Nazwa szablonu:", "");
    if (nazwa == null) return;
    nazwa = String(nazwa).trim() || ("Szablon " + new Date().toLocaleString("pl-PL"));

    const rekordy = _planDraft.map((r, idx) => {
        planEnsureDraftShape(r);
        return {
            offsetMin: idx === 0 ? 0 : (Number(r.offsetMin) || 0),
            tekst: r.tekst || "",
            patrolIndexes: planNormalizeIndexes(r.patrolIndexes)
        };
    });

    if (_planEditTemplateId) {
        const existing = appState.planSzablony.find(s => s.id === _planEditTemplateId);
        if (existing) {
            existing.nazwa = nazwa;
            existing.rekordy = rekordy;
            existing.numPatroli = Math.max(1, Math.min(12, Number(_planNumPatroli) || 2));
            await saveState();
            if (typeof showToast === "function") showToast("✅ Zaktualizowano szablon");
            renderPlanSluzbyModal();
            return;
        }
    }

    appState.planSzablony.push({
        id: Date.now() + Math.random().toString(36).slice(2),
        nazwa,
        rekordy,
        numPatroli: Math.max(1, Math.min(12, Number(_planNumPatroli) || 2)),
        createdAt: new Date().toISOString()
    });
    await saveState();
    if (typeof showToast === "function") showToast("✅ Zapisano szablon");
    renderPlanSluzbyModal();
}

async function planUsunSzablon() {
    // legacy (select UI removed) – kept for compatibility
    ensurePlanSzablonyState();
    const sel = document.getElementById("planSzablonSelect")?.value;
    if (sel === "" || sel == null) {
        if (typeof showToast === "function") showToast("Wybierz szablon do usunięcia");
        return;
    }
    const i = parseInt(sel, 10);
    if (!appState.planSzablony[i]) return;
    if (!confirm("Usunąć szablon „" + (appState.planSzablony[i].nazwa || "") + "”?")) return;
    appState.planSzablony.splice(i, 1);
    _planEditTemplateId = null;
    await saveState();
    renderPlanSluzbyModal();
}

function planWyczyscDraft() {
    _planDraft = [];
    _planEditTemplateId = null;
    // zostaw _planNumPatroli – użytkownik sam ustawia
    renderPlanSluzbyModal();
}

function planWczytajSzablonPoIndex(i) {
    ensurePlanSzablonyState();
    const s = appState.planSzablony[i];
    if (!s) return;
    _planEditTemplateId = s.id;
    _planNumPatroli = Math.max(1, Math.min(12, Number(s.numPatroli) || 2));
    (s.rekordy || []).forEach(r => {
        const idxs = planNormalizeIndexes(r.patrolIndexes != null ? r.patrolIndexes : r.patrolIndex);
        idxs.forEach(pi => {
            if (pi + 1 > _planNumPatroli) _planNumPatroli = pi + 1;
        });
    });
    _planDraft = (s.rekordy || []).map(r => planEnsureDraftShape({
        offsetMin: Number(r.offsetMin) || 0,
        tekst: r.tekst || "",
        patrolIndexes: planNormalizeIndexes(r.patrolIndexes != null ? r.patrolIndexes : r.patrolIndex)
    }));
    if (_planDraft.length) _planDraft[0].offsetMin = 0;
    renderPlanSluzbyModal();
    if (typeof showToast === "function") showToast("Wczytano: " + (s.nazwa || "szablon"));
}

async function planUsunSzablonPoIndex(i) {
    ensurePlanSzablonyState();
    if (!appState.planSzablony[i]) return;
    if (!confirm("Usunąć szablon „" + (appState.planSzablony[i].nazwa || "") + "”?")) return;
    const removedId = appState.planSzablony[i].id;
    appState.planSzablony.splice(i, 1);
    if (_planEditTemplateId === removedId) _planEditTemplateId = null;
    await saveState();
    renderPlanSluzbyModal();
}

async function planZmienNazweSzablonu(i) {
    ensurePlanSzablonyState();
    const s = appState.planSzablony[i];
    if (!s) return;
    const nowa = prompt("Nowa nazwa szablonu:", s.nazwa || "");
    if (nowa == null) return;
    s.nazwa = String(nowa).trim() || s.nazwa;
    await saveState();
    renderPlanSluzbyModal();
}

function planBuildAbsoluteTimes(startHHMM) {
    const startMin = timeToMinutes(startHHMM);
    let acc = startMin;
    return _planDraft.map((r, idx) => {
        if (idx > 0) acc += (Number(r.offsetMin) || 0);
        planEnsureDraftShape(r);
        return {
            godzinaStart: minutesToHHMM(acc),
            tekst: r.tekst || "",
            patrole: planNormalizeIndexes(r.patrolIndexes)
        };
    });
}

function planPodglad() {
    if (!_planDraft.length) {
        if (typeof showToast === "function") showToast("Brak punktów");
        return;
    }
    document.querySelectorAll(".plan-tekst").forEach(ta => {
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.value;
    });
    const start = document.getElementById("planStartGodz")?.value || "07:00";
    const abs = planBuildAbsoluteTimes(start);

    const old = document.getElementById("planPodgladModal");
    if (old) old.remove();

    const cards = abs.map((p, i) => {
        const pn = planAbstractPatrolsLabel(p.patrole);
        const tekst = String(p.tekst || "").trim() || "—";
        return `
        <div style="background:var(--bg-input); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                <div style="font-weight:700; font-size:18px; color:var(--primary-light);">
                    ${escapeHtml(p.godzinaStart || "—")}
                </div>
                <div style="font-size:13px; color:var(--text-dim);">
                    #${i + 1} · ${escapeHtml(pn)}
                </div>
            </div>
            <div style="font-size:15px; line-height:1.5; color:var(--text-soft); white-space:pre-wrap;">${escapeHtml(tekst)}</div>
        </div>`;
    }).join("");

    const overlay = document.createElement("div");
    overlay.id = "planPodgladModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:stretch; justify-content:center; padding:12px; z-index:10050;";
    overlay.innerHTML = `
        <div class="modal" style="width:min(900px,96vw); height:min(88vh,820px); max-width:none; max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                <h2 style="margin:0;">👁 Podgląd planu</h2>
                <div style="font-size:14px; color:var(--text-dim);">
                    Start: <strong style="color:var(--text-soft);">${escapeHtml(start)}</strong>
                    · ${abs.length} pkt
                </div>
            </div>
            <p style="margin:0 0 12px 0; font-size:13px; color:var(--text-dim);">
                Tak będą wyglądały wpisy w Książce wydarzeń (godziny od startu planu).
            </p>
            <div style="flex:1; overflow:auto; min-height:0; padding-right:4px;">
                ${cards || `<div style="color:var(--text-dim);">Brak punktów</div>`}
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap; border-top:1px solid var(--border); padding-top:14px;">
                <button class="btn-primary" onclick="closePlanPodgladModal()">← Wróć</button>
                <button class="btn-success" onclick="planPodgladZatwierdz()">✓ Zatwierdź – zapisz do Książki</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closePlanPodgladModal() {
    const m = document.getElementById("planPodgladModal");
    if (m) m.remove();
    // zostajemy w panelu Planowanie służby (planSluzbyModal nadal otwarty)
}

async function planPodgladZatwierdz() {
    closePlanPodgladModal();
    await planZapiszDoKsiazki();
}

async function planZapiszDoKsiazki() {
    if (!_planDraft.length) {
        if (typeof showToast === "function") showToast("Brak punktów w planie");
        else alert("Brak punktów w planie");
        return;
    }
    document.querySelectorAll(".plan-tekst").forEach(ta => {
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.value;
    });

    const startGodz = document.getElementById("planStartGodz")?.value || "07:00";
    const abs = planBuildAbsoluteTimes(startGodz);

    // Grupy wg zestawu abstrakcyjnych patroli (np. "0,1" = Patrol 1+2)
    const groupsMap = new Map();
    abs.forEach((p, i) => {
        const key = planIndexesKey(p.patrole);
        if (!groupsMap.has(key)) {
            groupsMap.set(key, {
                key,
                oldPatrolIndexes: planNormalizeIndexes(p.patrole),
                label: planAbstractPatrolsLabel(p.patrole),
                items: []
            });
        }
        groupsMap.get(key).items.push({ ...p, _absIndex: i });
    });
    const groups = [...groupsMap.values()];

    window._planPendingAbs = abs;
    window._planPendingGroups = groups;
    window._planGroupMap = {}; // key -> number[] (prawdziwe indeksy patroli)
    window._planGroupStep = 0;
    window._planGroupMapCurrent = []; // wybór multi w bieżącym kroku

    closePlanSluzbyModal();
    planShowGroupMapStep();
}

/** Krok mapowania: jedno okno na grupę – można wybrać WIELE prawdziwych patroli */
function planShowGroupMapStep() {
    const groups = window._planPendingGroups || [];
    const step = window._planGroupStep || 0;

    if (step >= groups.length) {
        planShowDopiszNadpiszModal();
        return;
    }

    const g = groups[step];
    const old = document.getElementById("planGroupMapModal");
    if (old) old.remove();

    const patrole = appState.patrole || [];
    // domyślna podpowiedź: te same numery slotów co w planie, jeśli istnieją
    const suggested = planNormalizeIndexes(g.oldPatrolIndexes).filter(i => patrole[i]);
    window._planGroupMapCurrent = suggested.length ? [...suggested] : [];

    const list = g.items.map(it =>
        `<div style="font-size:13px; padding:6px 0; border-bottom:1px solid var(--border);">
            <strong style="color:var(--primary-light);">${escapeHtml(it.godzinaStart)}</strong>
            <div style="color:var(--text-soft); margin-top:2px; white-space:pre-wrap;">${escapeHtml(String(it.tekst || "").slice(0, 160))}${(it.tekst || "").length > 160 ? "…" : ""}</div>
        </div>`
    ).join("");

    const pills = patrole.length
        ? patrole.map((p, i) => {
            const active = window._planGroupMapCurrent.includes(i) ? "active" : "";
            return `<div class="line-pill ${active}" style="cursor:pointer;" data-pidx="${i}" onclick="planGroupMapToggleReal(${i})">${escapeHtml(p.nazwa || ("Patrol " + (i + 1)))}</div>`;
        }).join("")
        : `<span style="color:var(--text-dim);">Brak patroli w zakładce Patrole</span>`;

    const overlay = document.createElement("div");
    overlay.id = "planGroupMapModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML = `
        <div class="modal" style="max-width:620px; max-height:92vh; overflow:auto;">
            <h2 style="margin-top:0;">Patrol z planu → prawdziwe patrole</h2>
            <p style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
                Krok <strong>${step + 1}</strong> / ${groups.length}<br>
                W planie: <strong style="color:var(--text-soft);">${escapeHtml(g.label)}</strong> (${g.items.length} wpisów)<br>
                Zaznacz <strong>jeden lub więcej</strong> prawdziwych patroli (albo żadnego = bez patrolu).
            </p>
            <div style="max-height:200px; overflow:auto; margin-bottom:12px; border:1px solid var(--border); border-radius:10px; padding:10px; background:var(--bg-input);">
                ${list || "<div style='color:var(--text-dim);'>Brak wpisów</div>"}
            </div>
            <label style="font-weight:600;">Przypisz do patroli (klik = zaznacz kilka)</label>
            <div id="planGroupMapPills" class="card-grid" style="gap:8px; margin:10px 0 14px 0;">
                ${pills}
            </div>
            <div id="planGroupMapSelectedLabel" style="font-size:13px; color:var(--text-dim); margin-bottom:12px;">
                Wybrane: ${window._planGroupMapCurrent.length
                    ? window._planGroupMapCurrent.map(i => escapeHtml((patrole[i] && patrole[i].nazwa) || ("Patrol " + (i + 1)))).join(", ")
                    : "— bez patrolu —"}
            </div>
            <div class="modal-actions">
                <button class="btn-success" onclick="planGroupMapNext()">Dalej</button>
                <button class="btn-danger" onclick="planGroupMapCancel()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function planGroupMapToggleReal(realIdx) {
    if (!Array.isArray(window._planGroupMapCurrent)) window._planGroupMapCurrent = [];
    const pos = window._planGroupMapCurrent.indexOf(realIdx);
    if (pos > -1) window._planGroupMapCurrent.splice(pos, 1);
    else window._planGroupMapCurrent.push(realIdx);
    window._planGroupMapCurrent = planNormalizeIndexes(window._planGroupMapCurrent);

    const patrole = appState.patrole || [];
    document.querySelectorAll("#planGroupMapPills .line-pill").forEach(el => {
        const i = parseInt(el.getAttribute("data-pidx"), 10);
        if (window._planGroupMapCurrent.includes(i)) el.classList.add("active");
        else el.classList.remove("active");
    });
    const lab = document.getElementById("planGroupMapSelectedLabel");
    if (lab) {
        lab.textContent = "Wybrane: " + (window._planGroupMapCurrent.length
            ? window._planGroupMapCurrent.map(i => (patrole[i] && patrole[i].nazwa) || ("Patrol " + (i + 1))).join(", ")
            : "— bez patrolu —");
    }
}

function planGroupMapNext() {
    const groups = window._planPendingGroups || [];
    const step = window._planGroupStep || 0;
    const g = groups[step];
    if (!g) {
        planShowDopiszNadpiszModal();
        return;
    }
    window._planGroupMap[g.key] = planNormalizeIndexes(window._planGroupMapCurrent || []);

    const m = document.getElementById("planGroupMapModal");
    if (m) m.remove();

    window._planGroupStep = step + 1;
    window._planGroupMapCurrent = [];
    planShowGroupMapStep();
}

function planGroupMapCancel() {
    const m = document.getElementById("planGroupMapModal");
    if (m) m.remove();
    window._planPendingAbs = null;
    window._planPendingGroups = null;
    window._planGroupMap = null;
    window._planGroupStep = 0;
}

/** Kafelki: Dopisz / Nadpisz */
function planShowDopiszNadpiszModal() {
    ensureKsiazkaState();
    const hasAny = (appState.ksiazkaWydarzen || []).length > 0;

    if (!hasAny) {
        planFinalizeWriteToKsiazka("dopisz");
        return;
    }

    const old = document.getElementById("planDopiszModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "planDopiszModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML = `
        <div class="modal" style="max-width:480px;">
            <h2 style="margin-top:0;">Jak zapisać plan?</h2>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:16px;">
                W Książce są już wpisy. Wybierz jedną opcję:
            </p>
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:18px;">
                <div id="planTileDopisz" onclick="planSelectWriteMode('dopisz')"
                     style="flex:1; min-width:140px; cursor:pointer; border:2px solid #22c55e; background:rgba(34,197,94,0.12);
                            border-radius:12px; padding:16px; text-align:center;">
                    <div style="font-size:22px; margin-bottom:6px;">➕</div>
                    <div style="font-weight:700; font-size:16px;">Dopisz</div>
                    <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Dodaj plan do istniejących wpisów</div>
                </div>
                <div id="planTileNadpisz" onclick="planSelectWriteMode('nadpisz')"
                     style="flex:1; min-width:140px; cursor:pointer; border:2px solid #475569; background:rgba(71,85,105,0.2);
                            border-radius:12px; padding:16px; text-align:center; opacity:0.75;">
                    <div style="font-size:22px; margin-bottom:6px;">♻️</div>
                    <div style="font-weight:700; font-size:16px;">Nadpisz</div>
                    <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Usuń całą książkę i wstaw plan</div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-success" onclick="planConfirmWriteMode()">Zatwierdź</button>
                <button class="btn-danger" onclick="planCancelWriteMode()">Anuluj</button>
            </div>
        </div>
    `;
    overlay._writeMode = "dopisz";
    document.body.appendChild(overlay);
}

function planSelectWriteMode(mode) {
    const modal = document.getElementById("planDopiszModal");
    if (!modal) return;
    modal._writeMode = mode;
    const d = document.getElementById("planTileDopisz");
    const n = document.getElementById("planTileNadpisz");
    if (mode === "dopisz") {
        if (d) { d.style.borderColor = "#22c55e"; d.style.background = "rgba(34,197,94,0.12)"; d.style.opacity = "1"; }
        if (n) { n.style.borderColor = "#475569"; n.style.background = "rgba(71,85,105,0.2)"; n.style.opacity = "0.75"; }
    } else {
        if (n) { n.style.borderColor = "#ef4444"; n.style.background = "rgba(239,68,68,0.15)"; n.style.opacity = "1"; }
        if (d) { d.style.borderColor = "#475569"; d.style.background = "rgba(71,85,105,0.2)"; d.style.opacity = "0.75"; }
    }
}

function planCancelWriteMode() {
    const m = document.getElementById("planDopiszModal");
    if (m) m.remove();
    planGroupMapCancel();
}

function planConfirmWriteMode() {
    const modal = document.getElementById("planDopiszModal");
    const mode = (modal && modal._writeMode) || "dopisz";
    if (modal) modal.remove();
    planFinalizeWriteToKsiazka(mode);
}

/** Podmiana znaczników @KZ, @dowodca, @patrol… wg patrolu */
function planApplyTagsToText(tekst, patrolIndexes) {
    const idxs = Array.isArray(patrolIndexes) ? patrolIndexes : [];
    if (typeof buildReplacementsForPatrols === "function" && typeof applyTags === "function") {
        const rep = buildReplacementsForPatrols(idxs);
        // godzina/data z kontekstu wpisu – nadpisz jeśli podane później
        return applyTags(tekst, rep);
    }
    // fallback minimalny
    let out = String(tekst || "");
    const kz = appState.kz || "";
    const mkk = appState.mkk || "";
    out = out.replace(/@KZ\b/gi, kz).replace(/@MKK\b/gi, mkk);
    out = out.replace(/@data\b/gi, todayPL()).replace(/@godzina\b/gi, nowHHMM());
    return out;
}

async function planFinalizeWriteToKsiazka(mode) {
    ensureKsiazkaState();
    const abs = window._planPendingAbs || [];
    const groupMap = window._planGroupMap || {};
    if (!abs.length) return;

    if (mode === "nadpisz") {
        appState.ksiazkaWydarzen = [];
    }

    abs.forEach(p => {
        const key = planIndexesKey(p.patrole);
        let patrolIndexes = [];
        if (groupMap.hasOwnProperty(key)) {
            patrolIndexes = planNormalizeIndexes(groupMap[key]);
        } else {
            // fallback: stare mapowanie single lub same abstrakcyjne indeksy
            patrolIndexes = planNormalizeIndexes(p.patrole);
        }

        const data = resolveDataForGodzina(p.godzinaStart);
        let tekst = planApplyTagsToText(p.tekst || "", patrolIndexes);
        tekst = tekst.replace(/@godzina\b/gi, p.godzinaStart || nowHHMM());
        tekst = tekst.replace(/@data\b/gi, data);
        tekst = capitalizeSentencesHtmlKs(tekst);

        appState.ksiazkaWydarzen.push({
            id: Date.now() + Math.random().toString(36).slice(2),
            data: data,
            godzinaStart: p.godzinaStart,
            tekst: tekst,
            patrole: patrolIndexes,
            zrobione: false,
            createdAt: new Date().toISOString(),
            zPlanu: true
        });
    });

    await saveState();
    planGroupMapCancel();
    if (typeof showToast === "function") {
        showToast("✅ Zapisano plan (" + abs.length + " pkt, " + mode + ")");
    } else {
        alert("Zapisano plan: " + abs.length + " punktów");
    }
    if (document.getElementById("ksiazkaContainer")) renderKsiazka();
}

// -------------------------------------
// Zapisz książkę jako szablon (grupowanie patroli)
// -------------------------------------
// -------------------------------------
// Zapisz książkę jako szablon (grupowanie patroli)
// -------------------------------------

function openZapiszKsiazkeJakoSzablon() {
    ensureKsiazkaState();
    ensurePlanSzablonyState();
    const entries = sortEntriesOldestFirst(appState.ksiazkaWydarzen || []);
    if (!entries.length) {
        if (typeof showToast === "function") showToast("Książka jest pusta");
        else alert("Książka jest pusta");
        return;
    }

    // Grupy wg klucza patrolu (posortowane indeksy albo "none")
    const groupsMap = new Map();
    entries.forEach(e => {
        const pats = Array.isArray(e.patrole) ? [...e.patrole].map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b) : [];
        const key = pats.length ? pats.join(",") : "none";
        if (!groupsMap.has(key)) {
            groupsMap.set(key, {
                key,
                oldIndexes: pats,
                label: pats.length ? pats.map(i => getPatrolName(i)).join(", ") : "Bez patrolu",
                entries: []
            });
        }
        groupsMap.get(key).entries.push(e);
    });

    const groups = [...groupsMap.values()];

    const old = document.getElementById("planSaveTplModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "planSaveTplModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay._groups = groups;
    overlay._allEntries = entries;

    const patrole = appState.patrole || [];
    const patrolOpts = `<option value="">— bez patrolu —</option>` +
        patrole.map((p, i) => `<option value="${i}">${escapeHtml(p.nazwa || ("Patrol " + (i + 1)))}</option>`).join("");

    const groupsHtml = groups.map((g, gi) => {
        const list = g.entries.map(e =>
            `<div style="font-size:12px; color:#94a3b8; padding:2px 0;">${escapeHtml(e.godzinaStart || "—")} · ${escapeHtml(String(e.tekst || "").slice(0, 80))}</div>`
        ).join("");
        const defaultSel = g.key === "none" ? "" : (g.oldIndexes[0] != null ? String(g.oldIndexes[0]) : "");
        return `
        <div style="border:1px solid #334155; border-radius:10px; padding:12px; margin-bottom:10px;">
            <div style="font-weight:600; margin-bottom:6px;">Grupa ${gi + 1}: ${escapeHtml(g.label)} <span style="color:#94a3b8; font-weight:500;">(${g.entries.length} wpisów)</span></div>
            <div style="max-height:100px; overflow:auto; margin-bottom:8px;">${list}</div>
            <label style="font-size:12px;">Przypisz do aktualnego patrolu</label>
            <select class="plan-group-map" data-gkey="${escapeHtml(g.key)}" style="width:100%;">
                ${patrolOpts.replace(`value="${defaultSel}"`, `value="${defaultSel}" selected`)}
            </select>
        </div>`;
    }).join("");

    overlay.innerHTML = `
        <div class="modal" style="max-width:600px; max-height:92vh; overflow:auto;">
            <h2 style="margin-top:0;">💾 Zapisz książkę jako szablon</h2>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:12px;">
                Wpisy pogrupowane według patroli z książki. Przypisz każdą grupę do <strong>aktualnego</strong> patrolu
                (nazwy mogły się zmienić). Offsety liczone od poprzedniego wpisu w kolejności czasu.
            </p>
            <div style="margin-bottom:12px;">
                <label>Nazwa szablonu</label>
                <input type="text" id="planSaveTplNazwa" value="Służba ${escapeHtml(todayPL())}" style="width:100%;">
            </div>
            ${groupsHtml}
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmZapiszKsiazkeJakoSzablon()">Zapisz szablon</button>
                <button class="btn-danger" onclick="closeZapiszKsiazkeJakoSzablon()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // fix selected options (replace trick may fail) – set via JS
    groups.forEach(g => {
        const sel = overlay.querySelector(`.plan-group-map[data-gkey="${g.key}"]`);
        if (!sel) return;
        if (g.key === "none") sel.value = "";
        else if (g.oldIndexes[0] != null) sel.value = String(g.oldIndexes[0]);
    });
}

function closeZapiszKsiazkeJakoSzablon() {
    const m = document.getElementById("planSaveTplModal");
    if (m) m.remove();
}

async function confirmZapiszKsiazkeJakoSzablon() {
    const modal = document.getElementById("planSaveTplModal");
    if (!modal) return;
    const entries = modal._allEntries || [];
    if (!entries.length) return;

    // map group key -> patrolIndex|null
    const map = {};
    modal.querySelectorAll(".plan-group-map").forEach(sel => {
        const k = sel.getAttribute("data-gkey");
        const v = sel.value;
        map[k] = (v === "" || v == null) ? null : parseInt(v, 10);
    });

    const rekordy = [];
    let prevMin = null;
    entries.forEach((e, idx) => {
        const pats = Array.isArray(e.patrole) ? [...e.patrole].map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b) : [];
        const key = pats.length ? pats.join(",") : "none";
        const patrolIndex = map.hasOwnProperty(key) ? map[key] : null;

        const curMin = timeToMinutes(e.godzinaStart || "00:00");
        let offsetMin = 0;
        if (idx === 0) {
            offsetMin = 0;
        } else {
            // różnica od poprzedniego; obsługa przejścia przez północ
            let diff = curMin - prevMin;
            if (diff < 0) diff += 24 * 60;
            offsetMin = diff;
        }
        prevMin = curMin;

        rekordy.push({
            offsetMin,
            tekst: e.tekst || "",
            patrolIndex
        });
    });

    const nazwa = (document.getElementById("planSaveTplNazwa")?.value || "").trim() || ("Służba " + todayPL());
    ensurePlanSzablonyState();
    appState.planSzablony.push({
        id: Date.now() + Math.random().toString(36).slice(2),
        nazwa,
        rekordy,
        createdAt: new Date().toISOString(),
        zKsiazki: true
    });
    await saveState();
    closeZapiszKsiazkeJakoSzablon();
    if (typeof showToast === "function") showToast("✅ Zapisano szablon „" + nazwa + "” (" + rekordy.length + " pkt)");
    else alert("Zapisano szablon: " + nazwa);
}

// =====================================
// EKSPORT FILTROWANEJ LISTY (godzina + opis → schowek)
// =====================================

function getKsiazkaFilteredEntries() {
    ensureKsiazkaState();
    const allEntries = (typeof sortEntriesOldestFirst === "function")
        ? sortEntriesOldestFirst(appState.ksiazkaWydarzen)
        : [...(appState.ksiazkaWydarzen || [])];

    if (ksiazkaFilterInne) {
        return allEntries.filter(e => !e.patrole || e.patrole.length === 0);
    }
    if (ksiazkaFilterPatrole.length > 0) {
        return allEntries.filter(e =>
            (e.patrole || []).some(p => ksiazkaFilterPatrole.includes(p))
        );
    }
    return allEntries;
}

async function exportKsiazkaFiltered() {
    const entries = getKsiazkaFilteredEntries();
    if (!entries.length) {
        if (typeof showToast === "function") showToast("Brak wpisów do eksportu");
        else alert("Brak wpisów do eksportu");
        return;
    }

    // Format: _data_ *godzina* \n opis (bez czarnych kropek/punktorów)
    // _…_ = kursywa, *…* = pogrubienie w WhatsApp
    const blocks = entries.map(e => {
        const data = String(e.data || "").trim() || "—";
        const godz = String(e.godzinaStart || "—").trim();
        let tekst = String(e.tekst || "");
        // HTML → zwykły tekst
        if (/<[^>]+>/.test(tekst)) {
            const tmp = document.createElement("div");
            tmp.innerHTML = tekst;
            tekst = tmp.innerText || tmp.textContent || "";
        }
        tekst = tekst
            .replace(/\r\n/g, "\n")
            // usuń typowe czarne kropki / punktory
            .replace(/[•·●▪▫○◦‣⁃∙]/g, "")
            .replace(/^\s*[-*–—]\s+/gm, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        return "_" + data + "_ *" + godz + "*\n" + tekst;
    });

    const text = blocks.join("\n\n");

    try {
        await navigator.clipboard.writeText(text);
        if (typeof showToast === "function") {
            showToast("✅ Skopiowano " + entries.length + " wpisów");
        } else {
            alert("Skopiowano " + entries.length + " wpisów");
        }
    } catch (err) {
        prompt("Skopiuj ręcznie (Ctrl+C):", text);
    }
}

// =====================================
// SPRAWDZENIE
// 1) lista wpisów z książki – kliknięcie odznacza/zaznacza (domyślnie wszystkie zaznaczone)
// 2) Dalej → okno zbiorcze z godzinami
//    (linia / nazwa / km pobrane z pasującego polecenia Szlak|towarowa|osobowa)
// =====================================

const SPRAWDZENIE_RODZAJE = ["Szlak", "Stacja towarowa", "Stacja osobowa"];

function getPoleceniaSprawdzenie() {
    const rows = appState.polecenia?.rows || [];
    return rows
        .map((r, i) => ({ ...r, _index: i }))
        .filter(r => r && SPRAWDZENIE_RODZAJE.includes(r.Rodzaj));
}

function entryMatchesPolecenieSprawdzenie(entry, pol) {
    const t = String(entry.tekst || "").toLowerCase();
    if (!t) return false;
    const keys = [pol.Nazwa, pol.OpisKrotki, pol.Opis, pol.NazwaSzlaku]
        .map(x => String(x || "").trim())
        .filter(x => x.length >= 3);
    return keys.some(k => t.includes(k.toLowerCase()));
}

function getKsiazkaWpisyDoSprawdzenia() {
    ensureKsiazkaState();
    const pols = getPoleceniaSprawdzenie();
    if (!pols.length) return [];
    const entries = (typeof sortEntriesOldestFirst === "function")
        ? sortEntriesOldestFirst(appState.ksiazkaWydarzen)
        : [...(appState.ksiazkaWydarzen || [])];
    return entries.filter(e => pols.some(p => entryMatchesPolecenieSprawdzenie(e, p)));
}

/** Dla wpisu zwraca pierwsze pasujące polecenie (Szlak / towarowa / osobowa) */
function findMatchingPolecenieForEntry(entry) {
    const pols = getPoleceniaSprawdzenie();
    return pols.find(p => entryMatchesPolecenieSprawdzenie(entry, p)) || null;
}

/** Czy wpis z książki ma już zapisane sprawdzenie w statystykach */
function isEntryAlreadyInSprawdzenia(entry) {
    if (!entry) return false;
    if (typeof ensureStatystykiState === "function") ensureStatystykiState();
    else {
        if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
        if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
    }
    const stats = appState.statystyki.sprawdzenia || [];

    // 1) po entryId (nowe zapisy)
    if (entry.id && stats.some(s => s.entryId && String(s.entryId) === String(entry.id))) {
        return true;
    }

    // 2) heurystyka: data + godzina + nazwa z pasującego polecenia
    const pol = findMatchingPolecenieForEntry(entry);
    if (!pol) return false;
    const nazwa = String(pol.Nazwa || pol.OpisKrotki || "").trim().toLowerCase();
    const rodzaj = String(pol.Rodzaj || "").trim().toLowerCase();
    const data = String(entry.data || "").trim();
    const godz = String(entry.godzinaStart || "").trim();

    return stats.some(s => {
        if (s.entryId && entry.id && String(s.entryId) === String(entry.id)) return true;
        const sn = String(s.nazwa || "").trim().toLowerCase();
        const sr = String(s.rodzaj || "").trim().toLowerCase();
        const sd = String(s.data || "").trim();
        const sg = String(s.godzOd || "").trim();
        if (nazwa && sn && sn === nazwa && sr === rodzaj) {
            if (data && sd && data === sd) {
                // ta sama data + (ta sama godzina startu albo brak godziny)
                if (!godz || !sg || godz === sg) return true;
            }
        }
        return false;
    });
}

function openKsiazkaSprawdzenieModal() {
    const items = getKsiazkaWpisyDoSprawdzenia();
    if (items.length === 0) {
        if (typeof showToast === "function") {
            showToast("Brak wpisów powiązanych z Szlak / Stacja towarowa / Stacja osobowa");
        } else {
            alert("Brak wpisów powiązanych z Szlak / Stacja towarowa / Stacja osobowa");
        }
        return;
    }

    const old = document.getElementById("ksiazkaSprawdModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaSprawdModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    // domyślnie zaznaczone TYLKO te, które NIE są jeszcze w statystykach
    const selected = new Set();
    items.forEach(e => {
        const idx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
        if (idx < 0) return;
        if (!isEntryAlreadyInSprawdzenia(e)) selected.add(idx);
    });
    overlay._selectedEntryIndexes = selected;

    const list = items.map(e => {
        const idx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
        const short = String(e.tekst || "").replace(/<[^>]+>/g, " ").slice(0, 120);
        const pol = findMatchingPolecenieForEntry(e);
        const polLabel = pol
            ? `${escapeHtml(pol.Rodzaj)} – ${escapeHtml(pol.Nazwa || pol.OpisKrotki || "")}`
            : "—";
        const already = isEntryAlreadyInSprawdzenia(e);
        const isSel = selected.has(idx);
        const border = isSel ? "#22c55e" : "#475569";
        const bg = isSel ? "rgba(34, 197, 94, 0.12)" : "rgba(71, 85, 105, 0.25)";
        const opacity = isSel ? "1" : "0.65";
        const badge = already
            ? `<span style="position:absolute; top:8px; right:8px; background:#16a34a; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px;">✓ Zrobione</span>`
            : "";
        return `
        <div id="ksiazkaSprawdEntry_${idx}"
             class="ksiazka-sprawd-entry ${isSel ? "selected" : ""}"
             data-index="${idx}"
             data-already="${already ? "1" : "0"}"
             onclick="ksiazkaSprawdzenieToggleEntry(${idx})"
             style="
                position: relative;
                border: 2px solid ${border};
                background: ${bg};
                border-radius: 10px;
                padding: 10px;
                margin-bottom: 8px;
                cursor: pointer;
                opacity: ${opacity};
                transition: border-color 0.15s, background 0.15s, opacity 0.15s;
             ">
            ${badge}
            <div style="font-weight:600; color:var(--primary-light); padding-right:${already ? "90px" : "0"};">${escapeHtml(e.godzinaStart || "—")} · ${escapeHtml(e.data || "")}</div>
            <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">${polLabel}</div>
            <div style="font-size:13px; color:var(--text-soft); margin-top:4px; white-space:pre-wrap;">${escapeHtml(short)}${(e.tekst || "").length > 120 ? "…" : ""}</div>
        </div>`;
    }).join("");

    const doneCount = items.filter(e => isEntryAlreadyInSprawdzenia(e)).length;
    const todoCount = items.length - doneCount;

    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <h2 style="margin-top:0;">Sprawdzenie – wybierz wpisy</h2>
            <p style="color:var(--text-dim); font-size:14px; margin-bottom:12px;">
                Kliknij wpis, aby zaznaczyć / odznaczyć.
                <strong>Zielone</strong> = zaznaczone do zapisu.
                Wpisane już w statystykach mają znacznik <strong>✓ Zrobione</strong> i nie są automatycznie zaznaczone
                (${todoCount} do zrobienia, ${doneCount} już w statystykach).
            </p>
            <div style="margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn-primary" style="padding:6px 12px; font-size:13px;" onclick="ksiazkaSprawdzenieZaznaczWszystkie(true)">Zaznacz wszystkie</button>
                <button type="button" class="btn-primary" style="padding:6px 12px; font-size:13px;" onclick="ksiazkaSprawdzenieZaznaczWszystkie(false)">Odznacz wszystkie</button>
                <button type="button" class="btn-primary" style="padding:6px 12px; font-size:13px;" onclick="ksiazkaSprawdzenieZaznaczTylkoNowe()">Tylko niezrobione</button>
            </div>
            <div style="max-height:360px; overflow:auto; margin-bottom:14px;">${list}</div>
            <div class="modal-actions">
                <button class="btn-success" onclick="ksiazkaSprawdzenieDalej()">Dalej – godziny</button>
                <button class="btn-danger" onclick="closeKsiazkaSprawdzenieModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function ksiazkaSprawdzenieZaznaczTylkoNowe() {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;
    if (!modal._selectedEntryIndexes) modal._selectedEntryIndexes = new Set();
    modal._selectedEntryIndexes.clear();

    document.querySelectorAll(".ksiazka-sprawd-entry").forEach(el => {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        const already = el.getAttribute("data-already") === "1";
        if (!already) {
            modal._selectedEntryIndexes.add(idx);
            el.classList.add("selected");
            el.style.borderColor = "#22c55e";
            el.style.background = "rgba(34, 197, 94, 0.12)";
            el.style.opacity = "1";
        } else {
            el.classList.remove("selected");
            el.style.borderColor = "#475569";
            el.style.background = "rgba(71, 85, 105, 0.25)";
            el.style.opacity = "0.65";
        }
    });
}

function closeKsiazkaSprawdzenieModal() {
    const m = document.getElementById("ksiazkaSprawdModal");
    if (m) m.remove();
}

function ksiazkaSprawdzenieToggleEntry(idx) {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal || !modal._selectedEntryIndexes) return;
    const set = modal._selectedEntryIndexes;
    const el = document.getElementById(`ksiazkaSprawdEntry_${idx}`);
    if (!el) return;

    if (set.has(idx)) {
        set.delete(idx);
        el.classList.remove("selected");
        el.style.borderColor = "#475569";
        el.style.background = "rgba(71, 85, 105, 0.25)";
        el.style.opacity = "0.65";
    } else {
        set.add(idx);
        el.classList.add("selected");
        el.style.borderColor = "#22c55e";
        el.style.background = "rgba(34, 197, 94, 0.12)";
        el.style.opacity = "1";
    }
}

function ksiazkaSprawdzenieZaznaczWszystkie(zaznacz) {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;
    if (!modal._selectedEntryIndexes) modal._selectedEntryIndexes = new Set();

    document.querySelectorAll(".ksiazka-sprawd-entry").forEach(el => {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        if (zaznacz) {
            modal._selectedEntryIndexes.add(idx);
            el.classList.add("selected");
            el.style.borderColor = "#22c55e";
            el.style.background = "rgba(34, 197, 94, 0.12)";
            el.style.opacity = "1";
        } else {
            modal._selectedEntryIndexes.delete(idx);
            el.classList.remove("selected");
            el.style.borderColor = "#475569";
            el.style.background = "rgba(71, 85, 105, 0.25)";
            el.style.opacity = "0.65";
        }
    });
}

function ksiazkaSprawdzenieDalej() {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;

    const selected = modal._selectedEntryIndexes
        ? [...modal._selectedEntryIndexes]
        : [];
    if (!selected.length) {
        if (typeof showToast === "function") showToast("Zaznacz przynajmniej jeden wpis");
        else alert("Zaznacz przynajmniej jeden wpis");
        return;
    }

    ensureKsiazkaState();
    const items = [];
    for (const idx of selected) {
        const entry = appState.ksiazkaWydarzen[idx];
        if (!entry) continue;
        const pol = findMatchingPolecenieForEntry(entry);
        if (!pol) continue;
        items.push({
            Rodzaj: pol.Rodzaj,
            Nazwa: pol.Nazwa || pol.OpisKrotki || "",
            Linia: pol.Linia || "",
            KmOd: pol.KmOd || "",
            KmDo: pol.KmDo || "",
            _entryIndex: idx,
            _entryGodzina: entry.godzinaStart || ""
        });
    }

    if (!items.length) {
        if (typeof showToast === "function") showToast("Nie znaleziono pasujących poleceń do zaznaczonych wpisów");
        else alert("Nie znaleziono pasujących poleceń do zaznaczonych wpisów");
        return;
    }

    closeKsiazkaSprawdzenieModal();

    const startRounded = (typeof formatHHMM === "function" && typeof roundTo10Minutes === "function")
        ? formatHHMM(roundTo10Minutes(new Date()))
        : nowHHMM();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaSprawdModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay._items = items;

    let body = items.map((it, i) => {
        const startVal = it._entryGodzina || startRounded;
        const endVal = (typeof addHoursHHMM === "function")
            ? addHoursHHMM(startVal, 2)
            : startVal;
        return `
        <div style="border:1px solid #334155; border-radius:10px; padding:12px; margin-bottom:12px;">
            <div style="font-weight:600; margin-bottom:8px;">${escapeHtml(it.Rodzaj)} – ${escapeHtml(it.Nazwa)}</div>
            <div style="font-size:13px; color:#94a3b8; margin-bottom:8px;">
                Linia: ${escapeHtml(it.Linia)} | Km: ${escapeHtml(it.KmOd)} – ${escapeHtml(it.KmDo)}
            </div>
            <label>Godzina rozpoczęcia</label>
            <input type="text" id="ksSprawdGodzOd_${i}" value="${escapeHtml(startVal)}" placeholder="gg:mm"
                   style="width:100%; margin-bottom:8px;"
                   oninput="ksiazkaSprawdGodzOdChange(${i})">
            <label>Szacunkowa godzina zakończenia (+2h, edytowalna)</label>
            <input type="text" id="ksSprawdGodzDo_${i}" value="${escapeHtml(endVal)}" placeholder="gg:mm" style="width:100%;">
        </div>`;
    }).join("");

    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <h2 style="margin-top:0;">Zaloguj sprawdzenie</h2>
            <p style="color:#94a3b8; font-size:14px;">
                Okno zbiorcze – dane (linia, nazwa, km) pobrane z polecenia.
                Uzupełnij tylko godziny.
            </p>
            ${body}
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmKsiazkaSprawdzenie()">Zapisz do statystyk</button>
                <button class="btn-danger" onclick="closeKsiazkaSprawdzenieModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function ksiazkaSprawdGodzOdChange(idx) {
    const odEl = document.getElementById(`ksSprawdGodzOd_${idx}`);
    const doEl = document.getElementById(`ksSprawdGodzDo_${idx}`);
    if (!odEl || !doEl) return;
    if (typeof parseHHMM !== "function" || typeof addHoursHHMM !== "function" || typeof formatHHMM !== "function") return;
    const parsed = parseHHMM(odEl.value);
    if (!parsed) return;
    doEl.value = addHoursHHMM(formatHHMM(parsed), 2);
}

async function confirmKsiazkaSprawdzenie() {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;
    const items = modal._items || [];
    if (!items.length) return;

    for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const godzOd = (document.getElementById(`ksSprawdGodzOd_${idx}`)?.value || "").trim();
        const godzDo = (document.getElementById(`ksSprawdGodzDo_${idx}`)?.value || "").trim();
        if (!godzOd || !godzDo) {
            if (typeof showToast === "function") showToast("Uzupełnij godziny (gg:mm)");
            else alert("Uzupełnij godziny (gg:mm)");
            return;
        }
        const entry = (it._entryIndex != null) ? appState.ksiazkaWydarzen[it._entryIndex] : null;
        const entryId = entry?.id || null;
        const entryData = entry?.data || todayPL();

        if (typeof logSprawdzenie === "function") {
            await logSprawdzenie({
                rodzaj: it.Rodzaj,
                nazwa: it.Nazwa || "",
                linia: it.Linia || "",
                kmOd: it.KmOd || "",
                kmDo: it.KmDo || "",
                godzOd,
                godzDo,
                entryId,
                data: entryData
            });
            // dopisz entryId jeśli logSprawdzenie go nie zapisuje
            const last = appState.statystyki?.sprawdzenia?.slice(-1)[0];
            if (last && entryId && !last.entryId) {
                last.entryId = entryId;
                if (!last.data) last.data = entryData;
            }
        } else {
            if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
            if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
            appState.statystyki.sprawdzenia.push({
                rodzaj: it.Rodzaj,
                nazwa: it.Nazwa || "",
                linia: it.Linia || "",
                kmOd: it.KmOd || "",
                kmDo: it.KmDo || "",
                godzOd,
                godzDo,
                data: entryData,
                entryId,
                createdAt: new Date().toISOString()
            });
        }
    }

    await saveState();
    closeKsiazkaSprawdzenieModal();
    if (typeof showToast === "function") showToast("✅ Zapisano sprawdzenia w statystykach");
    else alert("Zapisano sprawdzenia w statystykach");
}

// =====================================
// UWAGI – wybór wpisu → dodaje na końcu (nie nadpisuje) + edycja
// =====================================

function openKsiazkaUwagiPicker() {
    ensureKsiazkaState();
    const entries = sortEntriesOldestFirst(appState.ksiazkaWydarzen);
    if (!entries.length) {
        if (typeof showToast === "function") showToast("Brak wpisów w książce");
        else alert("Brak wpisów w książce");
        return;
    }

    const old = document.getElementById("ksiazkaUwagiPicker");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaUwagiPicker";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    const list = entries.map(e => {
        const idx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
        const short = String(e.tekst || "").slice(0, 80);
        return `
        <div style="border:1px solid #334155; border-radius:10px; padding:10px; margin-bottom:8px; cursor:pointer;"
             onclick="ksiazkaUwagiWybrano(${idx})">
            <div style="font-weight:600; color:#60a5fa;">${escapeHtml(e.godzinaStart || "—")} · ${escapeHtml(e.data || "")}</div>
            <div style="font-size:13px; color:#e2e8f0; margin-top:4px; white-space:pre-wrap;">${escapeHtml(short)}${(e.tekst || "").length > 80 ? "…" : ""}</div>
        </div>`;
    }).join("");

    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <h2 style="margin-top:0;">Uwagi – wybierz wpis</h2>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:12px;">
                Szablon uwagi zostanie <strong>dopisany na końcu</strong> wybranego wpisu (możesz edytować przed zapisem).
            </p>
            <div style="max-height:360px; overflow:auto;">${list}</div>
            <div class="modal-actions">
                <button class="btn-danger" onclick="closeKsiazkaUwagiPicker()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeKsiazkaUwagiPicker() {
    const m = document.getElementById("ksiazkaUwagiPicker");
    if (m) m.remove();
}

function ksiazkaUwagiWybrano(index) {
    closeKsiazkaUwagiPicker();
    window._ksiazkaUwagiEditIndex = index;
    ensureKsiazkaState();
    const entry = appState.ksiazkaWydarzen[index];
    if (!entry) return;

    if (typeof ensureUwagiState === "function") ensureUwagiState();

    const sz = (appState.uwagiSzablony) || {
        "MKK": "Przeprowadzono kontrolę dokumentów. MKK: @MKK.",
        "Pouczony": "Osoba została pouczona o obowiązujących przepisach.",
        "Legitymowany": "Dokonywano legitymowania osób. Sprawdzono tożsamość.",
        "Inne": ""
    };

    const old = document.getElementById("ksiazkaUwagiEditModal");
    if (old) old.remove();

    const types = Object.keys(sz).map(t => {
        const safe = JSON.stringify(sz[t] || "");
        return `<div class="line-pill" style="cursor:pointer;" onclick='ksiazkaUwagiDodajSzablon(${safe})'>${escapeHtml(t)}</div>`;
    }).join("");

    const base = String(entry.tekst || "");

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaUwagiEditModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML = `
        <div class="modal" style="max-width:640px;">
            <h2 style="margin-top:0;">Uwagi do wpisu</h2>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:10px;">
                Kliknij szablon (MKK / Pouczony / …) – dopisze się na końcu. Możesz też edytować ręcznie.
            </p>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">${types}</div>
            <label>Treść wpisu (edycja)</label>
            <textarea id="ksUwagiTekst" rows="10" style="width:100%; margin-bottom:14px; font-size:14px; line-height:1.45;">${escapeHtml(base)}</textarea>
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmKsiazkaUwagi()">Zapisz do wpisu</button>
                <button class="btn-danger" onclick="closeKsiazkaUwagiEditModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function ksiazkaUwagiDodajSzablon(tekstSzablonu) {
    const ta = document.getElementById("ksUwagiTekst");
    if (!ta) return;
    const add = String(tekstSzablonu || "").trim();
    if (!add) return;
    const cur = ta.value || "";
    if (cur.trim()) {
        ta.value = cur.replace(/\s*$/, "") + "\n\n" + add;
    } else {
        ta.value = add;
    }
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
}

function closeKsiazkaUwagiEditModal() {
    const m = document.getElementById("ksiazkaUwagiEditModal");
    if (m) m.remove();
}

async function confirmKsiazkaUwagi() {
    const index = window._ksiazkaUwagiEditIndex;
    if (index == null || !appState.ksiazkaWydarzen[index]) return;

    const tekst = (document.getElementById("ksUwagiTekst")?.value || "");
    appState.ksiazkaWydarzen[index].tekst = tekst;
    await saveState();
    closeKsiazkaUwagiEditModal();
    renderKsiazka();
    if (typeof showToast === "function") showToast("✅ Zapisano uwagi do wpisu");
}

// =====================================
// DODAJ WPIS – mini-generator w modalu
// (zapis NIE zamyka okna – można dodać wiele wpisów)
// =====================================

const ksiazkaAdd = {
    patrole: [],
    zglIndexes: [],
    polIndexes: [],
    zglLine: null,
    polLine: null,
    zglOpis: null,
    polOpis: null,
    zglSearch: "",
    polSearch: ""
};

function resetKsiazkaAddState() {
    ksiazkaAdd.patrole = [];
    ksiazkaAdd.zglIndexes = [];
    ksiazkaAdd.polIndexes = [];
    ksiazkaAdd.zglLine = null;
    ksiazkaAdd.polLine = null;
    ksiazkaAdd.zglOpis = null;
    ksiazkaAdd.polOpis = null;
    ksiazkaAdd.zglSearch = "";
    ksiazkaAdd.polSearch = "";
}

function openKsiazkaAddModal() {
    ensureKsiazkaState();
    resetKsiazkaAddState();

    const old = document.getElementById("ksiazkaAddModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaAddModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:stretch; justify-content:center; padding:12px;";
    overlay.innerHTML = `
        <div class="modal" style="width:min(1100px,96vw); height:min(90vh,900px); max-width:none; max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                <h2 style="margin:0;">➕ Dodaj wpis do Książki wydarzeń</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <label style="font-size:13px; color:#94a3b8;">Godzina</label>
                    <input type="time" id="ksAddGodzina" value="${escapeHtml(nowHHMM())}" style="width:130px;">
                    <button class="btn-success" onclick="ksiazkaAddZapisz()">💾 Zapisz</button>
                    <button class="btn-danger" onclick="closeKsiazkaAddModal()">Zamknij</button>
                </div>
            </div>
            <p style="margin:0 0 10px 0; font-size:13px; color:#94a3b8;">
                Wybierz patrole, zgłoszenia i polecenia – podgląd odświeża się na żywo. Możesz edytować tekst. <strong>Zapisz</strong> dodaje wpis i zostawia okno otwarte (kolejne wpisy). <strong>Zamknij</strong> zamyka okno.
            </p>
            <div style="flex:1; overflow:auto; display:flex; flex-direction:column; gap:12px; min-height:0;">
                <div>
                    <div style="font-weight:600; margin-bottom:6px; font-size:14px;">Patrole</div>
                    <div id="ksAddPatrole" class="card-grid" style="gap:6px;"></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                    <div>
                        <div style="font-weight:600; margin-bottom:6px; font-size:14px;">Zgłoszenia</div>
                        <input type="text" id="ksAddZglSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:8px;"
                               oninput="ksiazkaAdd.zglSearch=this.value; ksiazkaAddRenderZgl();">
                        <div id="ksAddZglLinie" class="card-grid" style="gap:6px; margin-bottom:8px;"></div>
                        <div id="ksAddZglItems" class="card-grid" style="gap:6px; margin-bottom:8px;"></div>
                        <div id="ksAddZglLevel3" class="card-grid" style="gap:6px;"></div>
                    </div>
                    <div>
                        <div style="font-weight:600; margin-bottom:6px; font-size:14px;">Polecenia</div>
                        <input type="text" id="ksAddPolSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:8px;"
                               oninput="ksiazkaAdd.polSearch=this.value; ksiazkaAddRenderPol();">
                        <div id="ksAddPolLinie" class="card-grid" style="gap:6px; margin-bottom:8px;"></div>
                        <div id="ksAddPolItems" class="card-grid" style="gap:6px; margin-bottom:8px;"></div>
                        <div id="ksAddPolLevel3" class="card-grid" style="gap:6px;"></div>
                    </div>
                </div>
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="font-weight:600; font-size:14px;">Podgląd wpisu (edytowalny)</div>
                        <button class="btn-primary" style="padding:4px 10px; font-size:12px;" onclick="ksiazkaAddWyczyscWybor()">Wyczyść wybór</button>
                    </div>
                    <div id="ksAddPreview" contenteditable="true"
                         style="min-height:140px; max-height:220px; overflow:auto; background:#0f172a; border:1px solid #334155; border-radius:10px; padding:12px; font-size:14px; line-height:1.45; color:#e2e8f0; white-space:pre-wrap;"></div>
                </div>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
                <button class="btn-success" onclick="ksiazkaAddZapisz()">💾 Zapisz do książki</button>
                <button class="btn-danger" onclick="closeKsiazkaAddModal()">Zamknij okno</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // responsywność: na wąskim ekranie 1 kolumna
    const style = document.createElement("style");
    style.textContent = `@media (max-width:800px){ #ksiazkaAddModal .modal > div[style*="grid-template-columns"]{ grid-template-columns:1fr !important; } }`;
    overlay.appendChild(style);

    ksiazkaAddRenderAll();
}

function closeKsiazkaAddModal() {
    const m = document.getElementById("ksiazkaAddModal");
    if (m) m.remove();
    resetKsiazkaAddState();
}

function ksiazkaAddRenderAll() {
    ksiazkaAddRenderPatrole();
    ksiazkaAddRenderZgl();
    ksiazkaAddRenderPol();
    ksiazkaAddUpdatePreview();
}

function ksiazkaAddRenderPatrole() {
    const el = document.getElementById("ksAddPatrole");
    if (!el) return;
    const list = appState.patrole || [];
    if (!list.length) {
        el.innerHTML = "<span style='color:#64748b; font-size:13px;'>Brak patroli</span>";
        return;
    }
    el.innerHTML = list.map((p, i) => {
        const active = ksiazkaAdd.patrole.includes(i) ? "active" : "";
        return `<div class="line-pill ${active}" style="cursor:pointer;" onclick="ksiazkaAddTogglePatrol(${i})">${escapeHtml(p.nazwa || ("Patrol " + (i + 1)))}</div>`;
    }).join("");
}

function ksiazkaAddTogglePatrol(i) {
    const pos = ksiazkaAdd.patrole.indexOf(i);
    if (pos > -1) ksiazkaAdd.patrole.splice(pos, 1);
    else ksiazkaAdd.patrole.push(i);
    ksiazkaAddRenderPatrole();
    ksiazkaAddUpdatePreview();
}

function ksiazkaAddRowMatches(row, search) {
    if (!search) return true;
    const t = `${row.Linia || ""} ${row.OpisKrotki || ""} ${row.OpisPom || ""} ${row.Opis || ""} ${row.Nazwa || ""} ${row.NazwaSzlaku || ""} ${row.KmOd || ""} ${row.KmDo || ""} ${row.Km || ""} ${row.Rodzaj || ""}`.toLowerCase();
    return t.includes(String(search).toLowerCase().trim());
}

function ksiazkaAddRenderZgl() {
    const linieEl = document.getElementById("ksAddZglLinie");
    const itemsEl = document.getElementById("ksAddZglItems");
    const lvl3El = document.getElementById("ksAddZglLevel3");
    if (!linieEl || !itemsEl || !lvl3El) return;

    const allRows = (appState.zgloszenia?.rows || []).map((r, i) => ({ ...r, _index: i }));
    const search = ksiazkaAdd.zglSearch;
    let rows = search ? allRows.filter(r => ksiazkaAddRowMatches(r, search)) : allRows;

    const lines = [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl"));
    linieEl.innerHTML = lines.map(line => {
        const hasSel = rows.some(r => (r.Linia || "(brak)") === line && ksiazkaAdd.zglIndexes.includes(r._index));
        let cls = "line-pill";
        if (ksiazkaAdd.zglLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="ksiazkaAddSelectZglLine('${String(line).replace(/'/g, "\\'")}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:#64748b;font-size:13px;'>Brak</span>";

    if (!ksiazkaAdd.zglLine && !search) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        return;
    }

    let filtered = rows;
    if (ksiazkaAdd.zglLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === ksiazkaAdd.zglLine);

    const krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl"));
    itemsEl.innerHTML = krotkie.map(k => {
        const hasSel = filtered.some(r => (r.OpisKrotki || "(bez opisu)") === k && ksiazkaAdd.zglIndexes.includes(r._index));
        let cls = "item-card";
        if (ksiazkaAdd.zglOpis === k) cls += " selected";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="ksiazkaAddSelectZglOpis('${String(k).replace(/'/g, "\\'")}')">${escapeHtml(k)}</div>`;
    }).join("") || "";

    if (!ksiazkaAdd.zglOpis) {
        lvl3El.innerHTML = "";
        return;
    }

    const level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === ksiazkaAdd.zglOpis);
    lvl3El.innerHTML = level3.map(r => {
        const sel = ksiazkaAdd.zglIndexes.includes(r._index) ? "selected" : "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 120);
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="ksiazkaAddToggleZgl(${r._index})">${escapeHtml(label)}</div>`;
    }).join("") || "";
}

function ksiazkaAddSelectZglLine(line) {
    if (ksiazkaAdd.zglLine === line) {
        ksiazkaAdd.zglLine = null;
        ksiazkaAdd.zglOpis = null;
    } else {
        ksiazkaAdd.zglLine = line;
        ksiazkaAdd.zglOpis = null;
    }
    ksiazkaAddRenderZgl();
}

function ksiazkaAddSelectZglOpis(k) {
    ksiazkaAdd.zglOpis = (ksiazkaAdd.zglOpis === k) ? null : k;
    ksiazkaAddRenderZgl();
}

function ksiazkaAddToggleZgl(i) {
    const pos = ksiazkaAdd.zglIndexes.indexOf(i);
    if (pos > -1) ksiazkaAdd.zglIndexes.splice(pos, 1);
    else ksiazkaAdd.zglIndexes.push(i);
    ksiazkaAddRenderZgl();
    ksiazkaAddUpdatePreview();
}

function ksiazkaAddRenderPol() {
    const linieEl = document.getElementById("ksAddPolLinie");
    const itemsEl = document.getElementById("ksAddPolItems");
    const lvl3El = document.getElementById("ksAddPolLevel3");
    if (!linieEl || !itemsEl || !lvl3El) return;

    const allRows = (appState.polecenia?.rows || []).map((r, i) => ({ ...r, _index: i }));
    const search = ksiazkaAdd.polSearch;
    let rows = search ? allRows.filter(r => ksiazkaAddRowMatches(r, search)) : allRows;

    const lines = [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl"));
    linieEl.innerHTML = lines.map(line => {
        const hasSel = rows.some(r => (r.Linia || "(brak)") === line && ksiazkaAdd.polIndexes.includes(r._index));
        let cls = "line-pill";
        if (ksiazkaAdd.polLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="ksiazkaAddSelectPolLine('${String(line).replace(/'/g, "\\'")}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:#64748b;font-size:13px;'>Brak</span>";

    if (!ksiazkaAdd.polLine && !search) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        return;
    }

    let filtered = rows;
    if (ksiazkaAdd.polLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === ksiazkaAdd.polLine);

    const krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl"));
    itemsEl.innerHTML = krotkie.map(k => {
        const hasSel = filtered.some(r => (r.OpisKrotki || "(bez opisu)") === k && ksiazkaAdd.polIndexes.includes(r._index));
        let cls = "item-card";
        if (ksiazkaAdd.polOpis === k) cls += " selected";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="ksiazkaAddSelectPolOpis('${String(k).replace(/'/g, "\\'")}')">${escapeHtml(k)}</div>`;
    }).join("") || "";

    if (!ksiazkaAdd.polOpis) {
        lvl3El.innerHTML = "";
        return;
    }

    const level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === ksiazkaAdd.polOpis);
    lvl3El.innerHTML = level3.map(r => {
        const sel = ksiazkaAdd.polIndexes.includes(r._index) ? "selected" : "";
        const label = (r.OpisPom || r.Opis || "(brak)").substring(0, 120);
        return `<div class="item-card ${sel}" style="cursor:pointer;" onclick="ksiazkaAddTogglePol(${r._index})">${escapeHtml(label)}</div>`;
    }).join("") || "";
}

function ksiazkaAddSelectPolLine(line) {
    if (ksiazkaAdd.polLine === line) {
        ksiazkaAdd.polLine = null;
        ksiazkaAdd.polOpis = null;
    } else {
        ksiazkaAdd.polLine = line;
        ksiazkaAdd.polOpis = null;
    }
    ksiazkaAddRenderPol();
}

function ksiazkaAddSelectPolOpis(k) {
    ksiazkaAdd.polOpis = (ksiazkaAdd.polOpis === k) ? null : k;
    ksiazkaAddRenderPol();
}

function ksiazkaAddTogglePol(i) {
    const pos = ksiazkaAdd.polIndexes.indexOf(i);
    if (pos > -1) ksiazkaAdd.polIndexes.splice(pos, 1);
    else ksiazkaAdd.polIndexes.push(i);
    ksiazkaAddRenderPol();
    ksiazkaAddUpdatePreview();
}

function ksiazkaAddWyczyscWybor() {
    ksiazkaAdd.zglIndexes = [];
    ksiazkaAdd.polIndexes = [];
    ksiazkaAdd.zglOpis = null;
    ksiazkaAdd.polOpis = null;
    const prev = document.getElementById("ksAddPreview");
    if (prev) prev.innerHTML = "";
    ksiazkaAddRenderZgl();
    ksiazkaAddRenderPol();
}

/** Buduje tekst z wybranych kafelków – używa logiki generatora (tagi @patrol itd.) */
function ksiazkaAddBuildTekstHtml() {
    const parts = [];
    const prevPatrols = (typeof selectedPatrols !== "undefined") ? [...selectedPatrols] : null;
    const prevAssign = (typeof patrolAssignments !== "undefined") ? patrolAssignments : null;

    try {
        if (typeof selectedPatrols !== "undefined") selectedPatrols = [...ksiazkaAdd.patrole];
        if (typeof patrolAssignments !== "undefined") patrolAssignments = {};

        const handle = (indexes, rows) => {
            indexes.forEach(i => {
                const t = rows?.[i]?.Opis;
                if (!t) return;
                let text = t;
                if (typeof applyTextWithPatrolOccurrences === "function") {
                    text = applyTextWithPatrolOccurrences(t, typeof buildSequentialOccurrenceList === "function" ? buildSequentialOccurrenceList(t) : null);
                }
                parts.push(String(text).trim());
            });
        };

        handle(ksiazkaAdd.zglIndexes, appState.zgloszenia?.rows);
        handle(ksiazkaAdd.polIndexes, appState.polecenia?.rows);
    } finally {
        if (prevPatrols && typeof selectedPatrols !== "undefined") selectedPatrols = prevPatrols;
        if (prevAssign !== null && typeof patrolAssignments !== "undefined") patrolAssignments = prevAssign;
    }

    const items = parts.filter(Boolean);
    if (!items.length) return "";

    // Bez kropek w książce – same linie
    const plain = items.join("\n");
    if (typeof plainTextToHtml === "function") {
        // plainTextToHtml dodaje bullet-y – usuwamy je później przez formatKsiazkaTekstHtml
        return plainTextToHtml(plain);
    }
    return escapeHtml(plain).replace(/\n/g, "<br>");
}

function ksiazkaAddUpdatePreview() {
    const el = document.getElementById("ksAddPreview");
    if (!el) return;
    // Nie nadpisuj, jeśli użytkownik właśnie edytuje ręcznie i nie ma zaznaczonych kafelków
    const html = ksiazkaAddBuildTekstHtml();
    if (html) {
        el.innerHTML = formatKsiazkaTekstHtml(html);
    } else if (!ksiazkaAdd.zglIndexes.length && !ksiazkaAdd.polIndexes.length) {
        // zostaw ręczną edycję, chyba że pusto po wyczyszczeniu
        if (!(el.innerText || "").trim()) el.innerHTML = "";
    }
}

function ksiazkaAddGetPreviewContent() {
    const el = document.getElementById("ksAddPreview");
    if (!el) return "";
    // Preferuj HTML (styl), bez kropek
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".entry-bullet").forEach(n => n.remove());
    let html = clone.innerHTML || "";
    html = html.replace(/(^|<br\s*\/?>)\s*[•·]\s*/gi, "$1");
    if (html.trim()) return html.trim();
    return stripBulletsPlain(el.innerText || "");
}

async function ksiazkaAddZapisz() {
    ensureKsiazkaState();

    const tekst = ksiazkaAddGetPreviewContent();
    if (!tekst || !String(tekst).replace(/<[^>]+>/g, "").trim()) {
        if (typeof showToast === "function") showToast("Brak treści wpisu");
        else alert("Brak treści wpisu – wybierz kafelki lub wpisz tekst");
        return;
    }

    const godzStart = document.getElementById("ksAddGodzina")?.value || nowHHMM();
    const parts = parseTimeParts(godzStart);
    let dataWpisu = todayPL();
    if (parts) {
        const now = new Date();
        const currentHour = now.getHours();
        if (currentHour >= 18 && parts.h < 12) {
            dataWpisu = tomorrowPL();
        }
    }

    appState.ksiazkaWydarzen.push({
        id: Date.now() + Math.random().toString(36).slice(2),
        data: dataWpisu,
        godzinaStart: godzStart,
        tekst: capitalizeSentencesHtmlKs(tekst),
        patrole: [...ksiazkaAdd.patrole],
        zrobione: false,
        createdAt: new Date().toISOString()
    });

    await saveState();
    renderKsiazka();

    // Zostaw okno otwarte – wyczyść tylko treść/wybór kafelków, patrole i godzinę zostaw
    ksiazkaAdd.zglIndexes = [];
    ksiazkaAdd.polIndexes = [];
    ksiazkaAdd.zglOpis = null;
    ksiazkaAdd.polOpis = null;
    const prev = document.getElementById("ksAddPreview");
    if (prev) prev.innerHTML = "";
    ksiazkaAddRenderZgl();
    ksiazkaAddRenderPol();

    if (typeof showToast === "function") showToast("✅ Zapisano – możesz dodać kolejny");
    else alert("Zapisano – możesz dodać kolejny");
}

// =====================================
// EXPOSE
// =====================================
window.initKsiazka = initKsiazka;
window.renderKsiazka = renderKsiazka;
window.openKsiazkaSaveModal = openKsiazkaSaveModal;
window.closeKsiazkaSaveModal = closeKsiazkaSaveModal;
window.confirmSaveToKsiazka = confirmSaveToKsiazka;
window.toggleKsiazkaFilter = toggleKsiazkaFilter;
window.clearKsiazkaFilter = clearKsiazkaFilter;
window.oznaczZrobione = oznaczZrobione;
window.odznaczZrobione = odznaczZrobione;
window.usunWpisKsiazki = usunWpisKsiazki;
window.clearAllKsiazka = clearAllKsiazka;
window.kopiujWpisKsiazki = kopiujWpisKsiazki;
window.edytujWpisKsiazki = edytujWpisKsiazki;
window.insertTileToEdit = insertTileToEdit;
window.replaceAllFromTile = replaceAllFromTile;
window.closeKsiazkaEditModal = closeKsiazkaEditModal;
window.confirmEditKsiazka = confirmEditKsiazka;
window.openPlanSluzbyModal = openPlanSluzbyModal;
window.closePlanSluzbyModal = closePlanSluzbyModal;
window.renderPlanSluzbyModal = renderPlanSluzbyModal;
window.planDraftUpdateOffset = planDraftUpdateOffset;
window.planDraftUpdatePatrol = planDraftUpdatePatrol;
window.planDraftTogglePatrol = planDraftTogglePatrol;
window.planAddTogglePatrol = planAddTogglePatrol;
window.planCycTogglePatrol = planCycTogglePatrol;
window.planGroupMapToggleReal = planGroupMapToggleReal;
window.planDraftUpdateTekst = planDraftUpdateTekst;
window.planDraftUsun = planDraftUsun;
window.planDraftDodaj = planDraftDodaj;
window.planDraftDodajCykliczne = planDraftDodajCykliczne;
window.planWczytajSzablon = planWczytajSzablon;
window.planZapiszJakoSzablon = planZapiszJakoSzablon;
window.planUsunSzablon = planUsunSzablon;
window.planPodglad = planPodglad;
window.planZapiszDoKsiazki = planZapiszDoKsiazki;
window.planShowGroupMapStep = planShowGroupMapStep;
window.planGroupMapNext = planGroupMapNext;
window.planWyczyscDraft = planWyczyscDraft;
window.planWczytajSzablonPoIndex = planWczytajSzablonPoIndex;
window.planUsunSzablonPoIndex = planUsunSzablonPoIndex;
window.planZmienNazweSzablonu = planZmienNazweSzablonu;
window.planUpdateAddPreview = planUpdateAddPreview;
window.planSetNumPatroli = planSetNumPatroli;
window.planAbstractPatrolName = planAbstractPatrolName;
window.planBuildAbstractPatrolOpts = planBuildAbstractPatrolOpts;

window.planGroupMapCancel = planGroupMapCancel;
window.planShowDopiszNadpiszModal = planShowDopiszNadpiszModal;
window.planSelectWriteMode = planSelectWriteMode;
window.planCancelWriteMode = planCancelWriteMode;
window.planConfirmWriteMode = planConfirmWriteMode;
window.planFinalizeWriteToKsiazka = planFinalizeWriteToKsiazka;
window.planApplyTagsToText = planApplyTagsToText;
window.openZapiszKsiazkeJakoSzablon = openZapiszKsiazkeJakoSzablon;
window.closeZapiszKsiazkeJakoSzablon = closeZapiszKsiazkeJakoSzablon;
window.confirmZapiszKsiazkeJakoSzablon = confirmZapiszKsiazkeJakoSzablon;
window.toggleKsiazkaFilterInne = toggleKsiazkaFilterInne;
window.exportKsiazkaFiltered = exportKsiazkaFiltered;
window.openKsiazkaSprawdzenieModal = openKsiazkaSprawdzenieModal;
window.closeKsiazkaSprawdzenieModal = closeKsiazkaSprawdzenieModal;
window.ksiazkaSprawdzenieToggleEntry = ksiazkaSprawdzenieToggleEntry;
window.ksiazkaSprawdzenieZaznaczWszystkie = ksiazkaSprawdzenieZaznaczWszystkie;
window.ksiazkaSprawdzenieZaznaczTylkoNowe = ksiazkaSprawdzenieZaznaczTylkoNowe;
window.ksiazkaSprawdzenieDalej = ksiazkaSprawdzenieDalej;
window.planRenderAddTilesZgl = planRenderAddTilesZgl;
window.planRenderAddTilesPol = planRenderAddTilesPol;
window.planAddSelectZglLine = planAddSelectZglLine;
window.planAddSelectZglOpis = planAddSelectZglOpis;
window.planAddToggleZgl = planAddToggleZgl;
window.planAddSelectPolLine = planAddSelectPolLine;
window.planAddSelectPolOpis = planAddSelectPolOpis;
window.planAddTogglePol = planAddTogglePol;
window.planUpdateAddPreviewFromTiles = planUpdateAddPreviewFromTiles;
window.closePlanPodgladModal = closePlanPodgladModal;
window.planPodgladZatwierdz = planPodgladZatwierdz;
window.ksiazkaSprawdGodzOdChange = ksiazkaSprawdGodzOdChange;
window.confirmKsiazkaSprawdzenie = confirmKsiazkaSprawdzenie;
window.openKsiazkaUwagiPicker = openKsiazkaUwagiPicker;
window.closeKsiazkaUwagiPicker = closeKsiazkaUwagiPicker;
window.ksiazkaUwagiWybrano = ksiazkaUwagiWybrano;
window.ksiazkaUwagiDodajSzablon = ksiazkaUwagiDodajSzablon;
window.closeKsiazkaUwagiEditModal = closeKsiazkaUwagiEditModal;
window.confirmKsiazkaUwagi = confirmKsiazkaUwagi;

window.openKsiazkaAddModal = openKsiazkaAddModal;
window.closeKsiazkaAddModal = closeKsiazkaAddModal;
window.ksiazkaAddTogglePatrol = ksiazkaAddTogglePatrol;
window.ksiazkaAddSelectZglLine = ksiazkaAddSelectZglLine;
window.ksiazkaAddSelectZglOpis = ksiazkaAddSelectZglOpis;
window.ksiazkaAddToggleZgl = ksiazkaAddToggleZgl;
window.ksiazkaAddSelectPolLine = ksiazkaAddSelectPolLine;
window.ksiazkaAddSelectPolOpis = ksiazkaAddSelectPolOpis;
window.ksiazkaAddTogglePol = ksiazkaAddTogglePol;
window.ksiazkaAddWyczyscWybor = ksiazkaAddWyczyscWybor;
window.ksiazkaAddZapisz = ksiazkaAddZapisz;
window.ksiazkaAddRenderZgl = ksiazkaAddRenderZgl;
window.ksiazkaAddRenderPol = ksiazkaAddRenderPol;
