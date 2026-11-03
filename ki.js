// KFZ-SV Wissen – Aufbau der Anfrage und Anbindung der KI (Claude oder Google Gemini).
// Firmenspezifische Regeln stehen nicht hier, sondern kommen aus den importierten Unterlagen.

export const MODELLE = [
    { anbieter: 'claude', id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', hinweis: 'Standard – schnell und genau (ca. 2 Cent pro Frage)' },
    { anbieter: 'claude', id: 'claude-opus-5-5', name: 'Claude Opus 5.5', hinweis: 'knifflige Fälle, beste Qualität (ca. 4–5 Cent)' },
    { anbieter: 'claude', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', hinweis: 'am schnellsten, einfache Fragen (ca. 0,1 Cent)' },
    { anbieter: 'gemini', id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', hinweis: 'schnell und günstig (ca. 0,8 Cent)' },
    { anbieter: 'gemini', id: 'gemini-4-argon', name: 'Gemini 4 Argon', hinweis: 'Googles Spitzenmodell (ca. 2 Cent)' },
    { anbieter: 'gemini', id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', hinweis: 'am billigsten (ca. 0,4 Cent)' },
];
export const STANDARD_MODELL = 'claude-sonnet-5-5';
export const ANBIETER = { claude: 'Claude', gemini: 'Google Gemini' };

const VERLAUF_RUNDEN = 3; // so viele frühere Fragen/Antworten gehen als Zusammenhang mit

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const OHNE_FALLBACK = new Set(['claude-haiku-5-5']); // Haiku 5.5 hat keine serverseitige Ausweichlösung

/**
 * Liest Vorrangregeln aus dem Kopf der Unterlagen, z. B.
 * "Reihenfolge der Verbindlichkeit bei Widersprüchen: …". Leer, wenn keine vorhanden.
 */
export function findeHausregeln(markdown) {
    return markdown.split('\n', 60)
        .filter((z) => /verbindlich|vorrang|widerspr/i.test(z))
        .map((z) => z.replace(/^[>\s*-]+/, '').replace(/\*\*/g, '').trim())
        .filter(Boolean)
        .join('\n');
}

export function baueSystemPrompt(hausregeln = '') {
    return [
        'Du bist ein Fachassistent für Kfz-Sachverständige in Österreich. Du beantwortest Fragen ausschließlich auf Grundlage der nummerierten Auszüge aus den internen Unterlagen, die mit jeder Frage mitgeschickt werden.',
        '',
        'So antwortest du:',
        '- Auf Deutsch (österreichische Fachbegriffe), knapp und praxistauglich: zuerst die direkte Antwort, dann die wichtigen Details, Werte und Ausnahmen.',
        '- Belege jede Aussage mit der Nummer des Auszugs in eckigen Klammern, z. B. [2] oder [1, 4]. Erfinde keine Nummern.',
        '- Zahlen, Beträge, Stunden und Fristen übernimmst du exakt aus den Auszügen. Gibt es mehrere Stände (z. B. ältere und neuere Tabellen), nenne beide und welcher aktueller ist.',
        '- Steht die Antwort nicht in den Auszügen, sag klar: „Dazu habe ich in den Unterlagen nichts gefunden.“ Rate nicht und ergänze kein Allgemeinwissen als Vorgabe.',
        '- Widersprechen sich Auszüge, weise darauf hin und nenne, welche Quelle Vorrang hat.',
        '- Wird ein Text für Kunden oder Geschädigte erbeten (z. B. für eine E-Mail), formuliere ihn höflich, sachlich und ohne interne Abkürzungen; die Quellen-Nummern gehören dann nicht in den Kundentext, sondern darunter.',
        '- Verwende Markdown sparsam (Fettdruck, kurze Listen, Tabellen nur bei Wertevergleichen).',
        hausregeln ? `\nVorrangregeln aus den Unterlagen:\n${hausregeln}` : '',
    ].join('\n').trim();
}

/** Baut die Nutzernachricht mit den Auszügen. `treffer` stammt aus suche(). */
export function baueFrage(frage, treffer) {
    const auszuege = treffer.map(({ abschnitt }, i) =>
        `<auszug nr="${i + 1}" quelle="${abschnitt.pfad.join(' › ').replace(/"/g, "'")}">\n${abschnitt.text}\n</auszug>`).join('\n\n');
    return `<auszuege>\n${auszuege}\n</auszuege>\n\nFrage: ${frage}`;
}

/**
 * Nachrichten für die KI: die letzten Gesprächsrunden (ohne alte Auszüge und Quellen-Nummern)
 * und zuletzt die aktuelle Frage mit ihren Auszügen.
 * @param {{frage:string, antwort:string}[]} verlauf
 */
export function baueNachrichten(verlauf, frage, treffer) {
    const frueher = verlauf.slice(-VERLAUF_RUNDEN).flatMap((r) => [
        { role: 'user', content: r.frage },
        { role: 'assistant', content: r.antwort.replace(/\s*\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\]/g, '') },
    ]);
    return [...frueher, { role: 'user', content: baueFrage(frage, treffer) }];
}

/** Kurze Nachfragen ("und bei Hybrid?") werden zusammen mit der vorigen Frage gesucht. */
export function suchtextFuer(frage, verlauf) {
    const woerter = frage.trim().split(/\s+/).length;
    return verlauf.length && woerter <= 8 ? `${verlauf.at(-1).frage} ${frage}` : frage;
}

export class KiFehler extends Error {}

function fehlerText(status, details) {
    if (status === 401) return 'Der API-Key wird nicht akzeptiert. Bitte in den Einstellungen prüfen.';
    if (status === 403) return 'Der API-Key hat keine Berechtigung für dieses Modell.';
    if (status === 429) return 'Zu viele Anfragen oder Guthaben aufgebraucht. Bitte kurz warten bzw. das Guthaben prüfen.';
    if (status === 529 || status === 503) return 'Der KI-Dienst ist gerade überlastet. Bitte gleich nochmal versuchen.';
    return `Fehler vom KI-Dienst (${status}): ${details || 'unbekannt'}`;
}

// Liest einen Server-Sent-Events-Strom und ruft für jedes Ereignis `beiEreignis(daten)` auf.
async function leseEreignisse(antwort, beiEreignis) {
    const leser = antwort.body.getReader();
    const dekoder = new TextDecoder();
    let puffer = '';
    for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        // Google trennt Ereignisse mit \r\n\r\n, Anthropic mit \n\n; ein \r am Ende wartet auf sein \n
        puffer = (puffer + dekoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        let grenze;
        while ((grenze = puffer.indexOf('\n\n')) >= 0) {
            const block = puffer.slice(0, grenze);
            puffer = puffer.slice(grenze + 2);
            const daten = block.split('\n').filter((z) => z.startsWith('data:')).map((z) => z.slice(5).trim()).join('');
            if (daten) beiEreignis(JSON.parse(daten));
        }
    }
}

/**
 * Stellt die Frage an Claude und streamt die Antwort.
 * @param {{key:string, modell:string, system:string, nachrichten:object[], beiText:(t:string)=>void, signal?:AbortSignal}} p
 * @returns {Promise<{stopGrund:string, modell:string}>}
 */
export async function frageClaude({ key, modell, system, nachrichten, beiText, signal }) {
    const mitFallback = !OHNE_FALLBACK.has(modell);
    const kopf = {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (mitFallback) kopf['anthropic-beta'] = FALLBACK_BETA;

    const koerper = {
        model: modell,
        max_tokens: 16000,
        stream: true,
        system,
        output_config: { effort: 'low' }, // schnelle Antworten; Nachschlagefragen brauchen kein langes Nachdenken
        messages: nachrichten,
    };
    if (mitFallback) koerper.fallbacks = 'default';

    let antwort;
    try {
        antwort = await fetch(CLAUDE_URL, { method: 'POST', headers: kopf, body: JSON.stringify(koerper), signal });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new KiFehler('Keine Verbindung zum KI-Dienst. Bist du online?');
    }
    if (!antwort.ok) {
        let details = '';
        try { details = (await antwort.json()).error?.message || ''; } catch { /* Antwort ohne JSON */ }
        throw new KiFehler(fehlerText(antwort.status, details));
    }

    let stopGrund = '';
    let genutztesModell = modell;
    await leseEreignisse(antwort, (e) => {
        if (e.type === 'message_start') genutztesModell = e.message?.model || modell;
        else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') beiText(e.delta.text);
        else if (e.type === 'message_delta' && e.delta?.stop_reason) stopGrund = e.delta.stop_reason;
        else if (e.type === 'error') throw new KiFehler(fehlerText(e.error?.type === 'overloaded_error' ? 529 : 500, e.error?.message));
    });
    if (stopGrund === 'refusal') throw new KiFehler('Die KI hat diese Anfrage abgelehnt. Bitte anders formulieren.');
    return { stopGrund, modell: genutztesModell };
}

// ---------------------------------------------------------------------------
// Google Gemini (gleicher Aufruf wie in der SV-Toolbox, zusätzlich gestreamt)
// ---------------------------------------------------------------------------

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function geminiFehlerText(status, details) {
    if (/api key|api_key/i.test(details) || status === 401) return 'Der Google-API-Key wird nicht akzeptiert. Bitte in den Einstellungen prüfen.';
    if (status === 403) return 'Der Google-API-Key hat keine Berechtigung für dieses Modell.';
    if (status === 404) return 'Dieses Gemini-Modell ist für deinen Key nicht verfügbar. Bitte ein anderes wählen.';
    return fehlerText(status, details);
}

async function geminiAnfrage({ key, modell, koerper, signal }) {
    try {
        return await fetch(`${GEMINI_URL}/${encodeURIComponent(modell)}:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(koerper),
            signal,
        });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new KiFehler('Keine Verbindung zum KI-Dienst. Bist du online?');
    }
}

/** Stellt die Frage an Gemini und streamt die Antwort. Parameter wie frageClaude. */
export async function frageGemini({ key, modell, system, nachrichten, beiText, signal }) {
    const koerper = {
        systemInstruction: { parts: [{ text: system }] },
        contents: nachrichten.map((n) => ({ role: n.role === 'assistant' ? 'model' : 'user', parts: [{ text: n.content }] })),
        generationConfig: { maxOutputTokens: 16000, thinkingConfig: { thinkingLevel: 'low' } },
    };
    let antwort = await geminiAnfrage({ key, modell, koerper, signal });
    if (antwort.status === 400) {
        // Lehnt Google die Denkstufe ab, ohne sie wiederholen (Standardeinstellung des Modells)
        const details = await antwort.clone().json().then((j) => j.error?.message || '').catch(() => '');
        if (/thinking/i.test(details)) {
            delete koerper.generationConfig.thinkingConfig;
            antwort = await geminiAnfrage({ key, modell, koerper, signal });
        }
    }
    if (!antwort.ok) {
        let details = '';
        try { details = (await antwort.json()).error?.message || ''; } catch { /* Antwort ohne JSON */ }
        throw new KiFehler(geminiFehlerText(antwort.status, details));
    }

    let stopGrund = '';
    await leseEreignisse(antwort, (e) => {
        if (e.error) throw new KiFehler(geminiFehlerText(e.error.code || 500, e.error.message));
        const kandidat = e.candidates?.[0];
        for (const teil of kandidat?.content?.parts || []) {
            if (teil.text && !teil.thought) beiText(teil.text);
        }
        if (kandidat?.finishReason) stopGrund = kandidat.finishReason;
    });
    if (/SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(stopGrund)) throw new KiFehler('Die KI hat diese Anfrage abgelehnt. Bitte anders formulieren.');
    return { stopGrund: stopGrund === 'MAX_TOKENS' ? 'max_tokens' : stopGrund.toLowerCase(), modell };
}

/** Wählt den Anbieter passend zum Modell. */
export function frageKi(parameter) {
    const anbieter = MODELLE.find((m) => m.id === parameter.modell)?.anbieter || 'claude';
    return anbieter === 'gemini' ? frageGemini(parameter) : frageClaude(parameter);
}
