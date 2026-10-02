/* Flipdown Timer Plus Card
 * Eigene Karte, inspiriert von pmongloid/flipdown-timer-card (MIT).
 * Vanilla Web Component, kein Build nötig. Visueller Editor via ha-form.
 * Lovelace-Ressource: /local/flipdown-timer-plus-card.js (Typ: JavaScript-Modul)
 */

const CARD_VERSION = "1.0.0";
const FLIP_MS = 500;

const I18N = {
  de: {
    button: { start: "Start", stop: "Stopp", cancel: "Abbrechen", resume: "Weiter", reset: "Zurücksetzen" },
    header: { hours: "Std", minutes: "Min", seconds: "Sek" },
  },
  en: {
    button: { start: "Start", stop: "Stop", cancel: "Cancel", resume: "Resume", reset: "Reset" },
    header: { hours: "Hours", minutes: "Minutes", seconds: "Seconds" },
  },
};

const DEFAULTS = {
  theme: "hass",
  show_title: false,
  show_header: false,
  show_hour: "false",
  styles: {
    space: "20px",
    rotor: { width: "50px", height: "80px", fontsize: "4rem", radius: "4px", background: "", color: "" },
    button: { width: "", height: "20px", fontsize: "1em", location: "right" },
  },
};

// Farben analog zum Original: oben/unten leicht unterschiedlich
const THEMES = {
  hass: { top: "var(--primary-color)", bot: "var(--primary-color)", ft: "var(--text-primary-color, #fff)", fb: "var(--text-primary-color, #fff)", line: "var(--dark-primary-color)", btn: "var(--dark-primary-color)", btnfg: "var(--text-primary-color, #fff)", dot: "var(--primary-color)", head: "var(--primary-color)" },
  dark: { top: "#151515", bot: "#202020", ft: "#ffffff", fb: "#efefef", line: "#151515", btn: "#202020", btnfg: "#ffffff", dot: "#151515", head: "var(--secondary-text-color)" },
  light: { top: "#dddddd", bot: "#eeeeee", ft: "#222222", fb: "#333333", line: "#222222", btn: "#dddddd", btnfg: "#222222", dot: "#eeeeee", head: "var(--secondary-text-color)" },
};

const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

function parseDuration(str) {
  if (typeof str === "number") return str;
  if (!str || typeof str !== "string") return 0;
  const p = str.split(":").map((x) => parseFloat(x) || 0);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] || 0;
}

