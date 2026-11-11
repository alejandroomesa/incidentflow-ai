const app = document.getElementById('app');

const SEVERITY_COLORS = {
  low: 'bg-slate-100 text-slate-700 ring-slate-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  critical: 'bg-red-50 text-red-700 ring-red-200',
};
const STATUS_COLORS = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  analyzing: 'bg-blue-50 text-blue-700 ring-blue-200',
  classified: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  action_pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  requiring_approval: 'bg-purple-50 text-purple-700 ring-purple-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};
const PRIORITY_COLORS = {
  low: 'bg-slate-100 text-slate-700 ring-slate-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  urgent: 'bg-red-50 text-red-700 ring-red-200',
};
const ACTION_STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-blue-50 text-blue-700 ring-blue-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  executed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};
const STATUS_LABELS = {
  pending: 'Pendiente', analyzing: 'Analizando', classified: 'Clasificada',
  action_pending: 'Acción pendiente', requiring_approval: 'Requiere aprobación',
  resolved: 'Resuelta', rejected: 'Rechazada', failed: 'Fallida',
};
const SEVERITY_LABELS = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
const ACTION_STATUS_LABELS = {
  pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', executed: 'Ejecutada', failed: 'Fallida',
};

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function humanize(value) {
  if (!value) return 'Sin clasificar';
  return String(value).replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function badge(text, colorClass) {
  return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${colorClass || 'bg-slate-100 text-slate-700 ring-slate-200'}">${escapeHtml(text)}</span>`;
}

function statusBadge(status) {
  return badge(STATUS_LABELS[status] || humanize(status), STATUS_COLORS[status]);
}

function severityBadge(severity) {
  return badge(SEVERITY_LABELS[severity] || humanize(severity), SEVERITY_COLORS[severity]);
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' }, signal: controller.signal, ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `La solicitud ha fallado (${response.status})`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La solicitud ha tardado demasiado. Inténtalo de nuevo.');
    if (error instanceof TypeError) throw new Error('No se ha podido conectar con el servidor. Comprueba tu conexión.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function render(html) {
  app.innerHTML = `<div class="fade-in">${html}</div>`;
}

function renderLoading(message = 'Cargando información') {
  render(`<div class="space-y-7" aria-label="${escapeHtml(message)}">
    <div class="space-y-3"><div class="skeleton h-4 w-28"></div><div class="skeleton h-8 w-64 max-w-full"></div></div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${Array.from({ length: 4 }, () => '<div class="surface-card p-5"><div class="skeleton h-4 w-24"></div><div class="skeleton mt-4 h-8 w-14"></div></div>').join('')}</div>
    <div class="surface-card p-5"><div class="skeleton h-10 w-full"></div><div class="skeleton mt-5 h-16 w-full"></div><div class="skeleton mt-3 h-16 w-full"></div></div>
  </div>`);
}

function renderPageError(error) {
  render(`<div class="mx-auto max-w-xl py-16 text-center">
    <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
      <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4m0 4h.01M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z"/></svg>
    </div>
    <h1 class="mt-5 text-xl font-bold text-slate-900">No hemos podido cargar esta vista</h1>
    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(error.message || 'Ha ocurrido un error inesperado.')}</p>
    <button id="retry-view" class="primary-button mt-6">Reintentar</button>
  </div>`);
  document.getElementById('retry-view')?.addEventListener('click', router);
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value.replace(' ', 'T')).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

function metricCard(label, value, description, tone) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100', amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    red: 'bg-red-50 text-red-600 ring-red-100', emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  };
  return `<article class="surface-card p-5"><div class="flex items-start justify-between gap-3"><div>
    <p class="text-sm font-medium text-slate-500">${label}</p><p class="mt-2 text-3xl font-bold tracking-tight text-slate-950">${value}</p>
    </div><span class="grid h-10 w-10 place-items-center rounded-xl ring-1 ${tones[tone]}"><span class="h-2.5 w-2.5 rounded-full bg-current"></span></span></div>
    <p class="mt-3 text-xs text-slate-500">${description}</p></article>`;
}

