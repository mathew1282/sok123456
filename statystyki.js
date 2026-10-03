// =====================================
// STATYSTYKI
// =====================================

function ensureStatystykiState() {
    if (!appState.statystyki) {
        appState.statystyki = { interwencje: [], sprawdzenia: [], wyniki: {} };
    }
    if (!Array.isArray(appState.statystyki.interwencje)) appState.statystyki.interwencje = [];
    if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
    if (!appState.statystyki.wyniki || typeof appState.statystyki.wyniki !== "object") {
        appState.statystyki.wyniki = {};
    }
}

function todayPL() {
    return new Date().toLocaleDateString("pl-PL");
}

function nowHHMM() {
    return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

async function logInterwencja(typ, extra) {
    ensureStatystykiState();
    let t = String(typ || "Inne").trim() || "Inne";
    if (t === "M") t = "MKK";
    if (t === "P") t = "Pouczony";
    if (t === "L") t = "Legitymowany";
    if (t === "I") t = "Inne";
    const row = {
        data: todayPL(),
        typ: t,
        godzina: nowHHMM()
    };
    if (extra && typeof extra === "object") {
        if (extra.entryId) row.entryId = extra.entryId;
        if (extra.godzina) row.godzina = extra.godzina;
        if (extra.data) row.data = extra.data;
        if (extra.kwota != null && Number(extra.kwota) > 0) row.kwota = Number(extra.kwota);
    }
    appState.statystyki.interwencje.push(row);
    if (typeof wynikiSyncAutoToState === "function") wynikiSyncAutoToState();
    await saveState();
}

async function logSprawdzenie(payload) {
    ensureStatystykiState();
    const row = {
        data: payload.data || todayPL(),
        rodzaj: payload.rodzaj || "",
        nazwa: payload.nazwa || "",
        linia: payload.linia || "",
        kmOd: payload.kmOd || "",
        kmDo: payload.kmDo || "",
        godzOd: payload.godzOd || "",
        godzDo: payload.godzDo || ""
    };
    if (payload.dataDo) row.dataDo = payload.dataDo;
    if (payload.czas != null) row.czas = payload.czas;
    if (payload.czasMin != null) row.czasMin = payload.czasMin;
    if (payload.entryId) row.entryId = payload.entryId;
    if (payload.entryIdEnd) row.entryIdEnd = payload.entryIdEnd;
    if (payload.procedureId) row.procedureId = payload.procedureId;
    if (Array.isArray(payload.osoby) && payload.osoby.length) {
        row.osoby = payload.osoby.map(x => String(x || "").trim()).filter(Boolean);
    }
    appState.statystyki.sprawdzenia.push(row);
    if (typeof wynikiSyncAutoToState === "function") wynikiSyncAutoToState();
    await saveState();
}

/** Klucz unikalności sprawdzenia: linia + nazwa + data + godziny (+ rodzaj).
 *  Ten sam szlak w inne godziny / inny dzień = osobny wpis. */
function sprawdzenieUniqueKey(s) {
    return [
        String(s.rodzaj || "").trim().toLowerCase(),
        String(s.nazwa || "").trim().toLowerCase(),
        String(s.linia || "").trim().toLowerCase(),
        String(s.data || "").trim(),
        String(s.godzOd || "").trim(),
        String(s.godzDo || "").trim(),
        String(s.kmOd || "").trim(),
        String(s.kmDo || "").trim()
    ].join("|");
}

function isSprawdzenieAlreadyInStats(payload) {
    ensureStatystykiState();
    const key = sprawdzenieUniqueKey(payload);
    if (appState.statystyki.sprawdzenia.some(s => sprawdzenieUniqueKey(s) === key)) return true;
    // dodatkowo: ten sam entryId startu (jeśli jest) + te same godziny
    if (payload.entryId) {
        const eid = String(payload.entryId);
        const go = String(payload.godzOd || "").trim();
        const gd = String(payload.godzDo || "").trim();
        if (appState.statystyki.sprawdzenia.some(s =>
            s.entryId && String(s.entryId) === eid &&
            String(s.godzOd || "").trim() === go &&
            String(s.godzDo || "").trim() === gd
        )) return true;
    }
    return false;
}

function isInterwencjaAlreadyInStats(entryId, typ, data, godzina) {
    ensureStatystykiState();
    const t = normalizeInterwencjaTyp(typ);
    return appState.statystyki.interwencje.some(i => {
        if (normalizeInterwencjaTyp(i.typ) !== t) return false;
        if (entryId && i.entryId && String(i.entryId) === String(entryId)) return true;
        if (entryId && i.entryId) return false;
        return String(i.data || "") === String(data || "") &&
            String(i.godzina || "") === String(godzina || "");
    });
}

/**
 * Odśwież statystyki z całej książki wydarzeń.
 * – skanuje procedury sprawdzeń (szlak / stacja) i interwencje
 * – dosypuje wyłącznie nowe (po linii, dniu, godzinach)
 * – ten sam szlak, inne godziny → zapisuje osobno
 */
async function refreshStatystykiFromKsiazka() {
    ensureStatystykiState();
    if (typeof ensureKsiazkaState === "function") ensureKsiazkaState();

    let addedSpr = 0;
    let addedInt = 0;
    let skippedSpr = 0;
    let skippedInt = 0;
    let openGroups = 0;

    // --- SPRAWDZENIA (szlaki / stacje) ---
    if (typeof getKsiazkaSprawdzenieGroups === "function") {
        const groups = getKsiazkaSprawdzenieGroups() || [];
        for (const g of groups) {
            if (!g || !g.closed || !g.godzOd || !g.godzDo) {
                if (g && (!g.closed || !g.godzOd || !g.godzDo)) openGroups++;
                continue;
            }
            const dataOd = g.dataOd || (g.startEntry && g.startEntry.data) || todayPL();
            const dataDo = g.dataDo || (g.endEntry && g.endEntry.data) || dataOd;
            let czas = "";
            let czasMin = 0;
            if (typeof durationMinutesBetween === "function" && typeof formatDurationMin === "function") {
                czasMin = durationMinutesBetween(dataOd, g.godzOd, dataDo, g.godzDo);
                czas = formatDurationMin(czasMin);
            }
            const osobyRef = [];
            const _pushO = (arr) => {
                (arr || []).forEach(n => {
                    const t = String(n || "").trim();
                    if (t && !osobyRef.includes(t)) osobyRef.push(t);
                });
            };
            _pushO(g.startEntry && g.startEntry.osoby);
            _pushO(g.endEntry && g.endEntry.osoby);

            const payload = {
                rodzaj: (g.meta && g.meta.Rodzaj) || "",
                nazwa: (g.meta && g.meta.Nazwa) || "",
                linia: (g.meta && g.meta.Linia) || "",
                kmOd: (g.meta && g.meta.KmOd) || "",
                kmDo: (g.meta && g.meta.KmDo) || "",
                godzOd: g.godzOd,
                godzDo: g.godzDo,
                data: dataOd,
                dataDo,
                czas,
                czasMin,
                entryId: (g.startEntry && g.startEntry.id) || null,
                entryIdEnd: (g.endEntry && g.endEntry.id) || null,
                procedureId: g.procedureId || null,
                ...(osobyRef.length ? { osoby: osobyRef } : {})
            };
            if (isSprawdzenieAlreadyInStats(payload)) {
                skippedSpr++;
                continue;
            }
            // zapis bez podwójnego saveState w pętli – push ręcznie
            const row = {
                data: payload.data,
                rodzaj: payload.rodzaj,
                nazwa: payload.nazwa,
                linia: payload.linia,
                kmOd: payload.kmOd,
                kmDo: payload.kmDo,
                godzOd: payload.godzOd,
                godzDo: payload.godzDo,
                dataDo: payload.dataDo,
                czas: payload.czas,
                czasMin: payload.czasMin
            };
            if (payload.entryId) row.entryId = payload.entryId;
            if (payload.entryIdEnd) row.entryIdEnd = payload.entryIdEnd;
            if (payload.procedureId) row.procedureId = payload.procedureId;
            if (payload.osoby && payload.osoby.length) row.osoby = [...payload.osoby];
            appState.statystyki.sprawdzenia.push(row);
            addedSpr++;
        }
    }

    // --- INTERWENCJE z oznaczeń na wpisach książki ---
    const entries = appState.ksiazkaWydarzen || [];
    const typMap = {
        M: "MKK", MKK: "MKK",
        P: "Pouczony", Pouczony: "Pouczony",
        L: "Legitymowany", Legitymowany: "Legitymowany",
        I: "Inne", Inne: "Inne"
    };
    for (const entry of entries) {
        if (!entry || !entry.interwencje || typeof entry.interwencje !== "object") continue;
        const seen = new Set();
        for (const key of Object.keys(entry.interwencje)) {
            if (!entry.interwencje[key]) continue;
            const typ = typMap[key] || normalizeInterwencjaTyp(key);
            if (seen.has(typ)) continue;
            seen.add(typ);
            const data = entry.data || todayPL();
            const godzina = entry.godzinaStart || "";
            if (isInterwencjaAlreadyInStats(entry.id, typ, data, godzina)) {
                skippedInt++;
                continue;
            }
            appState.statystyki.interwencje.push({
                data,
                typ,
                godzina,
                entryId: entry.id || null
            });
            addedInt++;
        }
    }

    if (typeof wynikiSyncAutoToState === "function") wynikiSyncAutoToState();
    await saveState();
    renderStatystyki();

    const parts = [];
    if (addedSpr) parts.push(`+${addedSpr} sprawdzeń`);
    if (addedInt) parts.push(`+${addedInt} interwencji`);
    if (!addedSpr && !addedInt) {
        const msg = openGroups
            ? `Brak nowych do dopisania (${openGroups} procedur bez zamknięcia w książce)`
            : "Wszystko aktualne – brak nowych statystyk do dopisania";
        if (typeof showToast === "function") showToast("ℹ️ " + msg);
        else alert(msg);
        return;
    }
    let extra = "";
    if (skippedSpr || skippedInt) {
        extra = ` (pominięto istniejące: ${skippedSpr} spr., ${skippedInt} int.)`;
    }
    if (openGroups) extra += `; ${openGroups} bez zamknięcia`;
    const msg = "✅ Odświeżono: " + parts.join(", ") + extra;
    if (typeof showToast === "function") showToast(msg);
    else alert(msg);
}

/** Sortowanie: najstarsze na górze (pierwszy wpis zostaje pierwszy) */
function sortStatNewestFirst(arr) {
    return [...(arr || [])].sort((a, b) => {
        const da = String(a.data || "");
        const db = String(b.data || "");
        if (da !== db) {
            // data w formacie pl-PL: dd.mm.rrrr
            const pa = da.split(".").map(Number);
            const pb = db.split(".").map(Number);
            if (pa.length === 3 && pb.length === 3) {
                const ta = new Date(pa[2], pa[1] - 1, pa[0]).getTime();
                const tb = new Date(pb[2], pb[1] - 1, pb[0]).getTime();
                if (ta !== tb) return ta - tb;
            } else {
                return da.localeCompare(db, "pl");
            }
        }
        const ga = String(a.godzOd || a.godzina || "");
        const gb = String(b.godzOd || b.godzina || "");
        return ga.localeCompare(gb, "pl");
    });
}


function normalizeInterwencjaTyp(t) {
    t = String(t || "Inne").trim();
    if (t === "M" || t.toUpperCase() === "MKK") return "MKK";
    if (t === "P" || /^poucz/i.test(t)) return "Pouczony";
    if (t === "L" || /^legitym/i.test(t)) return "Legitymowany";
    if (t === "I" || /^inne$/i.test(t)) return "Inne";
    return t;
}

function findKsiazkaEntryById(id) {
    if (!id) return null;
    const list = appState.ksiazkaWydarzen || [];
    return list.find(e => String(e.id) === String(id)) || null;
}

function stripHtmlPreview(html, maxLen) {
    let s = String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen) + "…";
    return s;
}

