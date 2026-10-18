// =====================================
// NOTATKI – lista + edytor + załączniki
// =====================================

const NOTATKI_KATEGORIE = ["Wszystkie", "Linia / km", "Pisma", "Ogólne", "Inne"];
const NOTATKI_KAT_EDIT = ["Linia / km", "Pisma", "Ogólne", "Inne"];
const NOTATKI_MAX_FILE_BYTES = 1.8 * 1024 * 1024; // ~1.8 MB
const NOTATKI_MAX_FILES = 3;
const NOTATKI_ACCEPT = "application/pdf,image/jpeg,image/png,image/jpg,image/webp";

let _notatkiFilter = "Wszystkie";
let _notatkiSearch = "";
/** Tymczasowe załączniki w otwartym edytorze */
let _notatkiDraftAtt = [];

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
    _notatkiDraftAtt = [];
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
            const plain = String(n.tresc || "").replace(/<[^>]+>/g, " ");
            const names = (n.zalaczniki || []).map(z => z.name || "").join(" ");
            const blob = [n.tytul, plain, n.linia, n.kmOd, n.kmDo, n.kategoria, names]
                .map(x => String(x || "").toLowerCase()).join(" ");
            return blob.includes(q);
        });
    }
    list.sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
    );
    return list;
}

function notatkiFormatDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("pl-PL", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    } catch (e) {
        return "";
    }
}

function notatkiMetaBits(n) {
    const bits = [];
    if (n.linia) bits.push("Linia " + n.linia);
    if (n.kmOd || n.kmDo) bits.push("km " + (n.kmOd || "?") + (n.kmDo ? " – " + n.kmDo : ""));
    return bits;
}

function notatkiKatStyle(kat) {
    const k = kat || "Ogólne";
    if (k === "Linia / km") return "background:rgba(37,99,235,.18);color:#93c5fd;";
    if (k === "Pisma") return "background:rgba(168,85,247,.18);color:#d8b4fe;";
    if (k === "Inne") return "background:rgba(100,116,139,.2);color:#cbd5e1;";
    return "background:rgba(34,197,94,.15);color:#86efac;";
}

function notatkiIsImage(type) {
    return /^image\//i.test(type || "");
}

function notatkiIsPdf(type, name) {
    return /pdf/i.test(type || "") || /\.pdf$/i.test(name || "");
}

function notatkiFmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// =====================================
// LISTA
// =====================================

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

    const rows = list.length === 0
        ? `<div style="color:var(--text-dim); padding:40px 12px; text-align:center; font-size:14px;">
                Brak notatek${_notatkiSearch || _notatkiFilter !== "Wszystkie" ? " dla tego filtra" : ""}.
                <div style="margin-top:8px; font-size:13px;">Kliknij „+ Nowa notatka”.</div>
           </div>`
        : list.map(n => {
            const kat = n.kategoria || "Ogólne";
            const meta = notatkiMetaBits(n);
            const hasAtt = Array.isArray(n.zalaczniki) && n.zalaczniki.length > 0;
            const plain = String(n.tresc || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const snippet = plain.length > 100 ? plain.slice(0, 100) + "…" : plain;
            const important = /fde047|background-color:\s*rgb\(253,\s*224,\s*71\)|★|ważne/i.test(String(n.tresc || ""));
            const pages = (String(n.tresc || "").match(/not-page-break/gi) || []).length + 1;
            return `
            <div class="notatka-row" onclick="openNotatkaView('${n.id}')"
                 style="display:flex; align-items:center; gap:14px; padding:14px 16px; border-bottom:1px solid var(--border);
                        cursor:pointer; transition:background .15s;"
                 onmouseenter="this.style.background='var(--bg-input)'"
                 onmouseleave="this.style.background='transparent'">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:15px; color:var(--text-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${escapeHtmlNot(n.tytul || "(bez tytułu)")}
                    </div>
                    ${meta.length ? `<div style="font-size:12px; color:var(--text-dim); margin-top:3px;">${escapeHtmlNot(meta.join(" · "))}</div>` : ""}
                    ${snippet ? `<div style="font-size:12px; color:var(--text-dim); margin-top:4px; opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlNot(snippet)}</div>` : ""}
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${hasAtt ? `<span title="Załączniki (${n.zalaczniki.length})" style="font-size:13px;">📎${n.zalaczniki.length > 1 ? n.zalaczniki.length : ""}</span>` : ""}
                    ${important ? `<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:#fde047;color:#713f12;white-space:nowrap;">★ Ważne</span>` : ""}
                    ${pages > 1 ? `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;background:var(--bg-input);color:var(--text-dim);white-space:nowrap;">${pages} str.</span>` : ""}
                    <span style="font-size:11px; font-weight:600; padding:3px 10px; border-radius:999px; white-space:nowrap; ${notatkiKatStyle(kat)}">${escapeHtmlNot(kat)}</span>
                    <button type="button" class="btn-danger" style="padding:3px 8px; font-size:12px;"
                            onclick="event.stopPropagation(); deleteNotatka('${n.id}')">Usuń</button>
                </div>
            </div>`;
        }).join("");

    container.innerHTML = `
    <div class="card" style="max-width:920px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:6px;">
            <div>
                <h2 style="margin:0 0 4px 0;">📝 Notatki</h2>
                <div style="font-size:13px; color:var(--text-dim);">Lista: tytuł i kategoria · kliknij, aby otworzyć</div>
            </div>
            <button class="btn-success" onclick="openNotatkaEdit(null)">+ Nowa notatka</button>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:16px 0 10px 0;">
            <input type="text" id="notatkiSearch" placeholder="Szukaj w tytułach i treści…"
                   value="${escapeHtmlNot(_notatkiSearch)}"
                   style="flex:1; min-width:200px;"
                   oninput="_notatkiSearch=this.value; renderNotatki();">
        </div>
        <div class="card-grid" style="gap:8px; margin-bottom:14px;">${cats}</div>

        <div style="border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--bg);">
            ${rows}
        </div>
    </div>
    `;
}

function setNotatkiFilter(kat) {
    _notatkiFilter = kat || "Wszystkie";
    renderNotatki();
}

// =====================================
// ZAŁĄCZNIKI – UI
// =====================================

function notatkiRenderAttachments(list, { editable }) {
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) {
        return editable
            ? `<div style="font-size:13px; color:var(--text-dim); padding:6px 0;">Brak załączników</div>`
            : "";
    }
    return `<div style="display:flex; flex-direction:column; gap:10px;">` + arr.map((z, i) => {
        const isImg = notatkiIsImage(z.type);
        const isPdf = notatkiIsPdf(z.type, z.name);
        const icon = isPdf ? "📄" : (isImg ? "🖼️" : "📎");
        const size = notatkiFmtSize(z.size);
        let preview = "";
        if (isImg && z.data) {
            preview = `<img src="${z.data}" alt="${escapeHtmlNot(z.name)}"
                style="max-width:100%; max-height:180px; border-radius:8px; margin-top:6px; border:1px solid var(--border); object-fit:contain; background:#000;">`;
        }
        const openBtn = z.data
            ? `<button type="button" class="btn-primary" style="padding:3px 8px; font-size:12px;" onclick="event.stopPropagation(); notatkiOpenAttachment(${i}, ${editable ? "true" : "false"})">Otwórz</button>`
            : "";
        const delBtn = editable
            ? `<button type="button" class="btn-danger" style="padding:3px 8px; font-size:12px;" onclick="event.stopPropagation(); notatkiRemoveDraftAtt(${i})">Usuń</button>`
            : "";
        return `
        <div style="border:1px solid var(--border); border-radius:10px; padding:10px 12px; background:var(--bg-input);">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span>${icon}</span>
                <span style="font-size:13px; font-weight:600; color:var(--text-soft); word-break:break-all; flex:1;">${escapeHtmlNot(z.name || "plik")}</span>
                ${size ? `<span style="font-size:11px; color:var(--text-dim);">${size}</span>` : ""}
                ${openBtn}
                ${delBtn}
            </div>
            ${preview}
        </div>`;
    }).join("") + `</div>`;
}

function notatkiOpenAttachment(index, fromDraft) {
    const list = fromDraft ? _notatkiDraftAtt : null;
    // z podglądu: bierzemy z aktualnie otwartej notatki przez data na modalu
    let att = null;
    if (fromDraft) {
        att = _notatkiDraftAtt[index];
    } else {
        const modal = document.getElementById("notatkaModal");
        const noteId = modal && modal._viewId;
        const n = noteId ? appState.notatki.find(x => x.id === noteId) : null;
        att = n && n.zalaczniki ? n.zalaczniki[index] : null;
    }
    if (!att || !att.data) return;
    const w = window.open();
    if (!w) {
        // fallback: download link
        const a = document.createElement("a");
        a.href = att.data;
        a.download = att.name || "plik";
        a.target = "_blank";
        a.click();
        return;
    }
    if (notatkiIsImage(att.type)) {
        w.document.write(`<title>${escapeHtmlNot(att.name)}</title><img src="${att.data}" style="max-width:100%;height:auto;">`);
    } else if (notatkiIsPdf(att.type, att.name)) {
        w.location.href = att.data;
    } else {
        const a = w.document.createElement("a");
        a.href = att.data;
        a.download = att.name || "plik";
        a.textContent = "Pobierz plik";
        w.document.body.appendChild(a);
    }
}

function notatkiRemoveDraftAtt(index) {
    _notatkiDraftAtt.splice(index, 1);
    const box = document.getElementById("notAttList");
    if (box) box.innerHTML = notatkiRenderAttachments(_notatkiDraftAtt, { editable: true });
}

function notatkiOnFileSelected(event) {
    const files = event.target.files;
    if (!files || !files.length) return;

    const remaining = NOTATKI_MAX_FILES - _notatkiDraftAtt.length;
    if (remaining <= 0) {
        if (typeof showToast === "function") showToast("Max " + NOTATKI_MAX_FILES + " pliki na notatkę");
        else alert("Max " + NOTATKI_MAX_FILES + " pliki na notatkę");
        event.target.value = "";
        return;
    }

    const toRead = [...files].slice(0, remaining);
    let pending = toRead.length;

    toRead.forEach(file => {
        const okType = /^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.type)
            || /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
        if (!okType) {
            if (typeof showToast === "function") showToast("Dozwolone: PDF, JPG, PNG");
            else alert("Dozwolone: PDF, JPG, PNG");
            pending--;
            if (pending <= 0) finish();
            return;
        }
        if (file.size > NOTATKI_MAX_FILE_BYTES) {
            if (typeof showToast === "function") showToast("Plik za duży (max ~1,8 MB): " + file.name);
            else alert("Plik za duży (max ~1,8 MB): " + file.name);
            pending--;
            if (pending <= 0) finish();
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            _notatkiDraftAtt.push({
                id: notatkiNewId(),
                name: file.name,
                type: file.type || "application/octet-stream",
                size: file.size,
                data: reader.result
            });
            pending--;
            if (pending <= 0) finish();
        };
        reader.onerror = () => {
            pending--;
            if (pending <= 0) finish();
        };
        reader.readAsDataURL(file);
    });

    function finish() {
        const box = document.getElementById("notAttList");
        if (box) box.innerHTML = notatkiRenderAttachments(_notatkiDraftAtt, { editable: true });
        event.target.value = "";
        if (typeof showToast === "function") showToast("Dodano załącznik");
    }
}

// =====================================
// PODGLĄD
// =====================================


let _notatkiViewPage = 0;
let _notatkiViewPages = [];
let _notatkiViewNoteId = null;

function notatkiSplitPages(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = String(html || "");
    const marked = [...wrap.querySelectorAll(".not-page")];
    if (marked.length) {
        return marked.map(el => el.innerHTML.trim() || "<p><br></p>");
    }
    // page breaks: <hr class="not-page-break">
    const raw = String(html || "");
    if (/not-page-break|page-break-after/i.test(raw)) {
        const parts = raw.split(/<hr[^>]*class=["'][^"']*not-page-break[^"']*["'][^>]*>/i);
        return parts.map(s => s.trim() || "<p><br></p>").filter(Boolean);
    }
    return [raw.trim() || "<p><br></p>"];
}

function notatkiWrapPagesFromEditor(editor) {
    if (!editor) return "";
    // jeśli użytkownik dodał page-break, zostaw; inaczej całość
    return editor.innerHTML;
}

function openNotatkaView(id) {
    ensureNotatkiState();
    const n = appState.notatki.find(x => x.id === id);
    if (!n) return;

    const existing = document.getElementById("notatkaModal");
    if (existing) existing.remove();

    const kat = n.kategoria || "Ogólne";
    const meta = notatkiMetaBits(n);
    const attHtml = notatkiRenderAttachments(n.zalaczniki || [], { editable: false });
    _notatkiViewNoteId = id;
    _notatkiViewPages = notatkiSplitPages(n.tresc || "");
    _notatkiViewPage = 0;

    const overlay = document.createElement("div");
    overlay.id = "notatkaModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;z-index:10050;align-items:center;justify-content:center;padding:12px;";
    overlay.onclick = (e) => { if (e.target === overlay) closeNotatkaModal(); };
    overlay.innerHTML = `
        <div class="modal notatki-viewer-modal" style="width:min(860px,96vw);max-height:94vh;overflow:auto;padding:0;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg-input);position:sticky;top:0;z-index:5;">
                <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;${notatkiKatStyle(kat)}">${escapeHtmlNot(kat)}</span>
                        ${meta.map(m => `<span style="font-size:12px;color:var(--text-dim);">${escapeHtmlNot(m)}</span>`).join("")}
                    </div>
                    <h2 style="margin:0;font-size:18px;line-height:1.3;word-break:break-word;">${escapeHtmlNot(n.tytul || "(bez tytułu)")}</h2>
                    <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${escapeHtmlNot(notatkiFormatDate(n.updatedAt || n.createdAt))}</div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;">
                    <button type="button" class="btn-primary" onclick="openNotatkaEdit('${n.id}')">Edytuj</button>
                    <button type="button" class="btn-danger" onclick="closeNotatkaModal()">Zamknij</button>
                </div>
            </div>
            <div class="notatki-pdf-stage" style="background:var(--bg);padding:20px 16px 28px;min-height:420px;">
                <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
                    <button type="button" class="btn-primary" id="notViewPrev" onclick="notatkiViewNav(-1)" style="padding:6px 14px;">← Poprzednia</button>
                    <span id="notViewPageLabel" style="font-size:13px;font-weight:600;color:var(--text-dim);min-width:100px;text-align:center;"></span>
                    <button type="button" class="btn-primary" id="notViewNext" onclick="notatkiViewNav(1)" style="padding:6px 14px;">Następna →</button>
                </div>
                <div id="notViewPaper" class="notatki-paper"></div>
            </div>
            ${attHtml ? `
            <div style="padding:12px 18px 20px;border-top:1px solid var(--border);">
                <div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">Załączniki</div>
                ${attHtml}
            </div>` : ""}
        </div>`;
    document.body.appendChild(overlay);
    notatkiRenderViewPage();
}

function notatkiViewNav(delta) {
    if (!_notatkiViewPages.length) return;
    _notatkiViewPage = Math.max(0, Math.min(_notatkiViewPages.length - 1, _notatkiViewPage + delta));
    notatkiRenderViewPage();
}

function notatkiRenderViewPage() {
    const paper = document.getElementById("notViewPaper");
    const label = document.getElementById("notViewPageLabel");
    const prev = document.getElementById("notViewPrev");
    const next = document.getElementById("notViewNext");
    if (!paper) return;
    const total = Math.max(1, _notatkiViewPages.length);
    const idx = Math.min(_notatkiViewPage, total - 1);
    const html = _notatkiViewPages[idx] || "<p style='color:var(--text-dim)'>Brak treści</p>";
    paper.innerHTML = `<div class="notatki-paper-inner notatka-body">${html}</div>`;
    notatkiStyleBody(paper.querySelector(".notatka-body"));
    if (label) label.textContent = "Strona " + (idx + 1) + " / " + total;
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx >= total - 1;
    if (prev) prev.style.opacity = idx <= 0 ? "0.45" : "1";
    if (next) next.style.opacity = idx >= total - 1 ? "0.45" : "1";
}

function openNotatkaEdit(id) {
    ensureNotatkiState();
    const existing = document.getElementById("notatkaModal");
    if (existing) existing.remove();

    const n = id ? appState.notatki.find(x => x.id === id) : null;
    _notatkiDraftAtt = n && Array.isArray(n.zalaczniki)
        ? n.zalaczniki.map(z => ({ ...z }))
        : [];

    const initialHtml = n ? (n.tresc || "") : "<p><br></p>";
    const katOpts = NOTATKI_KAT_EDIT.map(k =>
        `<option value="${escapeHtmlNot(k)}" ${(n?.kategoria || "Ogólne") === k ? "selected" : ""}>${escapeHtmlNot(k)}</option>`
    ).join("");

    const overlay = document.createElement("div");
    overlay.id = "notatkaModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;z-index:10050;align-items:stretch;justify-content:center;padding:8px;";
    overlay.onclick = (e) => { if (e.target === overlay) closeNotatkaModal(); };
    overlay._editId = n ? n.id : null;

    overlay.innerHTML = `
        <div class="modal" style="width:min(960px,98vw);max-height:96vh;overflow:auto;padding:0;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--bg-input);position:sticky;top:0;z-index:6;">
                <h2 style="margin:0;font-size:18px;">${n ? "Edytuj notatkę" : "Nowa notatka"}</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn-success" onclick="saveNotatkaFromModal()">Zapisz</button>
                    <button type="button" class="btn-danger" onclick="closeNotatkaModal()">Anuluj</button>
                </div>
            </div>

            <div style="padding:14px 16px 8px;">
                <label style="font-size:12px;color:var(--text-dim);">Tytuł</label>
                <input type="text" id="notTytul" value="${escapeHtmlNot(n?.tytul || "").replace(/"/g, "&quot;")}"
                       style="width:100%;margin-bottom:10px;font-size:16px;font-weight:600;" placeholder="Tytuł notatki">
                <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                    <div style="flex:1;min-width:120px;">
                        <label style="font-size:12px;color:var(--text-dim);">Kategoria</label>
                        <select id="notKategoria" style="width:100%;padding:8px;border-radius:8px;">${katOpts}</select>
                    </div>
                    <div style="flex:0.7;min-width:90px;">
                        <label style="font-size:12px;color:var(--text-dim);">Linia</label>
                        <input type="text" id="notLinia" value="${escapeHtmlNot(n?.linia || "").replace(/"/g, "&quot;")}" style="width:100%;">
                    </div>
                    <div style="flex:0.7;min-width:80px;">
                        <label style="font-size:12px;color:var(--text-dim);">Km od</label>
                        <input type="text" id="notKmOd" value="${escapeHtmlNot(n?.kmOd || "").replace(/"/g, "&quot;")}" style="width:100%;">
                    </div>
                    <div style="flex:0.7;min-width:80px;">
                        <label style="font-size:12px;color:var(--text-dim);">Km do</label>
                        <input type="text" id="notKmDo" value="${escapeHtmlNot(n?.kmDo || "").replace(/"/g, "&quot;")}" style="width:100%;">
                    </div>
                </div>
            </div>

            <!-- Word-like ribbon -->
            <div class="notatki-ribbon" style="padding:8px 12px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg-input);display:flex;flex-wrap:wrap;gap:6px;align-items:center;position:sticky;top:52px;z-index:5;">
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:13px;font-weight:700;" onclick="notatkiCmd('bold')" title="Pogrubienie"><b>B</b></button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:13px;font-style:italic;" onclick="notatkiCmd('italic')" title="Kursywa"><i>I</i></button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:13px;" onclick="notatkiCmd('underline')" title="Podkreślenie"><u>U</u></button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:13px;" onclick="notatkiCmd('strikeThrough')" title="Przekreślenie"><s>S</s></button>
                <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
                <button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;" onclick="notatkiCmd('justifyLeft')" title="Do lewej">⫷</button>
                <button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;" onclick="notatkiCmd('justifyCenter')" title="Wyśrodkuj">☰</button>
                <button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;" onclick="notatkiCmd('justifyRight')" title="Do prawej">⫸</button>
                <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="notatkiCmd('insertUnorderedList')" title="Wypunktowanie">• Lista</button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="notatkiCmd('insertOrderedList')" title="Numerowanie">1. Lista</button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="notatkiInsertTable()" title="Tabela">▦ Tabela</button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="notatkiInsertHr()" title="Linia">―</button>
                <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
                <label style="font-size:11px;color:var(--text-dim);">Kolor</label>
                <input type="color" id="notColorText" value="#e11d48" title="Kolor tekstu" style="width:32px;height:28px;border:none;background:transparent;cursor:pointer;" onchange="notatkiApplyColor(this.value)">
                <label style="font-size:11px;color:var(--text-dim);">Tło</label>
                <input type="color" id="notColorBg" value="#fde047" title="Zaznaczenie / highlight" style="width:32px;height:28px;border:none;background:transparent;cursor:pointer;" onchange="notatkiApplyHighlight(this.value)">
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;background:#eab308;border-color:#ca8a04;color:#111;" onclick="notatkiMarkImportant()" title="Oznacz jako ważne">★ Ważne</button>
                <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="notatkiCmd('removeFormat')" title="Usuń format">Wyczyść</button>
                <span style="width:1px;height:22px;background:var(--border);margin:0 2px;"></span>
                <button type="button" class="btn-success" style="padding:4px 12px;font-size:12px;" onclick="notatkiInsertPageBreak()" title="Nowa strona jak w PDF">+ Strona</button>
            </div>

            <div style="background:var(--bg);padding:18px 12px 24px;">
                <div style="max-width:720px;margin:0 auto;">
                    <div class="notatki-paper notatki-paper-edit">
                        <div id="notTresc" class="notatki-paper-inner" contenteditable="true"
                             style="min-height:520px;outline:none;font-size:15px;line-height:1.65;color:var(--text);">${initialHtml}</div>
                    </div>
                    <div style="text-align:center;font-size:12px;color:var(--text-dim);margin-top:10px;">
                        Podgląd jak strona dokumentu · „+ Strona” dodaje kolejną kartę (jak PDF)
                    </div>
                </div>
            </div>

            <div style="padding:12px 16px 20px;border-top:1px solid var(--border);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                    <div style="font-size:13px;font-weight:600;color:var(--text-dim);">Załączniki (PDF / JPG / PNG · max ${NOTATKI_MAX_FILES})</div>
                    <div>
                        <input type="file" id="notFileInput" accept="${NOTATKI_ACCEPT}" multiple hidden onchange="notatkiOnFileSelected(event)">
                        <button type="button" class="btn-primary" style="padding:6px 12px;font-size:13px;"
                                onclick="document.getElementById('notFileInput').click()">📎 Wgraj plik</button>
                    </div>
                </div>
                <div id="notAttList">${notatkiRenderAttachments(_notatkiDraftAtt, { editable: true })}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
                    <button type="button" class="btn-success" onclick="saveNotatkaFromModal()">Zapisz</button>
                    <button type="button" class="btn-danger" onclick="closeNotatkaModal()">Anuluj</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const editor = document.getElementById("notTresc");
    if (editor) {
        notatkiStyleBody(editor);
        editor.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                document.execCommand("insertText", false, "    ");
            }
        });
        // zachowaj Enter = nowa linia w notatkach
        editor.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                // default contenteditable behavior
            }
        });
    }
    setTimeout(() => document.getElementById("notTytul")?.focus(), 40);
}

