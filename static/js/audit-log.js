window.Gantt = window.Gantt || {};

Gantt.auditLog = (function() {
  var api = Gantt.api;
  var escapeHtml = Gantt.utils.escapeHtml;
  var showToast = Gantt.utils.showToast;

  var overlayEl = null;
  var events = [];
  var selectedEventUid = null;

  function formatActionLabel(action) {
    return String(action || '')
      .split('_')
      .map(function(part) {
        return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
      })
      .join(' ');
  }

  function getActionTone(action) {
    var value = String(action || '');
    if (value.indexOf('delete') !== -1) return 'danger';
    if (value.indexOf('update') !== -1) return 'info';
    if (value.indexOf('create') !== -1 || value.indexOf('acquire') !== -1 || value.indexOf('import') !== -1) return 'success';
    if (value.indexOf('takeover') !== -1) return 'warning';
    if (value.indexOf('release') !== -1) return 'muted';
    return 'default';
  }

  function formatEntityLabel(entityType) {
    if (!entityType) return 'Workspace';
    if (entityType === 'edit_lock') return 'Workspace lock';
    return String(entityType)
      .split('_')
      .map(function(part) {
        return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
      })
      .join(' ');
  }

  function getEventSubject(event) {
    if (event.task_name) return event.task_name;
    if (event.entity_type === 'edit_lock') return 'Workspace lock';
    if (event.entity_type === 'import') return 'Excel import';
    return formatEntityLabel(event.entity_type);
  }

  function getSummaryText(filtered) {
    if (!overlayEl) return '';
    var user = overlayEl.querySelector('#audit-user-filter').value || 'all';
    var action = overlayEl.querySelector('#audit-action-filter').value || 'all';
    var parts = [filtered.length + ' event' + (filtered.length === 1 ? '' : 's')];
    if (user !== 'all') parts.push('user ' + user);
    if (action !== 'all') parts.push(formatActionLabel(action));
    return parts.join(' • ');
  }

  function formatTimestamp(value) {
    if (!value) return 'Unknown time';
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function stringifyValue(value) {
    if (value == null) return 'None';
    return JSON.stringify(value, null, 2);
  }

  function getSelectedEvent(filtered) {
    var match = filtered.find(function(event) { return event.uid === selectedEventUid; });
    if (match) return match;
    selectedEventUid = filtered.length ? filtered[0].uid : null;
    return filtered.length ? filtered[0] : null;
  }

  function close() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function ensureModal() {
    if (overlayEl && overlayEl.isConnected) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'task-detail-modal audit-log-modal visible';
    overlayEl.setAttribute('aria-hidden', 'false');
    overlayEl.tabIndex = -1;
    overlayEl.innerHTML =
      '<div class="task-detail-modal-backdrop audit-log-backdrop"></div>' +
      '<div class="task-detail-modal-dialog audit-log-dialog">' +
        '<header class="task-detail-modal-header">' +
          '<div>' +
            '<div class="workspace-kicker">Workspace History</div>' +
            '<h2 class="task-detail-modal-title">Audit log</h2>' +
          '</div>' +
          '<button type="button" class="btn btn-ghost task-detail-modal-close audit-log-close" aria-label="Close">×</button>' +
        '</header>' +
        '<div class="task-detail-modal-body audit-log-body">' +
          '<div class="audit-log-toolbar">' +
            '<div class="audit-log-filter-group">' +
              '<label class="task-toolbar-label" for="audit-user-filter">User</label>' +
              '<select id="audit-user-filter" class="task-filter-select"><option value="all">All users</option></select>' +
            '</div>' +
            '<div class="audit-log-filter-group">' +
              '<label class="task-toolbar-label" for="audit-action-filter">Action</label>' +
              '<select id="audit-action-filter" class="task-filter-select"><option value="all">All actions</option></select>' +
            '</div>' +
            '<div class="audit-log-filter-group audit-log-search-group">' +
              '<label class="task-toolbar-label" for="audit-task-search">Task</label>' +
              '<input id="audit-task-search" class="audit-log-search-input" type="search" placeholder="Search task or payload" />' +
            '</div>' +
            '<button type="button" class="btn btn-ghost audit-log-refresh">Refresh</button>' +
          '</div>' +
          '<div class="audit-log-shell">' +
            '<section class="audit-log-list-pane">' +
              '<div class="audit-log-list-pane-header">' +
              '<div class="audit-log-summary" id="audit-log-summary">Loading audit log…</div>' +
              '<div class="audit-log-list-head" aria-hidden="true">' +
                '<span>Action</span>' +
                '<span>Task</span>' +
                '<span>User</span>' +
                '<span>Time</span>' +
              '</div>' +
              '</div>' +
              '<div class="audit-log-list" id="audit-log-list"></div>' +
            '</section>' +
            '<aside class="audit-log-detail-pane" id="audit-log-detail"></aside>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlayEl);

    overlayEl.querySelector('.audit-log-backdrop').addEventListener('click', close);
    overlayEl.querySelector('.audit-log-close').addEventListener('click', close);
    overlayEl.querySelector('.audit-log-refresh').addEventListener('click', loadEvents);
    overlayEl.querySelector('#audit-user-filter').addEventListener('change', renderList);
    overlayEl.querySelector('#audit-action-filter').addEventListener('change', renderList);
    overlayEl.querySelector('#audit-task-search').addEventListener('input', renderList);
    overlayEl.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') close();
    });
    return overlayEl;
  }

  function populateFilters() {
    if (!overlayEl) return;
    var userSelect = overlayEl.querySelector('#audit-user-filter');
    var actionSelect = overlayEl.querySelector('#audit-action-filter');
    var currentUser = userSelect.value || 'all';
    var currentAction = actionSelect.value || 'all';
    var users = Array.from(new Set(events.map(function(event) {
      return event.actor_employee_id || 'SYSTEM';
    }))).sort(function(a, b) { return a.localeCompare(b); });
    var actions = Array.from(new Set(events.map(function(event) {
      return event.action_type || '';
    }))).sort(function(a, b) { return a.localeCompare(b); });
    userSelect.innerHTML = '<option value="all">All users</option>' + users.map(function(user) {
      return '<option value="' + escapeHtml(user) + '">' + escapeHtml(user) + '</option>';
    }).join('');
    actionSelect.innerHTML = '<option value="all">All actions</option>' + actions.map(function(action) {
      return '<option value="' + escapeHtml(action) + '">' + escapeHtml(formatActionLabel(action)) + '</option>';
    }).join('');
    userSelect.value = users.indexOf(currentUser) !== -1 ? currentUser : 'all';
    actionSelect.value = actions.indexOf(currentAction) !== -1 ? currentAction : 'all';
  }

  function getFilteredEvents() {
    if (!overlayEl) return [];
    var user = overlayEl.querySelector('#audit-user-filter').value || 'all';
    var action = overlayEl.querySelector('#audit-action-filter').value || 'all';
    var query = (overlayEl.querySelector('#audit-task-search').value || '').trim().toLowerCase();
    return events.filter(function(event) {
      var matchesUser = user === 'all' || (event.actor_employee_id || 'SYSTEM') === user;
      var matchesAction = action === 'all' || event.action_type === action;
      if (!matchesUser || !matchesAction) return false;
      if (!query) return true;
      var haystack = [
        event.task_name || '',
        event.entity_type || '',
        event.action_type || '',
        stringifyValue(event.prior_value),
        stringifyValue(event.new_value)
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) !== -1;
    });
  }

  function renderList() {
    if (!overlayEl) return;
    var listEl = overlayEl.querySelector('#audit-log-list');
    var summaryEl = overlayEl.querySelector('#audit-log-summary');
    var detailEl = overlayEl.querySelector('#audit-log-detail');
    var filtered = getFilteredEvents();
    var selectedEvent = getSelectedEvent(filtered);
    summaryEl.textContent = getSummaryText(filtered);
    if (!filtered.length) {
      listEl.innerHTML = '<div class="audit-log-empty">No audit events match the current filters.</div>';
      if (detailEl) {
        detailEl.innerHTML =
          '<div class="audit-log-detail-empty">' +
            '<div class="audit-log-detail-empty-title">No matching events</div>' +
            '<div class="audit-log-detail-empty-copy">Adjust the filters or search to inspect a different part of the audit trail.</div>' +
          '</div>';
      }
      return;
    }
    listEl.innerHTML = filtered.map(function(event) {
      var actionTone = getActionTone(event.action_type);
      var subject = getEventSubject(event);
      return '' +
        '<button type="button" class="audit-log-row' + (selectedEvent && selectedEvent.uid === event.uid ? ' is-selected' : '') + '" data-event-uid="' + escapeHtml(event.uid) + '">' +
          '<div class="audit-log-cell audit-log-cell-action">' +
            '<span class="audit-log-action tone-' + escapeHtml(actionTone) + '">' + escapeHtml(formatActionLabel(event.action_type)) + '</span>' +
          '</div>' +
          '<div class="audit-log-cell audit-log-cell-task">' +
            '<span class="audit-log-task">' + escapeHtml(subject) + '</span>' +
            '<span class="audit-log-subtitle">' + escapeHtml(formatEntityLabel(event.entity_type)) + '</span>' +
          '</div>' +
          '<div class="audit-log-cell audit-log-cell-user">' +
            '<span class="audit-log-user-chip">' + escapeHtml(event.actor_employee_id || 'SYSTEM') + '</span>' +
          '</div>' +
          '<div class="audit-log-cell audit-log-cell-time">' + escapeHtml(formatTimestamp(event.created_at)) + '</div>' +
        '</button>';
    }).join('');
    listEl.querySelectorAll('.audit-log-row[data-event-uid]').forEach(function(row) {
      row.addEventListener('click', function() {
        selectedEventUid = row.getAttribute('data-event-uid');
        renderList();
      });
    });
    renderDetail(selectedEvent);
  }

  function renderDetail(event) {
    if (!overlayEl) return;
    var detailEl = overlayEl.querySelector('#audit-log-detail');
    if (!detailEl) return;
    if (!event) {
      detailEl.innerHTML =
        '<div class="audit-log-detail-empty">' +
          '<div class="audit-log-detail-empty-title">Select an audit event</div>' +
          '<div class="audit-log-detail-empty-copy">Choose an event from the list to inspect the before and after payloads.</div>' +
        '</div>';
      return;
    }
    var actionTone = getActionTone(event.action_type);
    var subject = getEventSubject(event);
    detailEl.innerHTML =
      '<div class="audit-log-detail-header">' +
        '<span class="audit-log-action tone-' + escapeHtml(actionTone) + '">' + escapeHtml(formatActionLabel(event.action_type)) + '</span>' +
        '<div class="audit-log-detail-title-block">' +
          '<div class="audit-log-detail-title">' + escapeHtml(subject) + '</div>' +
          '<div class="audit-log-detail-subtitle">' + escapeHtml(formatEntityLabel(event.entity_type)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="audit-log-detail-grid">' +
        '<div class="audit-log-detail-label">User</div><div class="audit-log-detail-value">' + escapeHtml(event.actor_employee_id || 'SYSTEM') + '</div>' +
        '<div class="audit-log-detail-label">Action</div><div class="audit-log-detail-value">' + escapeHtml(formatActionLabel(event.action_type)) + '</div>' +
        '<div class="audit-log-detail-label">Timestamp</div><div class="audit-log-detail-value">' + escapeHtml(formatTimestamp(event.created_at)) + '</div>' +
        '<div class="audit-log-detail-label">Task</div><div class="audit-log-detail-value">' + escapeHtml(subject) + '</div>' +
        '<div class="audit-log-detail-label">Entity</div><div class="audit-log-detail-value">' + escapeHtml(formatEntityLabel(event.entity_type)) + '</div>' +
      '</div>' +
      '<div class="audit-log-json-columns">' +
        '<div class="audit-log-json-card">' +
          '<div class="audit-log-json-title">Prior value</div>' +
          '<pre>' + escapeHtml(stringifyValue(event.prior_value)) + '</pre>' +
        '</div>' +
        '<div class="audit-log-json-card">' +
          '<div class="audit-log-json-title">New value</div>' +
          '<pre>' + escapeHtml(stringifyValue(event.new_value)) + '</pre>' +
        '</div>' +
        '<div class="audit-log-json-card">' +
          '<div class="audit-log-json-title">Metadata</div>' +
          '<pre>' + escapeHtml(stringifyValue(event.metadata)) + '</pre>' +
        '</div>' +
      '</div>';
  }

  function loadEvents() {
    ensureModal();
    var summaryEl = overlayEl.querySelector('#audit-log-summary');
    var listEl = overlayEl.querySelector('#audit-log-list');
    summaryEl.textContent = 'Loading audit log…';
    listEl.innerHTML = '';
    api.getAuditEvents()
      .then(function(data) {
        events = Array.isArray(data) ? data : [];
        populateFilters();
        renderList();
      })
      .catch(function(error) {
        summaryEl.textContent = 'Unable to load audit log';
        listEl.innerHTML = '<div class="audit-log-empty">Audit log could not be loaded.</div>';
        showToast(error.message || 'Unable to load audit log', true);
      });
  }

  function open() {
    ensureModal();
    overlayEl.focus();
    loadEvents();
  }

  return {
    open: open,
    close: close
  };
})();
