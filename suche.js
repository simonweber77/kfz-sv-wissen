// KFZ-SV Wissen – Zerlegung der Unterlagen und lokale Volltextsuche (BM25).
// Ohne DOM und ohne Abhängigkeiten: läuft im Browser und unter Node (Tests).

const STANDARD_MAX_ZEICHEN = 1500;
const STANDARD_UEBERLAPPUNG = 200;

// ---------------------------------------------------------------------------
// Zerlegung
// ---------------------------------------------------------------------------

// Überschrift ohne Markdown-Links, Hervorhebungen und Backticks.
function bereinigeUeberschrift(text) {
    return text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|`/g, '')
        .trim();
}

// Zeilen, die nur Struktur sind und keinen Inhalt tragen.
function istLeerzeile(zeile) {
    const t = zeile.trim();
    return t === '' || t === '---' || /^\|?\s*:?-{3,}/.test(t) && /^[|\s:-]+$/.test(t);
}

// Teilt einen langen Abschnitt in Fenster mit Überlappung. Beginnt ein Fenster
// mitten in einer Tabelle, wird deren Kopfzeile vorangestellt, damit Werte wie
// "Abdeckarbeiten | 0,3 | 2,00" ihre Spaltenbedeutung behalten.
function teileInFenster(zeilen, maxZeichen, ueberlappung) {
    const fenster = [];
    let aktuell = [];
    let laenge = 0;
    let tabellenKopf = null;

    const abschliessen = () => {
        if (aktuell.length) fenster.push(aktuell.join('\n'));
        // Überlappung: letzte ganze Zeilen bis ca. `ueberlappung` Zeichen übernehmen,
        // bei einer langen letzten Zeile nur deren Ende
        const rest = [];
        let n = 0;
        for (let i = aktuell.length - 1; i >= 0 && n < ueberlappung; i--) {
            if (n + aktuell[i].length > ueberlappung * 1.5) {
                if (!rest.length) rest.unshift('…' + aktuell[i].slice(-ueberlappung));
                break;
            }
            rest.unshift(aktuell[i]);
            n += aktuell[i].length + 1;
        }
        const inTabelle = rest.length && rest[0].trim().startsWith('|');
        aktuell = inTabelle && tabellenKopf && rest[0] !== tabellenKopf[0]
            ? [...tabellenKopf, ...rest]
            : rest;
        laenge = aktuell.reduce((s, z) => s + z.length + 1, 0);
    };

    for (let i = 0; i < zeilen.length; i++) {
        let zeile = zeilen[i];
        const naechste = zeilen[i + 1] || '';
        if (zeile.trim().startsWith('|') && /^\s*\|?[\s:|-]+$/.test(naechste) && naechste.includes('-')) {
            tabellenKopf = [zeile, naechste];
        } else if (!zeile.trim().startsWith('|')) {
            tabellenKopf = null;
        }
        // Einzelne überlange Zeile hart zerteilen
        while (zeile.length > maxZeichen) {
            if (laenge) abschliessen();
            fenster.push(zeile.slice(0, maxZeichen));
            zeile = zeile.slice(maxZeichen - ueberlappung);
            aktuell = [];
            laenge = 0;
        }
        if (laenge + zeile.length + 1 > maxZeichen && laenge > 0) abschliessen();
        aktuell.push(zeile);
        laenge += zeile.length + 1;
    }
    if (aktuell.some((z) => !istLeerzeile(z))) fenster.push(aktuell.join('\n'));
    // Doppelte Fenster (nur Überlappung) entfernen
    return fenster.filter((f, i) => i === 0 || !fenster[i - 1].endsWith(f));
}

/**
 * Zerlegt die Gesamt-.md in suchbare Abschnitte.
 * Gibt es "## Kapitel"-Überschriften, wird alles davor (Übersicht, Inhaltsverzeichnis) übersprungen.
 * @returns {{id:number, kapitel:string, dokument:string, pfad:string[], text:string}[]}
 */
export function zerlegeUnterlagen(markdown, { maxZeichen = STANDARD_MAX_ZEICHEN, ueberlappung = STANDARD_UEBERLAPPUNG } = {}) {
    const zeilen = markdown.replace(/\r\n?/g, '\n').split('\n');
    const abschnitte = [];
    const stapel = []; // Überschriften Ebene 2..6, Index = Ebene - 2
    let puffer = [];
    // Kompendium mit "## Kapitel"-Gliederung: Übersicht davor überspringen; andere Dateien ganz nehmen
    let begonnen = !/^##\s+Kapitel\s+\d+/m.test(markdown);
    let imCodeblock = false;

    const sichern = () => {
        const inhalt = puffer.filter((z) => !istLeerzeile(z));
        if (stapel.length && inhalt.join('').trim().length >= 30) {
            const pfad = stapel.filter(Boolean);
            for (const text of teileInFenster(puffer, maxZeichen, ueberlappung)) {
                abschnitte.push({
                    id: abschnitte.length,
                    kapitel: stapel[0] || '',
                    dokument: stapel[1] || '',
                    pfad,
                    text: text.trim(),
                });
            }
        }
        puffer = [];
    };

    for (const zeile of zeilen) {
        if (zeile.startsWith('```')) imCodeblock = !imCodeblock;
        const treffer = !imCodeblock && /^(#{2,6})\s+(.*)$/.exec(zeile);
        if (treffer) {
            const ebene = treffer[1].length;
            const titel = bereinigeUeberschrift(treffer[2]);
            if (!begonnen) {
                if (ebene !== 2 || !/^Kapitel\s+\d+/i.test(titel)) continue;
                begonnen = true;
            }
            sichern();
            stapel.length = ebene - 2;
            stapel[ebene - 2] = titel;
            continue;
        }
        if (begonnen) puffer.push(zeile);
    }
    sichern();
    return abschnitte;
}

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

