import { $, logs, state, store } from "./state.js";
import { jump, jumpToError, refilter, relayout, rerenderAll, resetBuffer, saveAnchor, schedulePaint, setLevel, showSeq } from "./list.js";
import { clearErrors, renderList } from "./containers.js";
import { connect, leaveSearch, searchHistory } from "./stream.js";
import { valueText } from "./render.js";

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

const REGEX = /^\/(.+)\/([a-z]*)$/;

// Text or /regex/flags; null when empty or invalid.
function parsePattern(v) {
  if (!v) return null;
  const m = v.match(REGEX);
  try { return m ? new RegExp(m[1], m[2].replace(/[gy]/g, "")) : new RegExp(RegExp.escape(v), "i"); }
  catch { return null; }
}

function setFilter(v) {
  state.filter = parsePattern(v.trim());
  state.hit = null;
  rerenderAll();
  refilter();
  if (!state.filterMode) jump(0);
}

function toggle(btnSel, key, def, onChange) {
  const btn = $(btnSel);
  const apply = (on) => {
    btn.classList.toggle("on", on);
    store.set(key, on ? "1" : "0");
    onChange(on);
  };
  apply(store.get(key, def) === "1");
  btn.onclick = () => apply(!btn.classList.contains("on"));
}

// key=value hides JSON lines whose key has exactly this value, or matches key=/regex/;
// other lines are matched as text. Anything else is a text or /regex/ pattern.
function excludeRule(src) {
  const text = parsePattern(src);
  const m = src.match(/^([\w.@-]+)=(.*)$/);
  if (!m || !text) return text && ((l) => text.test(l.plain));
  const [, key, value] = m;
  const re = REGEX.test(value) ? parsePattern(value) : null;
  if (REGEX.test(value) && !re) return null;
  return (l) => {
    if (!l.json) return text.test(l.plain);
    l.obj ??= JSON.parse(l.plain);
    if (!(key in l.obj)) return false;
    const v = valueText(l.obj[key]);
    return re ? re.test(v) : v === value;
  };
}

// Values entered one at a time and shown as removable chips, kept in the store under key.
// wrap turns the typed text into the stored value, label renders a stored value on its chip.
function chipInput(inputSel, chipsSel, key, onChange, { valid = () => true, wrap = (v) => v, label = (b, v) => { b.textContent = v; } } = {}) {
  const input = $(inputSel);
  let list = [];
  const set = (next) => {
    list = next;
    store.set(key, JSON.stringify(list));
    $(chipsSel).replaceChildren(...list.map((v) => {
      const b = document.createElement("button");
      label(b, v);
      b.title = `Remove ${b.textContent}`;
      b.onclick = () => set(list.filter((x) => x !== v));
      return b;
    }));
    onChange(list);
  };
  const add = (v) => { if (!list.includes(v)) set([...list, v]); };
  const remove = (v) => set(list.filter((x) => x !== v));
  try { set(JSON.parse(store.get(key, "[]"))); } catch { set([]); }
  input.addEventListener("keydown", (e) => {
    const v = input.value.trim();
    if (e.key === "Enter" && v) {
      e.preventDefault();
      if (!valid(v)) return;
      add(wrap(v));
      input.value = "";
    } else if (e.key === "Backspace" && !input.value && list.length) {
      set(list.slice(0, -1));
    } else if (e.key === "Escape") {
      input.blur();
    }
  });
  return { add, remove, has: (v) => list.includes(v) };
}

let hiddenFields, excludes, highlights;
let hlColor = "yellow";

// A highlight is stored as "color rule".
const splitHighlight = (v) => [v.slice(0, v.indexOf(" ")), v.slice(v.indexOf(" ") + 1)];

function pickSwatch(row, color) {
  for (const b of row.querySelectorAll("button")) b.classList.toggle("on", b.dataset.color === color);
}

