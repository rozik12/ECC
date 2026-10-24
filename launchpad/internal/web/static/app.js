'use strict';
// Launchpad dashboard. No framework, no build step. All text goes through
// textContent (see h()), so API data can never become markup.

const $app = document.getElementById('app');
const $toasts = document.getElementById('toasts');

// ---------- helpers ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'readOnly' || k === 'required' || k === 'open') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
// replaceChildren() turns null into the text "null", so drop empty children first.
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
const mount = (...nodes) => fill($app, ...nodes);

function toast(msg, bad) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  $toasts.append(t);
  setTimeout(() => t.remove(), bad ? 7000 : 3500);
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return Math.floor(s) + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function parseEnv(text) {
  const env = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) throw new Error('Bad line (expected KEY=value): ' + line.slice(0, 40));
    env[line.slice(0, i).trim()] = line.slice(i + 1);
  }
  return env;
}

// ---------- API ----------
const api = {
  token: (() => { try { return sessionStorage.getItem('lp_token') || ''; } catch { return ''; } })(),
  setToken(t) { this.token = t; try { t ? sessionStorage.setItem('lp_token', t) : sessionStorage.removeItem('lp_token'); } catch {} },
  async call(method, path, body) {
    const res = await fetch('/api/v1' + path, {
      method,
      headers: { Authorization: 'Bearer ' + this.token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { this.setToken(''); route(); throw new Error('Not signed in'); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  },
  get: (p) => api.call('GET', p),
  post: (p, b) => api.call('POST', p, b === undefined ? {} : b),
  put: (p, b) => api.call('PUT', p, b),
  patch: (p, b) => api.call('PATCH', p, b),
  del: (p) => api.call('DELETE', p),
};

// Run an action, toast the result. Returns the result or undefined on error.
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? null : r; }
  catch (e) { toast(e.message, true); return undefined; }
}

// ---------- shared UI ----------
function badge(state) { return h('span', { class: 'badge ' + state }, state); }

function stateOf(s) {
  return s.state;
}

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
}

function copyBox(value, secret) {
  const input = h('input', { type: secret ? 'password' : 'text', value, readOnly: true, 'aria-label': 'value' });
  const btns = [h('button', { class: 'btn small', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(value); toast('Copied'); } catch { input.select(); toast('Press Ctrl+C to copy'); }
  } }, 'Copy')];
  if (secret) btns.unshift(h('button', { class: 'btn small', type: 'button', onclick: (e) => {
    input.type = input.type === 'password' ? 'text' : 'password';
    e.target.textContent = input.type === 'password' ? 'Show' : 'Hide';
  } }, 'Show'));
  return h('div', { class: 'copy' }, input, btns);
}