const STOPPWOERTER = new Set(`
aber alle allem allen aller alles als also am an ander andere anderem anderen anderer anderes auch auf aus bei
beim bin bis bist bitte da damit dann das dass dein dem den denn der des dessen deshalb die dies diese diesem
diesen dieser dieses doch dort du durch ein eine einem einen einer eines er erklaere erklare erklaer es etwa euch
fuer fur gibt habe haben hat hatte hier hierfur hierfuer ich ihr im in ist ja jede jedem jeden jeder jedes kann
koennen konnen mal man mehr mein mich mir mit muss nach nicht noch nun nur ob oder ohne sehr sein seine sich sie
sind so soll sollen ueber uber um und uns unter viel viele vom von vor war waren was weil welche welchem welchen
welcher welches wenn wer werden wie wieviel wird wo worden wurde zu zum zur zwar zwischen gerne bzw zb ca
`.split(/\s+/).filter(Boolean));

// CISTEM-Stemmer für Deutsch (Weißweiler & Fraser 2017), ohne Groß/klein-Unterscheidung.
export function stamm(wort) {
    let w = wort.toLowerCase()
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ä/g, 'a').replace(/ß/g, 'ss');
    if (/^\d/.test(w)) return w;
    w = w.replace(/^ge(.{4,})/, '$1')
        .replace(/sch/g, '$').replace(/ei/g, '%').replace(/ie/g, '&')
        .replace(/(.)\1/g, '$1*');
    while (w.length > 3) {
        let neu = w;
        if (w.length > 5) {
            neu = w.replace(/e[mr]$/, '');
            if (neu === w) neu = w.replace(/nd$/, '');
        }
        if (neu === w) neu = w.replace(/t$/, '');
        if (neu === w) neu = w.replace(/[esn]$/, '');
        if (neu === w) break;
        w = neu;
    }
    return w.replace(/(.)\*/g, '$1$1').replace(/&/g, 'ie').replace(/%/g, 'ei').replace(/\$/g, 'sch');
}

// Fachbegriffe, die in den Unterlagen unterschiedlich geschrieben werden.
const SYNONYM_GRUPPEN = [
    ['wertminderung', 'minderwert', 'wertverlust'],
    ['stoßstange', 'stoßfänger', 'stossstange', 'stossfänger'],
    ['qualitätssicherung', 'qualität', 'mindeststandard', 'qs'],
    ['materialkonstante', 'materialkosten', 'material'],
    ['hochvolt', 'hv', 'elektrofahrzeug', 'e-fahrzeug'],
    ['wiederbeschaffungswert', 'wbw'],
    ['kilometer', 'km', 'laufleistung', 'kilometerstand'],
    ['erstzulassung', 'ez', 'zulassung'],
    ['erneuert', 'erneuerung', 'ersetzt', 'getauscht', 'tausch'],
    ['alt', 'alter', 'fahrzeugalter', 'altersgrenze'],
    ['abdeckarbeit', 'abdecken', 'abkleben', 'abdeckmaterial', 'abdeckung'],
    ['zweifarbig', 'andersfarbig', 'teilweise', 'teillackiert'],
    ['scheibe', 'verglasung', 'windschutzscheibe'],
];

const SYNONYME = new Map();
for (const gruppe of SYNONYM_GRUPPEN) {
    const staemme = gruppe.map(stamm);
    for (const s of staemme) SYNONYME.set(s, staemme.filter((x) => x !== s));
}

/** Zerlegt Text in normalisierte Suchbegriffe. Zahlen wie "0,3" bleiben als "0.3" erhalten. */
export function begriffe(text) {
    const roh = text.toLowerCase().match(/[a-z0-9äöüß]+(?:[.,][0-9]+)*/g) || [];
    const ergebnis = [];
    for (const t of roh) {
        if (/^\d/.test(t)) {
            ergebnis.push(t.replace(/,/g, '.'));
            continue;
        }
        const ohneUmlaut = t.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
        if (t.length < 2 || STOPPWOERTER.has(t) || STOPPWOERTER.has(ohneUmlaut)) continue;
        ergebnis.push(stamm(t));
    }
    return ergebnis;
}