function setFieldColors(colors) {
  state.fieldColors = colors;
  store.set("fieldColors", JSON.stringify(colors));
  rerenderAll();
  relayout();
}

export function openFieldMenu(x, y, key, value) {
  const menu = $("#field-menu");
  // A value that looks like a regex is excluded as an exact one.
  const rule = `${key}=${REGEX.test(value) ? `/^${RegExp.escape(value)}$/` : value}`;
  $("#fm-hide").textContent = `Hide field ${key}`;
  $("#fm-hide").onclick = () => { hiddenFields.add(key); menu.hidePopover(); };
  $("#fm-exclude").textContent = `Exclude ${rule}`;
  $("#fm-exclude").onclick = () => { excludes.add(rule); menu.hidePopover(); };
  pickSwatch($("#fm-field"), state.fieldColors[key] ?? "");
  $("#fm-field").onclick = (e) => {
    const color = e.target.dataset.color;
    if (color === undefined) return;
    const { [key]: _, ...rest } = state.fieldColors;
    setFieldColors(color ? { ...rest, [key]: color } : rest);
    menu.hidePopover();
  };
  const current = state.highlights.find((h) => h.src === rule);
  pickSwatch($("#fm-lines"), current?.color ?? "");
  $("#fm-lines").onclick = (e) => {
    const color = e.target.dataset.color;
    if (color === undefined) return;
    if (current) highlights.remove(`${current.color} ${rule}`);
    if (color) highlights.add(`${color} ${rule}`);
    menu.hidePopover();
  };
  menu.showPopover();
  menu.style.left = `${Math.min(x, innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(y + 8, innerHeight - menu.offsetHeight - 8)}px`;
}

function checkbox(sel, key, onChange) {
  const box = $(sel);
  box.checked = store.get(key, "1") === "1";
  box.onchange = () => {
    store.set(key, box.checked ? "1" : "0");
    onChange(box.checked);
  };
  onChange(box.checked);
}

