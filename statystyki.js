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
    appState.statystyki.sprawdzenia.push({
        data: todayPL(),
        rodzaj: payload.rodzaj || "",
        nazwa: payload.nazwa || "",
        linia: payload.linia || "",
        kmOd: payload.kmOd || "",
        kmDo: payload.kmDo || "",
        godzOd: payload.godzOd || "",
        godzDo: payload.godzDo || ""
    });
    await saveState();
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
            <button class="btn-danger" onclick="clearAllStatystyki()">Kasuj wszystkie statystyki</button>
        </div>
        <p style="color:#94a3b8; font-size:14px; margin-bottom:16px;">
            Pokazywane są <strong>wszystkie</strong> zapisane wpisy (ze wszystkich dni).
            Usuwają się dopiero po kliknięciu „Kasuj wszystkie” albo pojedynczego „Usuń”.
        </p>

        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin-bottom:22px;">
            <div style="background:rgba(96,165,250,.12); border:1px solid #60a5fa; border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">MKK</div>
                <div style="font-size:26px; font-weight:800; color:#60a5fa;">${counts.MKK}</div>
            </div>
            <div style="background:rgba(52,211,153,.12); border:1px solid #34d399; border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Pouczony (P)</div>
                <div style="font-size:26px; font-weight:800; color:#34d399;">${counts.Pouczony}</div>
            </div>
            <div style="background:rgba(251,146,60,.12); border:1px solid #fb923c; border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Legitymowany (L)</div>
                <div style="font-size:26px; font-weight:800; color:#fb923c;">${counts.Legitymowany}</div>
            </div>
            <div style="background:var(--bg-input,#1e293b); border:1px solid var(--border,#334155); border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:12px; color:var(--text-dim,#94a3b8); margin-bottom:4px;">Inne</div>
                <div style="font-size:26px; font-weight:800;">${counts.Inne}</div>
            </div>
            <div style="background:var(--bg-input,#1e293b); border:1px solid var(--border,#334155); border-radius:12px; padding:14px; text-align:center;">
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