function notatkiCmd(cmd) {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    document.execCommand(cmd, false, null);
}

function notatkiApplyColor(color) {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    document.execCommand("foreColor", false, color);
}

function notatkiApplyHighlight(color) {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    try {
        document.execCommand("hiliteColor", false, color);
    } catch (e) {
        document.execCommand("backColor", false, color);
    }
}

function notatkiMarkImportant() {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // zaznacz cały akapit – lub wstaw marker
        document.execCommand("hiliteColor", false, "#fde047");
        document.execCommand("bold", false, null);
        return;
    }
    document.execCommand("hiliteColor", false, "#fde047");
    document.execCommand("bold", false, null);
}

function notatkiInsertHr() {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    document.execCommand("insertHTML", false, '<hr style="border:none;border-top:1px solid #94a3b8;margin:16px 0;">');
}

function notatkiInsertPageBreak() {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    document.execCommand("insertHTML", false,
        '<hr class="not-page-break" style="border:none;border-top:2px dashed #64748b;margin:28px 0;position:relative;">' +
        '<p style="text-align:center;font-size:11px;color:#94a3b8;margin:-20px 0 16px;">— nowa strona —</p><p><br></p>');
    if (typeof showToast === "function") showToast("Dodano podział strony");
}

function notatkiInsertTable() {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();

    const rows = prompt("Liczba wierszy tabeli:", "3");
    if (rows === null) return;
    const cols = prompt("Liczba kolumn:", "3");
    if (cols === null) return;
    const r = Math.min(20, Math.max(1, parseInt(rows, 10) || 2));
    const c = Math.min(10, Math.max(1, parseInt(cols, 10) || 2));

    let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;"><thead><tr>';
    for (let j = 0; j < c; j++) {
        html += '<th style="border:1px solid #64748b;padding:8px;background:rgba(100,116,139,.15);">Nagłówek ' + (j + 1) + '</th>';
    }
    html += "</tr></thead><tbody>";
    for (let i = 0; i < r - 1; i++) {
        html += "<tr>";
        for (let j = 0; j < c; j++) {
            html += '<td style="border:1px solid #64748b;padding:8px;">&nbsp;</td>';
        }
        html += "</tr>";
    }
    html += "</tbody></table><p><br></p>";
    document.execCommand("insertHTML", false, html);
}