function getInterwencjeDlaTypu(typFilter) {
    ensureStatystykiState();
    const all = sortStatNewestFirst(appState.statystyki.interwencje || []);
    if (typFilter === "ALL") return all;
    return all.filter(i => normalizeInterwencjaTyp(i.typ) === typFilter);
}

function openInterwencjeSzczegoly(typFilter) {
    const items = getInterwencjeDlaTypu(typFilter);
    const title = typFilter === "ALL" ? "Wszystkie interwencje" : ("Interwencje: " + typFilter);

    const old = document.getElementById("interwencjeSzczegolyModal");
    if (old) old.remove();

    let body;
    if (!items.length) {
        body = `<p style="color:var(--text-dim); padding:12px 0;">Brak zapisanych interwencji tego typu.</p>`;
    } else {
        body = items.map((i, n) => {
            const entry = findKsiazkaEntryById(i.entryId);
            const data = i.data || entry?.data || "—";
            const godz = i.godzina || entry?.godzinaStart || "—";
            const typ = normalizeInterwencjaTyp(i.typ);
            let preview = "";
            if (entry) {
                preview = stripHtmlPreview(entry.tekst, 180);
            } else {
                preview = "(brak powiązanego wpisu w książce – interwencja zapisana tylko w statystykach)";
            }
            const patrol = entry && Array.isArray(entry.patrole)
                ? entry.patrole.map(pi => {
                    const p = (appState.patrole || [])[pi];
                    return p ? (p.nazwa || ("Patrol " + (pi + 1))) : "";
                }).filter(Boolean).join(", ")
                : "";
            return `
            <div style="border:1px solid var(--border,#334155); border-radius:10px; padding:12px; margin-bottom:10px; background:var(--bg-input,#1e293b);">
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px;">
                    <span style="font-weight:800; color:var(--primary-light,#60a5fa);">${escapeHtml(typ)}</span>
                    <span style="font-size:13px; color:var(--text-dim);">${escapeHtml(String(data))} · <strong>${escapeHtml(String(godz))}</strong></span>
                    ${patrol ? `<span style="font-size:12px; color:var(--text-dim);">· ${escapeHtml(patrol)}</span>` : ""}
                    <span style="font-size:11px; color:var(--text-dim); margin-left:auto;">#${n + 1}</span>
                </div>
                <div style="font-size:13.5px; line-height:1.45; white-space:pre-wrap; color:var(--text,#e2e8f0);">${escapeHtml(preview)}</div>
            </div>`;
        }).join("");
    }

    const overlay = document.createElement("div");
    overlay.id = "interwencjeSzczegolyModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML = `
        <div class="modal" style="max-width:640px; max-height:90vh; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
                <h2 style="margin:0;">${escapeHtml(title)}</h2>
                <span style="font-size:13px; color:var(--text-dim);">${items.length} szt.</span>
            </div>
            <p style="color:var(--text-dim); font-size:13px; margin:0 0 12px 0;">
                Lista interwencji z podglądem treści z <strong>Książki wydarzeń</strong> (jeśli jest powiązanie).
            </p>
            <div style="flex:1; overflow:auto; min-height:0;">${body}</div>
            <div class="modal-actions" style="margin-top:12px;">
                <button class="btn-danger" onclick="closeInterwencjeSzczegoly()">Zamknij</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeInterwencjeSzczegoly() {
    const m = document.getElementById("interwencjeSzczegolyModal");
    if (m) m.remove();
}


function initStatystyki() {
    ensureStatystykiState();
    renderStatystyki();
}

function renderStatystyki() {
    const container = document.getElementById("statystykiContainer");
    if (!container) return;
    ensureStatystykiState();

    // WSZYSTKIE wpisy – bez filtrowania po dniu
    const interwencje = sortStatNewestFirst(appState.statystyki.interwencje);
    const sprawdzenia = sortStatNewestFirst(appState.statystyki.sprawdzenia);

    const counts = { MKK: 0, Pouczony: 0, Legitymowany: 0, Inne: 0 };
    interwencje.forEach(i => {
        let t = String(i.typ || "Inne").trim();
        // normalizacja skrótów z książki
        if (t === "M" || t.toUpperCase() === "MKK") t = "MKK";
        else if (t === "P" || /^poucz/i.test(t)) t = "Pouczony";
        else if (t === "L" || /^legitym/i.test(t)) t = "Legitymowany";
        else if (t === "I" || /^inne$/i.test(t)) t = "Inne";
        if (counts[t] !== undefined) counts[t]++;
        else counts.Inne++;
    });

    const szlaki = sprawdzenia.filter(s => s.rodzaj === "Szlak");
    const towarowe = sprawdzenia.filter(s => s.rodzaj === "Stacja towarowa");
    const osobowe = sprawdzenia.filter(s => s.rodzaj === "Stacja osobowa");

    let html = `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
            <h2 style="margin:0;">Statystyki</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <button class="btn-success" onclick="refreshStatystykiFromKsiazka()">Odśwież</button>
                <button class="btn-primary" onclick="openWynikiModal()">📋 Wyniki</button>
                <button class="btn-danger" onclick="clearAllStatystyki()">Kasuj wszystkie statystyki</button>
            </div>
        </div>
        <p style="color:#94a3b8; font-size:14px; margin-bottom:16px;">
            Pokazywane są <strong>wszystkie</strong> zapisane wpisy (ze wszystkich dni).
            „Odśwież” skanuje książkę i dopisuje tylko nowe (po linii, dniu i godzinach).
            Usuwają się po kliknięciu „Kasuj wszystkie” albo pojedynczego „Usuń”.
        </p>

        <p style="color:var(--text-dim,#94a3b8); font-size:13px; margin:0 0 10px 0;">Kliknij kafelkę MKK / P / L / Inne, aby zobaczyć powiązane wpisy z książki.</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin-bottom:22px;">
            <div role="button" tabindex="0" onclick="openInterwencjeSzczegoly('MKK')"
                 style="cursor:pointer; background:rgba(96,165,250,.12); border:1px solid #60a5fa; border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">MKK</div>
                <div style="font-size:26px; font-weight:800; color:#60a5fa;">${counts.MKK}</div>
            </div>
            <div role="button" tabindex="0" onclick="openInterwencjeSzczegoly('Pouczony')"
                 style="cursor:pointer; background:rgba(52,211,153,.12); border:1px solid #34d399; border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Pouczony (P)</div>
                <div style="font-size:26px; font-weight:800; color:#34d399;">${counts.Pouczony}</div>
            </div>
            <div role="button" tabindex="0" onclick="openInterwencjeSzczegoly('Legitymowany')"
                 style="cursor:pointer; background:rgba(251,146,60,.12); border:1px solid #fb923c; border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Legitymowany (L)</div>
                <div style="font-size:26px; font-weight:800; color:#fb923c;">${counts.Legitymowany}</div>
            </div>
            <div role="button" tabindex="0" onclick="openInterwencjeSzczegoly('Inne')"
                 style="cursor:pointer; background:var(--bg-input,#1e293b); border:1px solid var(--border,#334155); border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Inne</div>
                <div style="font-size:26px; font-weight:800;">${counts.Inne}</div>
            </div>
            <div role="button" tabindex="0" onclick="openInterwencjeSzczegoly('ALL')"
                 style="cursor:pointer; background:var(--bg-input,#1e293b); border:1px solid var(--border,#334155); border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Razem interwencje</div>
                <div style="font-size:26px; font-weight:800;">${counts.MKK + counts.Pouczony + counts.Legitymowany + counts.Inne}</div>
            </div>
        </div>

        <h3>Stacje towarowe (${towarowe.length})</h3>
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Godz. rozpoczęcia</th>
                    <th>Godz. zakończenia</th>
                    <th>Nazwa stacji</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (towarowe.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Brak</td></tr>`;
    } else {
        towarowe.forEach((s) => {
            const globalIdx = appState.statystyki.sprawdzenia.indexOf(s);
            html += `<tr>
                <td>${escapeHtml(s.data)}</td>
                <td>${escapeHtml(s.godzOd)}</td>
                <td>${escapeHtml(s.godzDo)}</td>
                <td>${escapeHtml(s.nazwa)}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-primary" onclick="editSprawdzenie(${globalIdx})">Edytuj</button>
                    <button class="btn-danger" onclick="removeSprawdzenie(${globalIdx})">Usuń</button>
                </td>
            </tr>`;
        });
    }

    html += `
            </tbody>
        </table>
        <br>

        <h3>Stacje osobowe (${osobowe.length})</h3>
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Godz. rozpoczęcia</th>
                    <th>Godz. zakończenia</th>
                    <th>Nazwa stacji</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (osobowe.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Brak</td></tr>`;
    } else {
        osobowe.forEach((s) => {
            const globalIdx = appState.statystyki.sprawdzenia.indexOf(s);
            html += `<tr>
                <td>${escapeHtml(s.data)}</td>
                <td>${escapeHtml(s.godzOd)}</td>
                <td>${escapeHtml(s.godzDo)}</td>
                <td>${escapeHtml(s.nazwa)}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-primary" onclick="editSprawdzenie(${globalIdx})">Edytuj</button>
                    <button class="btn-danger" onclick="removeSprawdzenie(${globalIdx})">Usuń</button>
                </td>
            </tr>`;
        });
    }

    html += `
            </tbody>
        </table>
        <br>

        <h3>Sprawdzenia szlaków (${szlaki.length})</h3>
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Godz. rozpoczęcia</th>
                    <th>Godz. zakończenia</th>
                    <th>Nazwa szlaku</th>
                    <th>Km początek</th>
                    <th>Km koniec</th>
                    <th>Nr linii</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (szlaki.length === 0) {
        html += `<tr><td colspan="8" style="text-align:center;color:#94a3b8;">Brak</td></tr>`;
    } else {
        szlaki.forEach((s) => {
            const globalIdx = appState.statystyki.sprawdzenia.indexOf(s);
            html += `<tr>
                <td>${escapeHtml(s.data)}</td>
                <td>${escapeHtml(s.godzOd)}</td>
                <td>${escapeHtml(s.godzDo)}</td>
                <td>${escapeHtml(s.nazwa)}</td>
                <td>${escapeHtml(s.kmOd)}</td>
                <td>${escapeHtml(s.kmDo)}</td>
                <td>${escapeHtml(s.linia)}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-primary" onclick="editSprawdzenie(${globalIdx})">Edytuj</button>
                    <button class="btn-danger" onclick="removeSprawdzenie(${globalIdx})">Usuń</button>
                </td>
            </tr>`;
        });
    }

    html += `
            </tbody>
        </table>
        <br>
        <button class="btn-primary" onclick="copySzlaki()">Kopiuj szlaki do Excela</button>
    </div>
    `;

    container.innerHTML = html;
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === "function") showToast("✅ Skopiowano do schowka");
        else alert("Skopiowano");
    }).catch(() => alert("Nie udało się skopiować"));
}

function copySzlaki() {
    ensureStatystykiState();
    const szlaki = sortStatNewestFirst(appState.statystyki.sprawdzenia)
        .filter(s => s.rodzaj === "Szlak");
    if (szlaki.length === 0) {
        if (typeof showToast === "function") showToast("Brak wierszy do skopiowania");
        else alert("Brak wierszy do skopiowania");
        return;
    }
    const rows = szlaki.map(s =>
        [s.data, s.godzOd, s.godzDo, s.nazwa, s.kmOd, s.kmDo, s.linia].join("\t")
    );
    copyText(rows.join("\n"));
}

function editSprawdzenie(index) {
    ensureStatystykiState();
    const s = appState.statystyki.sprawdzenia[index];
    if (!s) return;

    let existing = document.getElementById("editSprawdzenieModal");
    if (existing) existing.remove();

    const isSzlak = s.rodzaj === "Szlak";

    const overlay = document.createElement("div");
    overlay.id = "editSprawdzenieModal";
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <h2>Edytuj sprawdzenie</h2>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:12px;">${escapeHtml(s.rodzaj || "")}</p>

            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                <div style="flex:1; min-width:120px;">
                    <label>Data</label>
                    <input type="text" id="editSprData" value="${escapeHtml(s.data || "")}" style="width:100%;">
                </div>
                <div style="flex:1; min-width:100px;">
                    <label>Godz. rozpoczęcia</label>
                    <input type="text" id="editSprGodzOd" value="${escapeHtml(s.godzOd || "")}" placeholder="gg:mm" style="width:100%;">
                </div>
                <div style="flex:1; min-width:100px;">
                    <label>Godz. zakończenia</label>
                    <input type="text" id="editSprGodzDo" value="${escapeHtml(s.godzDo || "")}" placeholder="gg:mm" style="width:100%;">
                </div>
            </div>

            <label>${isSzlak ? "Nazwa szlaku" : "Nazwa stacji"}</label>
            <input type="text" id="editSprNazwa" value="${escapeHtml(s.nazwa || "")}" style="width:100%; margin-bottom:12px;">

            ${isSzlak ? `
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                <div style="flex:1; min-width:100px;">
                    <label>Km początek</label>
                    <input type="text" id="editSprKmOd" value="${escapeHtml(s.kmOd || "")}" style="width:100%;">
                </div>
                <div style="flex:1; min-width:100px;">
                    <label>Km koniec</label>
                    <input type="text" id="editSprKmDo" value="${escapeHtml(s.kmDo || "")}" style="width:100%;">
                </div>
                <div style="flex:1; min-width:100px;">
                    <label>Nr linii</label>
                    <input type="text" id="editSprLinia" value="${escapeHtml(s.linia || "")}" style="width:100%;">
                </div>
            </div>
            ` : `
            <input type="hidden" id="editSprKmOd" value="${escapeHtml(s.kmOd || "")}">
            <input type="hidden" id="editSprKmDo" value="${escapeHtml(s.kmDo || "")}">
            <input type="hidden" id="editSprLinia" value="${escapeHtml(s.linia || "")}">
            `}

            <div class="modal-actions">
                <button class="btn-success" onclick="saveEditSprawdzenie(${index})">Zapisz</button>
                <button class="btn-danger" onclick="closeEditSprawdzenieModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeEditSprawdzenieModal() {
    const m = document.getElementById("editSprawdzenieModal");
    if (m) m.remove();
}

async function saveEditSprawdzenie(index) {
    ensureStatystykiState();
    const s = appState.statystyki.sprawdzenia[index];
    if (!s) return;

    s.data = (document.getElementById("editSprData")?.value || "").trim() || s.data;
    s.godzOd = (document.getElementById("editSprGodzOd")?.value || "").trim();
    s.godzDo = (document.getElementById("editSprGodzDo")?.value || "").trim();
    s.nazwa = (document.getElementById("editSprNazwa")?.value || "").trim();
    s.kmOd = (document.getElementById("editSprKmOd")?.value || "").trim();
    s.kmDo = (document.getElementById("editSprKmDo")?.value || "").trim();
    s.linia = (document.getElementById("editSprLinia")?.value || "").trim();

    await saveState();
    closeEditSprawdzenieModal();
    renderStatystyki();
    if (typeof showToast === "function") showToast("✅ Zapisano zmiany");
}

async function removeSprawdzenie(index) {
    ensureStatystykiState();
    if (!confirm("Usunąć ten wpis ze statystyk?")) return;
    appState.statystyki.sprawdzenia.splice(index, 1);
    if (typeof wynikiSyncAutoToState === "function") wynikiSyncAutoToState();
    await saveState();
    renderStatystyki();
}

async function clearAllStatystyki() {
    if (!confirm("Usunąć WSZYSTKIE statystyki (interwencje, sprawdzenia i wyniki)?")) return;
    ensureStatystykiState();
    appState.statystyki.interwencje = [];
    appState.statystyki.sprawdzenia = [];
    appState.statystyki.wyniki = {};
    if (typeof _wynikiState !== "undefined") _wynikiState.values = {};
    await saveState();
    renderStatystyki();
    if (typeof showToast === "function") showToast("🗑️ Statystyki i wyniki wyczyszczone");
}



// =====================================
// WYNIKI (formularz IOK – pozycje 25–76)
// =====================================

/** Katalog pozycji: grupy + nr + nazwa (bez 77+) */
const WYNIKI_CATALOG = [
    { group: "Interwencje wobec osób", items: [
        { nr: 25, name: "Ilość tylko legitymowanych" },
        { nr: 26, name: "Ilość pouczonych" },
        { nr: 27, name: "Ilość osób ukaranych mandatem karnym" },
        { nr: 28, name: "Kwota mandatów karnych" }
    ]},
    { group: "Ilość osób przekazanych do:", items: [
        { nr: 29, name: "Policji" },
        { nr: 30, name: "SG, ŻW, SM" },
        { nr: 31, name: "Inne" },
        { nr: 32, name: "Pisma interwencyjne do szkół i zakładów pracy" }
    ]},
    { group: "Użycie środków przymusu bezpośredniego", items: [
        { nr: 33, name: "Siła fizyczna" },
        { nr: 34, name: "Pałka służbowa" },
        { nr: 35, name: "RMG" },
        { nr: 36, name: "Kajdanki" },
        { nr: 37, name: "Pies służbowy" },
        { nr: 38, name: "Broń palna" },
        { nr: 39, name: "Paralizator" }
    ]},
    { group: "Wykorzystanie środków przymusu bezpośredniego", items: [
        { nr: 40, name: "Pałka służbowa" },
        { nr: 41, name: "RMG" },
        { nr: 42, name: "Broń palna" },
        { nr: 43, name: "Paralizator" }
    ]},
    { group: "Kontrole punktów skupu złomu", items: [
        { nr: 45, name: "Ilość kontroli" },
        { nr: 46, name: "Wykryte nieprawidłowości" },
        { nr: 47, name: "Wartość odzyskanego mienia" },
        { nr: 48, name: "Ujętych osób: Skupujących" },
        { nr: 49, name: "Ujętych osób: Sprzedających" }
    ]},
    { group: "Wykorzystanie w służbie", items: [
        { nr: 50, name: "Psów służbowych" },
        { nr: 51, name: "Samochodów służbowych" },
        { nr: 52, name: "Fotopułapki" },
        { nr: 53, name: "M C M" }
    ]},
    { group: "Użyte siły", items: [
        { nr: 54, name: "Policji" },
        { nr: 55, name: "ŻW" },
        { nr: 56, name: "SG" },
        { nr: 57, name: "SM" },
        { nr: 58, name: "Innych służb porządkowych (ITD, Izba Celna itp.)" },
        { nr: 59, name: "Innych pracowników kolejowych" },
        { nr: 60, name: "Ogółem" }
    ]},
    { group: "Ochrona transportów kolejowych", items: [
        { nr: 61, name: "Ilość konwojowanych przesyłek towarowych" },
        { nr: 62, name: "Ilość f-szy konw. przesyłki towarowe" },
        { nr: 63, name: "Ilość sprawdzonych wagonów" },
        { nr: 65, name: "Usterki: Brak plomb" },
        { nr: 66, name: "Usterki: Plomby uszkodzone lub nieczytelne" },
        { nr: 67, name: "Usterki: Inne usterki" }
    ]},
    { group: "Patrole w pociągach", items: [
        { nr: 68, name: "Pociągi międzynarodowe PKP IC" },
        { nr: 69, name: "Pociągi krajowe PKP IC" },
        { nr: 70, name: "Pociągi krajowe Przewozy Regionalne" },
        { nr: 71, name: "Pozostałe" }
    ]},
    { group: "Inne formy służby SOK", items: [
        { nr: 73, name: "Ilość patroli stacji osobowych" },
        { nr: 74, name: "Ilość patroli stacji towarowych" },
        { nr: 75, name: "Ilość patroli szlaków" },
        { nr: 76, name: "Ilość posterunków stałych" }
    ]}
];

/** Stan edycji wyników w sesji / po zapisie */
let _wynikiState = {
    values: {},      // nr -> number|string
    showAll: false
};

function wynikiFlatCatalog() {
    const out = [];
    WYNIKI_CATALOG.forEach(g => {
        g.items.forEach(it => out.push({ ...it, group: g.group }));
    });
    return out;
}

function wynikiNormalizeInterwencjaTyp(t) {
    t = String(t || "Inne").trim();
    if (t === "M" || t.toUpperCase() === "MKK") return "MKK";
    if (t === "P" || /^poucz/i.test(t)) return "Pouczony";
    if (t === "L" || /^legitym/i.test(t)) return "Legitymowany";
    if (t === "I" || /^inne$/i.test(t)) return "Inne";
    return t;
}

function wynikiNormalizeRodzaj(r) {
    const s = String(r || "").toLowerCase();
    if (s.includes("szlak")) return "Szlak";
    if (s.includes("osob")) return "Stacja osobowa";
    if (s.includes("towar")) return "Stacja towarowa";
    return String(r || "");
}

function wynikiIsPatrolDz(patrol) {
    const n = String(patrol?.nazwa || "").trim().toUpperCase();
    return n === "DZ" || n === "D.Z." || n === "D Z";
}

/** Policjanci / WOT ze wszystkich patroli oprócz DZ */
function wynikiCountFromPatrole() {
    const patrole = appState.patrole || [];
    let policja = 0;
    let wot = 0;
    patrole.forEach(p => {
        if (!p || wynikiIsPatrolDz(p)) return;
        if (p.policjant1 && String(p.policjant1).trim()) policja++;
        if (p.policjant2 && String(p.policjant2).trim()) policja++;
        if (p.wot1 && String(p.wot1).trim()) wot++;
        if (p.wot2 && String(p.wot2).trim()) wot++;
    });
    return { policja, wot };
}

/**
 * Generuje wartości auto z danych aplikacji.
 * values: { [nr]: number }
 */
function wynikiComputeAutoValues() {
    ensureStatystykiState();
    const vals = {};

    const inter = appState.statystyki.interwencje || [];
    let cL = 0, cP = 0, cM = 0;
    inter.forEach(i => {
        const t = wynikiNormalizeInterwencjaTyp(i.typ);
        if (t === "Legitymowany") cL++;
        else if (t === "Pouczony") cP++;
        else if (t === "MKK") cM++;
    });
    if (cL > 0) vals[25] = cL;
    if (cP > 0) vals[26] = cP;
    if (cM > 0) vals[27] = cM;

    const spr = appState.statystyki.sprawdzenia || [];
    let cOs = 0, cTow = 0, cSz = 0;
    spr.forEach(s => {
        const r = wynikiNormalizeRodzaj(s.rodzaj);
        if (r === "Stacja osobowa") cOs++;
        else if (r === "Stacja towarowa") cTow++;
        else if (r === "Szlak") cSz++;
    });
    if (cOs > 0) vals[73] = cOs;
    if (cTow > 0) vals[74] = cTow;
    if (cSz > 0) vals[75] = cSz;

    // 51 zawsze 1
    vals[51] = 1;

    const { policja, wot } = wynikiCountFromPatrole();
    if (policja > 0) vals[54] = policja;
    if (wot > 0) vals[58] = wot;

    // 60 = suma sił 54–59 jeśli coś jest
    const sily = [54, 55, 56, 57, 58, 59].reduce((a, n) => a + (Number(vals[n]) || 0), 0);
    if (sily > 0) vals[60] = sily;

    return vals;
}

/** Klucze liczone automatycznie – nadpisywane przy Odśwież / logowaniu */
const WYNIKI_AUTO_NRS = [25, 26, 27, 51, 54, 58, 60, 73, 74, 75];

/**
 * Przelicza auto-wyniki i zapisuje w appState.statystyki.wyniki.
 * Ręczne pozycje (np. 28 kwota, 29–50…) zostają.
 */
function wynikiSyncAutoToState() {
    ensureStatystykiState();
    if (!appState.statystyki.wyniki || typeof appState.statystyki.wyniki !== "object") {
        appState.statystyki.wyniki = {};
    }
    const prev = appState.statystyki.wyniki;
    const auto = wynikiComputeAutoValues();
    const next = {};
    // zachowaj ręczne (nie-auto)
    Object.keys(prev).forEach(k => {
        const n = parseInt(k, 10);
        if (isNaN(n)) return;
        if (WYNIKI_AUTO_NRS.indexOf(n) >= 0) return;
        const v = prev[k];
        if (v === undefined || v === null || v === "" || Number(v) === 0) return;
        next[n] = v;
    });
    // auto
    Object.keys(auto).forEach(k => {
        const n = parseInt(k, 10);
        if (!isNaN(n) && auto[k] != null && Number(auto[k]) !== 0) next[n] = auto[k];
    });
    // 28: suma kwot z interwencji MKK (jeśli są) – albo zachowana ręczna
    let sumaKwot = 0;
    (appState.statystyki.interwencje || []).forEach(i => {
        const t = wynikiNormalizeInterwencjaTyp(i.typ);
        if (t === "MKK" && Number(i.kwota) > 0) sumaKwot += Number(i.kwota);
    });
    if (sumaKwot > 0) next[28] = sumaKwot;
    else if (!next[27]) delete next[28];
    // jeśli było entry.mkkKwota bez row.kwota – zostaw prev[28]
    appState.statystyki.wyniki = next;
    return next;
}

function wynikiClearState() {
    ensureStatystykiState();
    appState.statystyki.wyniki = {};
    if (typeof _wynikiState !== "undefined") _wynikiState.values = {};
}

function openWynikiModal() {
    ensureStatystykiState();
    // wczytaj zapisane wyniki jeśli są
    const saved = (appState.statystyki && appState.statystyki.wyniki) ? appState.statystyki.wyniki : null;
    const auto = wynikiComputeAutoValues();

    // start: auto + nadpisania z zapisu (zapis wygrywa przy ręcznych polach)
    const values = { ...auto };
    if (saved && typeof saved === "object") {
        Object.keys(saved).forEach(k => {
            const nr = parseInt(k, 10);
            if (!isNaN(nr) && saved[k] !== "" && saved[k] != null) {
                values[nr] = saved[k];
            }
        });
    }

    // Kwota (28) pochodzi z wstawiania szablonu MKK (@kwota) – nie pytamy tu

    // ponownie 60
    const sily = [54, 55, 56, 57, 58, 59].reduce((a, n) => a + (Number(values[n]) || 0), 0);
    if (sily > 0) values[60] = sily;

    _wynikiState.values = values;
    _wynikiState.showAll = false;
    renderWynikiModal();
}

function closeWynikiModal() {
    const m = document.getElementById("wynikiModal");
    if (m) m.remove();
}

function wynikiToggleShowAll() {
    _wynikiState.showAll = !_wynikiState.showAll;
    // zbierz wartości z inputów przed re-render
    wynikiCollectFromDom();
    renderWynikiModal();
}

function wynikiCollectFromDom() {
    document.querySelectorAll("[data-wyniki-nr]").forEach(inp => {
        const nr = parseInt(inp.getAttribute("data-wyniki-nr"), 10);
        if (isNaN(nr)) return;
        const raw = String(inp.value || "").trim();
        if (raw === "") {
            delete _wynikiState.values[nr];
            return;
        }
        const n = parseInt(raw.replace(/\D/g, ""), 10);
        if (!isNaN(n)) _wynikiState.values[nr] = n;
        else _wynikiState.values[nr] = raw;
    });
    // 60 auto
    const sily = [54, 55, 56, 57, 58, 59].reduce((a, n) => a + (Number(_wynikiState.values[n]) || 0), 0);
    if (sily > 0) _wynikiState.values[60] = sily;
    else delete _wynikiState.values[60];
}

function wynikiHasValue(nr) {
    const v = _wynikiState.values[nr];
    if (v === undefined || v === null || v === "") return false;
    if (typeof v === "number" && v === 0) return false;
    if (String(v).trim() === "0") return false;
    return true;
}

function renderWynikiModal() {
    const old = document.getElementById("wynikiModal");
    if (old) old.remove();

    const showAll = !!_wynikiState.showAll;
    const values = _wynikiState.values || {};

    let body = "";
    WYNIKI_CATALOG.forEach(g => {
        const visibleItems = showAll
            ? g.items
            : g.items.filter(it => wynikiHasValue(it.nr));
        if (!visibleItems.length) return;

        body += `<tr><td colspan="3" style="background:var(--bg-input,#1e293b); font-weight:700; padding:10px 12px; border-bottom:1px solid var(--border,#334155);">${escapeHtml(g.group)}</td></tr>`;
        visibleItems.forEach(it => {
            const val = values[it.nr] != null ? values[it.nr] : "";
            body += `<tr>
                <td style="width:56px; text-align:center; vertical-align:middle;">
                    <span style="font-weight:800; font-size:16px; color:#facc15;">${it.nr}</span>
                </td>
                <td style="vertical-align:middle; padding:8px 10px;">
                    <div style="font-weight:600; font-size:13px; margin-bottom:2px;">${escapeHtml(it.name)}</div>
                </td>
                <td style="width:100px; vertical-align:middle;">
                    <input type="text" data-wyniki-nr="${it.nr}" value="${escapeHtml(String(val))}"
                           inputmode="numeric"
                           style="width:100%; text-align:center; font-weight:700; padding:8px;"
                           oninput="this.value=this.value.replace(/\\D/g,'')">
                </td>
            </tr>`;
        });
    });

    if (!body) {
        body = `<tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:24px;">Brak wypełnionych pozycji. Użyj „Pokaż całą tabelę” lub uzupełnij dane w statystykach / patrolach.</td></tr>`;
    }

    const overlay = document.createElement("div");
    overlay.id = "wynikiModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;align-items:stretch;justify-content:center;padding:12px;z-index:10050;";
    overlay.innerHTML = `
        <div class="modal" style="width:min(720px,96vw); height:min(90vh,860px); max-width:none; max-height:none; display:flex; flex-direction:column; padding:16px 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                <h2 style="margin:0;">📋 Wyniki (poz. 25–76)</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-primary" onclick="wynikiToggleShowAll()">${showAll ? "Tylko wypełnione" : "Pokaż całą tabelę"}</button>
                    <button class="btn-success" onclick="saveWynikiFromModal()">💾 Zapisz</button>
                    <button class="btn-danger" onclick="closeWynikiModal()">Zamknij</button>
                </div>
            </div>
            <p style="margin:0 0 10px 0; font-size:13px; color:var(--text-dim);">
                Nr na <span style="color:#facc15; font-weight:800;">żółto</span>. Auto: 25–27, 51, 54, 58, 73–75.
                ${showAll ? "Widok: <strong>cała tabela</strong> (edytowalna)." : "Widok: <strong>tylko pozycje z wartością</strong>."}
            </p>
            <div style="flex:1; overflow:auto; min-height:0; border:1px solid var(--border); border-radius:12px;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--table-header,#1d4ed8); color:#fff;">
                            <th style="padding:10px; width:56px;">Nr</th>
                            <th style="padding:10px; text-align:left;">Nazwa</th>
                            <th style="padding:10px; width:100px;">Wartość</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function saveWynikiFromModal() {
    wynikiCollectFromDom();
    ensureStatystykiState();
    if (!appState.statystyki.wyniki) appState.statystyki.wyniki = {};
    // zapisz tylko niepuste
    const out = {};
    Object.keys(_wynikiState.values).forEach(k => {
        const v = _wynikiState.values[k];
        if (v === undefined || v === null || v === "") return;
        if (Number(v) === 0) return;
        out[k] = Number(v) || v;
    });
    appState.statystyki.wyniki = out;
    if (typeof saveState === "function") await saveState();
    if (typeof showToast === "function") showToast("✅ Zapisano wyniki");
    // odśwież widok (tylko wypełnione po zapisie)
    _wynikiState.values = { ...out };
    // zachowaj 51=1 jeśli było
    if (out[51] == null) {
        _wynikiState.values[51] = 1;
    }
    renderWynikiModal();
}


window.initStatystyki = initStatystyki;
window.logInterwencja = logInterwencja;
window.logSprawdzenie = logSprawdzenie;
window.editSprawdzenie = editSprawdzenie;
window.saveEditSprawdzenie = saveEditSprawdzenie;
window.closeEditSprawdzenieModal = closeEditSprawdzenieModal;
window.removeSprawdzenie = removeSprawdzenie;
window.copySzlaki = copySzlaki;
window.clearAllStatystyki = clearAllStatystyki;
window.refreshStatystykiFromKsiazka = refreshStatystykiFromKsiazka;
window.openInterwencjeSzczegoly = openInterwencjeSzczegoly;
window.closeInterwencjeSzczegoly = closeInterwencjeSzczegoly;
window.openWynikiModal = openWynikiModal;
window.closeWynikiModal = closeWynikiModal;
window.wynikiToggleShowAll = wynikiToggleShowAll;
window.saveWynikiFromModal = saveWynikiFromModal;
window.wynikiSyncAutoToState = wynikiSyncAutoToState;
window.wynikiClearState = wynikiClearState;