function incidentTableRows(incidents) {
  if (!incidents.length) return '<tr><td colspan="7" class="px-5 py-12 text-center text-sm text-slate-500">No hay incidencias que coincidan con los filtros.</td></tr>';
  return incidents.map((incident) => `<tr class="border-t border-slate-100 transition hover:bg-slate-50/80">
    <td class="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-500">#${incident.id}</td>
    <td class="px-5 py-4"><p class="text-sm font-semibold text-slate-900">${escapeHtml(incident.company_name)}</p><p class="mt-0.5 max-w-xs truncate text-xs text-slate-500">${escapeHtml(incident.description)}</p></td>
    <td class="whitespace-nowrap px-5 py-4 text-sm text-slate-600">${escapeHtml(humanize(incident.category))}</td>
    <td class="whitespace-nowrap px-5 py-4">${incident.severity ? severityBadge(incident.severity) : '<span class="text-sm text-slate-400">—</span>'}</td>
    <td class="whitespace-nowrap px-5 py-4">${statusBadge(incident.status)}</td>
    <td class="whitespace-nowrap px-5 py-4 text-xs text-slate-500">${formatDate(incident.created_at)}</td>
    <td class="whitespace-nowrap px-5 py-4 text-right"><a href="#/incidents/${incident.id}" class="font-semibold text-indigo-600 hover:text-indigo-800">Ver detalle →</a></td>
  </tr>`).join('');
}

function incidentMobileCards(incidents) {
  if (!incidents.length) return '<div class="px-5 py-12 text-center text-sm text-slate-500">No hay incidencias que coincidan con los filtros.</div>';
  return incidents.map((incident) => `<a href="#/incidents/${incident.id}" class="block border-t border-slate-100 p-4 transition first:border-0 hover:bg-slate-50">
    <div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="truncate text-sm font-semibold text-slate-900">${escapeHtml(incident.company_name)}</p>
    <p class="mt-1 text-xs text-slate-500">Incidencia #${incident.id} · ${formatDate(incident.created_at)}</p></div>${statusBadge(incident.status)}</div>
    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600"><span>${escapeHtml(humanize(incident.category))}</span>${incident.severity ? severityBadge(incident.severity) : ''}</div>
  </a>`).join('');
}