function confirmDialog(title, text, confirmLabel, onConfirm, expect) {
  const input = expect ? h('input', { type: 'text', 'aria-label': 'Confirmation', placeholder: expect, autocomplete: 'off' }) : null;
  const ok = h('button', { class: 'btn danger', type: 'submit', disabled: !!expect }, confirmLabel);
  if (input) input.addEventListener('input', () => { ok.disabled = input.value !== expect; });
  const dlg = h('dialog', {},
    h('form', { method: 'dialog', onsubmit: async (e) => { e.preventDefault(); dlg.close(); await onConfirm(); } },
      h('div', { class: 'dlg-head' }, h('h2', {}, title)),
      h('div', { class: 'dlg-body stack' }, h('p', {}, text), input ? field('Type "' + expect + '" to confirm', input) : null),
      h('div', { class: 'dlg-foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), ok)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- login ----------
function loginView() {
  const input = h('input', { type: 'password', autocomplete: 'current-password', required: true, 'aria-label': 'API token' });
  const err = h('div', { class: 'notice bad hidden' });
  mount(h('div', { class: 'login stack' },
    h('div', { class: 'row' }, h('div', { class: 'brand-mark' }, logoSvg()), h('h1', {}, 'Launchpad')),
    h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      api.setToken(input.value.trim());
      try { await api.get('/nodes'); err.classList.add('hidden'); route(); }
      catch (ex) { api.setToken(''); err.textContent = ex.message === 'Not signed in' ? 'That token was not accepted.' : ex.message; err.classList.remove('hidden'); }
    } },
      field('API token', input, 'The value of LP_API_TOKEN on your control plane. It stays in this tab only.'),
      err,
      h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'))));
  input.focus();
}

function logoSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M16 6l6 10h-4v8h-4v-8h-4z');
  svg.append(p);
  return svg;
}

function shell(active, ...content) {
  const link = (href, label, key) => h('a', { href, ...(active === key ? { 'aria-current': 'page' } : {}) }, label);
  return [
    h('header', { class: 'bar' }, h('div', { class: 'bar-inner' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, logoSvg()), 'Launchpad'),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, link('#/', 'Services', 'services'), link('#/nodes', 'Nodes', 'nodes')),
      h('button', { class: 'btn ghost small', onclick: () => { api.setToken(''); route(); } }, 'Sign out'))),
    h('main', {}, content),
  ];
}

// ---------- polling / routing ----------
let timers = [];
function clearTimers() { timers.forEach(clearInterval); timers = []; }
function every(ms, fn) { timers.push(setInterval(fn, ms)); }

function route() {
  clearTimers();
  if (!api.token) return loginView();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'nodes') return nodesView();
  if (parts[0] === 's' && parts[1]) return serviceView(parts[1], parts[2] || 'overview');
  return servicesView();
}
window.addEventListener('hashchange', route);

// ---------- services list ----------
async function servicesView() {
  const list = h('div', { class: 'svc-list' });
  mount(...shell('services',
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Services'),
      h('button', { class: 'btn primary', onclick: () => createDialog() }, 'New service')),
    h('div', { class: 'stack' }, list)));
  let last = '';
  const load = async () => {
    let svcs;
    try { svcs = await api.get('/services'); } catch (e) { if (!last) list.replaceChildren(h('div', { class: 'notice bad' }, e.message)); return; }
    const sig = JSON.stringify(svcs.map((s) => [s.id, s.state, s.revision, s.serving_revision, s.node_name, s.error]));
    if (sig === last) return;
    last = sig;
    if (!svcs.length) {
      list.replaceChildren(h('div', { class: 'card empty' }, h('h2', {}, 'No services yet'),
        h('p', {}, 'Deploy a Docker image or a Git repository.'),
        h('button', { class: 'btn primary', onclick: () => createDialog() }, 'New service')));
      return;
    }
    list.replaceChildren(...svcs.map((s) => h('a', { class: 'svc', href: '#/s/' + s.id }, 
      h('span', { class: 'name' }, s.name), badge(stateOf(s)),
      h('span', { class: 'meta' },
        h('span', {}, s.domain),
        h('span', {}, s.git_url ? 'git: ' + s.git_url.replace(/^https:\/\//, '') : 'image: ' + s.image),
        h('span', {}, 'rev ' + s.revision + (s.serving_revision ? ' (serving ' + s.serving_revision + ')' : '')),
        h('span', {}, s.node_name ? 'node ' + s.node_name : 'unscheduled')))));
  };
  await load();
  every(3000, load);
}

// ---------- nodes ----------
async function nodesView() {
  const body = h('div');
  mount(...shell('nodes', h('h2', {}, 'Nodes'), h('div', { class: 'card table-wrap' }, body)));
  const load = async () => {
    let nodes;
    try { nodes = await api.get('/nodes'); } catch (e) { body.replaceChildren(h('div', { class: 'notice bad' }, e.message)); return; }
    if (!nodes.length) {
      body.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'No nodes connected'),
        h('p', {}, 'Run lp-agent on a server with Docker and point it at this control plane.')));
      return;
    }
    body.replaceChildren(h('table', {},
      h('thead', {}, h('tr', {}, ['Name', 'Address', 'Status', 'Services', 'Last seen'].map((c) => h('th', {}, c)))),
      h('tbody', {}, nodes.map((n) => h('tr', {},
        h('td', {}, n.name), h('td', { class: 'mono' }, n.addr),
        h('td', {}, badge(n.healthy ? 'running' : 'down')), h('td', {}, n.services), h('td', {}, ago(n.last_seen)))))));
  };
  await load();
  every(3000, load);
}

