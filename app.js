document.addEventListener("DOMContentLoaded", () => {

    const saveDataBtn = document.getElementById("saveDataBtn");
    const loadDataBtn = document.getElementById("loadDataBtn");
    const jsonLoader = document.getElementById("jsonLoader");

    if (saveDataBtn) saveDataBtn.addEventListener("click", exportToJSON);
    if (loadDataBtn) loadDataBtn.addEventListener("click", () => jsonLoader.click());
    if (jsonLoader) jsonLoader.addEventListener("change", importFromJSON);

    document.querySelectorAll(".menu-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const page = btn.dataset.page;
            loadPage(page);
            document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    if (window.__sokStateReady) {
        startApp();
    } else {
        window.addEventListener("sokStateLoaded", startApp, { once: true });
        setTimeout(() => {
            if (!window.__sokStarted) startApp();
        }, 2000);
    }
});

function startApp() {
    if (window.__sokStarted) return;
    window.__sokStarted = true;
    loadPage("generator");
}

// ======================================
// Wbudowane strony
// ======================================

const pages = {
    dane: `<div id="daneContainer"></div>`,
    zgloszenia: `<div id="zgloszeniaContainer"></div>`,
    polecenia: `<div id="poleceniaContainer"></div>`,
    patrole: `<div id="patroleContainer"></div>`,
    statystyki: `<div id="statystykiContainer"></div>`,
    generator: `
    <div id="generatorContainer">

        <div class="generator-section" style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
            <div class="generator-title" style="margin-bottom:0; white-space:nowrap;">Komendant zmiany (KZ)</div>
            <input type="text" id="kzInput" placeholder="Wpisz KZ" style="flex:1; min-width:180px;">
            <div class="generator-title" style="margin-bottom:0; white-space:nowrap;">MKK</div>
            <input type="text" id="mkkInput" placeholder="Wpisz MKK" style="flex:1; min-width:180px;">
        </div>

        <div class="generator-section">
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px;">
                <div class="generator-title" style="margin-bottom:0;">Patrole</div>
                <div id="patrolCards" class="card-grid" style="margin:0;"></div>
            </div>
        </div>

        <div class="generator-section">
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px;">
                <div class="generator-title" style="margin-bottom:0;">Zgłoszenia</div>
                <input type="text" id="zglSearch" placeholder="Szukaj..." style="width:180px;"
                       oninput="filterGeneratorTiles()">
            </div>
            <div id="zgloszeniaLinie" class="card-grid"></div>
            <br>
            <div id="zgloszeniaItems" class="card-grid"></div>
        </div>

        <div class="generator-section">
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px;">
                <div class="generator-title" style="margin-bottom:0;">Polecenia</div>
                <input type="text" id="polSearch" placeholder="Szukaj..." style="width:180px;"
                       oninput="filterGeneratorTiles()">
            </div>
            <div id="poleceniaLinie" class="card-grid"></div>
            <br>
            <div id="poleceniaItems" class="card-grid"></div>
        </div>

        <!-- Linia 1: Logowanie sprawdzeń + Uwagi + przyciski -->
        <div class="generator-section">
            <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
                <div class="generator-title" style="margin-bottom:0;">Logowanie sprawdzeń</div>
                <button class="btn-success" onclick="openLogSprawdzenModal()">Zaloguj sprawdzenie</button>

                <div class="generator-title" style="margin-bottom:0; margin-left:8px;">Uwagi</div>
                <div id="uwagiNie" class="line-pill active" onclick="setUwagi('NIE')">NIE</div>
                <div id="uwagiTak" class="line-pill" onclick="setUwagi('TAK')">TAK</div>
            </div>
        </div>

        <!-- Linia 2: Wygenerowany wpis + przyciski -->
        <div class="generator-section">
            <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:12px;">
                <div class="generator-title" style="margin-bottom:0;">Wygenerowany wpis</div>
                <button class="btn-success" onclick="generateEntry()">Generuj wpis</button>
                <button class="btn-primary" onclick="copyEntry()">Kopiuj</button>
                <button class="btn-danger" onclick="clearEntry()">Wyczyść / odznacz wszystko</button>
                <div style="flex:1; min-width:8px;"></div>
                <div id="sequentialPatrolPill" class="line-pill sequential-pill-on" onclick="toggleSequentialPatrolMode()" title="Tryb sekwencyjny @patrol">@patrol</div>
            </div>
            <div id="wybraniHintBanner" class="wybrani-hint-banner" style="display:none;">
                ⚠ W tekście jest @wybrani — kliknij „Generuj wpis”, aby wybrać osoby
            </div>
            <div id="generatedEntry" class="generated-entry-editable" contenteditable="true"
                 style="width:100%; min-height:280px; padding:14px; border-radius:12px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; line-height:1.55; white-space:pre-wrap; outline:none;"></div>
        </div>
    </div>`,
    linie: `<div id="linieContainer"></div>`,
    ksiazka: `<div id="ksiazkaContainer"></div>`,
    porownania: `<div id="porownaniaContainer"></div>`
};

function loadPage(page) {
    const content = document.getElementById("content");
    if (!content) return;

    content.innerHTML = pages[page] || `<h2>Strona nie znaleziona</h2>`;

    switch (page) {
        case "dane":       if (typeof initDane === "function") initDane(); break;
        case "zgloszenia": if (typeof initZgloszenia === "function") initZgloszenia(); break;
        case "polecenia":  if (typeof initPolecenia === "function") initPolecenia(); break;
        case "patrole":    if (typeof initPatrole === "function") initPatrole(); break;
        case "statystyki": if (typeof initStatystyki === "function") initStatystyki(); break;
        case "generator":  if (typeof initGenerator === "function") initGenerator(); break;
        case "linie":      if (typeof initLinie === "function") initLinie(); break;
        case "ksiazka":    if (typeof initKsiazka === "function") initKsiazka(); break;
        case "porownania": if (typeof initPorownania === "function") initPorownania(); break;
    }
}

// ======================================
// EKSPORT / IMPORT
// ======================================

function exportToJSON() {
    const dataStr = JSON.stringify(appState, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `sok_legnica_${new Date().toISOString().slice(0,10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    alert("Dane wyeksportowane!");
}

function importFromJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (confirm("Nadpisać obecne dane?")) {
                appState = { ...defaultState, ...importedData };
                if (!Array.isArray(appState.patrole)) appState.patrole = [];
                if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
                if (!Array.isArray(appState.statystyki.interwencje)) appState.statystyki.interwencje = [];
                if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
                saveState();
                alert("Dane wczytane!");
                const activeBtn = document.querySelector(".menu-btn.active");
                if (activeBtn) loadPage(activeBtn.dataset.page);
                else loadPage("generator");
            }
        } catch (error) {
            alert("Błąd pliku JSON: " + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}
// ===== TRYB JASNY / CIEMNY =====
(function () {
    const toggle = document.getElementById('themeToggle');
    const saved = localStorage.getItem('sok-theme');

    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (toggle) toggle.textContent = '☀️';
    }

    if (toggle) {
        toggle.addEventListener('click', () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            if (isLight) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('sok-theme', 'dark');
                toggle.textContent = '🌙';
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('sok-theme', 'light');
                toggle.textContent = '☀️';
            }
        });
    }
})();
