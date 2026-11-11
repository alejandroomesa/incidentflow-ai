const app = document.getElementById('app');

const SEVERITY_COLORS = {
  low: 'bg-slate-200 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_COLORS = {
  pending: 'bg-slate-200 text-slate-700',
  analyzing: 'bg-blue-100 text-blue-800',
  classified: 'bg-indigo-100 text-indigo-800',
  action_pending: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const PRIORITY_COLORS = {
  low: 'bg-slate-200 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

const ACTION_STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  executed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

function badge(text, colorClass) {
  return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass || 'bg-slate-200 text-slate-700'}">${text}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data;
}

function render(html) {
  app.innerHTML = html;
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value.replace(' ', 'T')).toLocaleString('es-ES');
}

async function viewIncidentList() {
  render(`<p class="text-slate-500">Cargando incidencias…</p>`);
  const incidents = await api('/incidents');

  const rows = incidents
    .map(
      (inc) => `
      <tr class="border-b border-slate-200 hover:bg-slate-50">
        <td class="py-2 px-3 text-sm">${inc.id}</td>
        <td class="py-2 px-3 text-sm">${escapeHtml(inc.company_name)}</td>
        <td class="py-2 px-3 text-sm">${inc.category ? escapeHtml(inc.category) : '<span class="text-slate-400">—</span>'}</td>
        <td class="py-2 px-3 text-sm">${inc.severity ? badge(inc.severity, SEVERITY_COLORS[inc.severity]) : '<span class="text-slate-400">—</span>'}</td>
        <td class="py-2 px-3 text-sm">${badge(inc.status, STATUS_COLORS[inc.status])}</td>
        <td class="py-2 px-3 text-sm text-slate-500">${formatDate(inc.created_at)}</td>
        <td class="py-2 px-3 text-sm">
          <a href="#/incidents/${inc.id}" class="text-blue-600 hover:underline">Ver</a>
        </td>
      </tr>`,
    )
    .join('');

  render(`
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold">Incidencias</h1>
    </div>

    <details class="mb-6 bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <summary class="cursor-pointer font-medium text-sm text-slate-700">+ Reportar incidencia manualmente</summary>
      <form id="new-incident-form" class="mt-4 grid gap-3 max-w-xl">
        <label class="text-sm">
          Empresa
          <input name="company" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1" placeholder="Empresa Demo SL" />
        </label>
        <label class="text-sm">
          Reportado por
          <input name="reportedBy" class="mt-1 w-full border border-slate-300 rounded px-2 py-1" placeholder="Departamento de Administración" />
        </label>
        <label class="text-sm">
          Descripción
          <textarea name="description" required rows="3" class="mt-1 w-full border border-slate-300 rounded px-2 py-1" placeholder="Un empleado ha enviado por error..."></textarea>
        </label>
        <button type="submit" class="bg-slate-900 text-white rounded px-3 py-1.5 text-sm w-fit">Crear incidencia</button>
        <p id="new-incident-error" class="text-red-600 text-sm"></p>
      </form>
    </details>

    <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-3">ID</th>
            <th class="py-2 px-3">Empresa</th>
            <th class="py-2 px-3">Categoría</th>
            <th class="py-2 px-3">Gravedad</th>
            <th class="py-2 px-3">Estado</th>
            <th class="py-2 px-3">Creada</th>
            <th class="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" class="py-4 px-3 text-slate-400 text-sm">Aún no hay incidencias.</td></tr>'}</tbody>
      </table>
    </div>
  `);

  document.getElementById('new-incident-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errorEl = document.getElementById('new-incident-error');
    errorEl.textContent = '';
    try {
      const body = {
        company: form.company.value,
        reportedBy: form.reportedBy.value || null,
        description: form.description.value,
        source: 'manual',
      };
      const incident = await api('/incidents', { method: 'POST', body: JSON.stringify(body) });
      location.hash = `#/incidents/${incident.id}`;
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function proposedActionCard(action) {
  const canAct = action.status === 'pending';
  return `
    <div class="border border-slate-200 rounded p-3 flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium text-sm">${escapeHtml(action.title)}</span>
          ${badge(action.priority, PRIORITY_COLORS[action.priority])}
          ${badge(action.status, ACTION_STATUS_COLORS[action.status])}
        </div>
        <p class="text-xs text-slate-500">${escapeHtml(action.action_type)}</p>
      </div>
      ${
        canAct
          ? `<div class="flex gap-2 shrink-0">
              <button data-approve="${action.id}" class="bg-green-600 text-white text-xs rounded px-2 py-1">Aprobar</button>
              <button data-reject="${action.id}" class="bg-red-600 text-white text-xs rounded px-2 py-1">Rechazar</button>
            </div>`
          : ''
      }
    </div>`;
}

async function viewIncidentDetail(id) {
  render(`<p class="text-slate-500">Cargando incidencia…</p>`);
  const incident = await api(`/incidents/${id}`);

  render(`
    <a href="#/incidents" class="text-sm text-blue-600 hover:underline">&larr; Volver a incidencias</a>

    <div class="mt-3 bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Incidencia #${incident.id} — ${escapeHtml(incident.company_name)}</h1>
        ${badge(incident.status, STATUS_COLORS[incident.status])}
      </div>
      <dl class="grid grid-cols-2 gap-2 text-sm mt-3 text-slate-600">
        <div><dt class="text-xs uppercase text-slate-400">Origen</dt><dd>${escapeHtml(incident.source)}</dd></div>
        <div><dt class="text-xs uppercase text-slate-400">Reportado por</dt><dd>${escapeHtml(incident.reported_by || '—')}</dd></div>
      </dl>
      <p class="mt-4 text-sm whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-3">${escapeHtml(incident.description)}</p>

      ${incident.status === 'pending' ? `<button id="analyze-btn" class="mt-4 bg-slate-900 text-white rounded px-3 py-1.5 text-sm">Analizar con IA</button>` : ''}
      <p id="analyze-error" class="text-red-600 text-sm mt-2"></p>

      ${
        incident.category
          ? `<div class="mt-5 border-t border-slate-200 pt-4">
              <p class="text-xs uppercase text-slate-400 mb-2">Clasificación de la IA — pendiente de revisión del consultor</p>
              <div class="flex gap-2 mb-2">
                ${badge(incident.category, 'bg-indigo-100 text-indigo-800')}
                ${badge(incident.severity, SEVERITY_COLORS[incident.severity])}
                ${badge(`${Math.round(incident.confidence * 100)}% confianza`, 'bg-slate-200 text-slate-700')}
              </div>
            </div>`
          : ''
      }
    </div>

    <div id="actions-container" class="mt-5 bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 class="font-semibold mb-3">Actuaciones propuestas</h2>
      <div id="actions-list" class="space-y-2"><p class="text-slate-400 text-sm">Cargando…</p></div>
    </div>

    <a href="#/incidents/${id}/audit" class="inline-block mt-5 text-sm text-blue-600 hover:underline">Ver historial de auditoría &rarr;</a>
  `);

  document.getElementById('analyze-btn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Analizando…';
    try {
      await api(`/incidents/${id}/analyze`, { method: 'POST' });
      viewIncidentDetail(id);
    } catch (err) {
      document.getElementById('analyze-error').textContent = err.message;
      e.target.disabled = false;
      e.target.textContent = 'Analizar con IA';
    }
  });

  await refreshActions(id);
}

async function refreshActions(incidentId) {
  const container = document.getElementById('actions-list');
  if (!container) return;
  try {
    const actions = await api(`/incidents/${incidentId}/actions`);
    container.innerHTML = actions.length
      ? actions.map((a) => proposedActionCard(a)).join('')
      : '<p class="text-slate-400 text-sm">Aún no hay actuaciones propuestas.</p>';

    container.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => handleActionDecision(incidentId, btn.dataset.approve, 'approve'));
    });
    container.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => handleActionDecision(incidentId, btn.dataset.reject, 'reject'));
    });
  } catch (err) {
    container.innerHTML = `<p class="text-red-600 text-sm">${err.message}</p>`;
  }
}