// ---------- create dialog ----------
function createDialog() {
  let kind = 'image';
  const f = {
    name: h('input', { type: 'text', required: true, pattern: '[a-z][a-z0-9\\-]{1,38}', placeholder: 'my-app', autocomplete: 'off' }),
    image: h('input', { type: 'text', placeholder: 'nginx:1.27' }),
    git: h('input', { type: 'text', placeholder: 'https://github.com/you/repo' }),
    ref: h('input', { type: 'text', placeholder: 'main (default branch if empty)' }),
    port: h('input', { type: 'number', min: 1, max: 65535, value: 8080 }),
    health: h('input', { type: 'text', placeholder: '/healthz (TCP check if empty)' }),
    env: h('textarea', { placeholder: 'KEY=value\nANOTHER=value', spellcheck: 'false' }),
    mem: h('input', { type: 'number', min: 64, max: 16384, placeholder: '512' }),
    cpus: h('input', { type: 'number', min: 0.1, max: 16, step: 0.1, placeholder: '1' }),
    vols: h('input', { type: 'text', placeholder: 'data:/var/lib/app   (name:/path, comma separated)' }),
  };
  const imageBox = h('div', {}, field('Docker image', f.image));
  const gitBox = h('div', { class: 'stack hidden' }, field('Repository URL', f.git, 'https only. Needs a Dockerfile, or a Node, Python, Go or static project.'), field('Branch or tag', f.ref));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Source' });
  const setKind = (k) => {
    kind = k;
    imageBox.classList.toggle('hidden', k !== 'image'); gitBox.classList.toggle('hidden', k !== 'git');
    seg.replaceChildren(...['image', 'git'].map((x) => h('button', { type: 'button', 'aria-pressed': String(x === k), onclick: () => setKind(x) }, x === 'image' ? 'Docker image' : 'Git repository')));
  };
  setKind('image');
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Deploy');
  const dlg = h('dialog', {}, h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    let env = {};
    try { env = parseEnv(f.env.value); } catch (ex) { return toast(ex.message, true); }
    const body = { name: f.name.value.trim(), port: Number(f.port.value) || 8080, env };
    if (kind === 'image') body.image = f.image.value.trim(); else { body.git_url = f.git.value.trim(); if (f.ref.value.trim()) body.git_ref = f.ref.value.trim(); }
    if (f.health.value.trim()) body.health_path = f.health.value.trim();
    if (f.mem.value) body.memory_mb = Number(f.mem.value);
    if (f.cpus.value) body.cpus = Number(f.cpus.value);
    if (f.vols.value.trim()) {
      body.volumes = f.vols.value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => {
        const i = v.indexOf(':'); return { name: v.slice(0, i), path: v.slice(i + 1) };
      });
    }
    submit.disabled = true;
    const svc = await act(() => api.post('/services', body));
    submit.disabled = false;
    if (svc) { dlg.close(); location.hash = '#/s/' + svc.id; }
  } },
    h('div', { class: 'dlg-head' }, h('h2', {}, 'New service')),
    h('div', { class: 'dlg-body stack' },
      field('Name', f.name, 'Becomes name.your-domain'), seg, imageBox, gitBox,
      h('div', { class: 'grid2' }, field('Port the app listens on', f.port), field('Health check path', f.health)),
      field('Environment variables', f.env),
      h('details', {}, h('summary', {}, 'Resources and storage'),
        h('div', { class: 'stack' },
          h('div', { class: 'grid2' }, field('Memory (MB)', f.mem), field('CPUs', f.cpus)),
          field('Volumes', f.vols, 'A service with volumes stays on one node and restarts without overlap.')))),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), submit)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  f.name.focus();
}

