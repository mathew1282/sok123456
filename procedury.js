// =====================================
// PROCEDURY = Polecenia + Zgłoszenia w jednej zakładce
// Typ kafelka: polecenie | zgłoszenie | procedura (para)
// =====================================

let proceduryFilterLinia = "";
let proceduryFilterTyp = "wszystkie"; // wszystkie | polecenie | zgloszenie | procedura
let procedurySearch = "";
let currentProcEdit = null; // { kind: 'pol'|'zgl'|'proc', polIndex?, zglIndex? }

function initProcedury() {
    if (!appState.polecenia) appState.polecenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"], rows: [] };
    if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];
    if (!appState.zgloszenia) appState.zgloszenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis"], rows: [] };
    if (!Array.isArray(appState.zgloszenia.rows)) appState.zgloszenia.rows = [];

    (appState.polecenia.rows || []).forEach(r => {
        if (r.OpisKrotki === undefined) r.OpisKrotki = r.Opis || "";
        if (!r.id) r.id = procNewId();
    });
    (appState.zgloszenia.rows || []).forEach(r => {
        if (r.OpisKrotki === undefined) r.OpisKrotki = r.Opis || "";
        if (!r.id) r.id = procNewId();
    });

    proceduryFilterLinia = "";
    proceduryFilterTyp = "wszystkie";
    procedurySearch = "";
    currentProcEdit = null;
    renderProcedury();
}

