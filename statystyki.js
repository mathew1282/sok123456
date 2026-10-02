// =====================================
// STATYSTYKI
// =====================================

function ensureStatystykiState() {
    if (!appState.statystyki) {
        appState.statystyki = { interwencje: [], sprawdzenia: [] };
    }
    if (!Array.isArray(appState.statystyki.interwencje)) appState.statystyki.interwencje = [];
    if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
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
    }
    appState.statystyki.interwencje.push(row);
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
    await saveState();
    renderStatystyki();
}

async function clearAllStatystyki() {
    if (!confirm("Usunąć WSZYSTKIE statystyki (interwencje i sprawdzenia)?")) return;
    ensureStatystykiState();
    appState.statystyki.interwencje = [];
    appState.statystyki.sprawdzenia = [];
    await saveState();
    renderStatystyki();
    if (typeof showToast === "function") showToast("🗑️ Statystyki wyczyszczone");
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