// ---------- service detail ----------
const TABS = [['overview', 'Overview'], ['logs', 'Logs'], ['variables', 'Variables'], ['domains', 'Domains'], ['releases', 'Releases'], ['settings', 'Settings']];

async function serviceView(id, tab) {
  const head = h('div');
  const body = h('div');
  mount(...shell('services', head, h('nav', { class: 'tabs', 'aria-label': 'Service sections' },
    TABS.map(([k, label]) => h('a', { href: '#/s/' + id + '/' + k, ...(k === tab ? { 'aria-current': 'page' } : {}) }, label))), body));

  let svc;
  try { svc = await api.get('/services/' + id); }
  catch (e) { return head.replaceChildren(h('div', { class: 'notice bad' }, e.message), h('p', {}, h('a', { href: '#/' }, 'Back to services'))); }

  const renderHead = () => fill(head,
    h('p', { class: 'muted' }, h('a', { href: '#/' }, 'Services'), ' / ', svc.name),
    h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, svc.name), badge(svc.state),
      h('button', { class: 'btn', onclick: () => act(async () => { svc = await api.post('/services/' + id + '/redeploy'); renderHead(); render(); }, 'Redeploy started') }, 'Redeploy')),
    svc.serving_revision && svc.state !== 'running'
      ? h('div', { class: 'notice' + (svc.state === 'failed' ? ' warn' : '') },
        svc.state === 'failed'
          ? 'Revision ' + svc.revision + ' failed' + (svc.error ? ': ' + svc.error : '') + '. Revision ' + svc.serving_revision + ' is still serving traffic.'
          : 'Revision ' + svc.revision + ' is ' + svc.state + '. Traffic stays on revision ' + svc.serving_revision + ' until it is healthy.')
      : (svc.state === 'failed' ? h('div', { class: 'notice bad' }, 'Failed' + (svc.error ? ': ' + svc.error : '')) : null));

  const views = { overview, logs: logsTab, variables, domains, releases, settings };
  const ctx = { id, get svc() { return svc; }, set svc(v) { svc = v; renderHead(); } };
  const render = () => (views[tab] || overview)(body, ctx);
  renderHead();
  render();

  // Keep the header and read-only tabs fresh; never rebuild a tab with unsaved input.
  every(3000, async () => {
    try {
      const fresh = await api.get('/services/' + id);
      const changed = JSON.stringify(fresh) !== JSON.stringify(svc);
      svc = fresh;
      if (changed) { renderHead(); if (tab === 'overview' || tab === 'releases') render(); }
    } catch { /* transient; next tick retries */ }
  });
}

function overview(body, ctx) {
  const s = ctx.svc;
  const scheme = location.protocol === 'https:' ? 'https:' : 'http:';
  const kv = [
    ['URL', s.state === 'running' || s.serving_revision ? h('a', { href: scheme + '//' + s.domain, target: '_blank', rel: 'noopener noreferrer' }, s.domain) : s.domain],
    ['Source', s.git_url ? h('span', {}, s.git_url, s.git_ref ? ' @ ' + s.git_ref : '', s.pin_commit ? h('span', { class: 'muted' }, ' (pinned to ' + s.pin_commit.slice(0, 7) + ')') : null) : s.image],
    ['Revision', s.revision + (s.serving_revision ? ' (serving ' + s.serving_revision + ')' : '')],
    ['Node', s.node_name || 'waiting for a healthy node'],
    ['Port', String(s.port) + (s.health_path ? ', health ' + s.health_path : ', TCP health check')],
    ['Resources', (s.memory_mb || 512) + ' MB, ' + (s.cpus || 1) + ' CPU'],
    ['Created', ago(s.created_at)],
  ];
  if (s.volumes && s.volumes.length) kv.push(['Volumes', s.volumes.map((v) => v.name + ' → ' + v.path).join(', ')]);
  if (s.custom_domains && s.custom_domains.length) kv.push(['Custom domains', s.custom_domains.join(', ')]);
  body.replaceChildren(h('div', { class: 'card' }, h('dl', { class: 'kv' }, kv.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))));
}