function procNewId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function procEsc(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function procPlain(html) {
    return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Zbuduj listę pozycji do wyświetlenia */
function getProceduryListItems() {
    const items = [];
    const linkedZgl = new Set();
    const linkedPol = new Set();

    (appState.polecenia.rows || []).forEach((row, index) => {
        if (row.linkedZgloszenieId) {
            const z = (appState.zgloszenia.rows || []).find(r => r.id === row.linkedZgloszenieId);
            if (z) {
                linkedZgl.add(z.id);
                linkedPol.add(row.id);
                items.push({
                    typ: "procedura",
                    linia: row.Linia || z.Linia || "",
                    tytul: (row.OpisKrotki || "Polecenie") + " ↔ " + (z.OpisKrotki || "Zgłoszenie"),
                    polIndex: index,
                    zglIndex: appState.zgloszenia.rows.indexOf(z),
                    pol: row,
                    zgl: z
                });
                return;
            }
        }
        items.push({
            typ: "polecenie",
            linia: row.Linia || "",
            tytul: row.OpisKrotki || "(bez nazwy)",
            polIndex: index,
            pol: row
        });
    });

    (appState.zgloszenia.rows || []).forEach((row, index) => {
        if (linkedZgl.has(row.id)) return;
        if (row.linkedPolecenieId && linkedPol.has(row.linkedPolecenieId)) return;
        items.push({
            typ: "zgloszenie",
            linia: row.Linia || "",
            tytul: row.OpisKrotki || "(bez nazwy)",
            zglIndex: index,
            zgl: row
        });
    });

    let list = items;
    if (proceduryFilterTyp === "polecenie") list = list.filter(i => i.typ === "polecenie");
    if (proceduryFilterTyp === "zgloszenie") list = list.filter(i => i.typ === "zgloszenie");
    if (proceduryFilterTyp === "procedura") list = list.filter(i => i.typ === "procedura");
    if (proceduryFilterLinia) {
        list = list.filter(i => String(i.linia || "") === String(proceduryFilterLinia));
    }
    const q = procedurySearch.trim().toLowerCase();
    if (q) {
        list = list.filter(i => {
            const blob = [
                i.tytul, i.linia,
                i.pol?.Opis, i.pol?.OpisPom, i.pol?.Nazwa,
                i.zgl?.Opis, i.zgl?.OpisPom
            ].map(x => procPlain(x).toLowerCase()).join(" ");
            return blob.includes(q);
        });
    }
    list.sort((a, b) => String(a.linia).localeCompare(String(b.linia), "pl") || String(a.tytul).localeCompare(String(b.tytul), "pl"));
    return list;
}

function procTypBadge(typ) {
    if (typ === "procedura") return `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(168,85,247,.2);color:#d8b4fe;">Procedura</span>`;
    if (typ === "polecenie") return `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(37,99,235,.18);color:#93c5fd;">Polecenie</span>`;
    return `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;">Zgłoszenie</span>`;
}

function renderProcedury() {
    const container = document.getElementById("proceduryContainer");
    if (!container) return;

    const lines = [...new Set([
        ...(appState.polecenia.rows || []).map(r => r.Linia || ""),
        ...(appState.zgloszenia.rows || []).map(r => r.Linia || "")
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pl"));

    const linePills = [`<div class="line-pill ${!proceduryFilterLinia ? "active" : ""}" style="cursor:pointer;" onclick="setProceduryFilterLinia('')">Wszystkie linie</div>`]
        .concat(lines.map(l => `<div class="line-pill ${proceduryFilterLinia === l ? "active" : ""}" style="cursor:pointer;" onclick="setProceduryFilterLinia('${String(l).replace(/'/g, "\\'")}')">${procEsc(l)}</div>`))
        .join("");

    const typPills = [
        ["wszystkie", "Wszystkie"],
        ["procedura", "Procedury"],
        ["polecenie", "Polecenia"],
        ["zgloszenie", "Zgłoszenia"]
    ].map(([k, lab]) => `<div class="line-pill ${proceduryFilterTyp === k ? "active" : ""}" style="cursor:pointer;" onclick="setProceduryFilterTyp('${k}')">${lab}</div>`).join("");

    const list = getProceduryListItems();
    const rows = list.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px;">Brak pozycji. Dodaj polecenie, zgłoszenie lub całą procedurę.</td></tr>`
        : list.map(item => {
            const preview = item.typ === "procedura"
                ? procPlain(item.pol?.Opis).slice(0, 50) + " → " + procPlain(item.zgl?.Opis).slice(0, 50)
                : procPlain((item.pol || item.zgl)?.Opis).slice(0, 90);
            const editFn = item.typ === "procedura"
                ? `openProcModal('proc', ${item.polIndex}, ${item.zglIndex})`
                : item.typ === "polecenie"
                    ? `openProcModal('pol', ${item.polIndex}, null)`
                    : `openProcModal('zgl', null, ${item.zglIndex})`;
            const delFn = item.typ === "procedura"
                ? `removeProceduraPair(${item.polIndex}, ${item.zglIndex})`
                : item.typ === "polecenie"
                    ? `removeProcPolecenie(${item.polIndex})`
                    : `removeProcZgloszenie(${item.zglIndex})`;
            return `<tr>
                <td>${procEsc(item.linia)}</td>
                <td>${procTypBadge(item.typ)}</td>
                <td style="font-weight:600;">${procEsc(item.tytul)}</td>
                <td style="font-size:12px;color:var(--text-dim);max-width:280px;">${procEsc(preview)}${preview.length >= 90 ? "…" : ""}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-primary" onclick="${editFn}">Edytuj</button>
                    <button class="btn-danger" onclick="${delFn}">Usuń</button>
                </td>
            </tr>`;
        }).join("");

    container.innerHTML = `
    <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div>
                <h2 style="margin:0 0 4px 0;">📋 Polecenia i zgłoszenia</h2>
                <div style="font-size:13px;color:var(--text-dim);">Jeden kafelek: polecenie, zgłoszenie albo cała procedura (start + koniec)</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="openProcModal('pol', null, null)">+ Polecenie</button>
                <button class="btn-primary" onclick="openProcModal('zgl', null, null)">+ Zgłoszenie</button>
                <button class="btn-success" onclick="openProcModal('proc', null, null)">+ Cała procedura</button>
            </div>
        </div>

        <div class="card-grid" style="gap:8px;margin-bottom:10px;">${typPills}</div>
        <div class="card-grid" style="gap:8px;margin-bottom:10px;">${linePills}</div>
        <input type="text" placeholder="Szukaj…" value="${procEsc(procedurySearch)}"
               style="width:100%;max-width:360px;margin-bottom:14px;"
               oninput="procedurySearch=this.value;renderProcedury();">

        <table>
            <thead>
                <tr>
                    <th>Linia</th>
                    <th>Typ</th>
                    <th>Nazwa</th>
                    <th>Podgląd opisu</th>
                    <th>Akcje</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div id="procModalRoot"></div>
    `;
}

function setProceduryFilterLinia(line) {
    proceduryFilterLinia = line || "";
    renderProcedury();
}
function setProceduryFilterTyp(t) {
    proceduryFilterTyp = t || "wszystkie";
    renderProcedury();
}

// ---------- edytor pól (wspólny fragment HTML) ----------
function procEditorFields(prefix, data, opts) {
    const d = data || {};
    const showRodzaj = opts && opts.showRodzaj;
    let extra = "";
    if (showRodzaj) {
        const rodzaje = ["Inne", "Szlak", "Stacja towarowa", "Stacja osobowa"];
        const optsHtml = rodzaje.map(r =>
            `<option value="${r}"${(d.Rodzaj || "Inne") === r ? " selected" : ""}>${r === "Inne" ? "Inne (nie do statystyk)" : r}</option>`
        ).join("");
        extra = `
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <div style="flex:1;min-width:130px;">
                <label>Rodzaj</label>
                <select id="${prefix}Rodzaj" style="width:100%;padding:8px;border-radius:8px;">${optsHtml}</select>
            </div>
            <div style="flex:1.2;min-width:130px;">
                <label>Nazwa (szlaku / stacji)</label>
                <input type="text" id="${prefix}Nazwa" value="${procEsc(d.Nazwa || d.NazwaSzlaku || "")}" style="width:100%;">
            </div>
            <div style="flex:0.7;min-width:90px;">
                <label>Km od</label>
                <input type="text" id="${prefix}KmOd" value="${procEsc(d.KmOd || d.Km || "")}" style="width:100%;">
            </div>
            <div style="flex:0.7;min-width:90px;">
                <label>Km do</label>
                <input type="text" id="${prefix}KmDo" value="${procEsc(d.KmDo || "")}" style="width:100%;">
            </div>
        </div>`;
    }
    const opisRaw = d.Opis || "";
    const opisHtml = /<(?:b|strong|u|i|br|div|p)\b/i.test(opisRaw)
        ? opisRaw
        : procEsc(opisRaw).replace(/\n/g, "<br>");

    return `
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <div style="flex:1;min-width:100px;">
                <label>Nr linii</label>
                <input type="text" id="${prefix}Linia" value="${procEsc(d.Linia || proceduryFilterLinia || "")}" style="width:100%;">
            </div>
            <div style="flex:1.2;min-width:120px;">
                <label>Opis krótki</label>
                <input type="text" id="${prefix}OpisKrotki" value="${procEsc(d.OpisKrotki || "")}" style="width:100%;">
            </div>
            <div style="flex:1;min-width:120px;">
                <label>Opis pom</label>
                <input type="text" id="${prefix}OpisPom" value="${procEsc(d.OpisPom || "")}" style="width:100%;">
            </div>
        </div>
        <label>Opis (tekst do wpisu)</label>
        <div style="display:flex;gap:6px;margin:4px 0 6px;flex-wrap:wrap;">
            <button type="button" class="btn-primary" style="padding:3px 10px;" onclick="procFormat('${prefix}Opis','bold')"><b>B</b></button>
            <button type="button" class="btn-primary" style="padding:3px 10px;" onclick="procFormat('${prefix}Opis','underline')"><u>U</u></button>
        </div>
        <div id="${prefix}Opis" class="rich-opis-editor" contenteditable="true"
             style="width:100%;min-height:120px;padding:10px;margin-bottom:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);white-space:pre-wrap;outline:none;">${opisHtml}</div>
        ${extra}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;">
            ${["@patrol","@dowodca","@kierowca","@sklad","@wszyscy","@KZ","@MKK","@data","@godzina","@wot","@policjant","@wybrani"]
                .map(t => `<button type="button" class="btn-primary" style="padding:3px 8px;font-size:12px;" onclick="procInsertTag('${prefix}Opis','${t}')">${t}</button>`).join("")}
        </div>
    `;
}

function procFormat(id, cmd) {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, null);
}
function procInsertTag(id, tag) {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    try { document.execCommand("insertText", false, tag); }
    catch (e) { el.innerHTML += tag; }
}

function openProcModal(kind, polIndex, zglIndex) {
    currentProcEdit = { kind, polIndex, zglIndex };
    const root = document.getElementById("procModalRoot");
    if (!root) return;

    const pol = (polIndex != null && polIndex >= 0) ? appState.polecenia.rows[polIndex] : null;
    const zgl = (zglIndex != null && zglIndex >= 0) ? appState.zgloszenia.rows[zglIndex] : null;

    let title = "Nowa pozycja";
    if (kind === "pol") title = pol ? "Edytuj polecenie" : "Nowe polecenie";
    if (kind === "zgl") title = zgl ? "Edytuj zgłoszenie" : "Nowe zgłoszenie";
    if (kind === "proc") title = (pol || zgl) ? "Edytuj procedurę" : "Nowa procedura (polecenie + zgłoszenie)";

    let body = "";
    if (kind === "pol") {
        body = `<div style="padding:4px 0;">${procEditorFields("pol", pol, { showRodzaj: true })}</div>`;
    } else if (kind === "zgl") {
        body = `<div style="padding:4px 0;">${procEditorFields("zgl", zgl, { showRodzaj: false })}</div>`;
    } else {
        body = `
        <p style="font-size:13px;color:var(--text-dim);margin:0 0 12px 0;">
            Lewa strona = <strong>polecenie (start)</strong>, prawa = <strong>zgłoszenie (koniec)</strong>. Zapis tworzy od razu powiązaną parę.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg);">
                <div style="font-weight:700;margin-bottom:10px;color:#93c5fd;">▶ Polecenie (start)</div>
                ${procEditorFields("pol", pol, { showRodzaj: true })}
            </div>
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg);">
                <div style="font-weight:700;margin-bottom:10px;color:#86efac;">■ Zgłoszenie (koniec)</div>
                ${procEditorFields("zgl", zgl, { showRodzaj: false })}
            </div>
        </div>`;
    }

    root.innerHTML = `
    <div class="modal-overlay" id="procModalOverlay" style="display:flex;z-index:10050;" onclick="if(event.target===this)closeProcModal()">
        <div class="modal" style="width:min(${kind === "proc" ? "1100px" : "920px"},96vw);max-height:94vh;overflow:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                <h2 style="margin:0;">${title}</h2>
                <div style="display:flex;gap:8px;">
                    <button class="btn-success" onclick="saveProcModal()">Zapisz</button>
                    <button class="btn-danger" onclick="closeProcModal()">Anuluj</button>
                </div>
            </div>
            ${body}
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button class="btn-success" onclick="saveProcModal()">Zapisz</button>
                <button class="btn-danger" onclick="closeProcModal()">Anuluj</button>
            </div>
        </div>
    </div>`;
}

function closeProcModal() {
    const root = document.getElementById("procModalRoot");
    if (root) root.innerHTML = "";
    currentProcEdit = null;
}

function readProcSide(prefix, withRodzaj) {
    const linia = (document.getElementById(prefix + "Linia")?.value || "").trim();
    const opisKrotki = (document.getElementById(prefix + "OpisKrotki")?.value || "").trim();
    const opisPom = (document.getElementById(prefix + "OpisPom")?.value || "").trim();
    const opisEl = document.getElementById(prefix + "Opis");
    const opis = opisEl ? (opisEl.innerHTML || "").trim() : "";
    const item = { Linia: linia, OpisKrotki: opisKrotki, OpisPom: opisPom, Opis: opis };
    if (withRodzaj) {
        item.Rodzaj = document.getElementById(prefix + "Rodzaj")?.value || "Inne";
        item.Nazwa = (document.getElementById(prefix + "Nazwa")?.value || "").trim();
        item.KmOd = (document.getElementById(prefix + "KmOd")?.value || "").trim();
        item.KmDo = (document.getElementById(prefix + "KmDo")?.value || "").trim();
    }
    return item;
}

async function saveProcModal() {
    if (!currentProcEdit) return;
    const { kind, polIndex, zglIndex } = currentProcEdit;

    if (kind === "pol") {
        const item = readProcSide("pol", true);
        if (!item.Linia) { alert("Podaj nr linii (polecenie)"); return; }
        if (!item.OpisKrotki) { alert("Podaj opis krótki (polecenie)"); return; }
        if (polIndex == null) {
            item.id = procNewId();
            appState.polecenia.rows.push(item);
        } else {
            const prev = appState.polecenia.rows[polIndex] || {};
            item.id = prev.id || procNewId();
            item.linkedZgloszenieId = prev.linkedZgloszenieId || null;
            appState.polecenia.rows[polIndex] = item;
        }
    } else if (kind === "zgl") {
        const item = readProcSide("zgl", false);
        if (!item.Linia) { alert("Podaj nr linii (zgłoszenie)"); return; }
        if (!item.OpisKrotki) { alert("Podaj opis krótki (zgłoszenie)"); return; }
        if (zglIndex == null) {
            item.id = procNewId();
            appState.zgloszenia.rows.push(item);
        } else {
            const prev = appState.zgloszenia.rows[zglIndex] || {};
            item.id = prev.id || procNewId();
            item.linkedPolecenieId = prev.linkedPolecenieId || null;
            appState.zgloszenia.rows[zglIndex] = item;
        }
    } else {
        // procedura – para
        const pol = readProcSide("pol", true);
        const zgl = readProcSide("zgl", false);
        if (!pol.Linia && zgl.Linia) pol.Linia = zgl.Linia;
        if (!zgl.Linia && pol.Linia) zgl.Linia = pol.Linia;
        if (!pol.Linia) { alert("Podaj nr linii"); return; }
        if (!pol.OpisKrotki) { alert("Podaj opis krótki polecenia"); return; }
        if (!zgl.OpisKrotki) { alert("Podaj opis krótki zgłoszenia"); return; }

        let polId, zglId;
        if (polIndex == null) {
            pol.id = procNewId();
            appState.polecenia.rows.push(pol);
            polId = pol.id;
        } else {
            const prev = appState.polecenia.rows[polIndex] || {};
            pol.id = prev.id || procNewId();
            appState.polecenia.rows[polIndex] = pol;
            polId = pol.id;
        }
        if (zglIndex == null) {
            zgl.id = procNewId();
            appState.zgloszenia.rows.push(zgl);
            zglId = zgl.id;
        } else {
            const prev = appState.zgloszenia.rows[zglIndex] || {};
            zgl.id = prev.id || procNewId();
            appState.zgloszenia.rows[zglIndex] = zgl;
            zglId = zgl.id;
        }
        // powiązanie
        const pRow = appState.polecenia.rows.find(r => r.id === polId);
        const zRow = appState.zgloszenia.rows.find(r => r.id === zglId);
        if (pRow) pRow.linkedZgloszenieId = zglId;
        if (zRow) zRow.linkedPolecenieId = polId;
    }

    if (typeof saveState === "function") await saveState();
    closeProcModal();
    renderProcedury();
    if (typeof showToast === "function") showToast("✅ Zapisano");
}

async function removeProcPolecenie(index) {
    if (!confirm("Usunąć polecenie?")) return;
    const row = appState.polecenia.rows[index];
    if (row?.linkedZgloszenieId) {
        const z = (appState.zgloszenia.rows || []).find(r => r.id === row.linkedZgloszenieId);
        if (z && z.linkedPolecenieId === row.id) z.linkedPolecenieId = null;
    }
    appState.polecenia.rows.splice(index, 1);
    if (typeof saveState === "function") await saveState();
    renderProcedury();
}

async function removeProcZgloszenie(index) {
    if (!confirm("Usunąć zgłoszenie?")) return;
    const row = appState.zgloszenia.rows[index];
    if (row?.linkedPolecenieId) {
        const p = (appState.polecenia.rows || []).find(r => r.id === row.linkedPolecenieId);
        if (p && p.linkedZgloszenieId === row.id) p.linkedZgloszenieId = null;
    }
    appState.zgloszenia.rows.splice(index, 1);
    if (typeof saveState === "function") await saveState();
    renderProcedury();
}

async function removeProceduraPair(polIndex, zglIndex) {
    if (!confirm("Usunąć całą procedurę (polecenie i zgłoszenie)?")) return;
    // usuń od większego indeksu w tej samej tablicy nie koliduje – to różne tablice
    if (zglIndex != null && zglIndex >= 0) appState.zgloszenia.rows.splice(zglIndex, 1);
    if (polIndex != null && polIndex >= 0) appState.polecenia.rows.splice(polIndex, 1);
    if (typeof saveState === "function") await saveState();
    renderProcedury();
}

// kompatybilność ze starymi zakładkami
function initPolecenia() { initProcedury(); }
function initZgloszenia() { initProcedury(); }

window.initProcedury = initProcedury;
window.renderProcedury = renderProcedury;
window.setProceduryFilterLinia = setProceduryFilterLinia;
window.setProceduryFilterTyp = setProceduryFilterTyp;
window.openProcModal = openProcModal;
window.closeProcModal = closeProcModal;
window.saveProcModal = saveProcModal;
window.procFormat = procFormat;
window.procInsertTag = procInsertTag;
window.removeProcPolecenie = removeProcPolecenie;
window.removeProcZgloszenie = removeProcZgloszenie;
window.removeProceduraPair = removeProceduraPair;
window.initPolecenia = initPolecenia;
window.initZgloszenia = initZgloszenia;