async function viewIncidentList() {
  renderLoading('Cargando panel de incidencias');
  const incidents = await api('/incidents');
  const attentionStatuses = new Set(['pending', 'analyzing', 'action_pending', 'requiring_approval']);
  const attention = incidents.filter((item) => attentionStatuses.has(item.status)).length;
  const highRisk = incidents.filter((item) => ['high', 'critical'].includes(item.severity)).length;
  const resolved = incidents.filter((item) => item.status === 'resolved').length;

  render(`<section>
    <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div>
      <p class="text-sm font-semibold text-indigo-600">Centro de control</p><h1 class="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Gestión de incidencias</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Clasifica, revisa y resuelve incidencias con asistencia de IA y control humano en cada decisión sensible.</p>
    </div><button id="open-incident-dialog" class="primary-button shrink-0"><span class="text-lg leading-none">+</span> Nueva incidencia</button></div>

    <div class="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      ${metricCard('Total registradas', incidents.length, 'Histórico de incidencias', 'indigo')}
      ${metricCard('Requieren atención', attention, 'Pendientes o en revisión', 'amber')}
      ${metricCard('Riesgo alto', highRisk, 'Gravedad alta o crítica', 'red')}
      ${metricCard('Resueltas', resolved, 'Cerradas con trazabilidad', 'emerald')}
    </div>

    <div class="surface-card mt-7 overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div>
        <h2 class="font-semibold text-slate-900">Registro de incidencias</h2><p class="mt-0.5 text-xs text-slate-500">Consulta el estado y la clasificación de cada caso.</p>
      </div><div class="flex flex-col gap-2 sm:flex-row">
        <label class="relative"><span class="sr-only">Buscar incidencias</span><svg viewBox="0 0 24 24" class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="incident-search" class="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm sm:w-60" placeholder="Buscar empresa o descripción" /></label>
        <select id="incident-status-filter" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><option value="">Todos los estados</option>${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
      </div></div>
      ${incidents.length ? `<div class="hidden overflow-x-auto md:block"><table class="w-full text-left"><thead class="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>
        <th class="px-5 py-3">ID</th><th class="px-5 py-3">Empresa</th><th class="px-5 py-3">Categoría</th><th class="px-5 py-3">Gravedad</th><th class="px-5 py-3">Estado</th><th class="px-5 py-3">Fecha</th><th class="px-5 py-3"></th>
      </tr></thead><tbody id="incident-table-body">${incidentTableRows(incidents)}</tbody></table></div><div id="incident-mobile-list" class="md:hidden">${incidentMobileCards(incidents)}</div>` : `
      <div class="px-5 py-16 text-center"><div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100"><svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6m-6 4h4m2-13v4h4"/></svg></div>
        <h3 class="mt-4 font-semibold text-slate-900">Todo está bajo control</h3><p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Todavía no hay incidencias registradas. Crea la primera para demostrar el flujo completo de clasificación y revisión.</p>
        <button id="empty-new-incident" class="secondary-button mt-5">Crear primera incidencia</button></div>`}
    </div>
  </section>

  <div id="incident-dialog" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
    <div class="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div class="flex items-start justify-between border-b border-slate-200 px-6 py-5"><div>
      <p class="text-xs font-semibold uppercase tracking-wider text-indigo-600">Nuevo registro</p><h2 id="dialog-title" class="mt-1 text-xl font-bold text-slate-950">Reportar una incidencia</h2>
    </div><button id="close-incident-dialog" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">✕</button></div>
    <form id="new-incident-form" class="space-y-4 p-6">
      <label class="block text-sm font-medium text-slate-700">Empresa<input name="company" required maxlength="255" class="form-control" placeholder="Empresa Demo SL" /></label>
      <label class="block text-sm font-medium text-slate-700">Reportado por <span class="font-normal text-slate-400">(opcional)</span><input name="reportedBy" maxlength="255" class="form-control" placeholder="Departamento de Administración" /></label>
      <label class="block text-sm font-medium text-slate-700">Descripción<textarea name="description" required rows="5" class="form-control resize-none" placeholder="Describe qué ha ocurrido, qué datos pueden estar afectados y cómo se detectó..."></textarea></label>
      <p class="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-700">La información personal se anonimiza antes de enviarse al proveedor de IA.</p>
      <p id="new-incident-error" class="hidden rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"></p>
      <div class="flex justify-end gap-3 pt-1"><button type="button" id="cancel-incident-dialog" class="secondary-button">Cancelar</button><button type="submit" id="create-incident-button" class="primary-button">Registrar incidencia</button></div>
    </form></div>
  </div>`);

  const dialog = document.getElementById('incident-dialog');
  const openDialog = () => { dialog.classList.replace('hidden', 'flex'); document.body.classList.add('overflow-hidden'); setTimeout(() => dialog.querySelector('input')?.focus(), 0); };
  const closeDialog = () => { dialog.classList.replace('flex', 'hidden'); document.body.classList.remove('overflow-hidden'); };
  document.getElementById('open-incident-dialog')?.addEventListener('click', openDialog);
  document.getElementById('empty-new-incident')?.addEventListener('click', openDialog);
  document.getElementById('close-incident-dialog')?.addEventListener('click', closeDialog);
  document.getElementById('cancel-incident-dialog')?.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  const applyFilters = () => {
    const query = document.getElementById('incident-search')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('incident-status-filter')?.value || '';
    const filtered = incidents.filter((incident) => {
      const searchable = `${incident.company_name} ${incident.description} ${incident.category || ''}`.toLowerCase();
      return (!query || searchable.includes(query)) && (!status || incident.status === status);
    });
    const table = document.getElementById('incident-table-body');
    const mobile = document.getElementById('incident-mobile-list');
    if (table) table.innerHTML = incidentTableRows(filtered);
    if (mobile) mobile.innerHTML = incidentMobileCards(filtered);
  };
  document.getElementById('incident-search')?.addEventListener('input', applyFilters);
  document.getElementById('incident-status-filter')?.addEventListener('change', applyFilters);

  document.getElementById('new-incident-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const errorEl = document.getElementById('new-incident-error');
    const button = document.getElementById('create-incident-button');
    errorEl.classList.add('hidden'); button.disabled = true; button.textContent = 'Registrando…';
    try {
      const incident = await api('/incidents', { method: 'POST', body: JSON.stringify({
        company: form.company.value.trim(), reportedBy: form.reportedBy.value.trim() || null,
        description: form.description.value.trim(), source: 'manual',
      }) });
      location.hash = `#/incidents/${incident.id}`;
    } catch (error) {
      errorEl.textContent = error.message; errorEl.classList.remove('hidden'); button.disabled = false; button.textContent = 'Registrar incidencia';
    }
  });
}