function notatkiStyleBody(el) {
    if (!el) return;
    el.querySelectorAll("table").forEach(t => {
        t.style.cssText = "border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;";
        t.querySelectorAll("td,th").forEach(c => {
            c.style.cssText = "border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top;";
        });
        t.querySelectorAll("th").forEach(c => {
            c.style.background = "var(--bg-input)";
            c.style.fontWeight = "700";
        });
    });
    el.querySelectorAll("ul,ol").forEach(l => {
        l.style.margin = "8px 0 8px 1.2em";
        l.style.paddingLeft = "1em";
    });
    el.querySelectorAll("li").forEach(li => {
        li.style.margin = "4px 0";
    });
    // ważne – żółte tło ma zostać
    el.querySelectorAll('[style*="background"]').forEach(() => {});
}

function closeNotatkaModal() {
    const m = document.getElementById("notatkaModal");
    if (m) m.remove();
    _notatkiDraftAtt = [];
}

function sanitizeNotatkaHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html || "");
    div.querySelectorAll("script,iframe,object,embed,link,style").forEach(n => n.remove());
    div.querySelectorAll("*").forEach(el => {
        [...el.attributes].forEach(attr => {
            const name = attr.name.toLowerCase();
            if (name.startsWith("on") || name === "srcdoc") el.removeAttribute(attr.name);
        });
    });
    return div.innerHTML;
}

