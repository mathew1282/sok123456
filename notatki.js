// =====================================
// NOTATKI – czytelna lista + bogaty edytor
// =====================================

const NOTATKI_KATEGORIE = ["Wszystkie", "Linia / km", "Pisma", "Ogólne", "Inne"];
const NOTATKI_KAT_EDIT = ["Linia / km", "Pisma", "Ogólne", "Inne"];

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
            const plain = String(n.tresc || "").replace(/<[^>]+>/g, " ");
            const blob = [n.tytul, plain, n.linia, n.kmOd, n.kmDo, n.kategoria]
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
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
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

function openNotatkaView(id) {
    ensureNotatkiState();
    const n = appState.notatki.find(x => x.id === id);
    if (!n) {
        if (typeof showToast === "function") showToast("Nie znaleziono notatki");
        return;
    }

    const old = document.getElementById("notatkaModal");
    if (old) old.remove();

    const kat = n.kategoria || "Ogólne";
    const meta = notatkiMetaBits(n);
    const bodyHtml = n.tresc && /<[^>]+>/.test(n.tresc)
        ? n.tresc
        : escapeHtmlNot(n.tresc || "").replace(/\n/g, "<br>");

    const overlay = document.createElement("div");
    overlay.id = "notatkaModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:center; justify-content:center; padding:12px; z-index:10040;";
    overlay.onclick = (e) => { if (e.target === overlay) closeNotatkaModal(); };

    overlay.innerHTML = `
        <div class="modal" style="width:min(780px,96vw); max-height:92vh; overflow:auto; padding:0;" onclick="event.stopPropagation()">
            <div style="position:sticky; top:0; z-index:2; background:var(--bg-light); border-bottom:1px solid var(--border); padding:16px 20px; display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                        <span style="font-size:11px; font-weight:600; padding:3px 10px; border-radius:999px; ${notatkiKatStyle(kat)}">${escapeHtmlNot(kat)}</span>
                        ${meta.map(m => `<span style="font-size:12px; color:var(--text-dim);">${escapeHtmlNot(m)}</span>`).join("")}
                    </div>
                    <h2 style="margin:0; font-size:20px; line-height:1.3; word-break:break-word;">${escapeHtmlNot(n.tytul || "(bez tytułu)")}</h2>
                    <div style="font-size:11px; color:var(--text-dim); margin-top:6px;">${escapeHtmlNot(notatkiFormatDate(n.updatedAt || n.createdAt))}</div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button class="btn-primary" onclick="openNotatkaEdit('${n.id}')">Edytuj</button>
                    <button class="btn-danger" onclick="closeNotatkaModal()">Zamknij</button>
                </div>
            </div>
            <div class="notatka-body" style="padding:20px 22px 28px; font-size:15px; line-height:1.6; color:var(--text-soft); word-break:break-word;">
                ${bodyHtml || "<span style='color:var(--text-dim);'>Brak treści</span>"}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    notatkiStyleBody(overlay.querySelector(".notatka-body"));
}

function notatkiStyleBody(el) {
    if (!el) return;
    el.querySelectorAll("table").forEach(t => {
        t.style.cssText = "border-collapse:collapse; width:100%; margin:12px 0; font-size:14px;";
        t.querySelectorAll("td,th").forEach(c => {
            c.style.cssText = "border:1px solid var(--border); padding:8px 10px; text-align:left; vertical-align:top;";
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
}

function openNotatkaEdit(id) {
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

    const katOpts = NOTATKI_KAT_EDIT.map(k =>
        `<option value="${escapeHtmlNot(k)}"${(n.kategoria || "Ogólne") === k ? " selected" : ""}>${escapeHtmlNot(k)}</option>`
    ).join("");

    const initialHtml = (() => {
        const t = n.tresc || "";
        if (!t) return "";
        if (/<[^>]+>/.test(t)) return t;
        return escapeHtmlNot(t).replace(/\n/g, "<br>");
    })();

    const overlay = document.createElement("div");
    overlay.id = "notatkaModal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; align-items:center; justify-content:center; padding:12px; z-index:10040;";
    overlay._editId = id || null;

    overlay.innerHTML = `
        <div class="modal" style="width:min(860px,96vw); max-height:94vh; overflow:auto; padding:18px 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                <h2 style="margin:0;">${isNew ? "Nowa notatka" : "Edytuj notatkę"}</h2>
                <div style="display:flex; gap:8px;">
                    <button class="btn-success" onclick="saveNotatkaFromModal()">Zapisz</button>
                    <button class="btn-danger" onclick="closeNotatkaModal()">Anuluj</button>
                </div>
            </div>

            <label style="font-size:12px; color:var(--text-dim);">Tytuł</label>
            <input type="text" id="notTytul" value="${escapeHtmlNot(n.tytul)}" placeholder="np. Linia 275 – przejazd / Pismo nr …"
                   style="width:100%; margin:4px 0 12px 0; font-size:16px; font-weight:600;">

            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:12px;">
                <div>
                    <label style="font-size:12px; color:var(--text-dim);">Kategoria</label>
                    <select id="notKategoria" style="width:100%; margin-top:4px;">${katOpts}</select>
                </div>
                <div>
                    <label style="font-size:12px; color:var(--text-dim);">Linia</label>
                    <input type="text" id="notLinia" value="${escapeHtmlNot(n.linia)}" placeholder="275" style="width:100%; margin-top:4px;">
                </div>
                <div>
                    <label style="font-size:12px; color:var(--text-dim);">Km od</label>
                    <input type="text" id="notKmOd" value="${escapeHtmlNot(n.kmOd)}" placeholder="0,000" style="width:100%; margin-top:4px;">
                </div>
                <div>
                    <label style="font-size:12px; color:var(--text-dim);">Km do</label>
                    <input type="text" id="notKmDo" value="${escapeHtmlNot(n.kmDo)}" placeholder="0,000" style="width:100%; margin-top:4px;">
                </div>
            </div>

            <label style="font-size:12px; color:var(--text-dim);">Treść</label>
            <div id="notEditorToolbar" style="display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 0 0; padding:8px; border:1px solid var(--border); border-bottom:none; border-radius:10px 10px 0 0; background:var(--bg-input);">
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:13px; font-weight:700;" onclick="notatkiCmd('bold')" title="Pogrubienie"><b>B</b></button>
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:13px;" onclick="notatkiCmd('underline')" title="Podkreślenie"><u>U</u></button>
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:13px;" onclick="notatkiCmd('insertUnorderedList')" title="Lista z kropkami">• Lista</button>
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:13px;" onclick="notatkiCmd('insertOrderedList')" title="Lista numerowana">1. Lista</button>
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:13px;" onclick="notatkiInsertTable()" title="Wstaw tabelę">▦ Tabela</button>
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:13px;" onclick="notatkiCmd('removeFormat')" title="Usuń formatowanie">Wyczyść styl</button>
            </div>
            <div id="notTresc"
                 contenteditable="true"
                 style="min-height:220px; max-height:42vh; overflow:auto; padding:14px 16px; border:1px solid var(--border); border-radius:0 0 10px 10px; background:var(--bg); color:var(--text-soft); font-size:15px; line-height:1.55; outline:none;">${initialHtml}</div>

            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px; flex-wrap:wrap;">
                <button class="btn-success" onclick="saveNotatkaFromModal()">Zapisz</button>
                <button class="btn-danger" onclick="closeNotatkaModal()">Anuluj</button>
            </div>
        </div>
    `;
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
    }
    setTimeout(() => document.getElementById("notTytul")?.focus(), 40);
}

function notatkiCmd(cmd) {
    const editor = document.getElementById("notTresc");
    if (!editor) return;
    editor.focus();
    document.execCommand(cmd, false, null);
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

    let html = '<table style="border-collapse:collapse;width:100%;margin:10px 0;"><thead><tr>';
    for (let j = 0; j < c; j++) {
        html += '<th style="border:1px solid #64748b;padding:8px;background:rgba(100,116,139,.2);">Nagłówek ' + (j + 1) + '</th>';
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

function closeNotatkaModal() {
    const m = document.getElementById("notatkaModal");
    if (m) m.remove();
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

    if (!tytul && !plain) {
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
window.openNotatkaView = openNotatkaView;
window.openNotatkaEdit = openNotatkaEdit;
window.closeNotatkaModal = closeNotatkaModal;
window.saveNotatkaFromModal = saveNotatkaFromModal;
window.deleteNotatka = deleteNotatka;
window.notatkiCmd = notatkiCmd;
window.notatkiInsertTable = notatkiInsertTable;