function logsTab(body, ctx) {
  const pre = h('pre', { class: 'logs', tabindex: '0', 'aria-label': 'Service logs' }, h('span', { class: 'empty-log' }, 'Waiting for output…'));
  const follow = h('input', { type: 'checkbox', checked: true, id: 'follow' });
  const filter = h('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter logs' });
  const count = h('span', { class: 'muted' });
  body.replaceChildren(
    h('div', { class: 'log-tools' }, filter, h('label', { class: 'row', for: 'follow' }, follow, 'Follow'),
      h('button', { class: 'btn small', onclick: () => { pre.replaceChildren(); lines.length = 0; } }, 'Clear view'), count),
    pre);
  const lines = [];
  let after = 0, cleared = true;
  const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour12: false });
  const nodeFor = (l) => h('div', { class: 'l', 'data-text': l.text.toLowerCase() },
    h('span', { class: 't' }, fmt(l.time)), h('span', { class: 'r' }, 'r' + l.revision), l.text);
  const applyFilter = () => {
    const q = filter.value.toLowerCase();
    for (const el of pre.children) if (el.dataset) el.classList.toggle('hidden', !!q && !(el.dataset.text || '').includes(q));
  };
  filter.addEventListener('input', applyFilter);
  const poll = async () => {
    let res;
    try { res = await api.get('/services/' + ctx.id + '/logs?limit=1000&after=' + after); } catch { return; }
    if (!res.lines.length) return;
    if (cleared) { pre.replaceChildren(); cleared = false; }
    after = res.next;
    for (const l of res.lines) { lines.push(l); pre.append(nodeFor(l)); }
    while (pre.children.length > 2000) pre.firstChild.remove();
    count.textContent = pre.children.length + ' lines';
    applyFilter();
    if (follow.checked) pre.scrollTop = pre.scrollHeight;
  };
  pre.addEventListener('scroll', () => { follow.checked = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24; });
  poll();
  every(2000, poll);
}

function variables(body, ctx) {
  const rows = h('div');
  const addRow = (k = '', v = '') => {
    const val = h('input', { type: 'password', value: v, 'aria-label': 'Value', autocomplete: 'off', spellcheck: 'false' });
    const row = h('div', { class: 'env-row' },
      h('input', { type: 'text', value: k, 'aria-label': 'Name', placeholder: 'NAME', spellcheck: 'false' }), val,
      h('span', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: (e) => { val.type = val.type === 'password' ? 'text' : 'password'; e.target.textContent = val.type === 'password' ? 'Show' : 'Hide'; } }, 'Show'),
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Remove variable', onclick: () => row.remove() }, '✕')));
    rows.append(row);
  };
  Object.entries(ctx.svc.env || {}).sort().forEach(([k, v]) => addRow(k, v));
  const bulk = h('textarea', { class: 'hidden', spellcheck: 'false', placeholder: 'KEY=value, one per line' });
  const collect = () => {
    if (!bulk.classList.contains('hidden')) return parseEnv(bulk.value);
    const env = {};
    for (const r of rows.children) {
      const [k, v] = r.querySelectorAll('input');
      if (k.value.trim()) env[k.value.trim()] = v.value;
    }
    return env;
  };
  body.replaceChildren(h('div', { class: 'card stack' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Environment variables'),
      h('button', { class: 'btn small', type: 'button', onclick: (e) => {
        const toBulk = bulk.classList.contains('hidden');
        try {
          if (toBulk) { bulk.value = Object.entries(collect()).map(([k, v]) => k + '=' + v).join('\n'); }
          else { const env = parseEnv(bulk.value); rows.replaceChildren(); Object.entries(env).forEach(([k, v]) => addRow(k, v)); }
        } catch (ex) { return toast(ex.message, true); }
        bulk.classList.toggle('hidden', !toBulk); rows.classList.toggle('hidden', toBulk);
        e.target.textContent = toBulk ? 'Edit as rows' : 'Bulk edit';
      } }, 'Bulk edit')),
    rows, bulk,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => addRow() }, 'Add variable'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        let env; try { env = collect(); } catch (ex) { return toast(ex.message, true); }
        const s = await act(() => api.put('/services/' + ctx.id + '/env', env), 'Saved. A new revision is deploying.');
        if (s) ctx.svc = s;
      } }, 'Save and deploy')),
    h('p', { class: 'muted' }, 'Saving creates a new revision. The current one keeps serving until the new one is healthy. ', h('code', {}, 'PORT'), ' is always set for you.')));
}