function proposedActionCard(action) {
  const canAct = action.status === 'pending';
  return `<article class="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div>
    <div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-semibold text-slate-900">${escapeHtml(action.title)}</h3>${badge(humanize(action.priority), PRIORITY_COLORS[action.priority])}${badge(ACTION_STATUS_LABELS[action.status] || humanize(action.status), ACTION_STATUS_COLORS[action.status])}</div>
    <p class="mt-2 text-xs text-slate-500">${escapeHtml(humanize(action.action_type))}</p></div>
    ${canAct ? `<div class="flex shrink-0 gap-2"><button data-reject="${action.id}" class="secondary-button !px-3 !py-2 text-xs">Rechazar</button><button data-approve="${action.id}" class="primary-button !bg-emerald-600 !px-3 !py-2 text-xs hover:!bg-emerald-700">Aprobar</button></div>` : ''}
  </div></article>`;
}

async function viewIncidentDetail(id) {
  renderLoading('Cargando incidencia');
  const incident = await api(`/incidents/${id}`);
  const confidence = Math.min(100, Math.max(0, Math.round(Number(incident.confidence || 0) * 100)));
  render(`<a href="#/incidents" class="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-indigo-600">← Volver al panel</a>
  <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,.7fr)]"><div class="space-y-6">
    <section class="surface-card overflow-hidden"><div class="border-b border-slate-200 bg-slate-50/70 px-6 py-5"><div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div>
      <p class="text-xs font-semibold uppercase tracking-wider text-indigo-600">Incidencia #${incident.id}</p><h1 class="mt-1 text-2xl font-bold tracking-tight text-slate-950">${escapeHtml(incident.company_name)}</h1>
    </div>${statusBadge(incident.status)}</div></div><div class="p-6">
      <dl class="grid gap-4 sm:grid-cols-3"><div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Origen</dt><dd class="mt-1 text-sm font-medium text-slate-700">${escapeHtml(humanize(incident.source))}</dd></div>
      <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Reportado por</dt><dd class="mt-1 text-sm font-medium text-slate-700">${escapeHtml(incident.reported_by || 'No indicado')}</dd></div>
      <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Fecha</dt><dd class="mt-1 text-sm font-medium text-slate-700">${formatDate(incident.created_at)}</dd></div></dl>
      <div class="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Descripción</p><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">${escapeHtml(incident.description)}</p></div>
      ${incident.status === 'pending' ? '<button id="analyze-btn" class="primary-button mt-5">Analizar con IA</button>' : ''}<p id="analyze-error" class="mt-3 text-sm text-red-600"></p>
    </div></section>
    <section class="surface-card p-6"><div class="mb-4 flex items-center justify-between gap-3"><div><h2 class="font-semibold text-slate-900">Actuaciones propuestas</h2><p class="mt-1 text-xs text-slate-500">Requieren una decisión humana antes de ejecutarse.</p></div><span class="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">Human-in-the-loop</span></div><div id="actions-list" class="space-y-3"><div class="skeleton h-20 w-full"></div></div></section>
  </div><aside class="space-y-6">
    <section class="surface-card p-5"><h2 class="font-semibold text-slate-900">Clasificación de IA</h2>${incident.category ? `<p class="mt-1 text-xs leading-5 text-slate-500">Resultado orientativo pendiente de revisión profesional.</p><div class="mt-4 flex flex-wrap gap-2">${badge(humanize(incident.category), 'bg-indigo-50 text-indigo-700 ring-indigo-200')}${incident.severity ? severityBadge(incident.severity) : ''}</div>
      <div class="mt-5"><div class="flex justify-between text-xs"><span class="font-medium text-slate-600">Confianza</span><span class="font-semibold text-slate-900">${confidence}%</span></div><div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-indigo-500" style="width:${confidence}%"></div></div></div>` : '<p class="mt-2 text-sm leading-6 text-slate-500">La incidencia todavía no ha sido analizada.</p>'}</section>
    <section class="rounded-2xl bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10"><p class="text-xs font-semibold uppercase tracking-wider text-indigo-300">Trazabilidad</p><h2 class="mt-2 font-semibold">Historial de auditoría</h2><p class="mt-2 text-sm leading-6 text-slate-400">Consulta cada cambio, decisión y ejecución registrada para esta incidencia.</p><a href="#/incidents/${id}/audit" class="mt-4 inline-flex text-sm font-semibold text-white hover:text-indigo-300">Ver historial →</a></section>
  </aside></div>`);

  document.getElementById('analyze-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Analizando…';
    try { await api(`/incidents/${id}/analyze`, { method: 'POST' }); await viewIncidentDetail(id); }
    catch (error) { document.getElementById('analyze-error').textContent = error.message; button.disabled = false; button.textContent = 'Analizar con IA'; }
  });
  await refreshActions(id);
}

async function refreshActions(incidentId) {
  const container = document.getElementById('actions-list');
  if (!container) return;
  try {
    const actions = await api(`/incidents/${incidentId}/actions`);
    container.innerHTML = actions.length ? actions.map(proposedActionCard).join('') : '<div class="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No hay actuaciones propuestas todavía.</div>';
    container.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', () => handleActionDecision(incidentId, button.dataset.approve, 'approve')));
    container.querySelectorAll('[data-reject]').forEach((button) => button.addEventListener('click', () => handleActionDecision(incidentId, button.dataset.reject, 'reject')));
  } catch (error) { container.innerHTML = `<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700">${escapeHtml(error.message)}</p>`; }
}

async function handleActionDecision(incidentId, actionId, decision) {
  const actor = prompt(decision === 'approve' ? 'Tu nombre (aprobando como):' : 'Tu nombre (rechazando como):');
  if (!actor?.trim()) return;
  try {
    await api(`/incidents/${incidentId}/${decision}`, { method: 'POST', body: JSON.stringify(decision === 'approve'
      ? { actionId: Number(actionId), approvedBy: actor.trim() }
      : { actionId: Number(actionId), rejectedBy: actor.trim() }) });
    await refreshActions(incidentId);
  } catch (error) { alert(error.message); }
}

async function viewAuditTrail(id) {
  renderLoading('Cargando historial de auditoría');
  const logs = await api(`/incidents/${id}/audit`);
  render(`<a href="#/incidents/${id}" class="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-indigo-600">← Volver a la incidencia</a>
    <div class="mt-5"><p class="text-sm font-semibold text-indigo-600">Trazabilidad completa</p><h1 class="mt-1 text-2xl font-bold tracking-tight text-slate-950">Historial de auditoría</h1><p class="mt-2 text-sm text-slate-500">Incidencia #${id} · ${logs.length} eventos registrados</p></div>
    <section class="surface-card mt-7 p-5 sm:p-6">${logs.length ? `<div class="relative ml-2 border-l border-slate-200 pl-6">${logs.map((log) => `<article class="relative border-b border-slate-100 py-5 first:pt-0 last:border-0 last:pb-0">
      <span class="absolute -left-[30px] top-6 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50"></span><div class="flex flex-wrap items-center gap-2"><time class="text-xs text-slate-400">${formatDate(log.created_at)}</time>${badge(humanize(log.actor_type), log.actor_type === 'human' ? 'bg-blue-50 text-blue-700 ring-blue-200' : log.actor_type === 'ai_agent' ? 'bg-purple-50 text-purple-700 ring-purple-200' : 'bg-slate-100 text-slate-700 ring-slate-200')}</div>
      <h2 class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(humanize(log.event))}</h2>${log.actor_id ? `<p class="mt-1 text-xs text-slate-500">Responsable: ${escapeHtml(log.actor_id)}</p>` : ''}
      ${log.metadata && Object.keys(log.metadata).length ? `<details class="mt-3"><summary class="cursor-pointer text-xs font-medium text-indigo-600">Ver datos técnicos</summary><pre class="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">${escapeHtml(JSON.stringify(log.metadata, null, 2))}</pre></details>` : ''}</article>`).join('')}</div>` : '<div class="py-12 text-center text-sm text-slate-500">Todavía no hay eventos de auditoría.</div>'}</section>`);
}

async function router() {
  const hash = location.hash || '#/incidents';
  const auditMatch = hash.match(/^#\/incidents\/(\d+)\/audit$/);
  const detailMatch = hash.match(/^#\/incidents\/(\d+)$/);
  try {
    if (auditMatch) await viewAuditTrail(Number(auditMatch[1]));
    else if (detailMatch) await viewIncidentDetail(Number(detailMatch[1]));
    else await viewIncidentList();
  } catch (error) { console.error(error); renderPageError(error); }
}

window.addEventListener('hashchange', router);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.getElementById('cancel-incident-dialog')?.click();
});
window.addEventListener('DOMContentLoaded', router);