async function handleActionDecision(incidentId, actionId, decision) {
  const actor = prompt(decision === 'approve' ? 'Tu nombre (aprobando como):' : 'Tu nombre (rechazando como):');
  if (!actor) return;
  try {
    if (decision === 'approve') {
      await api(`/incidents/${incidentId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ actionId: Number(actionId), approvedBy: actor }),
      });
    } else {
      await api(`/incidents/${incidentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ actionId: Number(actionId), rejectedBy: actor }),
      });
    }
    await refreshActions(incidentId);
  } catch (err) {
    alert(err.message);
  }
}

async function viewAuditTrail(id) {
  render(`<p class="text-slate-500">Cargando historial…</p>`);
  const logs = await api(`/incidents/${id}/audit`);

  const rows = logs
    .map(
      (log) => `
      <div class="border-b border-slate-200 py-3">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-slate-400 text-xs">${formatDate(log.created_at)}</span>
          ${badge(log.actor_type, log.actor_type === 'human' ? 'bg-blue-100 text-blue-800' : log.actor_type === 'ai_agent' ? 'bg-purple-100 text-purple-800' : 'bg-slate-200 text-slate-700')}
          <span class="font-medium">${escapeHtml(log.event)}</span>
          ${log.actor_id ? `<span class="text-slate-500">por ${escapeHtml(log.actor_id)}</span>` : ''}
        </div>
        ${log.metadata && Object.keys(log.metadata).length ? `<pre class="mt-1 text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">${escapeHtml(JSON.stringify(log.metadata, null, 2))}</pre>` : ''}
      </div>`,
    )
    .join('');

  render(`
    <a href="#/incidents/${id}" class="text-sm text-blue-600 hover:underline">&larr; Volver a la incidencia</a>
    <h1 class="text-xl font-semibold mt-3 mb-4">Historial de auditoría — Incidencia #${id}</h1>
    <div class="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      ${rows || '<p class="text-slate-400 text-sm">Aún no hay eventos de auditoría.</p>'}
    </div>
  `);
}

function router() {
  const hash = location.hash || '#/incidents';
  const auditMatch = hash.match(/^#\/incidents\/(\d+)\/audit$/);
  const detailMatch = hash.match(/^#\/incidents\/(\d+)$/);

  if (auditMatch) {
    viewAuditTrail(Number(auditMatch[1]));
  } else if (detailMatch) {
    viewIncidentDetail(Number(detailMatch[1]));
  } else {
    viewIncidentList();
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
