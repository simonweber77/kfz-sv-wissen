// KFZ-SV Wissen – Spracheingabe, die über Denkpausen hinweg zuhört.
// iOS beendet die Erkennung oft schon nach einer kurzen Pause; dann wird sie sofort neu gestartet,
// bis der Nutzer tippt oder eine längere Sprechpause erreicht ist.

const MELDUNGEN = {
    'not-allowed': 'Mikrofon nicht erlaubt (Einstellungen › Apps › Safari › Mikrofon).',
    'service-not-allowed': 'Spracherkennung gesperrt (Einstellungen › Allgemein › Tastatur › Diktierfunktion).',
    'network': 'Kein Netz für die Spracherkennung.',
    'audio-capture': 'Kein Mikrofon verfügbar.',
};
const HARMLOS = new Set(['no-speech', 'aborted']); // kommen bei Pausen vor, Erkennung läuft danach weiter

export class Spracheingabe {
    /**
     * @param {object} o
     * @param {Function} o.Erkennung        SpeechRecognition-Klasse
     * @param {number} [o.pauseMs]          Sprechpause, nach der abgeschickt wird (0 = nur per Tippen)
     * @param {number} [o.startStilleMs]    Stille zu Beginn, nach der ohne Senden beendet wird
     * @param {(text:string)=>void} o.beiText
     * @param {(zustand:'hoert'|'aus'|'fehler', meldung?:string)=>void} o.beiStatus
     * @param {(text:string)=>void} o.beiFertig  wird mit dem gesprochenen Text aufgerufen, wenn abgeschickt werden soll
     */
    constructor({ Erkennung, pauseMs = 3000, startStilleMs = 10000, beiText, beiStatus, beiFertig, zeitgeber = globalThis }) {
        Object.assign(this, { Erkennung, pauseMs, startStilleMs, beiText, beiStatus, beiFertig, zeitgeber });
        this.aktiv = false;
        this.erkennung = null;
        this.timer = null;
    }

    start(vortext = '') {
        if (this.aktiv) return;
        this.aktiv = true;
        this.absenden = false;
        this.gesprochen = false;
        this.basis = vortext.trim();
        this.sitzungText = '';
        this.beiStatus('hoert');
        this._neueSitzung();
        this._stille(this.startStilleMs);
    }

    /** Beendet die Aufnahme; `absenden` = gesprochenen Text abschicken. */
    stopp(absenden = true) {
        if (!this.aktiv) return;
        this.aktiv = false;
        this.absenden = absenden;
        this._stille(0);
        if (this.erkennung) this.erkennung.stop(); // onend schließt ab
        else this._abschliessen();
    }

    get text() {
        return [this.basis, this.sitzungText.trim()].filter(Boolean).join(' ');
    }

    _neueSitzung() {
        const e = new this.Erkennung();
        e.lang = 'de-AT';
        e.continuous = true;
        e.interimResults = true;
        e.onresult = (ev) => {
            if (e !== this.erkennung) return;
            this.sitzungText = Array.from(ev.results, (r) => r[0].transcript).join('');
            if (this.sitzungText.trim()) this.gesprochen = true;
            this.beiText(this.text);
            this._stille(this.gesprochen ? this.pauseMs : this.startStilleMs);
        };
        e.onerror = (ev) => {
            if (HARMLOS.has(ev.error)) return;
            this.aktiv = false;
            this.absenden = false;
            this._stille(0);
            this.beiStatus('fehler', MELDUNGEN[ev.error] || `Spracheingabe-Fehler: ${ev.error}`);
        };
        e.onend = () => {
            if (e !== this.erkennung) return;
            this.basis = this.text; // Gesprochenes dieser Sitzung festhalten
            this.sitzungText = '';
            this.erkennung = null;
            if (this.aktiv) {
                // iOS hat von sich aus beendet → sofort weiter zuhören
                this.zeitgeber.setTimeout(() => { if (this.aktiv && !this.erkennung) this._neueSitzung(); }, 60);
            } else {
                this._abschliessen();
            }
        };
        this.erkennung = e;
        try {
            e.start();
        } catch {
            this.erkennung = null;
            this.stopp(this.gesprochen);
        }
    }

    _stille(ms) {
        if (this.timer) this.zeitgeber.clearTimeout(this.timer);
        this.timer = null;
        if (ms > 0 && this.aktiv) this.timer = this.zeitgeber.setTimeout(() => this.stopp(this.gesprochen), ms);
    }

    _abschliessen() {
        this.beiStatus('aus');
        const text = this.text;
        if (this.absenden && text) this.beiFertig(text);
    }
}