function domains(body, ctx) {
  const s = ctx.svc;
  const input = h('input', { type: 'text', placeholder: 'app.example.com', autocomplete: 'off', 'aria-label': 'Domain' });
  const listEl = h('div');
  const draw = () => {
    const ds = ctx.svc.custom_domains || [];
    const remove = (d) => async () => {
      const r = await act(() => api.del('/services/' + ctx.id + '/domains/' + encodeURIComponent(d)), 'Removed');
      if (r) { ctx.svc = r; draw(); }
    };
    listEl.replaceChildren(ds.length
      ? h('table', {}, h('tbody', {}, ds.map((d) => h('tr', {}, h('td', {}, d),
        h('td', {}, h('button', { class: 'btn small danger', onclick: remove(d) }, 'Remove'))))))
      : h('p', { class: 'muted' }, 'No custom domains yet.'));
  };
  draw();
  body.replaceChildren(
    h('div', { class: 'card stack' }, h('h3', {}, 'Platform domain'), copyBox(s.domain)),
    h('div', { class: 'card stack' }, h('h3', {}, 'Custom domains'), listEl,
      h('form', { class: 'row', onsubmit: async (e) => {
        e.preventDefault();
        const r = await act(() => api.post('/services/' + ctx.id + '/domains', { domain: input.value }), 'Domain added');
        if (r) { ctx.svc = r; input.value = ''; draw(); }
      } }, h('div', { class: 'grow' }, input), h('button', { class: 'btn primary', type: 'submit' }, 'Add')),
      h('div', { class: 'notice' }, 'At your DNS provider, create a CNAME record from your domain to ', h('code', {}, s.domain),
        ' (for an apex domain use ALIAS/ANAME, or an A record to your edge server). HTTPS certificates are issued automatically once DNS points here and the service is running.')));
}