// ---------------------------------------------------------------------------
// Index und Suche (BM25)
// ---------------------------------------------------------------------------

const K1 = 1.2;
const B = 0.75;
const PFAD_GEWICHT = 2; // Begriffe aus den Überschriften zählen doppelt
const ABDECKUNG = 1;    // Gewicht der Abdeckung: Anteil getroffener Fragebegriffe hoch diesem Wert

/** Baut einen serialisierbaren Suchindex (nur einfache Objekte, für IndexedDB geeignet). */
export function baueIndex(abschnitte) {
    const haeufigkeiten = [];
    const laengen = [];
    const df = {};
    for (const a of abschnitte) {
        const tf = {};
        const pfadBegriffe = begriffe(a.pfad.join(' '));
        const textBegriffe = begriffe(a.text);
        for (const b of textBegriffe) tf[b] = (tf[b] || 0) + 1;
        for (const b of pfadBegriffe) tf[b] = (tf[b] || 0) + PFAD_GEWICHT;
        for (const b of Object.keys(tf)) df[b] = (df[b] || 0) + 1;
        haeufigkeiten.push(tf);
        laengen.push(textBegriffe.length + pfadBegriffe.length * PFAD_GEWICHT);
    }
    const mittlereLaenge = laengen.reduce((s, l) => s + l, 0) / Math.max(laengen.length, 1);
    return { anzahl: abschnitte.length, haeufigkeiten, laengen, df, mittlereLaenge };
}

/**
 * Sucht die passendsten Abschnitte.
 * @returns {{abschnitt:object, punkte:number}[]} absteigend nach Punkten
 */
export function suche(index, abschnitte, frage, { anzahl = 10, maxProDokument = 2, abdeckung = ABDECKUNG } = {}) {
    // Jeder Fragebegriff bildet eine Gruppe aus sich selbst, Synonymen und Wortteilen
    const gewichte = new Map();
    const gruppen = new Map(); // Begriff → Bitmaske der Fragebegriffe, zu denen er passt
    const setze = (begriff, gewicht, gruppe) => {
        gewichte.set(begriff, Math.max(gewichte.get(begriff) || 0, gewicht));
        gruppen.set(begriff, (gruppen.get(begriff) || 0) | (1 << gruppe));
    };
    const wortschatz = Object.keys(index.df);
    const fragebegriffe = [...new Set(begriffe(frage))].slice(0, 30);
    fragebegriffe.forEach((b, g) => {
        setze(b, 1, g);
        for (const s of SYNONYME.get(b) || []) setze(s, 0.7, g);
        // Zusammengesetzte Wörter: "Berechnungsarten" findet "Berechnung",
        // "Kraftfahrzeug" findet "Fahrzeug" und umgekehrt
        if (b.length >= 6 && !/^\d/.test(b)) {
            for (const w of wortschatz) {
                if (w !== b && w.length >= 5 && (b.startsWith(w) || b.endsWith(w) || (w.length > b.length && w.includes(b)))) setze(w, 0.5, g);
            }
        }
    });
    if (!gewichte.size) return [];

    const punkte = new Float64Array(index.anzahl);
    const getroffen = new Uint32Array(index.anzahl);
    for (const [begriff, gewicht] of gewichte) {
        const df = index.df[begriff];
        if (!df) continue;
        const idf = Math.log(1 + (index.anzahl - df + 0.5) / (df + 0.5));
        const maske = gruppen.get(begriff);
        for (let i = 0; i < index.anzahl; i++) {
            const tf = index.haeufigkeiten[i][begriff];
            if (!tf) continue;
            const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * index.laengen[i] / index.mittlereLaenge));
            punkte[i] += gewicht * idf * norm;
            getroffen[i] |= maske;
        }
    }

    // Abdeckung: Abschnitte, die viele verschiedene Fragebegriffe enthalten, schlagen solche,
    // die nur einen Begriff oft wiederholen (z. B. "Scheibe" in Glas-Katalogen)
    const anzahlBegriffe = fragebegriffe.length;
    for (let i = 0; i < index.anzahl; i++) {
        if (!punkte[i]) continue;
        let n = 0;
        for (let m = getroffen[i]; m; m &= m - 1) n++;
        punkte[i] *= (n / anzahlBegriffe) ** abdeckung;
    }

    const sortiert = [...punkte.keys()].filter((i) => punkte[i] > 0).sort((a, b) => punkte[b] - punkte[a]);
    const proDokument = new Map();
    const ergebnis = [];
    for (const i of sortiert) {
        const dok = abschnitte[i].dokument;
        const n = proDokument.get(dok) || 0;
        if (n >= maxProDokument) continue;
        proDokument.set(dok, n + 1);
        ergebnis.push({ abschnitt: abschnitte[i], punkte: punkte[i] });
        if (ergebnis.length >= anzahl) break;
    }
    return ergebnis;
}
