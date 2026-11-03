// KFZ-SV Wissen – Antworten als reinen Text aufbereiten (zum Kopieren und Vorlesen) und vorlesen.

const QUELLEN_MARKE = /\s*\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\]/g;

/** Markdown-Antwort → schlichter Text ohne Quellen-Nummern, z. B. für eine E-Mail. */
export function klartext(markdown) {
    return markdown
        .replace(/\r\n?/g, '\n')
        .replace(QUELLEN_MARKE, '')
        .split('\n')
        .filter((z) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(z) || !z.includes('-')) // Tabellen-Trennzeilen
        .map((z) => {
            const t = z.trim();
            if (t.startsWith('|')) return t.replace(/^\||\|$/g, '').split('|').map((s) => s.trim()).filter(Boolean).join(' – ');
            return z.replace(/^#{1,6}\s+/, '').replace(/^\s*[*•]\s+/, '- ');
        })
        .join('\n')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Text zum Vorlesen: Aufzählungszeichen und Abkürzungen gesprochen sinnvoll. */
export function sprechtext(markdown) {
    return klartext(markdown)
        .replace(/^- /gm, '')
        .replace(/€\s?(\d+(?:[.,]\d+)*)/g, '$1 Euro')
        .replace(/(\d+(?:[.,]\d+)*)\s?€/g, '$1 Euro')
        .replace(/\bStd\./g, 'Stunden')
        .replace(/\bz\.\s?B\./g, 'zum Beispiel')
        .replace(/\bbzw\./g, 'beziehungsweise')
        .replace(/\bggf\./g, 'gegebenenfalls')
        .replace(/\bvgl\./g, 'vergleiche')
        .replace(/\bca\./g, 'circa')
        .replace(/→/g, ', danach ')
        .replace(/\s*–\s*/g, ', ');
}

/** iOS bricht lange Vorlese-Texte gern ab – deshalb in Sätze bis ca. 220 Zeichen teilen. */
export function teileZumVorlesen(text, max = 220) {
    const saetze = text.replace(/\n+/g, '. ').replace(/\.\s*\./g, '.').match(/[^.!?]+[.!?]*/g) || [];
    const teile = [];
    let aktuell = '';
    for (const satz of saetze.map((s) => s.trim()).filter(Boolean)) {
        if (aktuell && (aktuell + ' ' + satz).length > max) { teile.push(aktuell); aktuell = satz; }
        else aktuell = aktuell ? `${aktuell} ${satz}` : satz;
    }
    if (aktuell) teile.push(aktuell);
    return teile;
}

let aktiv = null; // { beiEnde }

export const kannVorlesen = () => typeof speechSynthesis !== 'undefined';

export function stoppeVorlesen() {
    if (!kannVorlesen()) return;
    const vorher = aktiv;
    aktiv = null;
    speechSynthesis.cancel();
    vorher?.beiEnde();
}

/** Liest die Antwort vor; `beiEnde` wird nach dem Ende oder beim Stoppen aufgerufen. */
export function lieseVor(markdown, beiEnde = () => {}) {
    stoppeVorlesen();
    const stimmen = speechSynthesis.getVoices();
    const stimme = stimmen.find((s) => s.lang === 'de-AT') || stimmen.find((s) => s.lang?.startsWith('de'));
    const teile = teileZumVorlesen(sprechtext(markdown));
    const eintrag = { beiEnde };
    aktiv = eintrag;
    teile.forEach((t, i) => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = stimme?.lang || 'de-AT';
        if (stimme) u.voice = stimme;
        u.rate = 1.05;
        if (i === teile.length - 1) u.onend = () => { if (aktiv === eintrag) { aktiv = null; beiEnde(); } };
        speechSynthesis.speak(u);
    });
    if (!teile.length) stoppeVorlesen();
}
