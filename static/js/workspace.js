window.Gantt = window.Gantt || {};

Gantt.workspace = (function() {
  var state = Gantt.state;
  var api = Gantt.api;
  var table = Gantt.table;
  var gantt = Gantt.gantt;
  var detail = Gantt.detail;
  var auditLog = Gantt.auditLog;
  var escapeHtml = Gantt.utils.escapeHtml;
  var showToast = Gantt.utils.showToast;
  var prettyDate = Gantt.utils.prettyDate;
  var EMPLOYEE_ID_RE = /^[a-zA-Z]{2}[0-9]{5}$/;

  var scrollSyncDone = false;
  var hasCenteredInitialView = false;
  var lockPollTimer = null;
  var hasShownLockLostToast = false;
  var hasShownLockPollErrorToast = false;
  var serverConnectionState = 'unknown';
  var scrollSyncRafScheduled = false;
  var VIRTUAL_THRESHOLD = 60;
  var VIRTUAL_BUFFER = 12;
  var virtualScrollRafScheduled = false;
  var lastVisibleTreeLength = 0;
  function getViewport(visibleTreeLength) {
    if (visibleTreeLength <= VIRTUAL_THRESHOLD) return null;
    var el = state.getEl();
    if (!el.taskTableWrap) return null;
    var rowHeight = state.getConstants().ROW_HEIGHT;
    var scrollTop = el.taskTableWrap.scrollTop;
    var clientHeight = el.taskTableWrap.clientHeight;
    var visibleStart = Math.floor(scrollTop / rowHeight);
    var visibleEnd = Math.ceil((scrollTop + clientHeight) / rowHeight);
    var start = Math.max(0, visibleStart - VIRTUAL_BUFFER);
    var end = Math.min(visibleTreeLength, visibleEnd + VIRTUAL_BUFFER);
    return { start: start, end: end, total: visibleTreeLength };
  }
  function scheduleVirtualScrollRender() {
    if (virtualScrollRafScheduled) return;
    virtualScrollRafScheduled = true;
    requestAnimationFrame(function() {
      virtualScrollRafScheduled = false;
      render();
    });
  }
  var filterRenderDebounceTimer = null;
  var FILTER_DEBOUNCE_MS = 180;
  function debouncedFilterRender() {
    if (filterRenderDebounceTimer) window.clearTimeout(filterRenderDebounceTimer);
    filterRenderDebounceTimer = window.setTimeout(function() {
      filterRenderDebounceTimer = null;
      render();
    }, FILTER_DEBOUNCE_MS);
  }
  function syncVerticalScroll() {
    var el = state.getEl();
    if (!el.taskTableWrap || !el.ganttBody || !el.ganttBodyViewport) return;
    var top = el.taskTableWrap.scrollTop;
    el.ganttBody.style.transform = 'translateY(' + (-top) + 'px)';
  }
  function syncFromTaskThrottled() {
    if (scrollSyncRafScheduled) return;
    scrollSyncRafScheduled = true;
    requestAnimationFrame(function() {
      scrollSyncRafScheduled = false;
      syncVerticalScroll();
    });
  }
  function setupScrollSync() {
    var el = state.getEl();
    if (scrollSyncDone || !el.taskTableWrap || !el.ganttScrollWrap) return;
    el.taskTableWrap.addEventListener('scroll', function() {
      syncFromTaskThrottled();
      if (lastVisibleTreeLength > VIRTUAL_THRESHOLD) scheduleVirtualScrollRender();
    });
    el.ganttScrollWrap.addEventListener('wheel', function(e) {
      var useHorizontal = e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (useHorizontal) {
        e.preventDefault();
        el.ganttScrollWrap.scrollLeft += (e.deltaX !== 0 ? e.deltaX : e.deltaY);
      } else {
        e.preventDefault();
        el.taskTableWrap.scrollTop += e.deltaY;
      }
    }, { passive: false });
    scrollSyncDone = true;
  }
  function forceScrollSync() {
    var el = state.getEl();
    if (!el.taskTableWrap || !el.ganttBodyViewport || !el.ganttBody) return;
    syncVerticalScroll();
  }

  function setLoading(visible) {
    var el = document.getElementById('workspace-loading');
    if (el) el.classList.toggle('visible', !!visible);
  }

  function getPlanBounds(tasks) {
    var minDate = null;
    var maxDate = null;
    tasks.forEach(function(task) {
      if (task.start_date) {
        var start = new Date(task.start_date);
        if (!isNaN(start.getTime()) && (!minDate || start < minDate)) minDate = start;
      }
      if (task.end_date) {
        var end = new Date(task.end_date);
        if (!isNaN(end.getTime()) && (!maxDate || end > maxDate)) maxDate = end;
      }
    });
    return { minDate: minDate, maxDate: maxDate };
  }

  function updateWorkspaceMeta(visibleTree, selectedTaskUid) {
    var el = state.getEl();
    var tasks = state.getTasks();
    var completedCount = tasks.filter(function(task) { return task.status === 'complete'; }).length;
    var bounds = getPlanBounds(tasks);
    var dateRange = bounds.minDate && bounds.maxDate
      ? prettyDate(bounds.minDate) + ' - ' + prettyDate(bounds.maxDate)
      : 'No scheduled dates';
    if (el.projectMeta) {
      el.projectMeta.textContent = tasks.length + ' task' + (tasks.length === 1 ? '' : 's') +
        ' • ' + completedCount + ' complete • ' + dateRange;
    }
    if (el.taskCountBadge) {
      el.taskCountBadge.textContent = visibleTree.length + ' visible';
    }
    if (el.timelineSummaryBadge) {
      var selectedTask = tasks.find(function(task) { return task.uid === selectedTaskUid; });
      el.timelineSummaryBadge.textContent = selectedTask ? selectedTask.name : 'Plan view';
    }
  }

  function setSelectedTask(uid) {
    state.setSelectedTaskUid(uid || null);
  }

  var ICON_LOCK = '<span class="mode-icon mode-icon-lock" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>';
  var ICON_UNLOCK = '<span class="mode-icon mode-icon-unlock" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 5-5h0a5 5 0 0 1 4 2"/></svg></span>';

  function updateModeUi() {
    var el = state.getEl();
    var editMode = state.isEditMode();
    var employeeId = state.getEmployeeId();
    var lock = state.getEditLock();
    var lockedByOther = lock && lock.locked && lock.employee_id && lock.employee_id !== employeeId;
    var lockedBySelf = lock && lock.locked && lock.employee_id && lock.employee_id === employeeId;
    if (el.workspaceModeIndicator) {
      var indIcon = (editMode || lockedBySelf) ? ICON_UNLOCK : ICON_LOCK;
      var indText = editMode
        ? ('Editing • ' + employeeId)
        : lockedByOther
          ? ('Locked by ' + lock.employee_id)
          : lockedBySelf
            ? ('Your lock • ' + employeeId)
            : 'Read only';
      el.workspaceModeIndicator.innerHTML = indIcon + '<span class="mode-text">' + indText + '</span>';
      el.workspaceModeIndicator.classList.toggle('is-edit', editMode);
    }
    if (el.workspaceModeToggle) {
      var btnIcon = editMode ? ICON_LOCK : ICON_UNLOCK;
      var btnText = editMode
        ? 'Release Lock'
        : lockedByOther
          ? ('Take Lock from ' + lock.employee_id)
          : lockedBySelf
            ? 'Resume editing'
            : 'Lock for Editing';
      el.workspaceModeToggle.innerHTML = btnIcon + '<span class="btn-text">' + btnText + '</span>';
    }
    if (el.btnTimelineEdit) {
      var canTimelineEdit = !!editMode && !!lockedBySelf;
      el.btnTimelineEdit.disabled = !canTimelineEdit;
      el.btnTimelineEdit.classList.toggle('is-active', canTimelineEdit && state.isTimelineEditMode());
      var tlIcon = (canTimelineEdit && state.isTimelineEditMode()) ? ICON_UNLOCK : ICON_LOCK;
      var tlText = state.isTimelineEditMode() ? 'Timeline editing on' : 'Timeline edit';
      el.btnTimelineEdit.innerHTML = tlIcon + '<span class="btn-text">' + tlText + '</span>';
    }
    if (el.ganttTimelineEditHint) {
      var showHint = !!editMode && !!lockedBySelf && state.isTimelineEditMode();
      el.ganttTimelineEditHint.hidden = !showHint;
    }
    if (el.btnImport) {
      var showImport = !!editMode && !!lockedBySelf;
      el.btnImport.hidden = !showImport;
      el.btnImport.disabled = !showImport;
    }
    if (el.btnAddTopLevelTask) {
      var showAddTopLevel = !!editMode && !!lockedBySelf;
      el.btnAddTopLevelTask.hidden = !showAddTopLevel;
      el.btnAddTopLevelTask.disabled = !showAddTopLevel;
    }
  }

  function updateServerIndicatorUi() {
    var indicator = (state.getEl().workspaceServerIndicator) || document.getElementById('workspace-server-indicator');
    if (!indicator) return;
    var label = serverConnectionState === 'online'
      ? 'Online'
      : serverConnectionState === 'offline'
        ? 'Offline'
        : 'Checking server...';
    indicator.textContent = label;
    indicator.setAttribute('aria-label', 'Server status: ' + label);
    indicator.classList.toggle('is-online', serverConnectionState === 'online');
    indicator.classList.toggle('is-offline', serverConnectionState === 'offline');
    indicator.classList.toggle('is-unknown', serverConnectionState === 'unknown');
  }

  function setServerConnectionState(nextState) {
    var previousState = serverConnectionState;
    if (previousState === nextState) return;
    serverConnectionState = nextState;
    updateServerIndicatorUi();
    if (nextState === 'offline') {
      showToast('Server connection lost', true);
      return;
    }
    if (nextState === 'online' && previousState === 'offline') {
      showToast('Server connection restored');
    }
  }

  function normalizeEmployeeId(value) {
    var trimmed = (value || '').trim();
    if (!EMPLOYEE_ID_RE.test(trimmed)) return '';
    return trimmed.slice(0, 2).toUpperCase() + trimmed.slice(2);
  }

  function promptForEmployeeId(onDone) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>Enter employee ID</h2>' +
        '<div class="field">' +
          '<label for="employee-id-input">Employee ID</label>' +
          '<input type="text" id="employee-id-input" placeholder="e.g. AB12345" autofocus />' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-secondary btn-employee-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary btn-employee-save">Continue</button>' +
        '</div>' +
      '</div>';
    var input = overlay.querySelector('#employee-id-input');
    function close(result) {
      overlay.remove();
      if (onDone) onDone(result || '');
    }
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close('');
    });
    overlay.querySelector('.btn-employee-cancel').addEventListener('click', function() { close(''); });
    overlay.querySelector('.btn-employee-save').addEventListener('click', function() {
      var value = normalizeEmployeeId(input.value || '');
      if (!value) {
        showToast('Employee ID must match format AA12345', true);
        input.focus();
        return;
      }
      close(value);
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') overlay.querySelector('.btn-employee-save').click();
      if (e.key === 'Escape') close('');
    });
    document.body.appendChild(overlay);
    setTimeout(function() { input.focus(); }, 50);
  }

  function rerenderDetailIfOpen() {
    var el = state.getEl();
    if (el.taskDetailModal && el.taskDetailModal.classList.contains('visible')) {
      detail.renderDetail({ mergeAndRender: mergeAndRender, refreshAll: refreshAll });
    }
  }

  function setEditMode(enabled) {
    var changed = state.isEditMode() !== !!enabled;
    state.setEditMode(enabled);
    if (!enabled) state.setTimelineEditMode(false);
    updateModeUi();
    if (changed) {
      render();
      rerenderDetailIfOpen();
    }
  }

  function applyLockState(lock) {
    var currentEmployeeId = state.getEmployeeId();
    var previousLock = state.getEditLock();
    var previousEditMode = state.isEditMode();
    state.setEditLock(lock);
    if (state.isEditMode() && (!lock.locked || lock.employee_id !== currentEmployeeId)) {
      state.setEditMode(false);
      state.setTimelineEditMode(false);
      if (!hasShownLockLostToast) {
        showToast(lock.locked ? ('Edit mode taken by ' + lock.employee_id) : 'Edit mode unlocked', true);
        hasShownLockLostToast = true;
      }
    } else if (lock.locked && lock.employee_id === currentEmployeeId) {
      hasShownLockLostToast = false;
    } else if (!previousLock.locked || previousLock.employee_id !== lock.employee_id) {
      hasShownLockLostToast = false;
    }
    updateModeUi();
    var lockChanged =
      previousLock.locked !== lock.locked ||
      previousLock.employee_id !== lock.employee_id ||
      previousEditMode !== state.isEditMode();
    if (lockChanged) {
      render();
      rerenderDetailIfOpen();
    }
  }

  var LOCK_POLL_FAST_MS = 5000;
  var LOCK_POLL_SLOW_MS = 25000;
  var LOCK_POLL_RETRY_MS = 15000;
  var lockPollInFlight = false;
  function pollEditLock() {
    if (lockPollInFlight) return;
    lockPollInFlight = true;
    api.getEditLock()
      .then(function(lock) {
        hasShownLockPollErrorToast = false;
        applyLockState(lock);
        var hasOurLock = lock && lock.locked && lock.employee_id === state.getEmployeeId();
        scheduleNextLockPoll(hasOurLock ? LOCK_POLL_FAST_MS : LOCK_POLL_SLOW_MS);
      })
      .catch(function(e) {
        if (e && e.status && !e.isConnectionError && !hasShownLockPollErrorToast) {
          showToast(e.message || 'Unable to check edit lock', true);
          hasShownLockPollErrorToast = true;
        }
        scheduleNextLockPoll(LOCK_POLL_RETRY_MS);
      })
      .finally(function() {
        lockPollInFlight = false;
      });
  }
  function scheduleNextLockPoll(interval) {
    if (lockPollTimer) {
      window.clearTimeout(lockPollTimer);
      lockPollTimer = null;
    }
    lockPollTimer = window.setTimeout(function() {
      lockPollTimer = null;
      pollEditLock();
    }, interval);
  }

  function startLockPolling() {
    if (lockPollTimer) return;
    pollEditLock();
  }

  function ensureEditAccess(onReady, onDenied) {
    var lock = state.getEditLock();
    var employeeId = state.getEmployeeId();
    if (!state.isEditMode() || !lock.locked || lock.employee_id !== employeeId) {
      showToast('Switch to edit mode to make changes', true);
      if (onDenied) onDenied();
      return;
    }
    if (employeeId) {
      onReady(employeeId);
      return;
    }
    promptForEmployeeId(function(value) {
      if (!value) {
        if (onDenied) onDenied();
        return;
      }
      state.setEmployeeId(value);
      updateModeUi();
      onReady(value);
    });
  }

  function acquireLock(employeeId, force) {
    return api.acquireEditLock({ employee_id: employeeId, force: !!force })
      .then(function(lock) {
        applyLockState(lock);
        setEditMode(true);
        return lock;
      })
      .catch(function(e) {
        if (e.status === 409 && e.data && e.data.employee_id) {
          applyLockState({
            locked: true,
            employee_id: e.data.employee_id,
            locked_at: e.data.locked_at || null,
            updated_at: e.data.locked_at || null
          });
        }
        throw e;
      });
  }

  function releaseLock(employeeId, force) {
    return api.releaseEditLock({ employee_id: employeeId, force: !!force })
      .then(function(lock) {
        applyLockState(lock);
        setEditMode(false);
        return lock;
      });
  }

  function toggleMode() {
    var employeeId = state.getEmployeeId();

    if (state.isEditMode()) {
      releaseLock(employeeId, false)
        .catch(function(e) { showToast(e.message || 'Unable to unlock edit mode', true); });
      return;
    }

    function continueWithEmployeeId(value) {
      if (!value) return;
      state.setEmployeeId(value);
      var lock = state.getEditLock();
      if (lock.locked && lock.employee_id && lock.employee_id !== value) {
        if (!window.confirm('Edit mode is currently locked by ' + lock.employee_id + '. Take over the lock?')) return;
        acquireLock(value, true)
          .catch(function(e) { showToast(e.message || 'Unable to take edit lock', true); });
        return;
      }
      acquireLock(value, false)
        .catch(function(e) { showToast(e.message || 'Unable to enable edit mode', true); });
    }

    if (employeeId) {
      continueWithEmployeeId(employeeId);
      return;
    }

    promptForEmployeeId(continueWithEmployeeId);
  }

  function getFilteredTree(tree) {
    var domainUid = state.getSelectedDomainUid();
    var scopedTree = tree;
    if (domainUid && domainUid !== 'all') {
      var startIndex = -1;
      for (var i = 0; i < tree.length; i++) {
        if (tree[i].uid === domainUid) {
          startIndex = i;
          break;
        }
      }
      if (startIndex !== -1) {
        var rootDepth = tree[startIndex].depth;
        scopedTree = [];
        for (var j = startIndex; j < tree.length; j++) {
          var scopedTask = tree[j];
          if (j > startIndex && scopedTask.depth <= rootDepth) break;
          scopedTree.push(scopedTask);
        }
      }
    }

    var selectedAccountable = state.getSelectedAccountable();
    var selectedResponsible = state.getSelectedResponsible();
    var selectedRag = state.getSelectedRag();
    var selectedStatus = state.getSelectedStatus();
    if (selectedAccountable === 'all' && selectedResponsible === 'all' && selectedRag === 'all' && selectedStatus === 'all') {
      return scopedTree;
    }

    var byUid = {};
    scopedTree.forEach(function(task) { byUid[task.uid] = task; });
    var included = {};
    scopedTree.forEach(function(task) {
      var rag = state.getTaskRag()[task.uid] || 'none';
      var matches =
        (selectedAccountable === 'all' || (task.accountable_person || '__unassigned__') === selectedAccountable) &&
        (selectedResponsible === 'all' || (task.responsible_party || '__unassigned__') === selectedResponsible) &&
        (selectedRag === 'all' || rag === selectedRag) &&
        (selectedStatus === 'all' || (task.status || 'not_started') === selectedStatus);
      if (!matches) return;
      var current = task;
      while (current) {
        included[current.uid] = true;
        current = current.parent_task_uid ? byUid[current.parent_task_uid] : null;
      }
    });
    return scopedTree.filter(function(task) { return included[task.uid]; });
  }

  function getFocusTree(tree) {
    var focusedTaskUid = state.getFocusedTaskUid();
    if (!focusedTaskUid) {
      return { tree: tree, focusTask: null };
    }
    var focusIndex = -1;
    var byUid = {};
    tree.forEach(function(task, index) {
      byUid[task.uid] = task;
      if (task.uid === focusedTaskUid) focusIndex = index;
    });
    if (focusIndex === -1) {
      return { tree: tree, focusTask: null };
    }
    var focusTask = tree[focusIndex];
    var included = {};
    var current = focusTask;
    while (current) {
      included[current.uid] = true;
      current = current.parent_task_uid ? byUid[current.parent_task_uid] : null;
    }
    for (var i = focusIndex + 1; i < tree.length; i++) {
      var candidate = tree[i];
      if (candidate.depth <= focusTask.depth) break;
      included[candidate.uid] = true;
    }
    return {
      tree: tree.filter(function(task) { return !!included[task.uid]; }),
      focusTask: focusTask
    };
  }

  function updateDomainOptions(tree) {
    var el = state.getEl();
    if (!el.domainFilterSelect) return;
    var roots = tree.filter(function(task) { return task.depth === 0; });
    var current = state.getSelectedDomainUid();
    el.domainFilterSelect.innerHTML = '<option value="all">All domains</option>' + roots.map(function(task) {
      return '<option value="' + escapeHtml(task.uid) + '">' + escapeHtml(task.name) + '</option>';
    }).join('');
    if (current !== 'all' && !roots.some(function(task) { return task.uid === current; })) {
      current = 'all';
      state.setSelectedDomainUid('all');
    }
    el.domainFilterSelect.value = current || 'all';
  }

  function updateTaskFilterOptions(tasks, taskRagMap) {
    var el = state.getEl();

    function uniqueSorted(values) {
      return Array.from(new Set(values)).sort(function(a, b) {
        return a.localeCompare(b);
      });
    }

    function renderOptions(selectEl, allLabel, values, formatter) {
      if (!selectEl) return;
      var current = selectEl.value || 'all';
      selectEl.innerHTML = '<option value="all">' + allLabel + '</option>' + values.map(function(value) {
        return '<option value="' + escapeHtml(value) + '">' + escapeHtml(formatter ? formatter(value) : value) + '</option>';
      }).join('');
      if (!values.some(function(value) { return value === current; })) current = 'all';
      selectEl.value = current;
    }

    var accountableValues = uniqueSorted(tasks.map(function(task) { return task.accountable_person || '__unassigned__'; }));
    var responsibleValues = uniqueSorted(tasks.map(function(task) { return task.responsible_party || '__unassigned__'; }));
    var ragValues = uniqueSorted(tasks.map(function(task) { return taskRagMap[task.uid] || 'none'; }));
    var statusValues = uniqueSorted(tasks.map(function(task) { return task.status || 'not_started'; }));

    renderOptions(el.accountableFilterSelect, 'All accountable', accountableValues, function(value) {
      return value === '__unassigned__' ? 'Unassigned' : value;
    });
    renderOptions(el.responsibleFilterSelect, 'All responsible', responsibleValues, function(value) {
      return value === '__unassigned__' ? 'Unassigned' : value;
    });
    renderOptions(el.ragFilterSelect, 'All RAG', ragValues, function(value) {
      return value === 'none' ? 'No RAG' : Gantt.utils.titleCaseStatus(value);
    });
    renderOptions(el.statusFilterSelect, 'All status', statusValues, function(value) {
      return Gantt.utils.titleCaseStatus(value);
    });

    state.setSelectedAccountable(el.accountableFilterSelect ? el.accountableFilterSelect.value : 'all');
    state.setSelectedResponsible(el.responsibleFilterSelect ? el.responsibleFilterSelect.value : 'all');
    state.setSelectedRag(el.ragFilterSelect ? el.ragFilterSelect.value : 'all');
    state.setSelectedStatus(el.statusFilterSelect ? el.statusFilterSelect.value : 'all');
  }

  function updateTaskFilterUi(focusTask) {
    var el = state.getEl();
    var count = 0;
    var filters = [
      { value: state.getSelectedAccountable(), element: el.accountableFilterSelect, label: 'accountable' },
      { value: state.getSelectedResponsible(), element: el.responsibleFilterSelect, label: 'responsible' },
      { value: state.getSelectedRag(), element: el.ragFilterSelect, label: 'RAG' },
      { value: state.getSelectedStatus(), element: el.statusFilterSelect, label: 'status' }
    ];
    var activeLabels = [];
    filters.forEach(function(filter) {
      var active = filter.value !== 'all';
      if (active) {
        count += 1;
        activeLabels.push(filter.label);
      }
      if (filter.element) filter.element.classList.toggle('is-active-filter', active);
    });
    if (el.domainFilterSelect) {
      el.domainFilterSelect.classList.toggle('is-active-filter', state.getSelectedDomainUid() !== 'all');
    }
    if (el.btnClearFilters) {
      el.btnClearFilters.disabled = count === 0;
      el.btnClearFilters.textContent = count === 0 ? 'Clear filters' : ('Clear ' + count + ' filter' + (count === 1 ? '' : 's'));
    }
    if (el.taskFilterSummary) {
      var summaryParts = [];
      if (count > 0) summaryParts.push('Filtered by ' + activeLabels.join(', '));
      if (focusTask) summaryParts.push('Focused on ' + focusTask.name);
      var fullSummary = summaryParts.length ? summaryParts.join(' • ') : 'All filters off';
      el.taskFilterSummary.textContent = fullSummary;
      el.taskFilterSummary.title = fullSummary;
      el.taskFilterSummary.classList.toggle('is-active', count > 0 || !!focusTask);
    }
    if (el.taskTableWrap) {
      el.taskTableWrap.classList.toggle('has-active-filters', count > 0 || state.getSelectedDomainUid() !== 'all' || !!focusTask);
    }
    var toolbar = document.querySelector('.task-panel-toolbar');
    if (toolbar) {
      toolbar.classList.toggle('has-active-filters', count > 0 || state.getSelectedDomainUid() !== 'all' || !!focusTask);
    }
  }

  function updateFocusButton(selectedTaskUid, focusTask) {
    var el = state.getEl();
    if (!el.btnFocusTask) return;
    var tasks = state.getTasks();
    var selectedTask = tasks.find(function(task) { return task.uid === selectedTaskUid; }) || null;
    if (focusTask) {
      el.btnFocusTask.disabled = false;
      el.btnFocusTask.textContent = 'Exit focus';
      el.btnFocusTask.title = 'Show the full task tree again';
      el.btnFocusTask.classList.add('is-active');
      return;
    }
    el.btnFocusTask.disabled = !selectedTask;
    el.btnFocusTask.textContent = 'Focus selected';
    el.btnFocusTask.title = selectedTask
      ? ('Show only ' + selectedTask.name + ', its ancestors, and children')
      : 'Select a task to focus it';
    el.btnFocusTask.classList.remove('is-active');
  }

  function clearTaskFilters() {
    var el = state.getEl();
    state.setSelectedAccountable('all');
    state.setSelectedResponsible('all');
    state.setSelectedRag('all');
    state.setSelectedStatus('all');
    if (el.accountableFilterSelect) el.accountableFilterSelect.value = 'all';
    if (el.responsibleFilterSelect) el.responsibleFilterSelect.value = 'all';
    if (el.ragFilterSelect) el.ragFilterSelect.value = 'all';
    if (el.statusFilterSelect) el.statusFilterSelect.value = 'all';
    render();
  }

  function toggleFocusMode() {
    var focusedTaskUid = state.getFocusedTaskUid();
    if (focusedTaskUid) {
      state.setFocusedTaskUid(null);
      render();
      return;
    }
    var selectedTaskUid = state.getSelectedTaskUid();
    if (!selectedTaskUid) {
      showToast('Select a task to focus it', true);
      return;
    }
    state.setFocusedTaskUid(selectedTaskUid);
    render();
    requestAnimationFrame(function() {
      centerSelectedTaskRow();
      scrollTimelineToSelectedBar();
    });
  }

  function openTaskDetail(uid) {
    setSelectedTask(uid);
    render();
    detail.renderDetail({ mergeAndRender: mergeAndRender, refreshAll: refreshAll });
  }

  function showBarContextMenu(taskUid, event, isTimelineEdit) {
    var existing = document.getElementById('gantt-bar-context-menu');
    if (existing) existing.remove();
    var menu = document.createElement('div');
    menu.id = 'gantt-bar-context-menu';
    menu.className = 'gantt-bar-context-menu';
    menu.style.cssText = 'position:fixed;left:' + event.clientX + 'px;top:' + event.clientY + 'px;z-index:10000;min-width:180px;padding:4px 0;background:rgba(20,26,38,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    var items = [
      { label: 'Open task detail', action: function() { openTaskDetail(taskUid); } },
      { label: 'Edit dates', action: function() { openTaskDetail(taskUid); } }
    ];
    if (isTimelineEdit) {
      items.push({ label: 'Create dependency from here', action: function() {
        showToast('Drag from the blue dot on the right edge to another task\'s left dot to create a dependency');
      } });
    }
    items.forEach(function(item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gantt-context-menu-item';
      btn.textContent = item.label;
      btn.style.cssText = 'display:block;width:100%;padding:8px 14px;border:none;background:transparent;color:rgba(255,255,255,0.9);text-align:left;font-size:0.85rem;cursor:pointer;';
      btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(255,255,255,0.08)'; });
      btn.addEventListener('mouseleave', function() { btn.style.background = 'transparent'; });
      btn.addEventListener('click', function() {
        item.action();
        menu.remove();
        document.removeEventListener('click', closeMenu);
      });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (event.clientX - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (event.clientY - rect.height) + 'px';
    function closeMenu() {
      if (menu.parentNode) menu.remove();
      document.removeEventListener('click', closeMenu);
    }
    requestAnimationFrame(function() { document.addEventListener('click', closeMenu); });
  }

  function saveQuickEdit(task, field, values) {
    var prevTask = null;
    var prevRag = null;
    if (field === 'rag') {
      prevRag = state.getTaskRag()[task.uid];
      state.mergeTaskRag(task.uid, values.status);
      mergeAndRender();
      return api.postRag(task.uid, values).then(function(rag) {
        state.mergeTaskRag(task.uid, rag.status);
        showToast('RAG updated');
        mergeAndRender();
        return rag;
      }).catch(function(e) {
        state.mergeTaskRag(task.uid, prevRag || null);
        mergeAndRender();
        showToast(e.message || 'Unable to save RAG', true);
      });
    }
    prevTask = state.getTasks().find(function(t) { return t.uid === task.uid; });
    if (prevTask) prevTask = Object.assign({}, prevTask);
    state.mergeTask(Object.assign({}, task, values));
    mergeAndRender();
    return api.patchTask(task.uid, values).then(function(updatedTask) {
      state.mergeTask(updatedTask);
      showToast((field === 'progress' ? 'Progress' : 'Task') + ' updated');
      mergeAndRender();
      return updatedTask;
    }).catch(function(e) {
      if (prevTask) state.mergeTask(prevTask);
      mergeAndRender();
      showToast(e.message || 'Unable to save', true);
    });
  }

  function centerTimelineOnToday() {
    var el = state.getEl();
    var wrap = el.ganttScrollWrap;
    var inner = el.ganttTimelineInner;
    if (!wrap || !inner) return;
    var totalWidth = parseInt(inner.getAttribute('data-total-width'), 10);
    var todayPx = parseInt(inner.getAttribute('data-today-px'), 10);
    if (isNaN(totalWidth) || isNaN(todayPx)) return;
    var scrollLeft = Math.max(0, todayPx - wrap.clientWidth / 2);
    wrap.scrollTo({
      left: Math.min(scrollLeft, Math.max(0, totalWidth - wrap.clientWidth)),
      behavior: 'smooth'
    });
  }

  function centerSelectedTaskRow() {
    var el = state.getEl();
    var selectedUid = state.getSelectedTaskUid();
    if (!selectedUid || !el.taskTbody || !el.taskTableWrap) return;
    var row = el.taskTbody.querySelector('tr[data-uid="' + selectedUid + '"]');
    if (!row) return;
    var targetTop = Math.max(0, row.offsetTop - (el.taskTableWrap.clientHeight / 2) + (row.offsetHeight / 2));
    el.taskTableWrap.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  function scrollTimelineToSelectedBar() {
    var el = state.getEl();
    var selectedUid = state.getSelectedTaskUid();
    if (!selectedUid || !el.ganttBody || !el.ganttScrollWrap) return;
    var row = el.ganttBody.querySelector('.gantt-row[data-uid="' + selectedUid + '"]');
    if (!row) return;
    var bar = row.querySelector('.bar');
    if (!bar) return;
    var barLeft = parseFloat(bar.style.left) || 0;
    var barWidth = bar.offsetWidth || 48;
    var wrap = el.ganttScrollWrap;
    var scrollLeft = wrap.scrollLeft;
    var clientWidth = wrap.clientWidth;
    var padding = 24;
    var barRight = barLeft + barWidth;
    var viewRight = scrollLeft + clientWidth;
    var targetScroll = scrollLeft;
    if (barLeft < scrollLeft + padding) {
      targetScroll = Math.max(0, barLeft - padding);
    } else if (barRight > viewRight - padding) {
      targetScroll = Math.min(wrap.scrollWidth - clientWidth, barRight - clientWidth + padding);
    }
    if (targetScroll !== scrollLeft) {
      wrap.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }

  var LOAD_TIMEOUT_MS = 15000;
  function getApiLabel() {
    return (api && api.getApiBaseUrl && api.getApiBaseUrl()) || window.location.origin || 'http://127.0.0.1:8000';
  }
  function refreshAll() {
    setLoading(true);
    var loadTimeout = window.setTimeout(function() {
      if (serverConnectionState === 'unknown') {
        setServerConnectionState('offline');
        var meta = (state.getEl().projectMeta) || document.getElementById('project-meta');
        if (meta) meta.textContent = 'Load timed out. Is the server running at ' + getApiLabel() + '?';
      }
    }, LOAD_TIMEOUT_MS);
    return api.getProject()
      .then(function(p) {
        setServerConnectionState('online');
        state.setProject(p);
        var el = state.getEl();
        if (el.projectTitle) el.projectTitle.textContent = p.name || 'Gantt';
        var meta = el.projectMeta || document.getElementById('project-meta');
        if (meta) {
          meta.textContent = '';
          meta.classList.remove('load-failed');
        }
        return api.getTasks();
      })
      .then(function(t) {
        state.setTasks(Array.isArray(t) ? t : []);
        return api.getDependencies();
      })
      .then(function(d) {
        state.setDependencies(Array.isArray(d) ? d : []);
        state.setTaskRag({});
        render();
        setupScrollSync();
        requestAnimationFrame(function() {
          forceScrollSync();
          if (!hasCenteredInitialView) {
            centerTimelineOnToday();
            hasCenteredInitialView = true;
          }
        });
        setLoading(false);
        updateServerIndicatorUi();
        return api.getBulkRag();
      })
      .then(function(bulkRag) {
        var taskRagMap = {};
        if (bulkRag && typeof bulkRag === 'object') {
          Object.keys(bulkRag).forEach(function(taskUid) {
            var rag = bulkRag[taskUid];
            if (rag && rag.length) {
              taskRagMap[taskUid] = rag[rag.length - 1].status;
              if (Gantt.ragTooltip && Gantt.ragTooltip.setCache) {
                Gantt.ragTooltip.setCache(taskUid, rag);
              }
            }
          });
        }
        state.setTaskRag(taskRagMap);
        render();
        setupScrollSync();
        rerenderDetailIfOpen();
        requestAnimationFrame(forceScrollSync);
      })
      .catch(function(e) {
        setServerConnectionState('offline');
        var isTimeout = e && e.name === 'AbortError';
        var msg = isTimeout
          ? 'Request timed out. Is the server running?'
          : (e && (e.message || (e.data && (e.data.message || (e.data.detail && (typeof e.data.detail === 'string' ? e.data.detail : e.data.detail.message)))))) || 'Load failed';
        var projectMeta = (state.getEl().projectMeta) || document.getElementById('project-meta');
        if (projectMeta) {
          var hint = 'Is the server running at ' + getApiLabel() + '?';
          projectMeta.textContent = 'Failed to load. ' + (e && e.status ? ('Error ' + e.status + ': ' + msg) : (isTimeout ? msg : hint)) + ' Click to retry.';
          projectMeta.classList.add('load-failed');
          projectMeta.setAttribute('role', 'button');
          projectMeta.setAttribute('tabindex', '0');
        }
        if (e && e.status && !e.isConnectionError) {
          showToast(msg, true);
        } else if (!e || !e.status) {
          showToast('Cannot reach server. Is it running at ' + getApiLabel() + '?', true);
        }
      })
      .finally(function() {
        window.clearTimeout(loadTimeout);
        setLoading(false);
      });
  }

  function startLockPollingAfterLoad() {
    refreshAll().then(startLockPolling).catch(startLockPolling);
  }

  function mergeAndRender() {
    render();
    setupScrollSync();
    rerenderDetailIfOpen();
    requestAnimationFrame(forceScrollSync);
  }

  function render() {
    var tasks = state.getTasks();
    var taskRag = state.getTaskRag();
    var tree = state.buildTaskTree(tasks);
    updateDomainOptions(tree);
    updateTaskFilterOptions(tasks, taskRag);
    var filteredTree = getFilteredTree(tree);
    var focusState = getFocusTree(filteredTree);
    if (state.getFocusedTaskUid() && !focusState.focusTask) {
      state.setFocusedTaskUid(null);
      focusState = { tree: filteredTree, focusTask: null };
    }
    var focusTree = focusState.tree;
    var visibleTree = focusState.focusTask ? focusTree : state.getVisibleTree(focusTree);
    var hasChildren = state.getHasChildren(focusTree);
    var el = state.getEl();
    var selectedTaskUid = state.getSelectedTaskUid();

    if (selectedTaskUid && !visibleTree.some(function(task) { return task.uid === selectedTaskUid; })) {
      selectedTaskUid = null;
      setSelectedTask(null);
      detail.closeTaskModal();
    }
    if (!selectedTaskUid && visibleTree.length) {
      selectedTaskUid = visibleTree[0].uid;
      setSelectedTask(selectedTaskUid);
    }

    updateTaskFilterUi(focusState.focusTask);
    updateFocusButton(selectedTaskUid, focusState.focusTask);
    updateWorkspaceMeta(visibleTree, selectedTaskUid);
    updateModeUi();

    lastVisibleTreeLength = visibleTree.length;
    var viewport = getViewport(visibleTree.length);
    var treeToRender = viewport
      ? visibleTree.slice(viewport.start, viewport.end)
      : visibleTree;

    table.render(visibleTree, treeToRender, viewport, taskRag, selectedTaskUid, hasChildren, function(uid) {
      return focusState.focusTask ? true : state.isExpanded(uid);
    }, function(uid) {
      setSelectedTask(uid);
      render();
      requestAnimationFrame(function() {
        centerSelectedTaskRow();
        scrollTimelineToSelectedBar();
      });
    }, function(uid) {
      if (focusState.focusTask) return;
      state.toggleCollapsed(uid);
      render();
    }, function(uid) {
      openTaskDetail(uid);
    }, function(uid) {
      ensureEditAccess(function() {
        detail.showTaskModal('Add subtask', uid, function(name) {
          var parent = tasks.find(function(t) { return t.uid === uid; });
          var startDate = (parent && parent.start_date) ? parent.start_date : new Date().toISOString().slice(0, 10);
          var start = new Date(startDate);
          var end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          var endDate = end.toISOString().slice(0, 10);
          var payload = { name: name, parent_task_uid: uid, start_date: startDate, end_date: endDate };
          api.postTask(payload)
            .then(function(createdTask) {
              state.addTask(createdTask);
              showToast('Subtask added');
              mergeAndRender();
            })
            .catch(function(e) { showToast(e.message, true); });
        });
      });
    }, saveQuickEdit, function(taskUid, commentText) {
      return new Promise(function(resolve, reject) {
        ensureEditAccess(
          function(authorId) {
            api.postComment(taskUid, { author: authorId, comment_text: commentText })
              .then(function() { mergeAndRender(); resolve(); })
              .catch(reject);
          },
          function() { reject(new Error('Edit access denied')); }
        );
      });
    });

    var isTimelineEdit = state.isTimelineEditMode() && state.isEditMode();
    var lock = state.getEditLock();
    var hasEditLock = lock && lock.locked && lock.employee_id === state.getEmployeeId();
    gantt.render(visibleTree, treeToRender, viewport, taskRag, selectedTaskUid, function(uid) {
      setSelectedTask(uid);
      render();
    }, function(uid) {
      openTaskDetail(uid);
    }, isTimelineEdit && hasEditLock, function(taskUid, startDate, endDate) {
      ensureEditAccess(function() {
        api.patchTask(taskUid, { start_date: startDate, end_date: endDate })
          .then(function(updatedTask) {
            state.mergeTask(updatedTask);
            showToast('Dates updated');
            mergeAndRender();
          })
          .catch(function(e) { showToast(e.message, true); });
      });
    }, function(predecessorUid, successorUid) {
      ensureEditAccess(function() {
        var deps = state.getDependencies();
        var exists = deps.some(function(d) { return d.predecessor_task_uid === predecessorUid && d.successor_task_uid === successorUid; });
        if (exists) {
          showToast('Dependency already exists', true);
          return;
        }
        api.postDependency({ predecessor_task_uid: predecessorUid, successor_task_uid: successorUid, dependency_type: 'FS' })
          .then(function(dep) {
            state.addDependency(dep);
            var successorTask = tasks.find(function(t) { return t.uid === successorUid; });
            var predecessorTask = tasks.find(function(t) { return t.uid === predecessorUid; });
            if (successorTask && predecessorTask && (!successorTask.start_date || !successorTask.end_date)) {
              var predEnd = predecessorTask.end_date ? new Date(predecessorTask.end_date) : new Date();
              var startStr = predEnd.toISOString().slice(0, 10);
              var endDate = new Date(predEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
              var endStr = endDate.toISOString().slice(0, 10);
              return api.patchTask(successorUid, { start_date: startStr, end_date: endStr })
                .then(function(updatedTask) {
                  state.mergeTask(updatedTask);
                  showToast('Dependency added and task scheduled');
                  mergeAndRender();
                })
                .catch(function(e) {
                  showToast(e.message || 'Could not schedule task', true);
                  mergeAndRender();
                });
            }
            showToast('Dependency added');
            mergeAndRender();
          })
          .catch(function(e) { showToast(e.message, true); });
      });
    }, function(taskUid, event, isTimelineEdit) {
      showBarContextMenu(taskUid, event, isTimelineEdit);
    });
    if (el.ganttZoomSelect) el.ganttZoomSelect.value = state.getTimelineZoom();
    requestAnimationFrame(forceScrollSync);
  }

  function run() {
    var el = state.getEl();
    if (api.setConnectionListener) {
      api.setConnectionListener(setServerConnectionState);
    }
    var projectMetaEl = el.projectMeta || document.getElementById('project-meta');
    if (projectMetaEl) {
      projectMetaEl.addEventListener('click', function() {
        if (projectMetaEl.classList.contains('load-failed')) {
          projectMetaEl.classList.remove('load-failed');
          projectMetaEl.removeAttribute('role');
          projectMetaEl.removeAttribute('tabindex');
          projectMetaEl.textContent = 'Loading project plan...';
          startLockPollingAfterLoad();
        }
      });
      projectMetaEl.addEventListener('keydown', function(ev) {
        if (projectMetaEl.classList.contains('load-failed') && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault();
          projectMetaEl.click();
        }
      });
    }
    var normalizedStoredEmployeeId = normalizeEmployeeId(state.getEmployeeId());
    if (state.getEmployeeId() && !normalizedStoredEmployeeId) {
      state.setEmployeeId('');
      state.setEditMode(false);
      state.setTimelineEditMode(false);
    } else if (normalizedStoredEmployeeId && normalizedStoredEmployeeId !== state.getEmployeeId()) {
      state.setEmployeeId(normalizedStoredEmployeeId);
    }

    var btnAddTopLevelTask = el.btnAddTopLevelTask;
    if (btnAddTopLevelTask) {
      btnAddTopLevelTask.addEventListener('click', function() {
        ensureEditAccess(function() {
          var detail = Gantt.detail;
          if (!detail || !detail.showTaskModal) return;
          detail.showTaskModal('Add top-level task', null, function(name) {
            var today = new Date();
            var startDate = today.toISOString().slice(0, 10);
            var end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
            var endDate = end.toISOString().slice(0, 10);
            var payload = { name: name, parent_task_uid: null, start_date: startDate, end_date: endDate };
            api.postTask(payload)
              .then(function(createdTask) {
                state.addTask(createdTask);
                showToast('Top-level task added');
                mergeAndRender();
              })
              .catch(function(e) { showToast(e.message, true); });
          });
        });
      });
    }
    var btnExpandAll = document.getElementById('btn-expand-all');
    var btnCollapseAll = document.getElementById('btn-collapse-all');
    if (btnExpandAll) {
      btnExpandAll.addEventListener('click', function() {
        state.expandAll();
        render();
      });
    }
    if (btnCollapseAll) {
      btnCollapseAll.addEventListener('click', function() {
        var tree = state.buildTaskTree(state.getTasks());
        state.collapseAll(tree);
        render();
      });
    }

    if (el.domainFilterSelect) {
      el.domainFilterSelect.addEventListener('change', function() {
        state.setSelectedDomainUid(el.domainFilterSelect.value || 'all');
        debouncedFilterRender();
      });
    }
    if (el.accountableFilterSelect) {
      el.accountableFilterSelect.addEventListener('change', function() {
        state.setSelectedAccountable(el.accountableFilterSelect.value || 'all');
        debouncedFilterRender();
      });
    }
    if (el.responsibleFilterSelect) {
      el.responsibleFilterSelect.addEventListener('change', function() {
        state.setSelectedResponsible(el.responsibleFilterSelect.value || 'all');
        debouncedFilterRender();
      });
    }
    if (el.ragFilterSelect) {
      el.ragFilterSelect.addEventListener('change', function() {
        state.setSelectedRag(el.ragFilterSelect.value || 'all');
        debouncedFilterRender();
      });
    }
    if (el.statusFilterSelect) {
      el.statusFilterSelect.addEventListener('change', function() {
        state.setSelectedStatus(el.statusFilterSelect.value || 'all');
        debouncedFilterRender();
      });
    }
    if (el.btnClearFilters) {
      el.btnClearFilters.addEventListener('click', clearTaskFilters);
    }
    if (el.btnFocusTask) {
      el.btnFocusTask.addEventListener('click', toggleFocusMode);
    }
    if (el.workspaceModeToggle) {
      el.workspaceModeToggle.addEventListener('click', toggleMode);
    }
    if (el.btnTimelineEdit) {
      el.btnTimelineEdit.addEventListener('click', function() {
        if (!state.isEditMode() || !state.getEditLock().locked || state.getEditLock().employee_id !== state.getEmployeeId()) return;
        state.setTimelineEditMode(!state.isTimelineEditMode());
        updateModeUi();
        render();
      });
    }
    var btnAuditLog = document.getElementById('btn-audit-log');
    if (btnAuditLog && auditLog && auditLog.open) {
      btnAuditLog.addEventListener('click', function() {
        auditLog.open();
      });
    }
    var btnExportReport = document.getElementById('btn-export-report');

    el.btnExport.addEventListener('click', function() {
      window.location.href = api.exportUrl();
      showToast('Export started');
    });
    if (btnExportReport) {
      btnExportReport.addEventListener('click', function() {
        window.location.href = api.exportReportUrl();
        showToast('Report export started');
      });
    }

    el.btnImport.addEventListener('click', function() {
      if (el.fileImport) el.fileImport.click();
    });
    if (el.fileImport) {
      el.fileImport.addEventListener('change', function() {
        var file = el.fileImport.files[0];
        if (!file) return;
        ensureEditAccess(function() {
          var fd = new FormData();
          fd.append('file', file);
          api.importFile(fd)
            .then(function(data) {
              showToast('Imported: ' + data.projects + ' project(s), ' + data.tasks + ' task(s)');
              refreshAll();
              el.fileImport.value = '';
            })
            .catch(function(e) { showToast(e.message || 'Import failed', true); });
        });
      });
    }

    if (el.taskDetailModalClose) {
      el.taskDetailModalClose.addEventListener('click', detail.closeTaskModal);
    }
    if (el.taskDetailModal) {
      var backdrop = el.taskDetailModal.querySelector('.task-detail-modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', detail.closeTaskModal);
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && el.taskDetailModal.classList.contains('visible')) detail.closeTaskModal();
      });
    }

    document.addEventListener('keydown', function(e) {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) return;
      if (el.taskDetailModal && el.taskDetailModal.classList.contains('visible')) return;
      if (active && el.taskDetailModal && el.taskDetailModal.contains(active)) return;
      var tasks = state.getTasks();
      var tree = state.buildTaskTree(tasks);
      var filteredTree = getFilteredTree(tree);
      var focusState = getFocusTree(filteredTree);
      var focusTree = focusState.tree;
      var visibleTree = focusState.focusTask ? focusTree : state.getVisibleTree(focusTree);
      if (!visibleTree.length) return;
      var selectedUid = state.getSelectedTaskUid();
      var idx = selectedUid ? visibleTree.findIndex(function(t) { return t.uid === selectedUid; }) : -1;
      if (e.key === 'ArrowDown' && idx < visibleTree.length - 1) {
        e.preventDefault();
        var nextUid = visibleTree[idx + 1].uid;
        var inGantt = el.ganttScrollWrap && el.ganttScrollWrap.contains(active);
        setSelectedTask(nextUid);
        render();
        requestAnimationFrame(function() {
          centerSelectedTaskRow();
          scrollTimelineToSelectedBar();
          var bar = el.ganttBody && el.ganttBody.querySelector('.gantt-row[data-uid="' + nextUid + '"] .bar');
          var row = el.taskTbody && el.taskTbody.querySelector('tr[data-uid="' + nextUid + '"]');
          if (inGantt && bar) bar.focus();
          else if (row) row.focus();
        });
      } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault();
        var prevUid = visibleTree[idx - 1].uid;
        var inGantt = el.ganttScrollWrap && el.ganttScrollWrap.contains(active);
        setSelectedTask(prevUid);
        render();
        requestAnimationFrame(function() {
          centerSelectedTaskRow();
          scrollTimelineToSelectedBar();
          var bar = el.ganttBody && el.ganttBody.querySelector('.gantt-row[data-uid="' + prevUid + '"] .bar');
          var row = el.taskTbody && el.taskTbody.querySelector('tr[data-uid="' + prevUid + '"]');
          if (inGantt && bar) bar.focus();
          else if (row) row.focus();
        });
      } else if (e.key === 'Enter' && selectedUid) {
        var row = el.taskTbody && el.taskTbody.querySelector('tr[data-uid="' + selectedUid + '"]');
        if (row && (active === document.body || (el.taskTableWrap && el.taskTableWrap.contains(active)) || (el.ganttScrollWrap && el.ganttScrollWrap.contains(active)))) {
          e.preventDefault();
          openTaskDetail(selectedUid);
        }
      }
    });

    function panTimeline(direction) {
      var wrap = el.ganttScrollWrap;
      var inner = el.ganttTimelineInner;
      if (!wrap || !inner) return;
      var pxPerDay = parseInt(inner.getAttribute('data-px-per-day'), 10) || 4;
      var step = Math.max(160, pxPerDay * 14);
      var delta = direction === 'left' ? -step : step;
      wrap.scrollTo({
        left: Math.max(0, wrap.scrollLeft + delta),
        behavior: 'smooth'
      });
    }

    var ZOOM_ORDER = ['years', 'quarters', 'months', 'weeks', 'days'];
    function changeZoom(direction) {
      var current = state.getTimelineZoom();
      var idx = ZOOM_ORDER.indexOf(current);
      if (direction === 'in' && idx < ZOOM_ORDER.length - 1) {
        state.setTimelineZoom(ZOOM_ORDER[idx + 1]);
        render();
        requestAnimationFrame(centerTimelineOnToday);
      } else if (direction === 'out' && idx > 0) {
        state.setTimelineZoom(ZOOM_ORDER[idx - 1]);
        render();
        requestAnimationFrame(centerTimelineOnToday);
      }
    }
    if (el.ganttZoomSelect) {
      el.ganttZoomSelect.value = state.getTimelineZoom();
      el.ganttZoomSelect.addEventListener('change', function() {
        state.setTimelineZoom(el.ganttZoomSelect.value);
        render();
        requestAnimationFrame(centerTimelineOnToday);
      });
    }
    var btnZoomIn = document.getElementById('gantt-zoom-in');
    var btnZoomOut = document.getElementById('gantt-zoom-out');
    if (btnZoomIn) btnZoomIn.addEventListener('click', function() { changeZoom('in'); });
    if (btnZoomOut) btnZoomOut.addEventListener('click', function() { changeZoom('out'); });
    setupTimelineZoomShortcuts(panTimeline, changeZoom);
    updateServerIndicatorUi();
    updateModeUi();
    startLockPollingAfterLoad();
  }
  function setupTimelineZoomShortcuts(panTimeline, changeZoom) {
    var el = state.getEl();
    if (!el.ganttScrollWrap) return;
    function handleZoomKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var ganttPanel = document.getElementById('gantt-panel');
      var inTimeline = ganttPanel && ganttPanel.contains(document.activeElement);
      if (!inTimeline) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        changeZoom('in');
      } else if (e.key === '-') {
        e.preventDefault();
        changeZoom('out');
      } else if (e.key === 'T' || e.key === 't') {
        e.preventDefault();
        centerTimelineOnToday();
      }
    }
    document.addEventListener('keydown', handleZoomKey);
    if (el.ganttResetView) {
      el.ganttResetView.addEventListener('click', function() {
        centerTimelineOnToday();
      });
    }
    if (el.ganttPanLeft) {
      el.ganttPanLeft.addEventListener('click', function() { panTimeline('left'); });
    }
    if (el.ganttPanRight) {
      el.ganttPanRight.addEventListener('click', function() { panTimeline('right'); });
    }
  }

  return {
    run: run,
    refreshAll: refreshAll,
    ensureEditAccess: ensureEditAccess,
    isEditMode: function() { return state.isEditMode(); },
    getEmployeeId: function() { return state.getEmployeeId(); }
  };
})();