function merge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = merge(base?.[k] || {}, v);
    else if (v !== undefined && v !== "" && v !== null) out[k] = v;
  }
  return out;
}

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const c = clean(v);
      if (Object.keys(c).length) out[k] = c;
    } else if (v !== "" && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/* ---------------------------------------------------------------- Karte */

class FlipdownTimerPlusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._rotors = {};
    this._sig = "";
  }

  static getConfigElement() {
    return document.createElement("flipdown-timer-plus-card-editor");
  }

  static getStubConfig(hass) {
    const timer = Object.keys(hass?.states || {}).find((e) => e.startsWith("timer."));
    return { entity: timer || "timer.example" };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("entity fehlt / entity is required");
    const cfg = { ...config };
    if (typeof cfg.show_hour === "boolean") cfg.show_hour = String(cfg.show_hour);
    this._config = merge(DEFAULTS, cfg);
    this._sig = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._tick();
  }

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 250);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  getCardSize() {
    return 3;
  }

  // Sections-View
  getGridOptions() {
    return { columns: 12, rows: 3, min_columns: 4, min_rows: 2 };
  }

  _texts() {
    const lang = (this._hass?.language || "en").slice(0, 2);
    const base = I18N[lang] || I18N.en;
    const loc = this._config.localize || {};
    // Altes Format (kommagetrennte Strings) wird weiterhin unterstützt
    const toObj = (val, keys) => {
      if (typeof val === "string") {
        const parts = val.split(",").map((s) => s.trim());
        return Object.fromEntries(keys.map((k, i) => [k, parts[i]]).filter(([, v]) => v));
      }
      return val || {};
    };
    return {
      button: { ...base.button, ...toObj(loc.button, ["start", "stop", "cancel", "resume", "reset"]) },
      header: { ...base.header, ...toObj(loc.header, ["hours", "minutes", "seconds"]) },
    };
  }

  _isTimer() {
    return this._config.entity.startsWith("timer.");
  }

  // Ergebnis: { state: idle|active|paused, remaining: Sekunden }
  _status() {
    const st = this._hass?.states?.[this._config.entity];
    if (!st) return { state: "idle", remaining: 0, missing: true };
    const override = parseDuration(this._config.duration);
    if (this._isTimer()) {
      const a = st.attributes || {};
      if (st.state === "active") {
        const end = a.finishes_at ? Date.parse(a.finishes_at) : NaN;
        const rem = isNaN(end) ? parseDuration(a.remaining) : (end - Date.now()) / 1000;
        return { state: "active", remaining: Math.max(0, rem) };
      }
      if (st.state === "paused") return { state: "paused", remaining: parseDuration(a.remaining) };
      return { state: "idle", remaining: this._edit ?? (override || parseDuration(a.duration)) };
    }
    // input_datetime (Datum+Zeit) oder Timestamp-Sensor (z. B. Alexa-Wecker)
    const raw = st.state;
    const t = Date.parse(/^\d{4}-\d{2}-\d{2} /.test(raw) ? raw.replace(" ", "T") : raw);
    if (isNaN(t)) return { state: "idle", remaining: 0 };
    const rem = (t - Date.now()) / 1000;
    return rem > 0 ? { state: "active", remaining: rem, passive: true } : { state: "idle", remaining: 0, passive: true };
  }

  _groups(status) {
    const mode = this._config.show_hour;
    if (mode === "true") return ["h", "m", "s"];
    if (mode === "auto") return status.state === "idle" || status.remaining >= 3600 ? ["h", "m"] : ["m", "s"];
    return ["m", "s"];
  }

  _render() {
    if (!this._config) return;
    const c = this._config;
    const th = THEMES[c.theme] || THEMES.hass;
    const r = c.styles.rotor;
    const b = c.styles.button;
    const status = this._status();
    const groups = this._groups(status);
    const tx = this._texts();
    const hdr = { h: tx.header.hours, m: tx.header.minutes, s: tx.header.seconds };
    const st = this._hass?.states?.[c.entity];
    const title = c.name || st?.attributes?.friendly_name || c.entity;
    const showButtons = this._isTimer() && b.location !== "hide";
    const vertical = b.location === "bottom";

    const sig = JSON.stringify([c, groups.join(), showButtons, status.state, tx]);
    if (sig === this._sig) return;
    this._sig = sig;
    this._rotors = {};

    const blink = c.show_hour === "auto" && groups.join() === "h,m" && status.state === "active";
    const groupHtml = groups
      .map(
        (g, i) => `<div class="group">
          <div class="col">
            ${c.show_header ? `<div class="head">${hdr[g]}</div>` : ""}
            <div class="pair">${[0, 1].map((n) => this._rotorHtml(g + n)).join("")}</div>
          </div>
          ${i < groups.length - 1 ? `<div class="delim ${blink && i === 0 ? "blink" : ""}"><span class="dt"></span><span class="db"></span></div>` : ""}
        </div>`
      )
      .join("");
    const editable = this._isTimer() && status.state === "idle";
    const btnW = vertical ? b.width || "calc(var(--fd-rw) * 2 + 5px)" : b.width || "50px";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { height:100%; box-sizing:border-box; }
        .wrap {
          --fd-top:${r.background || th.top}; --fd-bot:${r.background || th.bot};
          --fd-ft:${r.color || th.ft}; --fd-fb:${r.color || th.fb};
          --fd-line:${th.line}; --fd-dot:${th.dot}; --fd-head:${th.head};
          --fd-btn:${th.btn}; --fd-btnfg:${th.btnfg};
          --fd-rw:${r.width}; --fd-rh:${r.height}; --fd-rf:${r.fontsize}; --fd-rr:${r.radius};
          --fd-space:${c.styles.space};
          display:flex; flex-direction:${vertical ? "column" : "row"}; align-items:center; justify-content:center;
          gap:${vertical ? "5px" : "0"}; padding:16px; height:100%; box-sizing:border-box;
        }
        .title { padding:12px 16px 0; font-size:1.2em; font-weight:500; color:var(--primary-text-color); }
        .clock { display:flex; align-items:flex-start; }
        .group { display:flex; align-items:flex-start; }
        .col { display:flex; flex-direction:column; align-items:center; }
        .head { height:30px; line-height:30px; font-size:.8em; color:var(--fd-head); text-align:center; }
        .pair { display:flex; gap:5px; }
        .delim { position:relative; width:var(--fd-space); height:var(--fd-rh); margin-top:${c.show_header ? "30px" : "0"}; }
        .delim span { position:absolute; left:calc(50% - 5px); width:10px; height:10px; border-radius:50%; background:var(--fd-dot); }
        .delim .dt { top:calc(var(--fd-rh) / 2 - 20px); } .delim .db { bottom:calc(var(--fd-rh) / 2 - 20px); }
        .delim.blink { animation:fd-blink 1s linear infinite; }
        @keyframes fd-blink { 50% { opacity:0; } }
        .rotor { position:relative; width:var(--fd-rw); height:var(--fd-rh); perspective:200px;
                 font-size:var(--fd-rf); font-weight:bold; font-family:sans-serif; }
        .half, .lh { position:absolute; left:0; width:100%; overflow:hidden; }
        .half { height:50%; }
        .half.t, .lh.f { top:0; border-radius:var(--fd-rr) var(--fd-rr) 0 0; background:var(--fd-top); color:var(--fd-ft); }
        .half.b, .lh.k { bottom:0; border-radius:0 0 var(--fd-rr) var(--fd-rr); background:var(--fd-bot); color:var(--fd-fb); }
        .half span, .lh span { position:absolute; left:0; width:100%; height:var(--fd-rh); line-height:var(--fd-rh); text-align:center; }
        .t span, .f span { top:0; } .b span, .k span { bottom:0; }
        .leaf { position:absolute; top:0; left:0; width:100%; height:50%; transform-origin:50% 100%;
                transform-style:preserve-3d; z-index:2; }
        .leaf .lh { height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
        .leaf .k { transform:rotateX(180deg); }
        .leaf.flip { animation:fd-flip ${FLIP_MS}ms ease-in forwards; }
        @keyframes fd-flip { to { transform:rotateX(-180deg); } }
        .rotor::after { content:""; position:absolute; left:0; right:0; top:calc(50% - 1px); height:2px;
                        background:var(--fd-line); z-index:3; pointer-events:none; }
        .tt, .tb { position:absolute; left:0; width:100%; height:50%; z-index:5; ${editable ? "cursor:pointer;" : "pointer-events:none;"} }
        .tt { top:0; } .tb { bottom:0; }
        .btns { display:flex; flex-direction:${vertical ? "row" : "column"}; justify-content:space-between;
                gap:${vertical ? c.styles.space : "4px"}; ${vertical ? "" : `height:var(--fd-rh); margin-left:${c.styles.space}; ${c.show_header ? "margin-top:30px;" : ""}`} }
        button { width:${btnW}; height:${vertical ? b.height : "calc(var(--fd-rh) / 2 - 2px)"}; font-size:${b.fontsize};
                 padding:0; border:0; border-radius:4px; cursor:pointer; overflow:hidden;
                 background:var(--fd-btn); color:var(--fd-btnfg); font-family:sans-serif; }
        .missing { padding:16px; color:var(--error-color); }
      </style>
      <ha-card>
        ${c.show_title ? `<div class="title">${title}</div>` : ""}
        ${
          status.missing
            ? `<div class="missing">Entität nicht gefunden: ${c.entity}</div>`
            : `<div class="wrap"><div class="clock">${groupHtml}</div>
               ${showButtons ? `<div class="btns">${this._buttons(status.state, tx.button)}</div>` : ""}</div>`
        }
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".rotor").forEach((el) => {
      this._rotors[el.dataset.id] = { el, cur: null, timeout: null };
    });
    this.shadowRoot.querySelectorAll(".tt, .tb").forEach((el) =>
      el.addEventListener("click", () => this._rotorClick(el.parentElement.dataset.id, el.dataset.inc === "1"))
    );
    this.shadowRoot.querySelectorAll("button[data-a]").forEach((btn) =>
      btn.addEventListener("click", () => this._action(btn.dataset.a))
    );
    this._applyValues(status, true);
  }

  _rotorHtml(id) {
    return `<div class="rotor" data-id="${id}">
      <div class="half t"><span></span></div><div class="half b"><span></span></div>
      <div class="tt" data-inc="1"></div><div class="tb" data-inc="0"></div>
      <div class="leaf"><div class="lh f"><span></span></div><div class="lh k"><span></span></div></div>
    </div>`;
  }

  _buttons(state, t) {
    const btn = (a, label, sec) => `<button data-a="${a}" class="${sec ? "sec" : ""}">${label}</button>`;
    if (state === "active") return btn("pause", t.stop) + btn("cancel", t.cancel, true);
    if (state === "paused") return btn("start", t.resume) + btn("cancel", t.cancel, true);
    return btn("start", t.start) + btn("reset", t.reset, true);
  }

  _action(a) {
    if (!this._hass || !this._isTimer()) return;
    const id = this._config.entity;
    const status = this._status();
    if (a === "reset") {
      this._edit = null;
      this._applyValues(this._status(), false);
      return;
    }
    if (a === "pause" || a === "cancel") {
      this._hass.callService("timer", a, { entity_id: id });
      return;
    }
    // start / resume
    const data = { entity_id: id };
    if (status.state === "idle") {
      const mode = this._groups(status);
      const secs = this._secs(this._vals(status.remaining, mode));
      if (secs <= 0) return;
      data.duration = `${pad(secs / 3600)}:${pad((secs % 3600) / 60)}:${pad(secs % 60)}`;
    }
    this._hass.callService("timer", "start", data);
  }

  // Klick auf obere/untere Rotorhälfte im Ruhezustand: Ziffer +1 / -1
  _rotorClick(id, inc) {
    const status = this._status();
    if (!this._isTimer() || status.state !== "idle") return;
    const mode = this._groups(status);
    const vals = this._vals(status.remaining, mode);
    const g = id[0];
    const unit = Number(id[1]);
    const tensMax = g === "h" ? 9 : 5;
    const max = unit === 0 ? tensMax : 9;
    const digits = pad(vals[g]).split("").map(Number);
    digits[unit] = inc ? (digits[unit] < max ? digits[unit] + 1 : 0) : digits[unit] > 0 ? digits[unit] - 1 : max;
    vals[g] = digits[0] * 10 + digits[1];
    this._edit = this._secs(vals);
    this._applyValues(this._status(), false);
  }

  _tick() {
    if (!this._config || !this._hass) return;
    const status = this._status();
    const groups = this._groups(status).join();
    const needRebuild = groups !== Object.keys(this._rotors).map((k) => k[0]).filter((v, i, a) => a.indexOf(v) === i).join() || !this._lastState || this._lastState !== status.state;
    if (status.state !== "idle") this._edit = null;
    this._lastState = status.state;
    if (needRebuild) this._render();
    this._applyValues(status, false);
  }

  _vals(remaining, mode) {
    const total = Math.ceil(remaining - 0.001);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (mode.join() === "h,m,s") return { h: Math.min(99, h), m, s };
    if (mode.join() === "h,m") return { h: Math.min(99, h), m };
    return { m: Math.min(99, Math.floor(total / 60)), s: total >= 6000 ? 59 : s };
  }

  _secs(v) {
    return (v.h || 0) * 3600 + (v.m || 0) * 60 + (v.s || 0);
  }

  _applyValues(status, instant) {
    const mode = this._groups(status);
    const vals = this._vals(status.remaining, mode);
    for (const g of mode) {
      const txt = pad(Math.min(99, vals[g]));
      this._setRotor(g + "0", txt[0], instant);
      this._setRotor(g + "1", txt[1], instant);
    }
  }

  _setRotor(id, val, instant) {
    const r = this._rotors[id];
    if (!r || r.cur === val) return;
    const q = (sel) => r.el.querySelector(sel);
    const set = (sel, v) => (q(sel + " span").textContent = v);
    const finish = () => {
      clearTimeout(r.timeout);
      r.timeout = null;
      q(".leaf").classList.remove("flip");
      set(".half.t", r.cur);
      set(".half.b", r.cur);
      set(".lh.f", r.cur);
      set(".lh.k", r.cur);
    };
    if (r.timeout) {
      const pending = r.cur;
      finish();
      r.cur = pending;
    }
    if (instant || r.cur === null) {
      r.cur = val;
      finish();
      return;
    }
    const old = r.cur;
    r.cur = val;
    set(".half.t", val);
    set(".half.b", old);
    set(".lh.f", old);
    set(".lh.k", val);
    const leaf = q(".leaf");
    leaf.classList.remove("flip");
    void leaf.offsetWidth; // Animation neu starten
    leaf.classList.add("flip");
    r.timeout = setTimeout(finish, FLIP_MS);
  }
}