function releases(body, ctx) {
  const s = ctx.svc;
  const hist = [...(s.history || [])].reverse();
  body.replaceChildren(h('div', { class: 'card table-wrap' }, hist.length ? h('table', {},
    h('thead', {}, h('tr', {}, ['Rev', 'When', 'Change', 'Commit', ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, hist.map((r) => {
      const current = r.revision === s.revision;
      const blocked = !!s.git_url && !r.commit;
      return h('tr', {},
        h('td', {}, r.revision, current ? h('span', { class: 'muted' }, ' (current)') : null),
        h('td', {}, ago(r.at)), h('td', {}, r.note),
        h('td', { class: 'mono' }, r.commit ? r.commit.slice(0, 7) : (s.git_url ? '—' : (r.image || ''))),
        h('td', {}, current ? null : h('button', { class: 'btn small', disabled: blocked, title: blocked ? 'This revision was never built' : '', onclick: () =>
          confirmDialog('Roll back to revision ' + r.revision + '?', 'A new revision is created with that revision\'s image, commit, variables and settings.', 'Roll back', async () => {
            const n = await act(() => api.post('/services/' + ctx.id + '/rollback', { revision: r.revision }), 'Rolling back');
            if (n) ctx.svc = n;
          }) }, 'Roll back')));
    }))) : h('div', { class: 'empty' }, 'No history yet.')));
}

function settings(body, ctx) {
  const s = ctx.svc;
  const f = {
    image: h('input', { type: 'text', value: s.image || '' }),
    ref: h('input', { type: 'text', value: s.git_ref || '', placeholder: 'default branch' }),
    port: h('input', { type: 'number', min: 1, max: 65535, value: s.port }),
    health: h('input', { type: 'text', value: s.health_path || '', placeholder: 'TCP check if empty' }),
    mem: h('input', { type: 'number', min: 64, max: 16384, value: s.memory_mb || '', placeholder: '512' }),
    cpus: h('input', { type: 'number', min: 0.1, max: 16, step: 0.1, value: s.cpus || '', placeholder: '1' }),
    vols: h('input', { type: 'text', value: (s.volumes || []).map((v) => v.name + ':' + v.path).join(', '), placeholder: 'data:/var/lib/app' }),
  };
  const hook = location.origin + '/hooks/github/' + s.id;
  const sections = [
    h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const p = { port: Number(f.port.value), health_path: f.health.value.trim(), memory_mb: Number(f.mem.value) || 0, cpus: Number(f.cpus.value) || 0 };
      if (s.git_url) p.git_ref = f.ref.value.trim(); else p.image = f.image.value.trim();
      p.volumes = f.vols.value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => { const i = v.indexOf(':'); return { name: v.slice(0, i), path: v.slice(i + 1) }; });
      const n = await act(() => api.patch('/services/' + ctx.id, p), 'Saved. A new revision is deploying.');
      if (n) ctx.svc = n;
    } },
      h('h3', {}, 'Configuration'),
      s.git_url ? field('Branch or tag', f.ref, 'Repository: ' + s.git_url) : field('Docker image', f.image),
      h('div', { class: 'grid2' }, field('Port', f.port), field('Health check path', f.health)),
      h('div', { class: 'grid2' }, field('Memory (MB)', f.mem), field('CPUs', f.cpus)),
      field('Volumes', f.vols, 'name:/path, comma separated. Data lives on the service\'s node.'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', type: 'submit' }, 'Save and deploy'))),
  ];
  if (s.git_url) {
    sections.push(h('div', { class: 'card stack' }, h('h3', {}, 'Deploy on push (GitHub)'),
      h('p', { class: 'muted' }, 'In the repository: Settings → Webhooks → Add webhook. Content type application/json, event "Just the push event".'),
      field('Payload URL', copyBox(hook)), field('Secret', copyBox(s.webhook_secret, true)),
      h('p', { class: 'muted' }, 'Pushes to ' + (s.git_ref || 'main or master') + ' deploy automatically. Pushes to other branches are ignored.')));
  }
  if (s.volumes && s.volumes.length) {
    sections.push(h('div', { class: 'card stack' }, h('h3', {}, 'Node'),
      h('p', {}, 'This service is pinned to ', h('strong', {}, s.node_name || 'no node'), ' because it has volumes. If that node is gone for good, you can let the scheduler pick another one; the data on the old node is not moved.'),
      h('div', {}, h('button', { class: 'btn danger', onclick: () => confirmDialog('Move to another node?', 'The service will start on another node with empty volumes.', 'Reschedule', async () => {
        const n = await act(() => api.post('/services/' + ctx.id + '/reschedule'), 'Rescheduling'); if (n) ctx.svc = n;
      }) }, 'Reschedule'))));
  }
  sections.push(h('div', { class: 'card stack' }, h('h3', {}, 'Danger zone'),
    h('p', { class: 'muted' }, 'Deleting stops all containers on the next node sync. Volumes are kept on the node.'),
    h('div', {}, h('button', { class: 'btn danger', onclick: () => confirmDialog('Delete ' + s.name + '?', 'This removes the service, its history and logs.', 'Delete service', async () => {
      if (await act(() => api.del('/services/' + ctx.id), 'Deleted') !== undefined) location.hash = '#/';
    }, s.name) }, 'Delete service'))));
  body.replaceChildren(...sections);
}

route();
