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

/** Duża litera na początku i po kropce (NIE po dwukropku). */
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
    let firstDone = false;
    return raw.replace(/(^|>)([^<]*)/g, (full, boundary, text) => {
        if (!text) return full;
        let t = text.replace(/([.!?…]+["»”']?)([ \t\n\r]+)([a-ząćęłńóśźż])/gi, (_, punct, sp, ch) =>
            punct + sp + ch.toLocaleUpperCase("pl-PL")
        );
        t = t.replace(/([\n\r]+)([ \t]*)([a-ząćęłńóśźż])/gi, (_, br, sp, ch) =>
            br + sp + ch.toLocaleUpperCase("pl-PL")
        );
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
// MODAL PO GENERUJ WPIS
// Zwykły: 1 godzina | Procedura: start + koniec (2 wpisy)
// =====================================

/** Wykryj wybraną procedurę (start+koniec tego samego procedureId) */
function detectSelectedProcedurePair() {
    const idxs = (typeof selectedZgloszeniaIndexes !== "undefined" && Array.isArray(selectedZgloszeniaIndexes))
        ? selectedZgloszeniaIndexes
        : [];
    const rows = appState.zgloszenia?.rows || [];
    const selected = idxs.map(i => ({ i, row: rows[i] })).filter(x => x.row);

    // Oba końce tej samej procedury zaznaczone
    const starts = selected.filter(x => x.row.procedureRole === "start" && x.row.procedureId);
    for (const s of starts) {
        const end = selected.find(x =>
            x.row.procedureRole === "end" && x.row.procedureId === s.row.procedureId
        );
        if (end) {
            return {
                procedureId: s.row.procedureId,
                startIndex: s.i,
                endIndex: end.i,
                startRow: s.row,
                endRow: end.row
            };
        }
    }
    // Tylko start zaznaczony → dociągnij koniec z bazy
    for (const s of starts) {
        const endIdx = rows.findIndex(r =>
            r.procedureId === s.row.procedureId && r.procedureRole === "end"
        );
        if (endIdx >= 0) {
            return {
                procedureId: s.row.procedureId,
                startIndex: s.i,
                endIndex: endIdx,
                startRow: s.row,
                endRow: rows[endIdx]
            };
        }
    }
    // Tylko koniec → dociągnij start
    const ends = selected.filter(x => x.row.procedureRole === "end" && x.row.procedureId);
    for (const e of ends) {
        const startIdx = rows.findIndex(r =>
            r.procedureId === e.row.procedureId && r.procedureRole === "start"
        );
        if (startIdx >= 0) {
            return {
                procedureId: e.row.procedureId,
                startIndex: startIdx,
                endIndex: e.i,
                startRow: rows[startIdx],
                endRow: e.row
            };
        }
    }
    return null;
}

function buildTekstFromZglIndex(index) {
    const row = appState.zgloszenia?.rows?.[index];
    if (!row?.Opis) return "";
    // Użyj logiki generatora jeśli dostępna
    if (typeof applyTextWithPatrolOccurrences === "function" && typeof getOccurrenceListForKey === "function") {
        const key = "zgl_" + index;
        let text = applyTextWithPatrolOccurrences(row.Opis, getOccurrenceListForKey(key, row.Opis));
        if (typeof selectedWybrani !== "undefined" && selectedWybrani.length > 0 && typeof forceOneLine === "function") {
            text = text.replace(/@wybrani/gi, forceOneLine(selectedWybrani));
        }
        return text;
    }
    return row.Opis;
}

function resolveKsiazkaDataForTime(godz) {
    const parts = parseTimeParts(godz);
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

function openKsiazkaSaveModal(tekst, patrolIndexes) {
    ensureKsiazkaState();

    const old = document.getElementById("ksiazkaSaveModal");
    if (old) old.remove();

    const now = nowHHMM();
    const patrolNames = (patrolIndexes || []).map(i => getPatrolName(i)).join(", ") || "Brak patrolu";
    const pair = detectSelectedProcedurePair();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaSaveModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    if (pair) {
        const tekstStart = buildTekstFromZglIndex(pair.startIndex) || tekst;
        const tekstKoniec = buildTekstFromZglIndex(pair.endIndex) || "";
        const nazwa = pair.startRow.OpisKrotki || pair.endRow.OpisKrotki || "Procedura";

        overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <h2 style="margin-top:0;">Zapisz procedurę do książki</h2>
            <p style="color:var(--text-dim); font-size:14px; margin-bottom:12px;">
                Patrol: <strong>${escapeHtml(patrolNames)}</strong><br>
                Procedura: <strong>${escapeHtml(nazwa)}</strong> — dwa wpisy (start + koniec)
            </p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                <div>
                    <label>▶ Godzina rozpoczęcia</label>
                    <input type="time" id="ksiazkaGodzStart" value="${now}" style="width:100%;">
                </div>
                <div>
                    <label>■ Godzina zakończenia</label>
                    <input type="time" id="ksiazkaGodzKoniec" value="${now}" style="width:100%;">
                </div>
            </div>
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">
                Po 18:00 godziny 0:00–11:59 → następny dzień (noc).
            </div>
            <div style="margin-bottom:10px;">
                <label>Podgląd start</label>
                <div style="background:var(--bg-input); border:1px solid var(--border); border-radius:10px; padding:10px; max-height:100px; overflow:auto; font-size:12px; white-space:pre-wrap; color:var(--text);">
${formatKsiazkaTekstHtml(tekstStart)}
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <label>Podgląd koniec</label>
                <div style="background:var(--bg-input); border:1px solid var(--border); border-radius:10px; padding:10px; max-height:100px; overflow:auto; font-size:12px; white-space:pre-wrap; color:var(--text);">
${formatKsiazkaTekstHtml(tekstKoniec)}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmSaveToKsiazka()">Zapisz oba wpisy</button>
                <button class="btn-danger" onclick="closeKsiazkaSaveModal()">Anuluj</button>
            </div>
        </div>`;

        overlay._procedure = true;
        overlay._tekstStart = tekstStart;
        overlay._tekstKoniec = tekstKoniec;
        overlay._procedureId = pair.procedureId;
        overlay._tekst = tekst;
    } else {
        overlay.innerHTML = `
        <div class="modal" style="max-width:480px;">
            <h2 style="margin-top:0;">Zapisz do Książki wydarzeń</h2>
            <p style="color:var(--text-dim); font-size:14px; margin-bottom:16px;">
                Patrol: <strong>${escapeHtml(patrolNames)}</strong>
            </p>
            <div style="margin-bottom:14px;">
                <label>Godzina rozpoczęcia</label>
                <input type="time" id="ksiazkaGodzStart" value="${now}" style="width:100%;">
                <div style="font-size:12px; color:var(--text-dim); margin-top:6px;">
                    Po 18:00 godziny 0:00–11:59 → następny dzień (noc).
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <label>Podgląd wpisu</label>
                <div style="background:var(--bg-input); border:1px solid var(--border); border-radius:10px; padding:12px; max-height:160px; overflow:auto; font-size:13px; white-space:pre-wrap; color:var(--text);">
${formatKsiazkaTekstHtml(tekst)}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmSaveToKsiazka()">Zapisz</button>
                <button class="btn-danger" onclick="closeKsiazkaSaveModal()">Anuluj</button>
            </div>
        </div>`;
        overlay._procedure = false;
        overlay._tekst = tekst;
    }

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

    const patrolIndexes = modal._patrolIndexes || [];
    ensureKsiazkaState();

    if (modal._procedure) {
        const godzStart = document.getElementById("ksiazkaGodzStart")?.value || nowHHMM();
        const godzKoniec = document.getElementById("ksiazkaGodzKoniec")?.value || godzStart;
        const procId = modal._procedureId || null;
        const base = Date.now();

        appState.ksiazkaWydarzen.push({
            id: base + "-s",
            data: resolveKsiazkaDataForTime(godzStart),
            godzinaStart: godzStart,
            tekst: capitalizeSentencesHtmlKs(modal._tekstStart || ""),
            patrole: [...patrolIndexes],
            zrobione: false,
            procedureId: procId,
            procedureRole: "start",
            createdAt: new Date().toISOString()
        });
        appState.ksiazkaWydarzen.push({
            id: base + "-e",
            data: resolveKsiazkaDataForTime(godzKoniec),
            godzinaStart: godzKoniec,
            tekst: capitalizeSentencesHtmlKs(modal._tekstKoniec || ""),
            patrole: [...patrolIndexes],
            zrobione: false,
            procedureId: procId,
            procedureRole: "end",
            createdAt: new Date().toISOString()
        });

        await saveState();
        closeKsiazkaSaveModal();
        if (typeof showToast === "function") {
            showToast("✅ Zapisano procedurę (start + koniec)");
        }
        return;
    }

    const tekst = modal._tekst || "";
    const godzStart = document.getElementById("ksiazkaGodzStart")?.value || nowHHMM();

    appState.ksiazkaWydarzen.push({
        id: Date.now() + Math.random().toString(36).slice(2),
        data: resolveKsiazkaDataForTime(godzStart),
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
let ksiazkaInterwencjeMode = false; // tryb Interwencje (MKK / P / L / Inne)

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

    setupKsiazkaShortcuts();
}

/** Skróty tylko w zakładce Książka: D = dodaj, S = sprawdzenie, E = eksport */

/** Zamyka najwyższe (najbardziej „wewnętrzne”) otwarte okno książki. Zwraca true jeśli coś zamknięto. */
function ksiazkaCloseTopModal() {
    const stack = [
        { id: "planPodgladModal", close: () => typeof closePlanPodgladModal === "function" && closePlanPodgladModal() },
        { id: "planDopiszModal", close: () => { const m = document.getElementById("planDopiszModal"); if (m) m.remove(); } },
        { id: "zapiszKsiazkeJakoSzablonModal", close: () => typeof closeZapiszKsiazkeJakoSzablon === "function" && closeZapiszKsiazkeJakoSzablon() },
        { id: "ksiazkaUwagiEditModal", close: () => typeof closeKsiazkaUwagiEditModal === "function" && closeKsiazkaUwagiEditModal() },
        { id: "ksiazkaUwagiPicker", close: () => typeof closeKsiazkaUwagiPicker === "function" && closeKsiazkaUwagiPicker() },
        { id: "ksiazkaSprawdModal", close: () => typeof closeKsiazkaSprawdzenieModal === "function" && closeKsiazkaSprawdzenieModal() },
        { id: "ksiazkaEditModal", close: () => typeof closeKsiazkaEditModal === "function" && closeKsiazkaEditModal() },
        { id: "ksiazkaSaveModal", close: () => typeof closeKsiazkaSaveModal === "function" && closeKsiazkaSaveModal() },
        { id: "ksiazkaAddModal", close: () => typeof closeKsiazkaAddModal === "function" && closeKsiazkaAddModal() },
        { id: "planSluzbyModal", close: () => typeof closePlanSluzbyModal === "function" && closePlanSluzbyModal() }
    ];
    for (const item of stack) {
        if (document.getElementById(item.id)) {
            try { item.close(); } catch (err) { console.warn(err); }
            return true;
        }
    }
    // fallback: dowolny overlay książki
    const any = document.querySelector(".modal-overlay");
    if (any && document.getElementById("ksiazkaContainer")) {
        any.remove();
        return true;
    }
    return false;
}

function setupKsiazkaShortcuts() {
    if (window._ksiazkaKeyHandler) {
        document.removeEventListener("keydown", window._ksiazkaKeyHandler);
    }
    window._ksiazkaKeyHandler = function (e) {
        // tylko gdy widoczna książka
        if (!document.getElementById("ksiazkaContainer")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // ESC zamyka otwarte okno (działa też w polach tekstowych)
        if (e.key === "Escape" || e.key === "Esc") {
            if (ksiazkaCloseTopModal()) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        // D / S / E – nie w polach tekstowych / edytorach
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.target && e.target.isContentEditable) return;

        const key = (e.key || "").toLowerCase();
        if (key === "d") {
            e.preventDefault();
            if (typeof openKsiazkaAddModal === "function") openKsiazkaAddModal();
        } else if (key === "s") {
            e.preventDefault();
            if (typeof openKsiazkaSprawdzenieModal === "function") openKsiazkaSprawdzenieModal();
        } else if (key === "e") {
            e.preventDefault();
            if (typeof exportKsiazkaFiltered === "function") exportKsiazkaFiltered();
        } else if (key === "i") {
            e.preventDefault();
            if (typeof toggleKsiazkaInterwencjeMode === "function") toggleKsiazkaInterwencjeMode();
        }
    };
    document.addEventListener("keydown", window._ksiazkaKeyHandler);
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
                <button class="btn-success" onclick="openKsiazkaAddModal()">➕ Dodaj wpis <span style="opacity:.7;font-size:11px;">(D)</span></button>
                <button class="btn-primary" onclick="openPlanSluzbyModal()">📋 Planowanie</button>
                <button class="btn-primary" onclick="openZapiszKsiazkeJakoSzablon()">💾 Zapisz książkę jako szablon</button>
                <button class="btn-primary" id="ksiazkaInterwencjeBtn"
                    style="${ksiazkaInterwencjeMode ? "background:#dc2626;border-color:#dc2626;" : ""}"
                    onclick="toggleKsiazkaInterwencjeMode()">
                    ${ksiazkaInterwencjeMode ? "Interwencje ON" : "Interwencje"} <span style="opacity:.7;font-size:11px;">(I)</span>
                </button>
                <button class="btn-success" onclick="openKsiazkaSprawdzenieModal()">Sprawdzenie <span style="opacity:.7;font-size:11px;">(S)</span></button>
                <button class="btn-primary" onclick="exportKsiazkaFiltered()">📋 Eksport (kopiuj) <span style="opacity:.7;font-size:11px;">(E)</span></button>
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
        <div class="${rowClass}" style="position:relative;">
            ${ksiazkaEntryTopBadgesHtml(entry, globalIdx)}
            <div class="ksiazka-col-time">
                <div class="ksiazka-time">${escapeHtml(entry.godzinaStart || "—")}</div>
                <div class="ksiazka-date">${escapeHtml(entry.data || "")}</div>
                ${patrolLabel ? `<div class="ksiazka-patrol">${escapeHtml(patrolLabel)}</div>` : ""}
            </div>
            <div class="ksiazka-col-info">
                <div class="ksiazka-text">${formatKsiazkaTekstHtml(entry.tekst)}</div>
            </div>
            <div class="ksiazka-col-actions" style="align-self:flex-end; justify-content:flex-end; align-items:flex-end;">
                ${ksiazkaInterwencjeMode ? `` : `
                    ${!done ? `
                        <button class="btn-success" style="padding:5px 10px; font-size:12px;" onclick="oznaczZrobione(${globalIdx})">Zrobione</button>
                    ` : `
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="odznaczZrobione(${globalIdx})">Cofnij</button>
                    `}
                    <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="kopiujWpisKsiazki(${globalIdx})">Kopiuj</button>
                    <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="edytujWpisKsiazki(${globalIdx})">Edytuj</button>
                    <button class="btn-danger" style="padding:5px 10px; font-size:12px;" onclick="usunWpisKsiazki(${globalIdx})">Kasuj</button>
                `}
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
                <div class="${extraClass}" style="${boxStyle} border-radius:10px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; min-height:0;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; font-size:13px; position:relative; padding-right:8px; gap:8px;">
                        <span style="color:#94a3b8;">${escapeHtml(entry.data)} · <strong style="color:#e2e8f0;">${escapeHtml(entry.godzinaStart || "—")}</strong>
                            ${done ? " <span style='color:#4ade80;'>✅</span>" : (overdue ? " <span style='color:#f87171;'>⚠</span>" : "")}
                        </span>
                        <span style="display:flex; flex-direction:column; gap:4px; align-items:flex-end; flex-wrap:wrap; max-width:65%;">
                            ${ksiazkaProceduraBadgeHtml(entry)}
                            ${ksiazkaInterwencjeModeBtnsHtml(globalIdx)}
                            ${ksiazkaInterwencjeBadgesHtml(entry, false, globalIdx)}
                        </span>
                    </div>
                    <div style="font-size:13.5px; line-height:1.45; white-space:pre-wrap; color:#e2e8f0; margin-bottom:10px; flex:1;">
                        ${formatKsiazkaTekstHtml(entry.tekst)}
                    </div>
                    ${ksiazkaInterwencjeMode ? `` : `
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; margin-top:auto;">
                        ${!done ? `
                            <button class="btn-success" style="padding:5px 10px; font-size:12px;" onclick="oznaczZrobione(${globalIdx})">Zrobione</button>
                        ` : `
                            <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="odznaczZrobione(${globalIdx})">Cofnij</button>
                        `}
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="kopiujWpisKsiazki(${globalIdx})">Kopiuj</button>
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="edytujWpisKsiazki(${globalIdx})">Edytuj</button>
                        <button class="btn-danger" style="padding:5px 10px; font-size:12px;" onclick="usunWpisKsiazki(${globalIdx})">Kasuj</button>
                    </div>
                    `}
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

/** Usuń ze statystyk sprawdzenia (Szlak / Osobowa / Towarowa) powiązane z wpisem książki */
function removeSprawdzeniaLinkedToEntry(entry) {
    if (!entry) return 0;
    if (!appState.statystyki) return 0;
    if (!Array.isArray(appState.statystyki.sprawdzenia)) return 0;

    const id = entry.id != null ? String(entry.id) : null;
    const procId = entry.procedureId != null ? String(entry.procedureId) : null;
    if (!id && !procId) return 0;

    const before = appState.statystyki.sprawdzenia.length;
    appState.statystyki.sprawdzenia = appState.statystyki.sprawdzenia.filter(s => {
        if (!s) return false;
        if (id) {
            if (s.entryId && String(s.entryId) === id) return false;
            if (s.entryIdEnd && String(s.entryIdEnd) === id) return false;
        }
        // ta sama procedura (start lub koniec skasowany)
        if (procId && s.procedureId && String(s.procedureId) === procId) return false;
        return true;
    });
    return before - appState.statystyki.sprawdzenia.length;
}

/** Usuń sprawdzenia powiązane z listą id wpisów (np. przy kasuj wszystkie) */
function removeSprawdzeniaLinkedToEntryIds(entryIds, procedureIds) {
    if (!appState.statystyki || !Array.isArray(appState.statystyki.sprawdzenia)) return 0;
    const ids = new Set((entryIds || []).map(String).filter(Boolean));
    const procs = new Set((procedureIds || []).map(String).filter(Boolean));
    if (!ids.size && !procs.size) return 0;
    const before = appState.statystyki.sprawdzenia.length;
    appState.statystyki.sprawdzenia = appState.statystyki.sprawdzenia.filter(s => {
        if (!s) return false;
        if (s.entryId && ids.has(String(s.entryId))) return false;
        if (s.entryIdEnd && ids.has(String(s.entryIdEnd))) return false;
        if (s.procedureId && procs.has(String(s.procedureId))) return false;
        return true;
    });
    return before - appState.statystyki.sprawdzenia.length;
}

async function usunWpisKsiazki(index) {
    ensureKsiazkaState();
    const entry = appState.ksiazkaWydarzen[index];
    if (!entry) return;
    if (!confirm("Na pewno usunąć ten wpis?")) return;

    const removedStats = removeSprawdzeniaLinkedToEntry(entry);
    appState.ksiazkaWydarzen.splice(index, 1);
    await saveState();
    renderKsiazka();
    if (typeof showToast === "function") {
        showToast(removedStats
            ? "🗑️ Usunięto wpis (−" + removedStats + " w statystykach sprawdzeń)"
            : "🗑️ Usunięto wpis");
    }
}

async function clearAllKsiazka() {
    ensureKsiazkaState();
    if (appState.ksiazkaWydarzen.length === 0) {
        alert("Brak wpisów do usunięcia");
        return;
    }
    if (!confirm("Na pewno usunąć WSZYSTKIE wpisy z Książki wydarzeń?\n\nZostaną też wyczyszczone WSZYSTKIE statystyki (sprawdzenia + interwencje).")) return;

    appState.ksiazkaWydarzen = [];
    if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [], wyniki: {} };
    appState.statystyki.interwencje = [];
    appState.statystyki.sprawdzenia = [];
    appState.statystyki.wyniki = {};
    if (typeof wynikiClearState === "function") wynikiClearState();
    await saveState();
    renderKsiazka();
    if (typeof showToast === "function") {
        showToast("🗑️ Wyczyszczono książkę, statystyki i wyniki");
    }
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
let _planSzablonyCollapsed = true;
let _planCycCollapsed = true;
let _planMultiPatrolDesc = false; // „Opis dotyczący więcej niż jednego patrolu?”
let _planSelectedPointIdx = null; // żółta ramka – aktywny punkt

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
    // zachowaj pozycję przewijania (żeby nie skakało do góry)
    const scrollBox = overlay.querySelector("[data-plan-scroll]");
    const prevScroll = scrollBox ? scrollBox.scrollTop : 0;
    const prevStartGodz = document.getElementById("planStartGodz")?.value;
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
            const selected = _planMultiPatrolDesc && _planSelectedPointIdx === idx;
            const boxExtra = selected
                ? "padding:10px; margin-bottom:8px; border:3px solid #eab308; box-shadow:0 0 0 1px #eab308;"
                : "padding:10px; margin-bottom:8px;";
            const idBtns = _planMultiPatrolDesc
                ? Array.from({length: nPat}, (_, i) =>
                    `<button type="button" class="btn-primary" style="padding:3px 8px; font-size:11px;"
                        onclick="planInsertPatrolMarker(${idx}, ${i})">P${i + 1}</button>`
                  ).join("")
                : "";
            return `
            <div style="${planThemeBoxStyle(boxExtra)}">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <div style="font-weight:700; color:var(--primary-light); white-space:nowrap;">#${idx + 1}${idx === 0 ? " (start)" : ""}</div>
                    ${idx === 0 ? `<input type="hidden" class="plan-offset" data-idx="${idx}" value="0">` : `
                    <input type="number" class="plan-offset" data-idx="${idx}" value="${Number(r.offsetMin) || 0}" min="0" step="5"
                           title="+ min od poprzedniego" style="width:72px;" onchange="planDraftUpdateOffset(${idx}, this.value)">
                    <span style="font-size:11px; color:var(--text-dim);">min</span>`}
                    <div class="card-grid" style="gap:6px; display:flex; flex-wrap:wrap;">
                        ${planBuildAbstractPatrolPills(planEnsureDraftShape(r).patrolIndexes, "planDraftTogglePatrol", idx)}
                    </div>
                    ${idBtns}
                    ${_planMultiPatrolDesc ? `
                    <button type="button" class="btn-primary" style="padding:3px 8px; font-size:11px;${selected ? " outline:2px solid #eab308;" : ""}"
                        onclick="planToggleSelectPoint(${idx})">${selected ? "✓" : "Zaznacz"}</button>
                    ` : ""}
                    <button type="button" class="btn-danger" style="padding:3px 8px; font-size:11px; margin-left:auto;" onclick="planDraftUsun(${idx})">Usuń</button>
                </div>
                <div class="plan-tekst rich-opis-editor" contenteditable="true" data-idx="${idx}"
                     style="width:100%; min-height:72px; font-size:13px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); white-space:pre-wrap;"
                     onblur="planDraftUpdateTekst(${idx}, this.isContentEditable ? this.innerHTML : this.value)">${(typeof formatKsiazkaTekstHtml === "function" ? formatKsiazkaTekstHtml(r.tekst || "") : escapeHtml(r.tekst || ""))}</div>
            </div>`;
        }).join("");
    }

    overlay.innerHTML = `
        <div class="modal" style="width:80vw; max-width:80vw; height:min(90vh,900px); max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
                <h2 style="margin:0;">📋 Planowanie służby</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-danger" onclick="closePlanSluzbyModal()">Zamknij</button>
                </div>
            </div>

            <div data-plan-scroll style="flex:1; overflow:auto; min-height:0; display:flex; flex-direction:column; gap:12px;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                        <label id="planSzablonyToggleLabel" style="margin:0; font-weight:600; cursor:pointer; user-select:none;" onclick="planToggleSzablonyCollapse()">
                            ${_planSzablonyCollapsed ? "▸" : "▾"} Szablony (${szablony.length})
                        </label>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button type="button" class="btn-success" style="padding:5px 10px; font-size:13px;" onclick="planZapiszJakoSzablon()">+ Zapisz bieżący jako szablon</button>
                            <button type="button" class="btn-primary" style="padding:5px 10px; font-size:13px;" onclick="planWyczyscDraft()">Nowy / pusty</button>
                        </div>
                    </div>
                    <div id="planSzablonyList" style="${_planSzablonyCollapsed ? "display:none;" : ""}${planThemeBoxStyle("max-height:140px; overflow:auto; padding:6px;")}">
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
                    <div style="flex:1; min-width:140px; max-width:220px;">
                        <label style="display:block; margin-bottom:4px;">Ilość patroli w planie</label>
                        <input type="number" id="planNumPatroli" value="${nPat}" min="1" max="12" step="1" style="width:100%; height:40px; box-sizing:border-box;"
                               onchange="planSetNumPatroli(this.value)">
                    </div>
                    <div style="flex:1; min-width:140px; max-width:220px;">
                        <label style="display:block; margin-bottom:4px;">Godzina startu planu</label>
                        <input type="time" id="planStartGodz" value="07:00" style="width:100%; height:40px; box-sizing:border-box;">
                    </div>
                    <button type="button" class="btn-primary" style="height:40px;" onclick="planPodglad()">Podgląd godzin</button>
                </div>

                <div id="planPodgladBox" style="display:none; ${planThemeBoxStyle("padding:10px; max-height:140px; overflow:auto; font-size:13px; white-space:pre-wrap;")}"></div>

                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:4px 0 8px 0;">
                    <h3 style="margin:0;">Punkty planu (${_planDraft.length})</h3>
                    <span style="font-size:13px; color:var(--text-dim);">Opis dotyczący więcej niż jednego patrolu?</span>
                    <div class="card-grid" style="gap:6px;">
                        <div class="line-pill ${_planMultiPatrolDesc ? "active" : ""}" style="cursor:pointer; padding:5px 14px; font-size:12px;"
                             onclick="planSetMultiPatrolDesc(true)">Tak</div>
                        <div class="line-pill ${!_planMultiPatrolDesc ? "active" : ""}" style="cursor:pointer; padding:5px 14px; font-size:12px;"
                             onclick="planSetMultiPatrolDesc(false)">Nie</div>
                    </div>
                </div>
                <div id="planDraftList">${draftHtml}</div>

                <div style="border:1px dashed var(--border); border-radius:10px; padding:12px;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                        <div style="font-weight:600; white-space:nowrap;">Dodaj punkt</div>
                        <input type="number" id="planAddOffset" value="${_planDraft.length === 0 ? 0 : 60}" min="0" step="5"
                               title="+ min" style="width:72px;" placeholder="min">
                        <span style="font-size:11px; color:var(--text-dim);">min</span>
                        <div id="planAddPatrolPills" class="card-grid" style="gap:6px; display:flex; flex-wrap:wrap;">
                            ${planBuildAbstractPatrolPills(_planAddPatrolIndexes, "planAddTogglePatrol", null)}
                        </div>
                        <button type="button" class="btn-success" style="margin-left:auto;" onclick="planDraftDodaj()">+ Dodaj punkt</button>
                    </div>
                    <div style="margin-bottom:8px;">
                        <label style="font-size:12px;">Treść (ręcznie)</label>
                        <textarea id="planAddTekst" rows="4" style="width:100%; min-height:120px;" placeholder="Wpisz treść ręcznie…" oninput="planUpdateAddPreviewFromTiles()"></textarea>
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
                </div>

                <div style="border:1px dashed var(--border); border-radius:10px; padding:12px;">
                    <div id="planCycToggleLabel" style="font-weight:600; margin-bottom:8px; cursor:pointer; user-select:none;" onclick="planToggleCycCollapse()">
                        ${_planCycCollapsed ? "▸" : "▾"} Cykliczne zgłoszenia
                    </div>
                    <div id="planCycBody" style="${_planCycCollapsed ? "display:none;" : ""}">
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
    if (prevStartGodz) {
        const g = document.getElementById("planStartGodz");
        if (g) g.value = prevStartGodz;
    }
    const sb = overlay.querySelector("[data-plan-scroll]");
    if (sb) sb.scrollTop = prevScroll;
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

/** Treść z ręki + kafelków – jak „Dodaj wpis”: HTML (bold itd.), bez stripowania */
function planResolveAddTekstFromTiles() {
    const manual = (document.getElementById("planAddTekst")?.value || "").trim();
    const parts = [];
    if (manual) {
        // ręcznie = zwykły tekst → proste HTML
        parts.push(escapeHtml(manual).replace(/\n/g, "<br>"));
    }

    if (_planAddTiles.zglIndex != null) {
        const row = appState.zgloszenia?.rows?.[_planAddTiles.zglIndex];
        if (row) {
            let t = String(row.Opis || row.OpisKrotki || "").trim();
            if (t) parts.push(t); // zachowaj <b>, <u> itd.
        }
    }
    if (_planAddTiles.polIndex != null) {
        const row = appState.polecenia?.rows?.[_planAddTiles.polIndex];
        if (row) {
            let t = String(row.Opis || row.OpisKrotki || "").trim();
            if (t) parts.push(t);
        }
    }
    return parts.filter(Boolean).join("<br><br>");
}

/** Meta procedury z wybranego zgłoszenia (jak Dodaj wpis) */
function planResolveAddProcedureMeta() {
    if (_planAddTiles.zglIndex == null) return null;
    const row = appState.zgloszenia?.rows?.[_planAddTiles.zglIndex];
    if (!row || !row.procedureId) return null;
    if (row.procedureRole !== "start" && row.procedureRole !== "end") return null;
    return { procedureId: row.procedureId, procedureRole: row.procedureRole };
}

function planUpdateAddPreviewFromTiles() {
    const box = document.getElementById("planAddPreview");
    if (!box) return;
    const tekst = planResolveAddTekstFromTiles();
    if (!tekst) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
    }
    box.style.display = "block";
    box.innerHTML = (typeof formatKsiazkaTekstHtml === "function")
        ? formatKsiazkaTekstHtml(tekst)
        : tekst;
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
    const proc = planResolveAddProcedureMeta();
    const item = {
        offsetMin: _planDraft.length === 0 ? 0 : offset,
        tekst,
        patrolIndexes: [...patrolIndexes]
    };
    if (proc) {
        item.procedureId = proc.procedureId;
        item.procedureRole = proc.procedureRole;
    }
    _planDraft.push(item);
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
    _planDraft = (s.rekordy || []).map(r => {
        const item = planEnsureDraftShape({
            offsetMin: Number(r.offsetMin) || 0,
            tekst: r.tekst || "",
            patrolIndexes: planNormalizeIndexes(r.patrolIndexes != null ? r.patrolIndexes : r.patrolIndex)
        });
        if (r.procedureId && (r.procedureRole === "start" || r.procedureRole === "end")) {
            item.procedureId = r.procedureId;
            item.procedureRole = r.procedureRole;
        }
        return item;
    });
    if (_planDraft.length) _planDraft[0].offsetMin = 0;
    _planSzablonyCollapsed = true;
    _planSelectedPointIdx = null;
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
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.isContentEditable ? ta.innerHTML : (ta.value || "");
    });

    let nazwa = prompt("Nazwa szablonu:", "");
    if (nazwa == null) return;
    nazwa = String(nazwa).trim() || ("Szablon " + new Date().toLocaleString("pl-PL"));

    const rekordy = _planDraft.map((r, idx) => {
        planEnsureDraftShape(r);
        const rec = {
            offsetMin: idx === 0 ? 0 : (Number(r.offsetMin) || 0),
            tekst: r.tekst || "",
            patrolIndexes: planNormalizeIndexes(r.patrolIndexes)
        };
        if (r.procedureId && (r.procedureRole === "start" || r.procedureRole === "end")) {
            rec.procedureId = r.procedureId;
            rec.procedureRole = r.procedureRole;
        }
        return rec;
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


function planToggleSzablonyCollapse() {
    _planSzablonyCollapsed = !_planSzablonyCollapsed;
    const list = document.getElementById("planSzablonyList");
    const lab = document.getElementById("planSzablonyToggleLabel");
    if (list) list.style.display = _planSzablonyCollapsed ? "none" : "";
    if (lab) {
        const n = (appState.planSzablony || []).length;
        lab.textContent = (_planSzablonyCollapsed ? "▸" : "▾") + " Szablony (" + n + ")";
    }
}

function planToggleCycCollapse() {
    _planCycCollapsed = !_planCycCollapsed;
    const body = document.getElementById("planCycBody");
    const lab = document.getElementById("planCycToggleLabel");
    if (body) body.style.display = _planCycCollapsed ? "none" : "";
    if (lab) lab.textContent = (_planCycCollapsed ? "▸" : "▾") + " Cykliczne zgłoszenia";
}

function planSetMultiPatrolDesc(on) {
    document.querySelectorAll(".plan-tekst").forEach(ta => {
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.isContentEditable ? ta.innerHTML : (ta.value || "");
    });
    _planMultiPatrolDesc = !!on;
    if (!_planMultiPatrolDesc) _planSelectedPointIdx = null;
    renderPlanSluzbyModal();
}

function planToggleSelectPoint(idx) {
    document.querySelectorAll(".plan-tekst").forEach(ta => {
        const i = parseInt(ta.getAttribute("data-idx"), 10);
        if (_planDraft[i]) _planDraft[i].tekst = ta.isContentEditable ? ta.innerHTML : (ta.value || "");
    });
    _planSelectedPointIdx = (_planSelectedPointIdx === idx) ? null : idx;
    renderPlanSluzbyModal();
    // fokus w treść zaznaczonego
    if (_planSelectedPointIdx != null) {
        setTimeout(() => {
            const ta = document.querySelector(`.plan-tekst[data-idx="${_planSelectedPointIdx}"]`);
            if (ta) ta.focus();
        }, 30);
    }
}

/** Marker w tekście: ⟦P1⟧ – niewidoczny w finalnym wpisie (usuwany przy generowaniu) */
function planInsertPatrolMarker(draftIdx, abstractIdx) {
    const ta = document.querySelector(`.plan-tekst[data-idx="${draftIdx}"]`);
    if (!ta) return;
    const marker = "⟦P" + (abstractIdx + 1) + "⟧";
    ta.focus();
    if (ta.isContentEditable) {
        try {
            document.execCommand("insertText", false, marker);
        } catch (e) {
            ta.innerHTML = (ta.innerHTML || "") + marker;
        }
        if (_planDraft[draftIdx]) _planDraft[draftIdx].tekst = ta.innerHTML;
        return;
    }
    const start = typeof ta.selectionStart === "number" ? ta.selectionStart : (ta.value || "").length;
    const end = typeof ta.selectionEnd === "number" ? ta.selectionEnd : start;
    const before = (ta.value || "").slice(0, start);
    const after = (ta.value || "").slice(end);
    ta.value = before + marker + after;
    const caret = before.length + marker.length;
    try { ta.setSelectionRange(caret, caret); } catch (e) {}
    if (_planDraft[draftIdx]) _planDraft[draftIdx].tekst = ta.value;
}

/** Usuwa markery ⟦P1⟧ z tekstu (do książki / podglądu finalnego) */
function planStripPatrolMarkers(tekst) {
    return String(tekst || "").replace(/⟦P\d+⟧/g, "");
}

/** Aplikuje tagi z uwzględnieniem markerów ⟦Pn⟧ – każdy segment wg innego patrolu abstrakcyjnego */
function planApplyTagsWithMarkers(tekst, groupMap, absPatrolIndexesFallback) {
    const raw = String(tekst || "");
    // brak markerów – klasyczna ścieżka
    if (!/⟦P\d+⟧/.test(raw)) {
        const real = absPatrolIndexesFallback || [];
        return planStripPatrolMarkers(
            typeof planApplyTagsToText === "function"
                ? planApplyTagsToText(raw, real)
                : raw
        );
    }
    // rozdziel na segmenty: [prefix przed pierwszym markerem] + pary (marker, tekst)
    const parts = raw.split(/(⟦P\d+⟧)/);
    let currentAbs = null;
    let out = "";
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const m = part.match(/^⟦P(\d+)⟧$/);
        if (m) {
            currentAbs = parseInt(m[1], 10) - 1;
            continue; // marker niewidoczny
        }
        if (!part) continue;
        let realIdxs = absPatrolIndexesFallback || [];
        if (currentAbs != null && groupMap) {
            // groupMap: abstract index -> real indexes array (from pending map by key)
            // uproszczone: użyj mapowania całego punktu + preferuj abs
            realIdxs = absPatrolIndexesFallback || [];
        }
        // Gdy groupMap to mapa abstractIdx -> real[]
        if (currentAbs != null && groupMap && groupMap[String(currentAbs)]) {
            realIdxs = groupMap[String(currentAbs)];
        }
        out += (typeof planApplyTagsToText === "function")
            ? planApplyTagsToText(part, realIdxs)
            : part;
    }
    return planStripPatrolMarkers(out);
}


function planBuildAbsoluteTimes(startHHMM) {
    const startMin = timeToMinutes(startHHMM);
    let acc = startMin;
    return _planDraft.map((r, idx) => {
        if (idx > 0) acc += (Number(r.offsetMin) || 0);
        planEnsureDraftShape(r);
        const item = {
            godzinaStart: minutesToHHMM(acc),
            tekst: r.tekst || "",
            patrole: planNormalizeIndexes(r.patrolIndexes)
        };
        if (r.procedureId && (r.procedureRole === "start" || r.procedureRole === "end")) {
            item.procedureId = r.procedureId;
            item.procedureRole = r.procedureRole;
        }
        return item;
    });
}

function planPodglad() {
    if (!_planDraft.length) {
        if (typeof showToast === "function") showToast("Brak punktów");
        return;
    }
    document.querySelectorAll(".plan-tekst").forEach(ta => {
        const idx = parseInt(ta.getAttribute("data-idx"), 10);
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.isContentEditable ? ta.innerHTML : (ta.value || "");
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
        <div class="modal" style="width:80vw; max-width:80vw; height:min(88vh,820px); max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
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
        if (_planDraft[idx]) _planDraft[idx].tekst = ta.isContentEditable ? ta.innerHTML : (ta.value || "");
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
        if (Object.prototype.hasOwnProperty.call(groupMap, key)) {
            patrolIndexes = planNormalizeIndexes(groupMap[key]);
        } else {
            patrolIndexes = planNormalizeIndexes(p.patrole);
        }

        // mapa abstrakcyjny indeks → realne (kolejność jak w p.patrole)
        const absList = planNormalizeIndexes(p.patrole);
        const segMap = {};
        absList.forEach((a, i) => {
            if (patrolIndexes[i] != null) segMap[String(a)] = [patrolIndexes[i]];
            else segMap[String(a)] = patrolIndexes.slice();
        });

        const data = resolveDataForGodzina(p.godzinaStart);
        let tekst = (typeof planApplyTagsWithMarkers === "function")
            ? planApplyTagsWithMarkers(p.tekst || "", segMap, patrolIndexes)
            : planApplyTagsToText(planStripPatrolMarkers(p.tekst || ""), patrolIndexes);
        tekst = planStripPatrolMarkers(tekst);
        tekst = tekst.replace(/@godzina\b/gi, p.godzinaStart || nowHHMM());
        tekst = tekst.replace(/@data\b/gi, data);
        tekst = capitalizeSentencesHtmlKs(tekst);

        const entry = {
            id: Date.now() + Math.random().toString(36).slice(2),
            data: data,
            godzinaStart: p.godzinaStart,
            tekst: tekst,
            patrole: patrolIndexes,
            zrobione: false,
            createdAt: new Date().toISOString(),
            zPlanu: true
        };
        if (p.procedureId && (p.procedureRole === "start" || p.procedureRole === "end")) {
            entry.procedureId = p.procedureId;
            entry.procedureRole = p.procedureRole;
        }
        appState.ksiazkaWydarzen.push(entry);
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
// Dane z ZGŁOSZEŃ (Szlak / Stacja towarowa / Stacja osobowa)
// Procedury start+stop → automatyczne godziny + czas przez północ
// =====================================

const SPRAWDZENIE_RODZAJE = ["Szlak", "Stacja towarowa", "Stacja osobowa"];

function getZgloszeniaSprawdzenie() {
    const rows = appState.zgloszenia?.rows || [];
    return rows
        .map((r, i) => ({ ...r, _index: i }))
        .filter(r => r && SPRAWDZENIE_RODZAJE.includes(r.Rodzaj));
}

function entryMatchesZgloszenieSprawdzenie(entry, zgl) {
    if (!entry || !zgl) return false;
    // TYLKO po procedureId – bez dopasowania po tekście
    // (polecenia / zwykłe wpisy nie mogą być mylone ze startem szlaku)
    if (!entry.procedureId || !zgl.procedureId) return false;
    if (String(entry.procedureId) !== String(zgl.procedureId)) return false;
    if (!entry.procedureRole || !zgl.procedureRole) return true;
    return entry.procedureRole === zgl.procedureRole;
}

function findMatchingZgloszenieForEntry(entry) {
    const zgls = getZgloszeniaSprawdzenie();
    if (!entry || !entry.procedureId) return null;
    const exact = zgls.find(z =>
        z.procedureId && String(z.procedureId) === String(entry.procedureId) &&
        (!entry.procedureRole || z.procedureRole === entry.procedureRole)
    );
    if (exact) return exact;
    return zgls.find(z =>
        z.procedureId && String(z.procedureId) === String(entry.procedureId)
    ) || null;
}

/** Meta procedury ze zgłoszeń (rodzaj, nazwa, linia, km) – preferuj start */
function getProcedureMetaFromZgl(procedureId, fallbackEntry) {
    const rows = appState.zgloszenia?.rows || [];
    let z = null;
    if (procedureId) {
        z = rows.find(r => r.procedureId === procedureId && r.procedureRole === "start")
            || rows.find(r => r.procedureId === procedureId);
    }
    if (!z && fallbackEntry) z = findMatchingZgloszenieForEntry(fallbackEntry);
    if (!z) return { Rodzaj: "", Nazwa: "", Linia: "", KmOd: "", KmDo: "" };
    return {
        Rodzaj: z.Rodzaj || "",
        Nazwa: z.Nazwa || z.OpisKrotki || "",
        Linia: z.Linia || "",
        KmOd: z.KmOd || "",
        KmDo: z.KmDo || ""
    };
}

/**
 * Znajdź wpis końca procedury w książce.
 * 1) procedureId + role end
 * 2) przez zgłoszenie końca tej samej procedury + dopasowanie tekstu
 */
function findProcedureEndEntry(startEntry) {
    if (!startEntry) return null;
    const all = appState.ksiazkaWydarzen || [];

    if (startEntry.procedureId) {
        const byId = all.find(e =>
            e && e.id !== startEntry.id &&
            String(e.procedureId) === String(startEntry.procedureId) &&
            e.procedureRole === "end"
        );
        if (byId) return byId;
    }

    // przez szablon zgłoszenia
    const zStart = findMatchingZgloszenieForEntry(startEntry);
    const procId = startEntry.procedureId || zStart?.procedureId;
    if (!procId) return null;

    const zEnd = (appState.zgloszenia?.rows || []).find(z =>
        z.procedureId === procId && z.procedureRole === "end"
    );
    if (!zEnd) return null;

    // kandydaci: wpisy z role end albo dopasowane do zEnd, po starcie w czasie
    const startMin = (typeof timeToMinutes === "function")
        ? timeToMinutes(startEntry.godzinaStart || "00:00")
        : 0;
    const startData = String(startEntry.data || "");

    const candidates = all.filter(e => {
        if (!e || e.id === startEntry.id) return false;
        if (e.procedureId && String(e.procedureId) === String(procId) && e.procedureRole === "end") {
            return true;
        }
        if (e.procedureRole === "start") return false;
        return entryMatchesZgloszenieSprawdzenie(e, zEnd);
    });

    // preferuj ten sam dzień lub następny, godzina >= start (albo inna data)
    candidates.sort((a, b) => {
        const da = String(a.data || "");
        const db = String(b.data || "");
        if (da !== db) return da.localeCompare(db);
        const ma = (typeof timeToMinutes === "function") ? timeToMinutes(a.godzinaStart || "00:00") : 0;
        const mb = (typeof timeToMinutes === "function") ? timeToMinutes(b.godzinaStart || "00:00") : 0;
        return ma - mb;
    });

    for (const c of candidates) {
        const sameDay = String(c.data || "") === startData;
        const cMin = (typeof timeToMinutes === "function")
            ? timeToMinutes(c.godzinaStart || "00:00")
            : 0;
        if (sameDay && cMin >= startMin) return c;
        if (!sameDay) return c; // inny dzień (noc)
    }
    return candidates[0] || null;
}

function findProcedureStartEntry(endEntry) {
    if (!endEntry) return null;
    const all = appState.ksiazkaWydarzen || [];
    if (endEntry.procedureId) {
        const byId = all.find(e =>
            e && e.id !== endEntry.id &&
            String(e.procedureId) === String(endEntry.procedureId) &&
            e.procedureRole === "start"
        );
        if (byId) return byId;
    }
    const zEnd = findMatchingZgloszenieForEntry(endEntry);
    const procId = endEntry.procedureId || zEnd?.procedureId;
    if (!procId) return null;
    const zStart = (appState.zgloszenia?.rows || []).find(z =>
        z.procedureId === procId && z.procedureRole === "start"
    );
    if (!zStart) return null;
    return all.find(e =>
        e && e.id !== endEntry.id &&
        (e.procedureRole !== "end") &&
        (String(e.procedureId || "") === String(procId) || entryMatchesZgloszenieSprawdzenie(e, zStart))
    ) || null;
}

/**
 * Grupy do sprawdzenia: jedna procedura = jedna grupa.
 * { type, procedureId, startEntry, endEntry, meta, closed, indexes[] }
 */
function getKsiazkaSprawdzenieGroups() {
    ensureKsiazkaState();
    const zgls = getZgloszeniaSprawdzenie();
    if (!zgls.length) return [];

    const all = (typeof sortEntriesOldestFirst === "function")
        ? sortEntriesOldestFirst(appState.ksiazkaWydarzen)
        : [...(appState.ksiazkaWydarzen || [])];

    // wpisy które w ogóle pasują do zgłoszeń sprawdzenia
    const matched = all.filter(e => zgls.some(z => entryMatchesZgloszenieSprawdzenie(e, z)));
    const usedIds = new Set();
    const groups = [];

    for (const e of matched) {
        if (usedIds.has(e.id)) continue;

        const zMatch = findMatchingZgloszenieForEntry(e);
        const role = e.procedureRole || zMatch?.procedureRole || "";

        if (role === "start") {
            const endE = findProcedureEndEntry(e);
            const procId = e.procedureId || zMatch?.procedureId || null;
            const meta = getProcedureMetaFromZgl(procId, e);
            if (endE) usedIds.add(endE.id);
            usedIds.add(e.id);

            const startIdx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
            const endIdx = endE ? appState.ksiazkaWydarzen.findIndex(x => x.id === endE.id) : -1;

            groups.push({
                type: "procedura",
                procedureId: procId,
                startEntry: e,
                endEntry: endE || null,
                closed: !!(endE && endE.godzinaStart),
                meta,
                indexes: [startIdx, endIdx].filter(i => i >= 0),
                godzOd: e.godzinaStart || "",
                godzDo: endE?.godzinaStart || "",
                dataOd: e.data || "",
                dataDo: endE?.data || e.data || ""
            });
            continue;
        }

        if (role === "end" || e.procedureRole === "end") {
            // jeśli start już przetworzony – pomiń; inaczej grupa otwarta tylko z końcem
            const startE = findProcedureStartEntry(e);
            if (startE && usedIds.has(startE.id)) {
                usedIds.add(e.id);
                continue;
            }
            if (startE) {
                // start nie był w matched? i tak zgrupuj
                usedIds.add(startE.id);
                usedIds.add(e.id);
                const procId = e.procedureId || startE.procedureId || zMatch?.procedureId || null;
                const meta = getProcedureMetaFromZgl(procId, startE);
                const startIdx = appState.ksiazkaWydarzen.findIndex(x => x.id === startE.id);
                const endIdx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
                groups.push({
                    type: "procedura",
                    procedureId: procId,
                    startEntry: startE,
                    endEntry: e,
                    closed: true,
                    meta,
                    indexes: [startIdx, endIdx].filter(i => i >= 0),
                    godzOd: startE.godzinaStart || "",
                    godzDo: e.godzinaStart || "",
                    dataOd: startE.data || "",
                    dataDo: e.data || ""
                });
                continue;
            }
            // sam koniec bez startu
            usedIds.add(e.id);
            const meta = getProcedureMetaFromZgl(e.procedureId || zMatch?.procedureId, e);
            const endIdx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
            groups.push({
                type: "procedura",
                procedureId: e.procedureId || zMatch?.procedureId || null,
                startEntry: null,
                endEntry: e,
                closed: false,
                meta,
                indexes: endIdx >= 0 ? [endIdx] : [],
                godzOd: "",
                godzDo: e.godzinaStart || "",
                dataOd: e.data || "",
                dataDo: e.data || "",
                missingStart: true
            });
            continue;
        }

        // pojedyncze zgłoszenie (bez procedury)
        usedIds.add(e.id);
        const z = zMatch || findMatchingZgloszenieForEntry(e);
        const idx = appState.ksiazkaWydarzen.findIndex(x => x.id === e.id);
        groups.push({
            type: "pojedyncze",
            procedureId: null,
            startEntry: e,
            endEntry: null,
            closed: false,
            meta: {
                Rodzaj: z?.Rodzaj || "",
                Nazwa: z?.Nazwa || z?.OpisKrotki || "",
                Linia: z?.Linia || "",
                KmOd: z?.KmOd || "",
                KmDo: z?.KmDo || ""
            },
            indexes: idx >= 0 ? [idx] : [],
            godzOd: e.godzinaStart || "",
            godzDo: "",
            dataOd: e.data || "",
            dataDo: e.data || "",
            missingEnd: true
        });
    }

    return groups;
}

function getKsiazkaWpisyDoSprawdzenia() {
    // kompatybilność – płaska lista startów/pojedynczych
    return getKsiazkaSprawdzenieGroups().map(g => g.startEntry || g.endEntry).filter(Boolean);
}

/** Kompatybilność ze starymi nazwami */
function getPoleceniaSprawdzenie() { return getZgloszeniaSprawdzenie(); }
function findMatchingPolecenieForEntry(entry) { return findMatchingZgloszenieForEntry(entry); }
function entryMatchesPolecenieSprawdzenie(entry, pol) { return entryMatchesZgloszenieSprawdzenie(entry, pol); }

function parseDatePL(str) {
    const m = String(str || "").trim().match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!m) return null;
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
}

function combineDateTimePL(dataStr, hhmm) {
    const base = parseDatePL(dataStr) || new Date();
    const parts = typeof parseTimeParts === "function" ? parseTimeParts(hhmm) : null;
    const d = new Date(base.getTime());
    if (parts) d.setHours(parts.h, parts.m, 0, 0);
    else d.setHours(0, 0, 0, 0);
    return d;
}

function durationMinutesBetween(dataOd, godzOd, dataDo, godzDo) {
    let start = combineDateTimePL(dataOd, godzOd);
    let end = combineDateTimePL(dataDo || dataOd, godzDo);
    if (!(start instanceof Date) || isNaN(start.getTime())) return 0;
    if (!(end instanceof Date) || isNaN(end.getTime())) return 0;
    if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatDurationMin(mins) {
    const m = Math.max(0, parseInt(mins, 10) || 0);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h + ":" + String(mm).padStart(2, "0");
}

function isGroupAlreadyInSprawdzenia(group) {
    if (!group) return false;
    if (typeof ensureStatystykiState === "function") ensureStatystykiState();
    else {
        if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
        if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
    }
    const stats = appState.statystyki.sprawdzenia || [];
    const startId = group.startEntry?.id;
    const endId = group.endEntry?.id;
    if (startId && stats.some(s => s.entryId && String(s.entryId) === String(startId))) return true;
    if (endId && stats.some(s => s.entryIdEnd && String(s.entryIdEnd) === String(endId))) return true;
    if (group.procedureId && stats.some(s => s.procedureId && String(s.procedureId) === String(group.procedureId) &&
        String(s.data || "") === String(group.dataOd || ""))) return true;
    return false;
}

function isEntryAlreadyInSprawdzenia(entry) {
    if (!entry) return false;
    const groups = getKsiazkaSprawdzenieGroups();
    const g = groups.find(gr =>
        (gr.startEntry && gr.startEntry.id === entry.id) ||
        (gr.endEntry && gr.endEntry.id === entry.id)
    );
    if (g) return isGroupAlreadyInSprawdzenia(g);
    if (typeof ensureStatystykiState === "function") ensureStatystykiState();
    const stats = appState.statystyki?.sprawdzenia || [];
    return !!(entry.id && stats.some(s => s.entryId && String(s.entryId) === String(entry.id)));
}

function openKsiazkaSprawdzenieModal() {
    const groups = getKsiazkaSprawdzenieGroups();
    if (groups.length === 0) {
        if (typeof showToast === "function") {
            showToast("Brak wpisów powiązanych ze zgłoszeniami: Szlak / Stacja towarowa / Stacja osobowa");
        } else {
            alert("Brak wpisów powiązanych ze zgłoszeniami: Szlak / Stacja towarowa / Stacja osobowa");
        }
        return;
    }

    const old = document.getElementById("ksiazkaSprawdModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaSprawdModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay._groups = groups;

    // zaznaczone: indeksy grup, nie wpisów
    const selected = new Set();
    groups.forEach((g, gi) => {
        if (!isGroupAlreadyInSprawdzenia(g) && g.closed) selected.add(gi);
        // zamknięte procedury domyślnie; otwarte też można zaznaczyć, ale zapis je odrzuci
        else if (!isGroupAlreadyInSprawdzenia(g) && g.type === "pojedyncze") {
            // pojedyncze bez końca – nie zaznaczaj auto
        } else if (!isGroupAlreadyInSprawdzenia(g) && g.closed) {
            selected.add(gi);
        }
    });
    // domyślnie wszystkie zamknięte i niezrobione
    groups.forEach((g, gi) => {
        if (!isGroupAlreadyInSprawdzenia(g) && g.closed) selected.add(gi);
    });
    overlay._selectedGroupIndexes = selected;

    const list = groups.map((g, gi) => {
        const already = isGroupAlreadyInSprawdzenia(g);
        const isSel = selected.has(gi);
        const border = isSel ? "#22c55e" : "#475569";
        const bg = isSel ? "rgba(34, 197, 94, 0.12)" : "rgba(71, 85, 105, 0.25)";
        const opacity = isSel ? "1" : "0.65";
        const badge = already
            ? `<span style="position:absolute; top:8px; right:8px; background:#16a34a; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px;">✓ Zrobione</span>`
            : "";
        const statusOpen = !g.closed
            ? `<span style="background:#b45309; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px;">⚠ Brak zamknięcia</span>`
            : "";
        const meta = g.meta || {};
        const godzLine = g.closed
            ? `${escapeHtml(g.godzOd || "—")} → ${escapeHtml(g.godzDo || "—")}`
            : (g.godzOd ? `${escapeHtml(g.godzOd)} → ?` : `? → ${escapeHtml(g.godzDo || "—")}`);
        const czas = (g.closed && g.godzOd && g.godzDo)
            ? formatDurationMin(durationMinutesBetween(g.dataOd, g.godzOd, g.dataDo, g.godzDo))
            : "—";
        const shortStart = g.startEntry
            ? String(g.startEntry.tekst || "").replace(/<[^>]+>/g, " ").slice(0, 80)
            : "";

        return `
        <div id="ksiazkaSprawdGroup_${gi}"
             class="ksiazka-sprawd-entry ${isSel ? "selected" : ""}"
             data-group="${gi}"
             data-already="${already ? "1" : "0"}"
             data-closed="${g.closed ? "1" : "0"}"
             onclick="ksiazkaSprawdzenieToggleGroup(${gi})"
             style="
                position: relative;
                border: 2px solid ${border};
                background: ${bg};
                border-radius: 10px;
                padding: 10px;
                margin-bottom: 8px;
                cursor: pointer;
                opacity: ${opacity};
             ">
            ${badge}
            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:4px; padding-right:${already ? "90px" : "0"};">
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(168,85,247,.2);color:#d8b4fe;">
                    ${g.type === "procedura" ? "Procedura" : "Zgłoszenie"}
                </span>
                ${statusOpen}
            </div>
            <div style="font-weight:700; color:var(--primary-light);">
                ${escapeHtml(meta.Rodzaj || "")}${meta.Rodzaj ? " · " : ""}${escapeHtml(meta.Nazwa || "—")}
            </div>
            <div style="font-size:13px; color:var(--text-dim); margin-top:2px;">
                Linia: <strong>${escapeHtml(meta.Linia || "—")}</strong>
                ${meta.KmOd || meta.KmDo ? ` · Km: ${escapeHtml(meta.KmOd || "")}–${escapeHtml(meta.KmDo || "")}` : ""}
            </div>
            <div style="font-size:14px; font-weight:600; margin-top:6px;">
                ${godzLine}
                <span style="font-weight:400; color:var(--text-dim); font-size:12px;"> · ${escapeHtml(g.dataOd || "")}${g.dataDo && g.dataDo !== g.dataOd ? " → " + escapeHtml(g.dataDo) : ""}</span>
                ${g.closed ? ` · czas <strong>${czas}</strong> h` : ""}
            </div>
            ${shortStart ? `<div style="font-size:12px; color:var(--text-soft); margin-top:4px;">${escapeHtml(shortStart)}${shortStart.length >= 80 ? "…" : ""}</div>` : ""}
        </div>`;
    }).join("");

    const doneCount = groups.filter(g => isGroupAlreadyInSprawdzenia(g)).length;
    const closedTodo = groups.filter(g => g.closed && !isGroupAlreadyInSprawdzenia(g)).length;
    const openCount = groups.filter(g => !g.closed).length;

    overlay.innerHTML = `
        <div class="modal" style="max-width:580px;">
            <h2 style="margin-top:0;">Sprawdzenie – procedury</h2>
            <p style="color:var(--text-dim); font-size:14px; margin-bottom:12px;">
                Jedna procedura = jeden wiersz (linia, szlak, godziny start→koniec).
                Godziny tylko z książki. <strong>Zapisz</strong> pomija otwarte procedury.
                <br>${closedTodo} do zapisu, ${doneCount} już w statystykach, ${openCount} bez zamknięcia.
            </p>
            <div style="margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn-primary" style="padding:6px 12px; font-size:13px;" onclick="ksiazkaSprawdzenieZaznaczWszystkie(true)">Zaznacz wszystkie</button>
                <button type="button" class="btn-primary" style="padding:6px 12px; font-size:13px;" onclick="ksiazkaSprawdzenieZaznaczWszystkie(false)">Odznacz wszystkie</button>
                <button type="button" class="btn-primary" style="padding:6px 12px; font-size:13px;" onclick="ksiazkaSprawdzenieZaznaczTylkoNowe()">Tylko niezrobione</button>
            </div>
            <div style="max-height:400px; overflow:auto; margin-bottom:14px;">${list}</div>
            <div class="modal-actions">
                <button class="btn-success" onclick="ksiazkaSprawdzenieZapisz()">Zapisz</button>
                <button class="btn-danger" onclick="closeKsiazkaSprawdzenieModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function ksiazkaSprawdzenieToggleGroup(gi) {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal || !modal._selectedGroupIndexes) return;
    const set = modal._selectedGroupIndexes;
    const el = document.getElementById(`ksiazkaSprawdGroup_${gi}`);
    if (!el) return;
    if (set.has(gi)) {
        set.delete(gi);
        el.classList.remove("selected");
        el.style.borderColor = "#475569";
        el.style.background = "rgba(71, 85, 105, 0.25)";
        el.style.opacity = "0.65";
    } else {
        set.add(gi);
        el.classList.add("selected");
        el.style.borderColor = "#22c55e";
        el.style.background = "rgba(34, 197, 94, 0.12)";
        el.style.opacity = "1";
    }
}

function ksiazkaSprawdzenieToggleEntry(idx) {
    // kompatybilność – nie używane przy grupach
}

function ksiazkaSprawdzenieZaznaczWszystkie(zaznacz) {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;
    if (!modal._selectedGroupIndexes) modal._selectedGroupIndexes = new Set();
    document.querySelectorAll(".ksiazka-sprawd-entry").forEach(el => {
        const gi = parseInt(el.getAttribute("data-group"), 10);
        if (zaznacz) {
            modal._selectedGroupIndexes.add(gi);
            el.classList.add("selected");
            el.style.borderColor = "#22c55e";
            el.style.background = "rgba(34, 197, 94, 0.12)";
            el.style.opacity = "1";
        } else {
            modal._selectedGroupIndexes.delete(gi);
            el.classList.remove("selected");
            el.style.borderColor = "#475569";
            el.style.background = "rgba(71, 85, 105, 0.25)";
            el.style.opacity = "0.65";
        }
    });
}

function ksiazkaSprawdzenieZaznaczTylkoNowe() {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;
    if (!modal._selectedGroupIndexes) modal._selectedGroupIndexes = new Set();
    modal._selectedGroupIndexes.clear();
    document.querySelectorAll(".ksiazka-sprawd-entry").forEach(el => {
        const gi = parseInt(el.getAttribute("data-group"), 10);
        const already = el.getAttribute("data-already") === "1";
        const closed = el.getAttribute("data-closed") === "1";
        if (!already && closed) {
            modal._selectedGroupIndexes.add(gi);
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

function buildSprawdzenieItemsFromSelected(selectedIndexes) {
    // kompatybilność – nie używane przy nowym Zapisz
    return [];
}

async function ksiazkaSprawdzenieZapisz() {
    const modal = document.getElementById("ksiazkaSprawdModal");
    if (!modal) return;

    const groups = modal._groups || getKsiazkaSprawdzenieGroups();
    const selected = modal._selectedGroupIndexes
        ? [...modal._selectedGroupIndexes]
        : [];
    if (!selected.length) {
        if (typeof showToast === "function") showToast("Zaznacz przynajmniej jedną procedurę");
        else alert("Zaznacz przynajmniej jedną procedurę");
        return;
    }

    const braki = [];
    const doZapisu = [];

    for (const gi of selected) {
        const g = groups[gi];
        if (!g) continue;
        const nazwa = (g.meta && (g.meta.Nazwa || g.meta.Rodzaj)) || "procedura";

        if (!g.closed || !g.godzOd || !g.godzDo) {
            if (g.missingStart) {
                braki.push(`„${nazwa}”: brak rozpoczęcia procedury w książce`);
            } else {
                braki.push(`„${nazwa}”: brak zamknięcia procedury (brak godziny końca w książce)`);
            }
            continue;
        }

        const dataOd = g.dataOd || todayPL();
        const dataDo = g.dataDo || dataOd;
        const czasMin = durationMinutesBetween(dataOd, g.godzOd, dataDo, g.godzDo);
        const czas = formatDurationMin(czasMin);

        const osobyFromEntries = [];
        const _addO = (arr) => {
            (arr || []).forEach(n => {
                const s = String(n || "").trim();
                if (s && !osobyFromEntries.includes(s)) osobyFromEntries.push(s);
            });
        };
        _addO(g.startEntry?.osoby);
        _addO(g.endEntry?.osoby);

        doZapisu.push({
            rodzaj: g.meta?.Rodzaj || "",
            nazwa: g.meta?.Nazwa || "",
            linia: g.meta?.Linia || "",
            kmOd: g.meta?.KmOd || "",
            kmDo: g.meta?.KmDo || "",
            godzOd: g.godzOd,
            godzDo: g.godzDo,
            data: dataOd,
            dataDo,
            czas,
            czasMin,
            entryId: g.startEntry?.id || null,
            entryIdEnd: g.endEntry?.id || null,
            procedureId: g.procedureId || null,
            ...(osobyFromEntries.length ? { osoby: osobyFromEntries } : {})
        });
    }

    if (braki.length && !doZapisu.length) {
        alert("Nie zapisano – brak zamknięcia / godzin z książki:\n\n" + braki.join("\n"));
        return;
    }
    if (braki.length && doZapisu.length) {
        if (!confirm("Część pominięta:\n\n" + braki.join("\n") +
            "\n\nZapisuję " + doZapisu.length + " sprawdzeń. Kontynuować?")) return;
    }

    for (const payload of doZapisu) {
        if (typeof logSprawdzenie === "function") {
            await logSprawdzenie(payload);
            const last = appState.statystyki?.sprawdzenia?.slice(-1)[0];
            if (last) {
                if (payload.entryId && !last.entryId) last.entryId = payload.entryId;
                if (payload.entryIdEnd) last.entryIdEnd = payload.entryIdEnd;
                if (!last.data) last.data = payload.data;
                last.dataDo = payload.dataDo;
                last.czas = payload.czas;
                last.czasMin = payload.czasMin;
                if (payload.procedureId) last.procedureId = payload.procedureId;
                if (payload.osoby && payload.osoby.length) last.osoby = [...payload.osoby];
            }
        } else {
            if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
            if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
            appState.statystyki.sprawdzenia.push({
                ...payload,
                createdAt: new Date().toISOString()
            });
        }
    }

    await saveState();
    closeKsiazkaSprawdzenieModal();
    const info = braki.length
        ? `✅ Zapisano ${doZapisu.length} (pominięto ${braki.length})`
        : `✅ Zapisano ${doZapisu.length} sprawdzeń`;
    if (typeof showToast === "function") showToast(info);
    else alert(info);
    if (document.getElementById("ksiazkaContainer") && typeof renderKsiazka === "function") {
        renderKsiazka();
    }
}

/** @deprecated – zostawione na kompatybilność; używaj ksiazkaSprawdzenieZapisz */
function ksiazkaSprawdzenieDalej() {
    return ksiazkaSprawdzenieZapisz();
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
        const entryEnd = (it._entryIndexEnd != null) ? appState.ksiazkaWydarzen[it._entryIndexEnd] : null;
        const entryId = entry?.id || null;
        const entryIdEnd = entryEnd?.id || null;
        const dataOd = it._dataOd || entry?.data || todayPL();
        const dataDo = it._dataDo || entryEnd?.data || dataOd;
        const czasMin = durationMinutesBetween(dataOd, godzOd, dataDo, godzDo);
        const czas = formatDurationMin(czasMin);

        const payload = {
            rodzaj: it.Rodzaj,
            nazwa: it.Nazwa || "",
            linia: it.Linia || "",
            kmOd: it.KmOd || "",
            kmDo: it.KmDo || "",
            godzOd,
            godzDo,
            data: dataOd,
            dataDo,
            czas,
            czasMin,
            entryId,
            entryIdEnd,
            procedureId: it._procedureId || null
        };

        if (typeof logSprawdzenie === "function") {
            await logSprawdzenie(payload);
            const last = appState.statystyki?.sprawdzenia?.slice(-1)[0];
            if (last) {
                if (entryId && !last.entryId) last.entryId = entryId;
                if (entryIdEnd) last.entryIdEnd = entryIdEnd;
                if (!last.data) last.data = dataOd;
                last.dataDo = dataDo;
                last.czas = czas;
                last.czasMin = czasMin;
                if (it._procedureId) last.procedureId = it._procedureId;
            }
        } else {
            if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
            if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
            appState.statystyki.sprawdzenia.push({
                ...payload,
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


// =====================================

/** Badge procedury (Szlak / Osobowa / Towarowa) – start = szary podkreślony, koniec = pogrubiony */
function ksiazkaProceduraBadgeHtml(entry) {
    if (!entry) return "";
    // Badge tylko gdy wpis ma jawnie ustawioną procedurę (nie z polecenia / tekstu)
    let role = entry.procedureRole || "";
    if (role !== "start" && role !== "end") return "";
    if (!entry.procedureId && role !== "start" && role !== "end") return "";

    let meta = { Rodzaj: "", Nazwa: "" };
    if (entry.procedureId) {
        meta = getProcedureMetaFromZgl(entry.procedureId, entry);
    }

    if (role !== "start" && role !== "end") return "";

    const rodzajRaw = String(meta.Rodzaj || "").toLowerCase();
    let rodzajLabel = "Procedura";
    if (rodzajRaw.includes("szlak")) rodzajLabel = "Szlak";
    else if (rodzajRaw.includes("osob")) rodzajLabel = "Osobowa";
    else if (rodzajRaw.includes("towar")) rodzajLabel = "Towarowa";
    else if (meta.Rodzaj) rodzajLabel = meta.Rodzaj;

    const nazwa = meta.Nazwa || meta.Linia || "";
    const isStart = role === "start";

    // start: jasnoszary + podkreślenie | koniec: mocny kolor + pogrubienie
    const color = isStart ? "var(--text-dim, #94a3b8)" : "var(--text, #0f172a)";
    // w trybie ciemnym koniec też ma być czytelny – użyj currentColor tekstu
    const weight = isStart ? "600" : "800";
    const decoration = isStart ? "underline" : "none";
    const borderCol = isStart ? "rgba(148,163,184,.55)" : "rgba(15,23,42,.35)";
    const bg = isStart ? "rgba(148,163,184,.12)" : "rgba(15,23,42,.08)";

    return `<span title="${isStart ? "Początek procedury" : "Koniec procedury"}"
        style="display:inline-flex; flex-direction:column; align-items:flex-end; max-width:140px;
               background:${bg}; border:1px solid ${borderCol}; border-radius:8px;
               padding:3px 7px; line-height:1.2; text-align:right;">
        <span style="font-size:11px; font-weight:${weight}; color:${color}; text-decoration:${decoration};
                     letter-spacing:0.3px; white-space:nowrap;">
            ${escapeHtml(rodzajLabel)}${isStart ? " · start" : " · koniec"}
        </span>
        ${nazwa ? `<span style="font-size:10px; font-weight:${isStart ? "500" : "700"}; color:${color};
                     text-decoration:${decoration}; margin-top:2px; max-width:130px;
                     overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(nazwa)}
        </span>` : ""}
    </span>`;
}

function ksiazkaInterwencjeModeBtnsHtml(globalIdx) {
    if (!ksiazkaInterwencjeMode) return "";
    const s = "padding:5px 10px; font-size:12px; font-weight:700;";
    return `<div style="display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end;">
        <button class="btn-primary" style="${s}" onclick="openKsiazkaInterwencjaModal(${globalIdx},'MKK')">MKK</button>
        <button class="btn-primary" style="${s}" onclick="openKsiazkaInterwencjaModal(${globalIdx},'P')">P</button>
        <button class="btn-primary" style="${s}" onclick="openKsiazkaInterwencjaModal(${globalIdx},'L')">L</button>
        <button class="btn-primary" style="${s}" onclick="openKsiazkaInterwencjaModal(${globalIdx},'I')">Inne</button>
    </div>`;
}

function ksiazkaEntryTopBadgesHtml(entry, globalIdx) {
    const proc = ksiazkaProceduraBadgeHtml(entry);
    const inv = ksiazkaInterwencjeBadgesHtml(entry, false, globalIdx);
    const modeBtns = ksiazkaInterwencjeModeBtnsHtml(globalIdx);
    if (!proc && !inv && !modeBtns) return "";
    // Szlak/procedura na górze, pod spodem przyciski interwencji, potem litery M/P/L/I
    return `<div style="position:absolute; top:6px; right:8px; z-index:2; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
        ${proc}${modeBtns}${inv}
    </div>`;
}


// INTERWENCJE (MKK / P / L / Inne)
// =====================================


/** Pola wyników bez automatu – do interwencji „Inne” */
const INNE_WYNIKI_GROUPS = [
    { id: "przek", title: "Przekazania / pisma", items: [
        { nr: 29, name: "Przekazani do Policji" },
        { nr: 30, name: "Przekazani do SG, ŻW, SM" },
        { nr: 31, name: "Przekazani do: Inne" },
        { nr: 32, name: "Pisma interwencyjne do szkół i zakładów pracy" }
    ]},
    { id: "spb_u", title: "Użycie środków przymusu bezpośredniego", items: [
        { nr: 33, name: "Siła fizyczna" },
        { nr: 34, name: "Pałka służbowa" },
        { nr: 35, name: "RMG" },
        { nr: 36, name: "Kajdanki" },
        { nr: 37, name: "Pies służbowy" },
        { nr: 38, name: "Broń palna" },
        { nr: 39, name: "Paralizator" }
    ]},
    { id: "spb_w", title: "Wykorzystanie środków przymusu bezpośredniego", items: [
        { nr: 40, name: "Pałka służbowa" },
        { nr: 41, name: "RMG" },
        { nr: 42, name: "Broń palna" },
        { nr: 43, name: "Paralizator" }
    ]},
    { id: "zlom", title: "Kontrole punktów skupu złomu", items: [
        { nr: 45, name: "Ilość kontroli" },
        { nr: 46, name: "Wykryte nieprawidłowości" },
        { nr: 47, name: "Wartość odzyskanego mienia" },
        { nr: 48, name: "Ujętych: skupujących" },
        { nr: 49, name: "Ujętych: sprzedających" }
    ]},
    { id: "wykorz", title: "Wykorzystanie w służbie", items: [
        { nr: 50, name: "Psy służbowe" },
        { nr: 52, name: "Fotopułapki" },
        { nr: 53, name: "M C M" }
    ]},
    { id: "sily", title: "Użyte siły", items: [
        { nr: 55, name: "ŻW" },
        { nr: 56, name: "SG" },
        { nr: 57, name: "SM" },
        { nr: 59, name: "Inni pracownicy kolejowi" }
    ]},
    { id: "trans", title: "Ochrona transportów / usterki", items: [
        { nr: 61, name: "Konwojowane przesyłki towarowe" },
        { nr: 62, name: "F-sze konw. przesyłki towarowe" },
        { nr: 63, name: "Sprawdzone wagony" },
        { nr: 65, name: "Brak plomb" },
        { nr: 66, name: "Plomby uszkodzone / nieczytelne" },
        { nr: 67, name: "Inne usterki" }
    ]},
    { id: "pociagi", title: "Patrole w pociągach", items: [
        { nr: 68, name: "Międzynarodowe PKP IC" },
        { nr: 69, name: "Krajowe PKP IC" },
        { nr: 70, name: "Krajowe PR" },
        { nr: 71, name: "Pozostałe" }
    ]},
    { id: "inne_formy", title: "Inne formy służby", items: [
        { nr: 76, name: "Posterunki stałe" }
    ]}
];

/** Sesja okna Inne: { nr: liczba }, grupy rozwinięte */
let _inneSessionCounts = {};
let _inneExpandedGroups = {};

function inneFindItem(nr) {
    for (const g of INNE_WYNIKI_GROUPS) {
        const it = g.items.find(x => x.nr === nr);
        if (it) return { group: g, item: it };
    }
    return null;
}

function inneToggleGroup(gid) {
    _inneExpandedGroups[gid] = !_inneExpandedGroups[gid];
    inneRenderGroupsPanel();
}

function inneAddCount(nr, delta) {
    const n = Number(nr);
    const cur = Number(_inneSessionCounts[n]) || 0;
    const next = Math.max(0, cur + (delta || 1));
    if (next === 0) delete _inneSessionCounts[n];
    else _inneSessionCounts[n] = next;
    inneRenderGroupsPanel();
}

function inneInsertItemToText(nr) {
    const found = inneFindItem(nr);
    if (!found) return;
    const ta = document.getElementById("ksUwagiTekst");
    if (!ta) return;
    const modal = document.getElementById("ksiazkaUwagiEditModal");
    inneEnsureNotesState();
    const noteEl = document.querySelector(`[data-inne-note="${nr}"]`);
    if (noteEl) inneSaveNote(nr, noteEl.value);
    const note = (appState.inneNotatki && appState.inneNotatki[nr]) ? String(appState.inneNotatki[nr]).trim() : "";
    const line = found.item.name
        + (note ? (": " + note) : "")
        + (Number(_inneSessionCounts[nr]) > 1 ? (" (×" + _inneSessionCounts[nr] + ")") : "");
    const cur = ta.value || "";
    let start = (modal && typeof modal._caretStart === "number") ? modal._caretStart : (ta.selectionStart || cur.length);
    let end = (modal && typeof modal._caretEnd === "number") ? modal._caretEnd : (ta.selectionEnd || start);
    start = Math.max(0, Math.min(start, cur.length));
    end = Math.max(0, Math.min(end, cur.length));
    let piece = line;
    const before = cur.slice(0, start);
    const after = cur.slice(end);
    if (before && !/\s$/.test(before)) piece = "\n" + piece;
    if (after && !/^\s/.test(after)) piece = piece + "\n";
    ta.value = before + piece + after;
    const caret = before.length + piece.length;
    try { ta.setSelectionRange(caret, caret); } catch (e) {}
    ta.focus();
    if (modal) { modal._caretStart = caret; modal._caretEnd = caret; }
    // +1 przy wstawieniu, jeśli jeszcze 0
    if (!(_inneSessionCounts[nr] > 0)) inneAddCount(nr, 1);
    else inneRenderGroupsPanel();
}

function inneEnsureNotesState() {
    if (!appState.inneNotatki || typeof appState.inneNotatki !== "object") appState.inneNotatki = {};
}

function inneSaveNote(nr, val) {
    inneEnsureNotesState();
    const v = String(val || "").trim();
    if (v) appState.inneNotatki[nr] = v;
    else delete appState.inneNotatki[nr];
    if (typeof saveState === "function") saveState();
}

function inneRenderGroupsPanel() {
    const host = document.getElementById("inneWynikiPanel");
    if (!host) return;
    inneEnsureNotesState();
    let html = "";
    INNE_WYNIKI_GROUPS.forEach(g => {
        const open = !!_inneExpandedGroups[g.id];
        const countInGroup = g.items.reduce((a, it) => a + (Number(_inneSessionCounts[it.nr]) || 0), 0);
        const headExtra = countInGroup > 0
            ? ` <span style="color:#ef4444; font-weight:800;">+${countInGroup}</span>`
            : "";
        html += `<div style="border:1px solid var(--border); border-radius:10px; margin-bottom:8px; overflow:hidden;">
            <div onclick="inneToggleGroup('${g.id}')" style="cursor:pointer; padding:10px 12px; background:var(--bg-input); display:flex; justify-content:space-between; align-items:center; gap:8px; user-select:none;">
                <span style="font-weight:700;">${open ? "▾" : "▸"} ${escapeHtml(g.title)}${headExtra}</span>
            </div>`;
        if (open) {
            html += `<div style="padding:8px 10px;">`;
            g.items.forEach(it => {
                const c = Number(_inneSessionCounts[it.nr]) || 0;
                const note = appState.inneNotatki[it.nr] || "";
                html += `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:6px 0; border-bottom:1px solid var(--border);">
                    <span style="width:36px; text-align:center; font-weight:800; color:#facc15;">${it.nr}</span>
                    <span style="min-width:120px; flex:0 1 180px; font-size:13px;">${escapeHtml(it.name)}</span>
                    <input type="text" data-inne-note="${it.nr}" value="${escapeHtml(note)}"
                           placeholder="Notatka…"
                           style="flex:1; min-width:120px; padding:6px 8px; font-size:13px;"
                           onchange="inneSaveNote(${it.nr}, this.value)"
                           onblur="inneSaveNote(${it.nr}, this.value)">
                    <button type="button" class="btn-primary" style="padding:4px 8px; font-size:12px;" onclick="inneAddCount(${it.nr},-1)">−</button>
                    <span style="min-width:24px; text-align:center; font-weight:700;">${c}</span>
                    <button type="button" class="btn-primary" style="padding:4px 8px; font-size:12px;" onclick="inneAddCount(${it.nr},1)">+</button>
                    <button type="button" class="btn-success" style="padding:4px 10px; font-size:12px;" onclick="inneInsertItemToText(${it.nr})">Wstaw</button>
                </div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    });
    host.innerHTML = html;
}


function inneWstawWszystkieDane() {
    const nrs = Object.keys(_inneSessionCounts)
        .map(n => parseInt(n, 10))
        .filter(n => (Number(_inneSessionCounts[n]) || 0) > 0)
        .sort((a, b) => a - b);
    if (!nrs.length) {
        if (typeof showToast === "function") showToast("Brak pozycji z licznikiem > 0");
        return;
    }
    nrs.forEach(nr => inneInsertItemToText(nr));
}

function inneApplyCountsToWyniki() {
    if (typeof ensureStatystykiState === "function") ensureStatystykiState();
    if (!appState.statystyki.wyniki) appState.statystyki.wyniki = {};
    Object.keys(_inneSessionCounts).forEach(k => {
        const nr = parseInt(k, 10);
        const add = Number(_inneSessionCounts[k]) || 0;
        if (!add) return;
        const prev = Number(appState.statystyki.wyniki[nr]) || 0;
        appState.statystyki.wyniki[nr] = prev + add;
    });
}


const INTERWENCJE_MAP = {
    MKK: { code: "M", label: "MKK", szablonKey: "MKK" },
    P:   { code: "P", label: "Pouczony", szablonKey: "Pouczony" },
    L:   { code: "L", label: "Legitymowany", szablonKey: "Legitymowany" },
    I:   { code: "I", label: "Inne", szablonKey: "Inne" }
};

function toggleKsiazkaInterwencjeMode() {
    ksiazkaInterwencjeMode = !ksiazkaInterwencjeMode;
    renderKsiazka();
    if (typeof showToast === "function") {
        showToast(ksiazkaInterwencjeMode
            ? "Tryb interwencji ON – wybierz MKK / P / L / Inne przy wpisie"
            : "Tryb interwencji OFF");
    }
}

function ksiazkaInterwencjeBadgesHtml(entry, absolute, entryIndex) {
    const inv = entry && entry.interwencje ? entry.interwencje : {};
    const counts = (entry && entry.interwencjeCounts && typeof entry.interwencjeCounts === "object")
        ? entry.interwencjeCounts : {};
    const items = [];
    const push = (code, keys) => {
        let n = 0;
        keys.forEach(k => {
            if (typeof counts[k] === "number" && counts[k] > 0) n = Math.max(n, counts[k]);
        });
        if (!n) {
            // legacy bool
            if (keys.some(k => inv[k])) n = 1;
        }
        if (n > 0) items.push({ code, n });
    };
    push("M", ["MKK", "M"]);
    push("P", ["P", "Pouczony"]);
    push("L", ["L", "Legitymowany"]);
    push("I", ["I", "Inne"]);
    if (!items.length) return "";
    const style = absolute
        ? "position:absolute; top:6px; right:8px; z-index:2; display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end;"
        : "display:inline-flex; gap:5px; margin-bottom:4px; flex-wrap:wrap;";
    const idxAttr = (entryIndex != null && entryIndex >= 0) ? String(entryIndex) : "";
    return `<span style="${style}">` + items.map(({ code: c, n }) => {
        const canRemove = idxAttr !== "";
        const label = n > 1 ? (c + "−" + n) : c;
        return `<span style="display:inline-flex; align-items:center; gap:2px; background:rgba(59,130,246,.15); border:1px solid rgba(96,165,250,.5); border-radius:6px; padding:1px 4px 1px 6px;">
            <span style="font-weight:800; font-size:13px; color:var(--primary-light,#60a5fa); letter-spacing:0.5px;" title="Interwencja ×${n}">${label}</span>
            ${canRemove ? `<button type="button" title="Cofnij interwencję ${c}"
                onclick="event.stopPropagation(); removeKsiazkaInterwencja(${idxAttr}, '${c}')"
                style="border:none; background:transparent; color:#f87171; font-weight:800; font-size:12px; line-height:1; cursor:pointer; padding:0 2px;">×</button>` : ""}
        </span>`;
    }).join("") + `</span>`;
}

/** Cofnij interwencję: usuwa oznaczenie z wpisu i −1 ze statystyk */
async function removeKsiazkaInterwencja(entryIndex, code) {
    ensureKsiazkaState();
    const entry = appState.ksiazkaWydarzen[entryIndex];
    if (!entry) return;

    const codeU = String(code || "").toUpperCase();
    const labelMap = { M: "MKK", P: "Pouczony", L: "Legitymowany", I: "Inne" };
    const label = labelMap[codeU] || codeU;

    if (!confirm("Cofnąć interwencję \"" + label + "\" z tego wpisu? (−1 w statystykach)")) return;

    if (!entry.interwencje || typeof entry.interwencje !== "object") entry.interwencje = {};

    if (codeU === "M") {
        delete entry.interwencje.MKK;
        delete entry.interwencje.M;
        // odejmij kwotę z wyników poz. 28
        const kw = Number(entry.mkkKwota) || 0;
        if (kw && appState.statystyki) {
            if (!appState.statystyki.wyniki) appState.statystyki.wyniki = {};
            const cur = Number(appState.statystyki.wyniki[28]) || 0;
            const next = Math.max(0, cur - kw);
            if (next > 0) appState.statystyki.wyniki[28] = next;
            else delete appState.statystyki.wyniki[28];
        }
        delete entry.mkkKwota;
    } else if (codeU === "P") {
        delete entry.interwencje.P;
        delete entry.interwencje.Pouczony;
    } else if (codeU === "L") {
        delete entry.interwencje.L;
        delete entry.interwencje.Legitymowany;
    } else if (codeU === "I") {
        delete entry.interwencje.I;
        delete entry.interwencje.Inne;
    }

    // −1 w statystykach: usuń jeden pasujący rekord (preferuj entryId + typ)
    if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
    if (!Array.isArray(appState.statystyki.interwencje)) appState.statystyki.interwencje = [];

    const typAliases = {
        M: ["MKK", "M"],
        P: ["Pouczony", "P"],
        L: ["Legitymowany", "L"],
        I: ["Inne", "I"]
    };
    const aliases = typAliases[codeU] || [label];
    const entryId = entry.id != null ? String(entry.id) : null;

    const norm = (t) => {
        t = String(t || "").trim();
        if (t === "M" || t.toUpperCase() === "MKK") return "MKK";
        if (t === "P" || /^poucz/i.test(t)) return "Pouczony";
        if (t === "L" || /^legitym/i.test(t)) return "Legitymowany";
        if (t === "I" || /^inne$/i.test(t)) return "Inne";
        return t;
    };
    const want = norm(label);

    let removed = false;
    // 1) z tym samym entryId
    if (entryId) {
        for (let i = appState.statystyki.interwencje.length - 1; i >= 0; i--) {
            const row = appState.statystyki.interwencje[i];
            if (String(row.entryId || "") === entryId && norm(row.typ) === want) {
                appState.statystyki.interwencje.splice(i, 1);
                removed = true;
                break;
            }
        }
    }
    // 2) fallback: ostatni rekord tego typu
    if (!removed) {
        for (let i = appState.statystyki.interwencje.length - 1; i >= 0; i--) {
            const row = appState.statystyki.interwencje[i];
            if (norm(row.typ) === want) {
                appState.statystyki.interwencje.splice(i, 1);
                removed = true;
                break;
            }
        }
    }

    await saveState();
    renderKsiazka();
    if (typeof showToast === "function") {
        showToast(removed
            ? "↩ Cofnięto " + label + " (−1 w statystykach)"
            : "↩ Usunięto oznaczenie " + label + " (brak wpisu w statystykach)");
    }
}

function openKsiazkaInterwencjaModal(index, typ) {
    ensureKsiazkaState();
    const entry = appState.ksiazkaWydarzen[index];
    if (!entry) return;

    const meta = INTERWENCJE_MAP[typ] || INTERWENCJE_MAP.I;
    window._ksiazkaInterwencjaIndex = index;
    window._ksiazkaInterwencjaTyp = typ;

    if (typeof ensureUwagiState === "function") ensureUwagiState();
    const sz = appState.uwagiSzablony || {};
    const szablon = sz[meta.szablonKey] || sz[meta.label] || "";

    const old = document.getElementById("ksiazkaUwagiEditModal");
    if (old) old.remove();

    const base = String(entry.tekst || "");
    const previewAdd = szablon ? ("\n\n" + szablon) : "";

    const overlay = document.createElement("div");
    overlay.id = "ksiazkaUwagiEditModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    const isInne = (typ === "I" || typ === "Inne" || meta.code === "I");
    if (isInne) {
        _inneSessionCounts = {};
        _inneExpandedGroups = {};
    }

    overlay.innerHTML = isInne ? `
        <div class="modal" style="width:min(900px,94vw); height:min(90vh,860px); max-width:none; max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                <h2 style="margin:0;">Interwencja: Inne</h2>
            </div>
            <p style="color:var(--text-dim); font-size:13px; margin:0 0 10px 0;">
                Rozwiń grupę → notatka / <strong>+</strong> / <strong>Wstaw</strong> w miejscu kursora. Nagłówek pokazuje sumę na czerwono.
            </p>
            <div style="flex:1; overflow:auto; min-height:0; display:flex; flex-direction:column; gap:12px;">
                <div id="inneWynikiPanel"></div>
                <div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px; align-items:center;">
                        <button type="button" class="btn-primary" onclick="inneWstawWszystkieDane()">Wstaw dane</button>
                        <span style="font-size:12px; color:var(--text-dim);">wstawia wszystkie pozycje z licznikiem &gt; 0 (notatki + nazwy)</span>
                    </div>
                    <label>Treść wpisu</label>
                    <textarea id="ksUwagiTekst" rows="8" style="width:100%; font-size:14px; line-height:1.45; min-height:140px;">${escapeHtml(base)}</textarea>
                </div>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap; border-top:1px solid var(--border); padding-top:12px;">
                <button class="btn-success" onclick="confirmKsiazkaInterwencja()">Zapisz</button>
                <button class="btn-danger" onclick="closeKsiazkaUwagiEditModal()">Anuluj</button>
            </div>
        </div>
    ` : `
        <div class="modal" style="max-width:640px;">
            <h2 style="margin-top:0;">Interwencja: ${escapeHtml(meta.label)}</h2>
            <p style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
                Szablon możesz wstawić przyciskiem poniżej albo dopisać ręcznie. Po zapisie przy wpisie pojawi się litera <strong>${meta.code}</strong>.
                ${typ === "MKK" || typ === "M" ? " W szablonie MKK użyj <strong>@kwota</strong> – przy wstawieniu program zapyta o kwotę." : ""}
            </p>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                <button type="button" class="btn-primary" onclick="ksiazkaInterwencjaWstawSzablon()">Wstaw szablon „${escapeHtml(meta.label)}”</button>
                <button type="button" class="btn-primary" style="padding:6px 10px;font-size:12px;" onclick="closeKsiazkaUwagiEditModal(); if(typeof openUwagiSzablonyModal==='function')openUwagiSzablonyModal()">Edytuj szablony</button>
            </div>
            <label>Treść wpisu</label>
            <textarea id="ksUwagiTekst" rows="10" style="width:100%; margin-bottom:14px; font-size:14px; line-height:1.45;">${escapeHtml(base)}</textarea>
            <div class="modal-actions">
                <button class="btn-success" onclick="confirmKsiazkaInterwencja()">Zapisz</button>
                <button class="btn-danger" onclick="closeKsiazkaUwagiEditModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // zapamiętaj szablon do wstawienia
    overlay._szablon = szablon;
    overlay._kwotaSum = 0;
    overlay._szablonInsertCount = 0;

    // Zapamiętuj pozycję kursora w textarea (klik w "Wstaw szablon" zdejmuje fokus)
    const ta = document.getElementById("ksUwagiTekst");
    if (ta) {
        const saveCaret = () => {
            overlay._caretStart = ta.selectionStart;
            overlay._caretEnd = ta.selectionEnd;
        };
        ta.addEventListener("keyup", saveCaret);
        ta.addEventListener("click", saveCaret);
        ta.addEventListener("select", saveCaret);
        ta.addEventListener("mouseup", saveCaret);
        // start: kursor na końcu treści
        const len = (ta.value || "").length;
        overlay._caretStart = len;
        overlay._caretEnd = len;
        setTimeout(() => {
            try {
                ta.focus();
                ta.setSelectionRange(len, len);
            } catch (e) {}
        }, 40);
    }
    if (document.getElementById("inneWynikiPanel")) {
        inneRenderGroupsPanel();
    }
}

function ksiazkaInterwencjaResolveTags(tekst, entry) {
    let out = String(tekst || "");
    // częsty błąd w szablonach
    out = out.replace(/@dowdca\b/gi, "@dowodca");

    const patrolIndexes = (entry && Array.isArray(entry.patrole)) ? entry.patrole : [];
    if (typeof planApplyTagsToText === "function") {
        out = planApplyTagsToText(out, patrolIndexes);
    } else if (typeof buildReplacementsForPatrols === "function" && typeof applyTags === "function") {
        out = applyTags(out, buildReplacementsForPatrols(patrolIndexes));
    } else {
        const kz = appState.kz || "";
        const mkk = appState.mkk || "";
        out = out.replace(/@KZ\b/gi, kz).replace(/@MKK\b/gi, mkk);
        out = out.replace(/@data\b/gi, (entry && entry.data) || (typeof todayPL === "function" ? todayPL() : ""));
        out = out.replace(/@godzina\b/gi, (entry && entry.godzinaStart) || (typeof nowHHMM === "function" ? nowHHMM() : ""));
        // minimalny fallback patroli
        const patrole = appState.patrole || [];
        if (patrolIndexes.length) {
            const names = [], dow = [], sklad = [], kier = [];
            patrolIndexes.forEach(i => {
                const p = patrole[i];
                if (!p) return;
                if (p.nazwa) names.push(p.nazwa);
                if (p.dowodca) dow.push(p.dowodca);
                if (p.kierowca) kier.push(p.kierowca);
                if (Array.isArray(p.sklad)) sklad.push(...p.sklad.filter(Boolean));
            });
            const join = a => [...new Set(a.map(s => String(s).trim()).filter(Boolean))].join(", ");
            out = out.replace(/@patrol\b/gi, join(names));
            out = out.replace(/@dowodca\b/gi, join(dow));
            out = out.replace(/@kierowca\b/gi, join(kier));
            out = out.replace(/@sklad\b/gi, join(sklad));
            out = out.replace(/@wszyscy\b/gi, join([...dow, ...sklad, ...kier]));
        }
    }

    // data/godzina z wpisu książki (nadpisanie)
    if (entry) {
        if (entry.data) out = out.replace(/@data\b/gi, entry.data);
        if (entry.godzinaStart) out = out.replace(/@godzina\b/gi, entry.godzinaStart);
    }
    return out;
}

function ksiazkaInterwencjaWstawSzablon() {
    const modal = document.getElementById("ksiazkaUwagiEditModal");
    let add = (modal && modal._szablon) ? String(modal._szablon).trim() : "";
    const ta = document.getElementById("ksUwagiTekst");
    if (!ta || !add) {
        if (typeof showToast === "function") showToast("Brak szablonu – ustaw w Szablony");
        return;
    }

    const index = window._ksiazkaInterwencjaIndex;
    const entry = (index != null && appState.ksiazkaWydarzen) ? appState.ksiazkaWydarzen[index] : null;
    const typ = window._ksiazkaInterwencjaTyp || "";
    if (modal) {
        if (!modal._szablonInsertCount) modal._szablonInsertCount = 0;
        modal._szablonInsertCount += 1;
    }

    // MKK: pytanie o kwotę → @kwota w szablonie + suma do wyników (poz. 28)
    let kwotaNum = null;
    if (typ === "MKK" || typ === "M") {
        const ans = prompt("Kwota mandatu (zł):", "");
        if (ans === null) return; // anulowano wstawianie
        const n = parseInt(String(ans).replace(/\D/g, ""), 10);
        if (isNaN(n) || n < 0) {
            if (typeof showToast === "function") showToast("Podaj prawidłową kwotę");
            return;
        }
        kwotaNum = n;
        add = add.replace(/@kwota\b/gi, String(n));
        if (!modal._kwotaSum) modal._kwotaSum = 0;
        modal._kwotaSum += n;
    }

    add = ksiazkaInterwencjaResolveTags(add, entry);
    // gdy ktoś wstawił @kwota bez pytania (nie-MKK) – zostaw lub wyczyść
    if (kwotaNum != null) add = add.replace(/@kwota\b/gi, String(kwotaNum));

    // Wstaw w miejscu kursora (zaznaczenie zamieniane na szablon)
    const modalEl = document.getElementById("ksiazkaUwagiEditModal");
    const cur = ta.value || "";
    let start = (modalEl && typeof modalEl._caretStart === "number")
        ? modalEl._caretStart
        : (typeof ta.selectionStart === "number" ? ta.selectionStart : cur.length);
    let end = (modalEl && typeof modalEl._caretEnd === "number")
        ? modalEl._caretEnd
        : (typeof ta.selectionEnd === "number" ? ta.selectionEnd : start);
    // clamp
    start = Math.max(0, Math.min(start, cur.length));
    end = Math.max(0, Math.min(end, cur.length));
    if (end < start) end = start;
    ta.focus();
    // gdy fokus był na przycisku – często selection = 0,0 przy niepustym polu;
    // jeśli użytkownik nie zaznaczył nic i kursor na początku, a tekst jest – wstaw w miejscu kursora i tak
    const before = cur.slice(0, start);
    const after = cur.slice(end);
    // odstępy tylko gdy trzeba (nie dubluj pustych linii)
    let piece = add;
    if (before && !/\s$/.test(before) && !/^\s/.test(piece)) piece = " " + piece;
    if (after && !/^\s/.test(after) && !/\s$/.test(piece)) piece = piece + " ";
    ta.value = before + piece + after;
    const caret = before.length + piece.length;
    try {
        ta.setSelectionRange(caret, caret);
    } catch (err) { /* ignore */ }
    ta.focus();
    if (modalEl) {
        modalEl._caretStart = caret;
        modalEl._caretEnd = caret;
    }

    if (entry && (!entry.patrole || !entry.patrole.length)) {
        if (typeof showToast === "function") {
            showToast("⚠ Wpis bez patrolu – @dowodca/@sklad mogą być puste. Przypisz patrol do wpisu.");
        }
    }
}


async function confirmKsiazkaInterwencja() {
    const index = window._ksiazkaInterwencjaIndex;
    const typ = window._ksiazkaInterwencjaTyp || "I";
    if (index == null || !appState.ksiazkaWydarzen[index]) return;

    let tekst = (document.getElementById("ksUwagiTekst")?.value || "");
    const entry = appState.ksiazkaWydarzen[index];
    // domknij ewentualne pozostałe znaczniki wg patrolu wpisu
    tekst = ksiazkaInterwencjaResolveTags(tekst, entry);
    entry.tekst = tekst;
    if (!entry.interwencje || typeof entry.interwencje !== "object") entry.interwencje = {};
    if (!entry.interwencjeCounts || typeof entry.interwencjeCounts !== "object") entry.interwencjeCounts = {};
    entry.interwencje[typ] = true;
    // kompatybilność liter
    const meta = INTERWENCJE_MAP[typ];
    if (meta) entry.interwencje[meta.code] = true;

    // Zapis do STATYSTYK (suma MKK / Pouczony / Legitymowany / Inne)
    const statTyp = meta ? meta.label : (typ === "MKK" ? "MKK" : typ === "P" ? "Pouczony" : typ === "L" ? "Legitymowany" : "Inne");
    const modal = document.getElementById("ksiazkaUwagiEditModal");
    const kwotaSum = (modal && Number(modal._kwotaSum) > 0) ? Number(modal._kwotaSum) : 0;
    // ile razy wstawiono szablon w tej sesji (min. 1 przy samym zapisie)
    let times = (modal && Number(modal._szablonInsertCount) > 0) ? Number(modal._szablonInsertCount) : 1;
    if (typ === "I" || typ === "Inne") times = 1;
    const countKey = (statTyp === "MKK") ? "MKK" : (statTyp === "Pouczony" ? "P" : (statTyp === "Legitymowany" ? "L" : "I"));
    entry.interwencjeCounts[countKey] = (Number(entry.interwencjeCounts[countKey]) || 0) + times;
    if (statTyp === "MKK") entry.interwencjeCounts.MKK = entry.interwencjeCounts[countKey];
    if (statTyp === "Pouczony") entry.interwencjeCounts.P = entry.interwencjeCounts[countKey];
    if (statTyp === "Legitymowany") entry.interwencjeCounts.L = entry.interwencjeCounts[countKey];

    for (let t = 0; t < times; t++) {
        if (typeof logInterwencja === "function") {
            await logInterwencja(statTyp, {
                entryId: entry.id || null,
                data: entry.data || undefined,
                godzina: entry.godzinaStart || undefined,
                kwota: (t === 0 ? kwotaSum : undefined) || undefined
            });
        } else {
            if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [], wyniki: {} };
            if (!Array.isArray(appState.statystyki.interwencje)) appState.statystyki.interwencje = [];
            const row = {
                data: (typeof todayPL === "function" ? todayPL() : new Date().toLocaleDateString("pl-PL")),
                typ: statTyp,
                godzina: (typeof nowHHMM === "function" ? nowHHMM() : ""),
                entryId: entry.id || null
            };
            if (t === 0 && kwotaSum) row.kwota = kwotaSum;
            appState.statystyki.interwencje.push(row);
        }
    }

    // Inne – dolicz wybrane pozycje wyników
    if ((typ === "I" || typ === "Inne" || statTyp === "Inne") && typeof inneApplyCountsToWyniki === "function") {
        inneApplyCountsToWyniki();
        _inneSessionCounts = {};
    }

    // Kwota mandatów (poz. 28) – suma wszystkich wstawionych przy tej interwencji
    if (kwotaSum && (statTyp === "MKK" || typ === "MKK" || typ === "M")) {
        if (typeof ensureStatystykiState === "function") ensureStatystykiState();
        if (!appState.statystyki.wyniki) appState.statystyki.wyniki = {};
        const prev = Number(appState.statystyki.wyniki[28]) || 0;
        appState.statystyki.wyniki[28] = prev + kwotaSum;
        entry.mkkKwota = (Number(entry.mkkKwota) || 0) + kwotaSum;
        if (typeof wynikiSyncAutoToState === "function") {
            // nie nadpisuj 28 – to ręczne; sync tylko auto
            wynikiSyncAutoToState();
            // przywróć sumę kwot (sync nie rusza 28, ale na wszelki wypadek)
            appState.statystyki.wyniki[28] = (Number(appState.statystyki.wyniki[28]) || 0);
            if (!appState.statystyki.wyniki[28] && prev + kwotaSum) {
                appState.statystyki.wyniki[28] = prev + kwotaSum;
            }
        }
    }

    await saveState();
    closeKsiazkaUwagiEditModal();
    renderKsiazka();
    const extra = kwotaSum ? (" · kwota +" + kwotaSum + " zł") : "";
    if (typeof showToast === "function") showToast("✅ Zapisano interwencję " + statTyp + " (+1 w statystykach)" + extra);
}


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
    polSearch: "",
    osoby: []   // z „Rozdziel patrol” – linie liczone osobno
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
    ksiazkaAdd.osoby = [];
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
        <div class="modal" style="width:80vw; max-width:80vw; height:min(90vh,900px); max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                <h2 style="margin:0;">➕ Dodaj wpis do Książki wydarzeń</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <label style="font-size:13px; color:#94a3b8;">Godzina</label>
                    <input type="time" id="ksAddGodzina" value="${escapeHtml(nowHHMM())}" style="width:130px;">
                    <button class="btn-primary" type="button" onclick="openKsiazkaRozdzielPatrol()">👥 Rozdziel patrol</button>
                    <button class="btn-success" onclick="ksiazkaAddZapisz()">💾 Zapisz</button>
                    <button class="btn-danger" onclick="closeKsiazkaAddModal()">Zamknij</button>
                </div>
            </div>
            <p style="margin:0 0 10px 0; font-size:13px; color:#94a3b8;">
                Wybierz patrole, zgłoszenia i polecenia – podgląd odświeża się na żywo. Kafelka <strong>start</strong> procedury zapisze wpis jako początek procedury (koniec dodaj osobno). <strong>Rozdziel patrol</strong> wstawia osoby w formacie „patrol: funkcjonariusz”. <strong>Zapisz</strong> dodaje wpis i zostawia okno otwarte.
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
                        <div id="ksAddZglLinieFrame" class="ks-add-level-frame">
                            <div id="ksAddZglLinie" class="card-grid" style="gap:6px;"></div>
                        </div>
                        <div id="ksAddZglItemsFrame" class="ks-add-level-frame" style="display:none;">
                            <div id="ksAddZglItems" class="card-grid" style="gap:6px;"></div>
                        </div>
                        <div id="ksAddZglLevel3" class="card-grid" style="gap:6px;"></div>
                    </div>
                    <div>
                        <div style="font-weight:600; margin-bottom:6px; font-size:14px;">Polecenia</div>
                        <input type="text" id="ksAddPolSearch" placeholder="Szukaj…" style="width:100%; margin-bottom:8px;"
                               oninput="ksiazkaAdd.polSearch=this.value; ksiazkaAddRenderPol();">
                        <div id="ksAddPolLinieFrame" class="ks-add-level-frame">
                            <div id="ksAddPolLinie" class="card-grid" style="gap:6px;"></div>
                        </div>
                        <div id="ksAddPolItemsFrame" class="ks-add-level-frame" style="display:none;">
                            <div id="ksAddPolItems" class="card-grid" style="gap:6px;"></div>
                        </div>
                        <div id="ksAddPolLevel3" class="card-grid" style="gap:6px;"></div>
                    </div>
                </div>
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="font-weight:600; font-size:14px;">Podgląd wpisu (edytowalny)</div>
                        <button class="btn-primary" style="padding:4px 10px; font-size:12px;" onclick="ksiazkaAddWyczyscWybor()">Wyczyść wybór</button>
                    </div>
                    <div id="ksAddPreview" contenteditable="true"
                         style="min-height:140px; max-height:280px; overflow:auto; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; padding:12px; font-size:14px; line-height:1.45; color:var(--text); white-space:pre-wrap;"></div>
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
    style.textContent = `
        #ksiazkaAddModal .ks-add-level-frame {
            border: 1px solid var(--border, #334155);
            border-radius: 12px;
            padding: 10px;
            margin-bottom: 8px;
            background: var(--bg-light, rgba(15, 23, 42, 0.45));
            box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.06);
        }
        @media (max-width:800px){
            #ksiazkaAddModal .modal > div[style*="grid-template-columns"]{ grid-template-columns:1fr !important; }
        }
    `;
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

    const zglItemsFrame = document.getElementById("ksAddZglItemsFrame");
    if (!ksiazkaAdd.zglLine && !search) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        if (zglItemsFrame) zglItemsFrame.style.display = "none";
        return;
    }
    if (zglItemsFrame) zglItemsFrame.style.display = "";

    let filtered = rows;
    if (ksiazkaAdd.zglLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === ksiazkaAdd.zglLine);

    let krotkie;
    if (typeof zglSortedOpisKrotkiForLine === "function" && ksiazkaAdd.zglLine) {
        krotkie = zglSortedOpisKrotkiForLine(ksiazkaAdd.zglLine, filtered);
    } else {
        krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl", { numeric: true, sensitivity: "base" }));
    }
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

    let level3;
    if (typeof zglSortedRowsForGroup === "function" && ksiazkaAdd.zglLine) {
        level3 = zglSortedRowsForGroup(ksiazkaAdd.zglLine, ksiazkaAdd.zglOpis, appState.zgloszenia?.rows || [])
            .map(x => ({ ...x.r, _index: x.i }));
    } else {
        level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === ksiazkaAdd.zglOpis);
    }
    lvl3El.innerHTML = level3.map(r => {
        const sel = ksiazkaAdd.zglIndexes.includes(r._index) ? "selected" : "";
        const role = r.procedureRole === "start" ? "▶ start · " : (r.procedureRole === "end" ? "■ koniec · " : "");
        const label = role + (r.OpisPom || r.Opis || "(brak)").substring(0, 120);
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

    const lines = (typeof polSortedLines === "function")
        ? polSortedLines(rows)
        : [...new Set(rows.map(r => r.Linia || "(brak)"))].sort((a, b) => a.localeCompare(b, "pl", { numeric: true }));
    linieEl.innerHTML = lines.map(line => {
        const hasSel = rows.some(r => (r.Linia || "(brak)") === line && ksiazkaAdd.polIndexes.includes(r._index));
        let cls = "line-pill";
        if (ksiazkaAdd.polLine === line) cls += " active";
        if (hasSel) cls += " has-selected";
        return `<div class="${cls}" style="cursor:pointer;" onclick="ksiazkaAddSelectPolLine('${String(line).replace(/'/g, "\\'")}')">${escapeHtml(line)}</div>`;
    }).join("") || "<span style='color:#64748b;font-size:13px;'>Brak</span>";

    const polItemsFrame = document.getElementById("ksAddPolItemsFrame");
    if (!ksiazkaAdd.polLine && !search) {
        itemsEl.innerHTML = "";
        lvl3El.innerHTML = "";
        if (polItemsFrame) polItemsFrame.style.display = "none";
        return;
    }
    if (polItemsFrame) polItemsFrame.style.display = "";

    let filtered = rows;
    if (ksiazkaAdd.polLine) filtered = filtered.filter(r => (r.Linia || "(brak)") === ksiazkaAdd.polLine);

    let krotkie;
    if (typeof polSortedOpisKrotkiForLine === "function" && ksiazkaAdd.polLine) {
        krotkie = polSortedOpisKrotkiForLine(ksiazkaAdd.polLine, filtered);
    } else {
        krotkie = [...new Set(filtered.map(r => r.OpisKrotki || "(bez opisu)"))].sort((a, b) => a.localeCompare(b, "pl", { numeric: true, sensitivity: "base" }));
    }
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

    let level3;
    if (typeof polSortedRowsForGroup === "function" && ksiazkaAdd.polLine) {
        level3 = polSortedRowsForGroup(ksiazkaAdd.polLine, ksiazkaAdd.polOpis, appState.polecenia?.rows || [])
            .map(x => ({ ...x.r, _index: x.i }));
    } else {
        level3 = filtered.filter(r => (r.OpisKrotki || "(bez opisu)") === ksiazkaAdd.polOpis);
    }
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
    ksiazkaAdd.osoby = [];
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

/** Wykryj procedurę ze zgłoszeń zaznaczonych w oknie Dodaj wpis */
function detectKsiazkaAddProcedure() {
    const rows = appState.zgloszenia?.rows || [];
    const selected = (ksiazkaAdd.zglIndexes || [])
        .map(i => ({ i, row: rows[i] }))
        .filter(x => x.row && x.row.procedureId && (x.row.procedureRole === "start" || x.row.procedureRole === "end"));

    if (!selected.length) return null;

    const starts = selected.filter(x => x.row.procedureRole === "start");
    const ends = selected.filter(x => x.row.procedureRole === "end");

    // Oba końce tej samej procedury
    for (const s of starts) {
        const end = ends.find(e => String(e.row.procedureId) === String(s.row.procedureId));
        if (end) {
            return {
                both: true,
                procedureId: s.row.procedureId,
                startRow: s.row,
                endRow: end.row
            };
        }
    }
    // Tylko start – procedura „otwarta”, czeka na koniec
    if (starts.length) {
        return {
            both: false,
            procedureId: starts[0].row.procedureId,
            procedureRole: "start",
            row: starts[0].row
        };
    }
    // Tylko koniec
    if (ends.length) {
        return {
            both: false,
            procedureId: ends[0].row.procedureId,
            procedureRole: "end",
            row: ends[0].row
        };
    }
    return null;
}

function ksiazkaAddResolveData(godzStart) {
    const parts = typeof parseTimeParts === "function" ? parseTimeParts(godzStart) : null;
    let dataWpisu = todayPL();
    if (parts) {
        const now = new Date();
        const currentHour = now.getHours();
        if (currentHour >= 18 && parts.h < 12) {
            dataWpisu = typeof tomorrowPL === "function" ? tomorrowPL() : dataWpisu;
        }
    }
    return dataWpisu;
}

/** Rozdziel patrol – jak w generatorze, z formatem „patrol: funkcjonariusz” */
function openKsiazkaRozdzielPatrol() {
    if (!ksiazkaAdd.patrole || !ksiazkaAdd.patrole.length) {
        if (typeof showToast === "function") showToast("Najpierw zaznacz patrol");
        else alert("Najpierw zaznacz patrol");
        return;
    }
    if (typeof openRozbijPatrolModal !== "function" || typeof _rozbij === "undefined") {
        alert("Funkcja Rozdziel patrol niedostępna");
        return;
    }
    // Zachowaj patrole generatora – przywrócimy przy zamknięciu modala
    window._ksiazkaRozdzielPrevPatrols = (typeof selectedPatrols !== "undefined") ? [...selectedPatrols] : [];
    if (typeof selectedPatrols !== "undefined") selectedPatrols = [...ksiazkaAdd.patrole];

    _rozbij.fromKsiazka = true;
    _rozbij.personDetails = (typeof getRozbijPeopleDetailedFromSelectedPatrols === "function")
        ? getRozbijPeopleDetailedFromSelectedPatrols(ksiazkaAdd.patrole)
        : [];
    _rozbij.zglIndexes = [...(ksiazkaAdd.zglIndexes || [])];
    _rozbij.polIndexes = [...(ksiazkaAdd.polIndexes || [])];
    openRozbijPatrolModal();
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
    const dataWpisu = ksiazkaAddResolveData(godzStart);
    const proc = detectKsiazkaAddProcedure();
    const baseId = Date.now() + Math.random().toString(36).slice(2);
    const patrole = [...ksiazkaAdd.patrole];

    if (proc && proc.both) {
        // Start + koniec tej samej procedury w jednym zapisie
        const osobySel = (Array.isArray(ksiazkaAdd.osoby) && ksiazkaAdd.osoby.length) ? [...ksiazkaAdd.osoby] : null;
        appState.ksiazkaWydarzen.push({
            id: baseId + "-s",
            data: dataWpisu,
            godzinaStart: godzStart,
            tekst: capitalizeSentencesHtmlKs(tekst),
            patrole,
            zrobione: false,
            procedureId: proc.procedureId,
            procedureRole: "start",
            createdAt: new Date().toISOString(),
            ...(osobySel ? { osoby: osobySel } : {})
        });
        appState.ksiazkaWydarzen.push({
            id: baseId + "-e",
            data: dataWpisu,
            godzinaStart: godzStart,
            tekst: capitalizeSentencesHtmlKs(tekst),
            patrole,
            zrobione: false,
            procedureId: proc.procedureId,
            procedureRole: "end",
            createdAt: new Date().toISOString(),
            ...(osobySel ? { osoby: osobySel } : {})
        });
        await saveState();
        renderKsiazka();
        ksiazkaAdd.zglIndexes = [];
        ksiazkaAdd.polIndexes = [];
        ksiazkaAdd.zglOpis = null;
        ksiazkaAdd.polOpis = null;
        ksiazkaAdd.osoby = [];
        const prev = document.getElementById("ksAddPreview");
        if (prev) prev.innerHTML = "";
        ksiazkaAddRenderZgl();
        ksiazkaAddRenderPol();
        if (typeof showToast === "function") showToast("✅ Zapisano procedurę (start + koniec)");
        else alert("Zapisano procedurę (start + koniec)");
        return;
    }

    const entry = {
        id: baseId,
        data: dataWpisu,
        godzinaStart: godzStart,
        tekst: capitalizeSentencesHtmlKs(tekst),
        patrole,
        zrobione: false,
        createdAt: new Date().toISOString()
    };

    if (proc && proc.procedureId && proc.procedureRole) {
        entry.procedureId = proc.procedureId;
        entry.procedureRole = proc.procedureRole;
    }
    if (Array.isArray(ksiazkaAdd.osoby) && ksiazkaAdd.osoby.length) {
        entry.osoby = [...ksiazkaAdd.osoby];
    }

    appState.ksiazkaWydarzen.push(entry);

    await saveState();
    renderKsiazka();

    // Zostaw okno otwarte – wyczyść tylko treść/wybór kafelków, patrole i godzinę zostaw
    ksiazkaAdd.zglIndexes = [];
    ksiazkaAdd.polIndexes = [];
    ksiazkaAdd.zglOpis = null;
    ksiazkaAdd.polOpis = null;
    ksiazkaAdd.osoby = [];
    const prev = document.getElementById("ksAddPreview");
    if (prev) prev.innerHTML = "";
    ksiazkaAddRenderZgl();
    ksiazkaAddRenderPol();

    let msg = "✅ Zapisano – możesz dodać kolejny";
    if (proc && proc.procedureRole === "start") {
        msg = "✅ Start procedury zapisany – dodaj koniec osobnym wpisem (kafelka ■ koniec)";
    } else if (proc && proc.procedureRole === "end") {
        msg = "✅ Koniec procedury zapisany – możesz odświeżyć statystyki";
    }
    if (typeof showToast === "function") showToast(msg);
    else alert(msg);
}

// =====================================
// EXPOSE
// =====================================
window.initKsiazka = initKsiazka;
window.setupKsiazkaShortcuts = setupKsiazkaShortcuts;
window.renderKsiazka = renderKsiazka;
window.openKsiazkaSaveModal = openKsiazkaSaveModal;
window.closeKsiazkaSaveModal = closeKsiazkaSaveModal;
window.confirmSaveToKsiazka = confirmSaveToKsiazka;
window.toggleKsiazkaFilter = toggleKsiazkaFilter;
window.clearKsiazkaFilter = clearKsiazkaFilter;
window.oznaczZrobione = oznaczZrobione;
window.odznaczZrobione = odznaczZrobione;
window.removeSprawdzeniaLinkedToEntry = removeSprawdzeniaLinkedToEntry;
window.usunWpisKsiazki = usunWpisKsiazki;
window.clearAllKsiazka = clearAllKsiazka;
window.kopiujWpisKsiazki = kopiujWpisKsiazki;
window.edytujWpisKsiazki = edytujWpisKsiazki;
window.insertTileToEdit = insertTileToEdit;
window.replaceAllFromTile = replaceAllFromTile;
window.closeKsiazkaEditModal = closeKsiazkaEditModal;
window.confirmEditKsiazka = confirmEditKsiazka;
window.openPlanSluzbyModal = openPlanSluzbyModal;
window.planToggleSzablonyCollapse = planToggleSzablonyCollapse;
window.planToggleCycCollapse = planToggleCycCollapse;
window.planSetMultiPatrolDesc = planSetMultiPatrolDesc;
window.planToggleSelectPoint = planToggleSelectPoint;
window.planInsertPatrolMarker = planInsertPatrolMarker;
window.planStripPatrolMarkers = planStripPatrolMarkers;

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
window.getKsiazkaSprawdzenieGroups = getKsiazkaSprawdzenieGroups;
window.ksiazkaSprawdzenieToggleGroup = ksiazkaSprawdzenieToggleGroup;
window.findProcedureEndEntry = findProcedureEndEntry;
window.openKsiazkaSprawdzenieModal = openKsiazkaSprawdzenieModal;
window.closeKsiazkaSprawdzenieModal = closeKsiazkaSprawdzenieModal;
window.ksiazkaSprawdzenieToggleEntry = ksiazkaSprawdzenieToggleEntry;
window.ksiazkaSprawdzenieZaznaczWszystkie = ksiazkaSprawdzenieZaznaczWszystkie;
window.ksiazkaSprawdzenieZaznaczTylkoNowe = ksiazkaSprawdzenieZaznaczTylkoNowe;
window.ksiazkaSprawdzenieZapisz = ksiazkaSprawdzenieZapisz;
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
window.ksiazkaSprawdGodzOdChange = (typeof ksiazkaSprawdGodzOdChange === "function") ? ksiazkaSprawdGodzOdChange : function(){};
window.confirmKsiazkaSprawdzenie = confirmKsiazkaSprawdzenie;

window.toggleKsiazkaInterwencjeMode = toggleKsiazkaInterwencjeMode;
window.openKsiazkaInterwencjaModal = openKsiazkaInterwencjaModal;
window.ksiazkaInterwencjaResolveTags = ksiazkaInterwencjaResolveTags;
window.ksiazkaInterwencjaWstawSzablon = ksiazkaInterwencjaWstawSzablon;
window.inneToggleGroup = inneToggleGroup;
window.inneAddCount = inneAddCount;
window.inneInsertItemToText = inneInsertItemToText;
window.inneRenderGroupsPanel = inneRenderGroupsPanel;
window.inneWstawWszystkieDane = inneWstawWszystkieDane;
window.inneSaveNote = inneSaveNote;

window.confirmKsiazkaInterwencja = confirmKsiazkaInterwencja;
window.ksiazkaProceduraBadgeHtml = ksiazkaProceduraBadgeHtml;
window.ksiazkaInterwencjeModeBtnsHtml = ksiazkaInterwencjeModeBtnsHtml;
window.ksiazkaEntryTopBadgesHtml = ksiazkaEntryTopBadgesHtml;
window.ksiazkaInterwencjeBadgesHtml = ksiazkaInterwencjeBadgesHtml;

window.removeKsiazkaInterwencja = removeKsiazkaInterwencja;


window.openKsiazkaUwagiPicker = openKsiazkaUwagiPicker;
window.closeKsiazkaUwagiPicker = closeKsiazkaUwagiPicker;
window.ksiazkaUwagiWybrano = ksiazkaUwagiWybrano;
window.ksiazkaUwagiDodajSzablon = ksiazkaUwagiDodajSzablon;
window.closeKsiazkaUwagiEditModal = closeKsiazkaUwagiEditModal;
window.confirmKsiazkaUwagi = confirmKsiazkaUwagi;

window.openKsiazkaAddModal = openKsiazkaAddModal;
window.closeKsiazkaAddModal = closeKsiazkaAddModal;
window.openKsiazkaRozdzielPatrol = openKsiazkaRozdzielPatrol;
window.detectKsiazkaAddProcedure = detectKsiazkaAddProcedure;
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