/* --------------------------------------------------------------- Editor */

const LABELS = {
  de: {
    entity: "Entität (timer, input_datetime, sensor)", name: "Titel (optional)", duration: "Dauer im Ruhezustand (hh:mm:ss)",
    theme: "Farbschema", show_title: "Titel anzeigen", show_header: "Überschriften der Rotoren anzeigen",
    show_hour: "Stunden-Rotoren", styles: "Darstellung", space: "Abstand / Doppelpunkt-Breite", rotor: "Rotoren",
    button: "Schaltflächen", width: "Breite", height: "Höhe", fontsize: "Schriftgröße", radius: "Eckenradius",
    background: "Hintergrundfarbe (leer = Theme)", color: "Schriftfarbe (leer = Theme)", location: "Position",
    localize: "Beschriftungen", header: "Überschriften", start: "Start", stop: "Stopp", cancel: "Abbrechen",
    resume: "Weiter", reset: "Zurücksetzen", hours: "Stunden", minutes: "Minuten", seconds: "Sekunden",
    o_hass: "Home Assistant Theme", o_dark: "Dunkel", o_light: "Hell",
    o_false: "Aus (MM:SS)", o_true: "An (HH:MM:SS)", o_auto: "Automatisch",
    o_right: "Rechts", o_bottom: "Unten", o_hide: "Ausblenden",
  },
  en: {
    entity: "Entity (timer, input_datetime, sensor)", name: "Title (optional)", duration: "Idle duration (hh:mm:ss)",
    theme: "Color scheme", show_title: "Show title", show_header: "Show rotor headings",
    show_hour: "Hour rotors", styles: "Appearance", space: "Spacing / colon width", rotor: "Rotors",
    button: "Buttons", width: "Width", height: "Height", fontsize: "Font size", radius: "Corner radius",
    background: "Background color (empty = theme)", color: "Text color (empty = theme)", location: "Position",
    localize: "Labels", header: "Headings", start: "Start", stop: "Stop", cancel: "Cancel",
    resume: "Resume", reset: "Reset", hours: "Hours", minutes: "Minutes", seconds: "Seconds",
    o_hass: "Home Assistant theme", o_dark: "Dark", o_light: "Light",
    o_false: "Off (MM:SS)", o_true: "On (HH:MM:SS)", o_auto: "Automatic",
    o_right: "Right", o_bottom: "Bottom", o_hide: "Hide",
  },
};

class FlipdownTimerPlusCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config, show_hour: typeof config.show_hour === "boolean" ? String(config.show_hour) : config.show_hour };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
      this._form.schema = this._schema();
    }
  }

  _t(key) {
    const lang = (this._hass?.language || "en").slice(0, 2);
    return (LABELS[lang] || LABELS.en)[key] || key;
  }

  _opts(name, values) {
    return values.map((v) => ({ value: v, label: this._t(`o_${v}`) }));
  }

  _schema() {
    const txt = (name) => ({ name, selector: { text: {} } });
    return [
      { name: "entity", required: true, selector: { entity: { filter: [{ domain: ["timer", "input_datetime", "sensor"] }] } } },
      txt("name"),
      txt("duration"),
      { name: "theme", selector: { select: { mode: "dropdown", options: this._opts("theme", ["hass", "dark", "light"]) } } },
      { name: "show_hour", selector: { select: { mode: "dropdown", options: this._opts("show_hour", ["false", "true", "auto"]) } } },
      {
        type: "grid", name: "", schema: [
          { name: "show_title", selector: { boolean: {} } },
          { name: "show_header", selector: { boolean: {} } },
        ],
      },
      {
        type: "expandable", name: "styles", title: this._t("styles"), schema: [
          txt("space"),
          {
            type: "expandable", name: "rotor", title: this._t("rotor"), schema: [
              { type: "grid", name: "", schema: [txt("width"), txt("height"), txt("fontsize"), txt("radius")] },
              txt("background"),
              txt("color"),
            ],
          },
          {
            type: "expandable", name: "button", title: this._t("button"), schema: [
              { name: "location", selector: { select: { mode: "dropdown", options: this._opts("location", ["right", "bottom", "hide"]) } } },
              { type: "grid", name: "", schema: [txt("width"), txt("height"), txt("fontsize")] },
            ],
          },
        ],
      },
      {
        type: "expandable", name: "localize", title: this._t("localize"), schema: [
          {
            type: "expandable", name: "button", title: this._t("button"), schema: [
              { type: "grid", name: "", schema: ["start", "stop", "cancel", "resume", "reset"].map(txt) },
            ],
          },
          {
            type: "expandable", name: "header", title: this._t("header"), schema: [
              { type: "grid", name: "", schema: ["hours", "minutes", "seconds"].map(txt) },
            ],
          },
        ],
      },
    ];
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => this._t(s.name);
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = clean({ ...ev.detail.value, type: this._config.type || "custom:flipdown-timer-plus-card" });
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this._schema();
    this._form.data = this._config;
  }
}

customElements.define("flipdown-timer-plus-card", FlipdownTimerPlusCard);
customElements.define("flipdown-timer-plus-card-editor", FlipdownTimerPlusCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "flipdown-timer-plus-card",
  name: "Flipdown Timer Plus",
  description: "Flip-Uhr für timer, input_datetime und Timestamp-Sensoren mit visuellem Editor",
  preview: true,
});

console.info(`%c FLIPDOWN-TIMER-PLUS-CARD %c v${CARD_VERSION} `, "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4");
