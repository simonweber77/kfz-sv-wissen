// KFZ-SV Wissen – Ablage der importierten Unterlagen in IndexedDB (bleibt am Gerät).

const DB_NAME = 'kfz-sv-wissen';
const STORE = 'daten';

let verbindung = null;

function oeffne() {
    if (verbindung) return verbindung;
    verbindung = new Promise((resolve, reject) => {
        const anfrage = indexedDB.open(DB_NAME, 1);
        anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(STORE);
        anfrage.onsuccess = () => resolve(anfrage.result);
        anfrage.onerror = () => reject(anfrage.error);
    });
    return verbindung;
}

function vorgang(modus, aktion) {
    return oeffne().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, modus);
        const anfrage = aktion(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(anfrage.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
}

export const lese = (schluessel) => vorgang('readonly', (s) => s.get(schluessel));
export const schreibe = (schluessel, wert) => vorgang('readwrite', (s) => s.put(wert, schluessel));
export const loesche = (schluessel) => vorgang('readwrite', (s) => s.delete(schluessel));

// Bittet iOS, die Daten nicht automatisch zu löschen (bei installierten Web-Apps meist gewährt).
export async function dauerhaftSpeichern() {
    try {
        return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
    } catch {
        return false;
    }
}
