// =====================================
// NOTATKI – proste, czytelne, szybki zapis
// =====================================

const NOTATKI_KATEGORIE = ["Wszystkie", "Linia / km", "Pisma", "Ogólne", "Inne"];

let _notatkiFilter = "Wszystkie";
let _notatkiSearch = "";

function ensureNotatkiState() {
    if (!Array.isArray(appState.notatki)) appState.notatki = [];
}

function escapeHtmlNot(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function notatkiNewId() {
    return Date.now() + Math.random().toString(36).slice(2, 9);
}

function initNotatki() {
    ensureNotatkiState();
    _notatkiFilter = "Wszystkie";
    _notatkiSearch = "";
    renderNotatki();
}

function getFilteredNotatki() {
    ensureNotatkiState();
    let list = [...appState.notatki];
    if (_notatkiFilter && _notatkiFilter !== "Wszystkie") {
        list = list.filter(n => (n.kategoria || "Ogólne") === _notatkiFilter);
    }
    const q = String(_notatkiSearch || "").trim().toLowerCase();
    if (q) {
        list = list.filter(n => {
            const blob = [
                n.tytul, n.tresc, n.linia, n.kmOd, n.kmDo, n.kategoria
            ].map(x => String(x || "").toLowerCase()).join(" ");
            return blob.includes(q);
        });
    }
    // najnowsze na górze
    list.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return list;
}

function notatkiMetaLine(n) {
    const parts = [];
    if (n.linia) parts.push("Linia " + n.linia);
    if (n.kmOd || n.kmDo) {
        parts.push("km " + (n.kmOd || "?") + (n.kmDo ? " – " + n.kmDo : ""));
    }
    if (n.kategoria && n.kategoria !== "Ogólne") parts.push(n.kategoria);
    return parts.join(" · ");
}

function renderNotatki() {
    const container = document.getElementById("notatkiContainer");
    if (!container) return;
    ensureNotatkiState();

    const list = getFilteredNotatki();
    const total = appState.notatki.length;

    const cats = NOTATKI_KATEGORIE.map(k => {
        const active = _notatkiFilter === k ? "active" : "";
        const count = k === "Wszystkie"
            ? total
            : appState.notatki.filter(n => (n.kategoria || "Ogólne") === k).length;
        return `<div class="line-pill ${active}" style="cursor:pointer;" onclick="setNotatkiFilter('${k.replace(/'/g, "\\'")}')">${escapeHtmlNot(k)}${count ? " (" + count + ")" : ""}</div>`;
    }).join("");

    const cards = list.length === 0
        ? `<div style="color:var(--text-dim); padding:24px 8px; text-align:center;">
                Brak notatek${_notatkiSearch || _notatkiFilter !== "Wszystkie" ? " dla tego filtra" : ""}.
                <br><span style="font-size:13px;">Kliknij „+ Dodaj notatkę”.</span>
           </div>`
        : list.map(n => {
            const meta = notatkiMetaLine(n);
            const preview = String(n.tresc || "").trim().slice(0, 160);
            const more = String(n.tresc || "").trim().length > 160 ? "…" : "";
            return `
            <div class="item-card" style="cursor:pointer; text-align:left; padding:14px 16px; display:flex; flex-direction:column; gap:6px; min-width:0;"
                 onclick="openNotatkaModal('${n.id}')">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                    <div style="font-weight:700; font-size:15px; color:var(--text-soft); word-break:break-word;">
                        ${escapeHtmlNot(n.tytul || "(bez tytułu)")}
                    </div>
                    <button type="button" class="btn-danger" style="padding:2px 8px; font-size:12px; flex-shrink:0;"
                            onclick="event.stopPropagation(); deleteNotatka('${n.id}')">Usuń</button>
                </div>
                ${meta ? `<div style="font-size:12px; color:var(--primary-light);">${escapeHtmlNot(meta)}</div>` : ""}
                ${preview ? `<div style="font-size:13px; color:var(--text-dim); line-height:1.4; white-space:pre-wrap; word-break:break-word;">${escapeHtmlNot(preview)}${more}</div>` : ""}
            </div>`;
        }).join("");

    container.innerHTML = `
    <div class="card" style="max-width:100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
            <h2 style="margin:0;">📝 Notatki</h2>
            <button class="btn-success" onclick="openNotatkaModal(null)">+ Dodaj notatkę</button>
        </div>
        <p style="color:var(--text-dim); font-size:13px; margin:0 0 14px 0;">
            Szybkie notatki: linia, km, pisma, uwagi. Zapis automatyczny przy „Zapisz”.
        </p>

        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;">
            <input type="text" id="notatkiSearch" placeholder="Szukaj…" value="${escapeHtmlNot(_notatkiSearch)}"
                   style="flex:1; min-width:180px;"
                   oninput="_notatkiSearch=this.value; renderNotatki();">
        </div>
        <div class="card-grid" style="gap:8px; margin-bottom:16px;">${cats}</div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px;">
            ${cards}
        </div>
    </div>
    `;
}

function setNotatkiFilter(kat) {
    _notatkiFilter = kat || "Wszystkie";
    renderNotatki();
}

function openNotatkaModal(id) {
    ensureNotatkiState();
    const isNew = !id;
    const n = isNew
        ? { id: null, tytul: "", linia: "", kmOd: "", kmDo: "", kategoria: "Ogólne", tresc: "" }
        : appState.notatki.find(x => x.id === id);

    if (!isNew && !n) {
        if (typeof showToast === "function") showToast("Nie znaleziono notatki");
        return;
    }

    const old = document.getElementById("notatkaModal");
    if (old) old.remove();

    const katOpts = ["Linia / km", "Pisma", "Ogólne", "Inne"].map(k =>
        `<option value="${escapeHtmlNot(k)}"${(n.kategoria || "Ogólne") === k ? " selected" : ""}>${escapeHtmlNot(k)}</option>`
    ).join("");

    const overlay = document.createElement("div");
    overlay.id = "notatkaModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:center; justify-content:center; padding:12px; z-index:10040;";
    overlay._editId = id || null;

    overlay.innerHTML = `
        <div class="modal" style="width:min(640px,96vw); max-height:92vh; overflow:auto;">
            <h2 style="margin-top:0;">${isNew ? "Nowa notatka" : "Edytuj notatkę"}</h2>

            <label>Tytuł</label>
            <input type="text" id="notTytul" value="${escapeHtmlNot(n.tytul)}" placeholder="np. Linia 275 – odcinek X" style="width:100%; margin-bottom:12px;">

            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                <div style="flex:1; min-width:120px;">
                    <label>Kategoria</label>
                    <select id="notKategoria" style="width:100%;">${katOpts}</select>
                </div>
                <div style="flex:1; min-width:100px;">
                    <label>Linia</label>
                    <input type="text" id="notLinia" value="${escapeHtmlNot(n.linia)}" placeholder="np. 275" style="width:100%;">
                </div>
                <div style="flex:1; min-width:80px;">
                    <label>Km od</label>
                    <input type="text" id="notKmOd" value="${escapeHtmlNot(n.kmOd)}" placeholder="0,000" style="width:100%;">
                </div>
                <div style="flex:1; min-width:80px;">
                    <label>Km do</label>
                    <input type="text" id="notKmDo" value="${escapeHtmlNot(n.kmDo)}" placeholder="0,000" style="width:100%;">
                </div>
            </div>

            <label>Treść</label>
            <textarea id="notTresc" rows="8" placeholder="Notatka, nr pisma, ustalenia…"
                style="width:100%; margin-bottom:14px; font-size:14px; line-height:1.45;">${escapeHtmlNot(n.tresc)}</textarea>

            <div class="modal-actions">
                <button class="btn-success" onclick="saveNotatkaFromModal()">Zapisz</button>
                <button class="btn-danger" onclick="closeNotatkaModal()">Anuluj</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
        const el = document.getElementById("notTytul");
        if (el) el.focus();
    }, 50);
}

function closeNotatkaModal() {
    const m = document.getElementById("notatkaModal");
    if (m) m.remove();
}

async function saveNotatkaFromModal() {
    ensureNotatkiState();
    const modal = document.getElementById("notatkaModal");
    if (!modal) return;

    const tytul = (document.getElementById("notTytul")?.value || "").trim();
    const tresc = (document.getElementById("notTresc")?.value || "").trim();
    const linia = (document.getElementById("notLinia")?.value || "").trim();
    const kmOd = (document.getElementById("notKmOd")?.value || "").trim();
    const kmDo = (document.getElementById("notKmDo")?.value || "").trim();
    const kategoria = (document.getElementById("notKategoria")?.value || "Ogólne").trim();

    if (!tytul && !tresc) {
        if (typeof showToast === "function") showToast("Podaj tytuł lub treść");
        else alert("Podaj tytuł lub treść");
        return;
    }

    const now = new Date().toISOString();
    const editId = modal._editId;

    if (editId) {
        const n = appState.notatki.find(x => x.id === editId);
        if (!n) return;
        n.tytul = tytul || "(bez tytułu)";
        n.tresc = tresc;
        n.linia = linia;
        n.kmOd = kmOd;
        n.kmDo = kmDo;
        n.kategoria = kategoria;
        n.updatedAt = now;
    } else {
        appState.notatki.push({
            id: notatkiNewId(),
            tytul: tytul || "(bez tytułu)",
            tresc,
            linia,
            kmOd,
            kmDo,
            kategoria,
            createdAt: now,
            updatedAt: now
        });
    }

    if (typeof saveState === "function") await saveState();
    closeNotatkaModal();
    renderNotatki();
    if (typeof showToast === "function") showToast("✅ Zapisano notatkę");
}

async function deleteNotatka(id) {
    ensureNotatkiState();
    const n = appState.notatki.find(x => x.id === id);
    if (!n) return;
    if (!confirm("Usunąć notatkę „" + (n.tytul || "") + "”?")) return;
    appState.notatki = appState.notatki.filter(x => x.id !== id);
    if (typeof saveState === "function") await saveState();
    renderNotatki();
    if (typeof showToast === "function") showToast("Usunięto");
}

window.initNotatki = initNotatki;
window.renderNotatki = renderNotatki;
window.setNotatkiFilter = setNotatkiFilter;
window.openNotatkaModal = openNotatkaModal;
window.closeNotatkaModal = closeNotatkaModal;
window.saveNotatkaFromModal = saveNotatkaFromModal;
window.deleteNotatka = deleteNotatka;
