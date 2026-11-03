// KFZ-SV Wissen – kleine, sichere Markdown-Darstellung für Antworten und Fundstellen.
// Jeder Text wird zuerst maskiert; erzeugt werden nur bekannte Elemente.

export function maskiere(text) {
    return text.replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}

function inline(text, mitZitaten) {
    let html = maskiere(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    if (mitZitaten) {
        // [1], [2, 5] oder [3][4] → antippbare Quellen-Marken
        html = html.replace(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g, (_, liste) =>
            liste.split(/\s*[,;]\s*/).map((n) => `<button type="button" class="zitat" data-nr="${n}">${n}</button>`).join(''));
    }
    return html;
}

function istTabellenTrenner(zeile) {
    return /^\s*\|?[\s:|-]+\|?\s*$/.test(zeile) && zeile.includes('-');
}

function zellen(zeile) {
    return zeile.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((z) => z.trim());
}

/** Wandelt Markdown in HTML um. `mitZitaten` macht aus [n] antippbare Quellen-Marken. */
export function markdownZuHtml(text, { mitZitaten = false } = {}) {
    const zeilen = text.replace(/\r\n?/g, '\n').split('\n');
    const teile = [];
    let absatz = [];
    let liste = null; // { typ: 'ul'|'ol', punkte: [] }

    const absatzAbschliessen = () => {
        if (absatz.length) teile.push(`<p>${absatz.map((z) => inline(z, mitZitaten)).join('<br>')}</p>`);
        absatz = [];
    };
    const listeAbschliessen = () => {
        if (liste) teile.push(`<${liste.typ}>${liste.punkte.map((p) => `<li>${inline(p, mitZitaten)}</li>`).join('')}</${liste.typ}>`);
        liste = null;
    };
    const alles = () => { absatzAbschliessen(); listeAbschliessen(); };

    for (let i = 0; i < zeilen.length; i++) {
        const zeile = zeilen[i];
        const t = zeile.trim();

        if (!t || t === '---') { alles(); continue; }

        const ueberschrift = /^(#{1,6})\s+(.*)$/.exec(t);
        if (ueberschrift) {
            alles();
            const ebene = Math.min(Math.max(ueberschrift[1].length, 3), 5);
            teile.push(`<h${ebene}>${inline(ueberschrift[2], mitZitaten)}</h${ebene}>`);
            continue;
        }

        if (t.startsWith('|') && istTabellenTrenner(zeilen[i + 1] || '')) {
            alles();
            const kopf = zellen(t);
            i++;
            const reihen = [];
            while (i + 1 < zeilen.length && zeilen[i + 1].trim().startsWith('|')) reihen.push(zellen(zeilen[++i]));
            teile.push('<div class="tabelle"><table><thead><tr>' +
                kopf.map((z) => `<th>${inline(z, mitZitaten)}</th>`).join('') + '</tr></thead><tbody>' +
                reihen.map((r) => '<tr>' + r.map((z) => `<td>${inline(z, mitZitaten)}</td>`).join('') + '</tr>').join('') +
                '</tbody></table></div>');
            continue;
        }

        const punkt = /^([-*•]|\d+[.)])\s+(.*)$/.exec(t);
        if (punkt) {
            absatzAbschliessen();
            const typ = /^\d/.test(punkt[1]) ? 'ol' : 'ul';
            if (liste && liste.typ !== typ) listeAbschliessen();
            if (!liste) liste = { typ, punkte: [] };
            liste.punkte.push(punkt[2]);
            continue;
        }

        if (t.startsWith('>')) {
            alles();
            teile.push(`<blockquote>${inline(t.replace(/^>\s?/, ''), mitZitaten)}</blockquote>`);
            continue;
        }

        listeAbschliessen();
        absatz.push(t);
    }
    alles();
    return teile.join('');
}
