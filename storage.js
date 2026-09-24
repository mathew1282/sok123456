// ======================
// SUPABASE INTEGRACJA
// ======================
const SUPABASE_URL = 'https://ytitgnljigizsunidwdy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aXRnbmxqaWdpenN1bmlkd2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjc5MTMsImV4cCI6MjA5Nzc0MzkxM30.rs3aHmDiDyAhjpIxbSsD4JLyv4tQMMOIcm8R2uZnM6M';

let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

// ======================
// DEFAULT STATE
// ======================
const defaultState = {
    dane: {
        columns: [
            "Imię",
            "Nazwisko",
            "Stopień",
            "Numer służbowy",
            "NrPLK"
        ],
        rows: []
    },
    zgloszenia: {
        columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "NazwaSzlaku", "Km"],
        rows: []
    },
    polecenia: {
        columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"],
        rows: []
    },
    patrole: [],
    szablony: [],
    statystyki: {
        interwencje: [],
        sprawdzenia: []
    },
    kz: "",
    mkk: "",
    linie: {
        szlak: "",
        osobowa: "",
        towarowa: "",
        dyzurny: "",
        komendant: ""
    },
    wot1: "",
    wot2: "",
    policjant1: "",
    policjant2: "",
    notatki: []
};

let appState = { ...defaultState };

// ======================
// GŁÓWNE FUNKCJE
// ======================

async function saveState() {
    localStorage.setItem("sokData", JSON.stringify(appState));

    try {
        const client = getSupabase();
        const { error } = await client
            .from('app_state')
            .upsert({
                id: 1,
                name: 'main_state',
                data: appState,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        console.log("✅ Dane zapisane na serwerze");
    } catch (err) {
        console.warn("⚠️ Zapisano tylko lokalnie", err);
    }
}

function normalizeState() {
    if (!Array.isArray(appState.patrole)) appState.patrole = [];
    if (!Array.isArray(appState.szablony)) appState.szablony = [];

    if (!appState.zgloszenia) appState.zgloszenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "NazwaSzlaku", "Km"], rows: [] };
    if (!Array.isArray(appState.zgloszenia.rows)) appState.zgloszenia.rows = [];

    if (!appState.polecenia) appState.polecenia = { columns: ["Linia", "OpisKrotki", "OpisPom", "Opis", "Rodzaj", "Nazwa", "KmOd", "KmDo"], rows: [] };
    if (!Array.isArray(appState.polecenia.rows)) appState.polecenia.rows = [];

    if (!appState.dane) appState.dane = defaultState.dane;

    if (!appState.statystyki) appState.statystyki = { interwencje: [], sprawdzenia: [] };
    if (!Array.isArray(appState.statystyki.interwencje)) appState.statystyki.interwencje = [];
    if (!Array.isArray(appState.statystyki.sprawdzenia)) appState.statystyki.sprawdzenia = [];
    if (!Array.isArray(appState.notatki)) appState.notatki = [];
}

async function loadState() {
    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('app_state')
            .select('data')
            .eq('id', 1)
            .single();

        if (data?.data) {
            appState = { ...defaultState, ...data.data };
            normalizeState();
            console.log("✅ Wczytano dane z Supabase");
        } else {
            const local = localStorage.getItem("sokData");
            if (local) {
                appState = { ...defaultState, ...JSON.parse(local) };
                normalizeState();
            }
        }
    } catch (err) {
        console.warn("Nie udało się wczytać z serwera - używam localStorage");
        const local = localStorage.getItem("sokData");
        if (local) {
            try {
                appState = { ...defaultState, ...JSON.parse(local) };
                normalizeState();
            } catch (e) {
                console.error("Błąd localStorage", e);
            }
        }
    }

    window.dispatchEvent(new Event("sokStateLoaded"));
}

async function uploadPDF(file, customName = null) {
    if (!file) return null;
    console.log("Upload PDF gotowy do użycia");
    return null;
}

window.saveState = saveState;
window.loadState = loadState;
window.uploadPDF = uploadPDF;
window.appState = appState;
window.defaultState = defaultState;

document.addEventListener("DOMContentLoaded", async () => {
    await loadState();
});