export function initUi() {
  applyTheme(store.get("theme", window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : ""));
  $("#theme").onclick = () => {
    const t = document.documentElement.dataset.theme === "light" ? "" : "light";
    applyTheme(t);
    store.set("theme", t);
  };

  let filterTimer = null;
  const applyFilter = () => {
    clearTimeout(filterTimer);
    filterTimer = null;
    setFilter($("#filter").value);
  };
  $("#filter").oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilter, 120);
  };
  const historySearch = () => {
    applyFilter();
    searchHistory($("#filter").value);
  };
  $("#filter").onkeydown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.altKey) historySearch();
    else if (filterTimer) applyFilter();
    else jump(e.shiftKey ? -1 : 1);
  };
  $("#t-history").onclick = historySearch;
  excludes = chipInput("#exclude", "#excludes", "exclude", (list) => {
    state.exclude = list.map(excludeRule).filter(Boolean);
    refilter();
  }, { valid: excludeRule });
  highlights = chipInput("#highlight", "#highlights", "highlights", (list) => {
    state.highlights = list.map((v) => {
      const [color, src] = splitHighlight(v);
      return { color, src, test: excludeRule(src) };
    }).filter((h) => h.test);
    rerenderAll();
  }, {
    valid: excludeRule,
    wrap: (v) => `${hlColor} ${v}`,
    label: (b, v) => {
      const [color, src] = splitHighlight(v);
      b.textContent = src;
      b.className = `hl hl-${color}`;
    },
  });
  pickSwatch($("#hl-colors"), hlColor);
  $("#hl-colors").onclick = (e) => {
    if (!e.target.dataset.color) return;
    hlColor = e.target.dataset.color;
    pickSwatch($("#hl-colors"), hlColor);
  };
  try { state.fieldColors = JSON.parse(store.get("fieldColors", "{}")); } catch {}
  hiddenFields = chipInput("#hide-field", "#hidden-fields", "hiddenFields", (list) => {
    state.hiddenFields = new Set(list);
    rerenderAll();
    relayout();
  });
  $("#back-live").onclick = leaveSearch;
  $("#trace").onkeydown = (e) => {
    const id = e.target.value.trim();
    if (e.key === "Enter" && id) location.hash = "trace=" + encodeURIComponent(id);
  };
  $("#levels").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) setLevel(b.dataset.level);
  };
  $("#t-errors").onclick = (e) => jumpToError(e.shiftKey ? 1 : -1);
  $("#marks").onclick = (e) => {
    if (e.target.dataset.seq) showSeq(Number(e.target.dataset.seq));
  };
  $("#tail").onchange = () => state.current && !state.current.trace && connect();
  $("#csearch").oninput = renderList;
  $("#clear-errors").onclick = clearErrors;
  $("#show-all").checked = store.get("showAll", "0") === "1";
  $("#show-all").onchange = (e) => { store.set("showAll", e.target.checked ? "1" : "0"); renderList(); };

  for (const [col, key] of [["ts", "ts"], ["lvl", "colLevel"], ["src", "colSource"]]) {
    checkbox(`#col-${col}`, key, (on) => { document.body.classList.toggle(`no-${col}`, !on); relayout(); });
  }
  const cols = $("#cols");
  cols.addEventListener("beforetoggle", (e) => {
    if (e.newState !== "open") return;
    const r = $("#t-cols").getBoundingClientRect();
    cols.style.top = `${r.bottom + 4}px`;
    cols.style.left = `${Math.max(8, r.right - 240)}px`;
  });
  toggle("#t-wrap", "wrap", "1", (on) => { document.body.classList.toggle("wrap", on); relayout(); });
  toggle("#t-filter", "filterMode", "0", (on) => { state.filterMode = on; refilter(); });

  $("#t-clear").onclick = resetBuffer;
  $("#t-dl").onclick = () => {
    if (!state.current) return;
    const text = state.view.map((l) => `${l.ts} ${l.plain}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const cur = state.current;
    const name = cur.trace ? `trace-${cur.trace}` : cur.project ?? cur.names.join("+");
    a.download = `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  logs.addEventListener("scroll", () => {
    state.follow = logs.scrollHeight - logs.scrollTop - logs.clientHeight < 40;
    saveAnchor();
    schedulePaint();
  });
  $("#jump").onclick = () => { state.follow = true; schedulePaint(); };

  let lastWidth = 0;
  new ResizeObserver(([e]) => {
    if (e.contentRect.width !== lastWidth) { lastWidth = e.contentRect.width; relayout(); }
    else schedulePaint();
  }).observe(logs);

  const help = $("#help");
  $("#t-help").onclick = () => help.showModal();
  help.onclick = (e) => { if (e.target === help) help.close(); };

  // Single-key shortcuts, active when not typing; they press the same buttons as the mouse would.
  const keys = {
    "?": () => help.showModal(),
    n: () => jump(1),
    N: () => jump(-1),
    e: () => jumpToError(-1),
    E: () => jumpToError(1),
    j: () => logs.scrollBy(0, 66),
    k: () => logs.scrollBy(0, -66),
    g: () => { logs.scrollTop = 0; },
    G: () => $("#jump").click(),
    f: () => $("#t-filter").click(),
    w: () => $("#t-wrap").click(),
    t: () => $("#col-ts").click(),
    0: () => setLevel(""),
    1: () => setLevel("error"),
    2: () => setLevel("warn"),
    3: () => setLevel("info"),
    4: () => setLevel("debug"),
  };
  document.addEventListener("keydown", (e) => {
    if (help.open) return;
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);
    if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key === "f")) {
      e.preventDefault();
      $("#filter").focus();
      $("#filter").select();
    } else if (e.key === "Escape") {
      if (document.activeElement === $("#filter")) {
        $("#filter").value = "";
        setFilter("");
        $("#filter").blur();
      } else if (!$("#banner").hidden) {
        $("#back-live").click();
      }
    } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  });
}