async function saveNotatkaFromModal() {
    ensureNotatkiState();
    const modal = document.getElementById("notatkaModal");
    if (!modal) return;

    const tytul = (document.getElementById("notTytul")?.value || "").trim();
    const editor = document.getElementById("notTresc");
    const tresc = sanitizeNotatkaHtml(editor ? editor.innerHTML : "");
    const plain = (editor?.innerText || "").trim();
    const linia = (document.getElementById("notLinia")?.value || "").trim();
    const kmOd = (document.getElementById("notKmOd")?.value || "").trim();
    const kmDo = (document.getElementById("notKmDo")?.value || "").trim();
    const kategoria = (document.getElementById("notKategoria")?.value || "Ogólne").trim();
    const zalaczniki = _notatkiDraftAtt.map(z => ({
        id: z.id || notatkiNewId(),
        name: z.name,
        type: z.type,
        size: z.size,
        data: z.data
    }));

    if (!tytul && !plain && !zalaczniki.length) {
        if (typeof showToast === "function") showToast("Podaj tytuł, treść lub załącznik");
        else alert("Podaj tytuł, treść lub załącznik");
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
        n.zalaczniki = zalaczniki;
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
            zalaczniki,
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
window.openNotatkaView = openNotatkaView;
window.openNotatkaEdit = openNotatkaEdit;
window.closeNotatkaModal = closeNotatkaModal;
window.saveNotatkaFromModal = saveNotatkaFromModal;
window.deleteNotatka = deleteNotatka;
window.notatkiCmd = notatkiCmd;
window.notatkiInsertHr = notatkiInsertHr;
window.notatkiInsertPageBreak = notatkiInsertPageBreak;
window.notatkiMarkImportant = notatkiMarkImportant;
window.notatkiApplyHighlight = notatkiApplyHighlight;
window.notatkiApplyColor = notatkiApplyColor;
window.notatkiViewNav = notatkiViewNav;
window.notatkiInsertTable = notatkiInsertTable;
window.notatkiOnFileSelected = notatkiOnFileSelected;
window.notatkiRemoveDraftAtt = notatkiRemoveDraftAtt;
window.notatkiOpenAttachment = notatkiOpenAttachment;
