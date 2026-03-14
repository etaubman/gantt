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
  var GANTT_VERTICAL_OFFSET = 5;
  var EMPLOYEE_ID_RE = /^[a-zA-Z]{2}[0-9]{5}$/;

  var scrollSyncDone = false;
  var hasCenteredInitialView = false;
  var lockPollTimer = null;
  var hasShownLockLostToast = false;
  var hasShownLockPollErrorToast = false;
  var serverConnectionState = 'unknown';
  function syncVerticalScroll() {
    var el = state.getEl();
    if (!el.taskTableWrap || !el.ganttBody || !el.ganttBodyViewport) return;
    var top = el.taskTableWrap.scrollTop;
    el.ganttBody.style.transform = 'translateY(' + ((-top) - GANTT_VERTICAL_OFFSET) + 'px)';
  }
  function setupScrollSync() {
    var el = state.getEl();
    if (scrollSyncDone || !el.taskTableWrap || !el.ganttScrollWrap) return;
    function syncFromTask() {
      syncVerticalScroll();
    }
    el.taskTableWrap.addEventListener('scroll', syncFromTask);
    el.ganttScrollWrap.addEventListener('wheel', function(e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.taskTableWrap.scrollTop += e.deltaY;
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

  function updateModeUi() {
    var el = state.getEl();
    var editMode = state.isEditMode();
    var employeeId = state.getEmployeeId();
    var lock = state.getEditLock();
    var lockedByOther = lock && lock.locked && lock.employee_id && lock.employee_id !== employeeId;
    var lockedBySelf = lock && lock.locked && lock.employee_id && lock.employee_id === employeeId;
    if (el.workspaceModeIndicator) {
      el.workspaceModeIndicator.textContent = editMode
        ? ('Edit mode • ' + employeeId)
        : lockedByOther
          ? ('Locked by ' + lock.employee_id)
          : lockedBySelf
            ? ('Locked by you • ' + employeeId)
            : 'Read mode';
      el.workspaceModeIndicator.classList.toggle('is-edit', editMode);
    }
    if (el.workspaceModeToggle) {
      el.workspaceModeToggle.textContent = editMode
        ? 'Unlock edit'
        : lockedByOther
          ? 'Take edit lock'
          : lockedBySelf
            ? 'Resume edit'
            : 'Switch to edit';
    }
    if (el.btnImport) {
      var showImport = !!editMode && !!lockedBySelf;
      el.btnImport.hidden = !showImport;
      el.btnImport.disabled = !showImport;
    }
  }

  function updateServerIndicatorUi() {
    var el = state.getEl();
    if (!el.workspaceServerIndicator) return;
    el.workspaceServerIndicator.textContent =
      serverConnectionState === 'online'
        ? 'Online'
        : serverConnectionState === 'offline'
          ? 'Offline'
          : 'Checking server...';
    el.workspaceServerIndicator.classList.toggle('is-online', serverConnectionState === 'online');
    el.workspaceServerIndicator.classList.toggle('is-offline', serverConnectionState === 'offline');
    el.workspaceServerIndicator.classList.toggle('is-unknown', serverConnectionState === 'unknown');
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
      detail.renderDetail(refreshAll);
    }
  }

  function setEditMode(enabled) {
    var changed = state.isEditMode() !== !!enabled;
    state.setEditMode(enabled);
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

  function pollEditLock() {
    return api.getEditLock()
      .then(function(lock) {
        hasShownLockPollErrorToast = false;
        applyLockState(lock);
      })
      .catch(function(e) {
        if (e && e.status && !e.isConnectionError && !hasShownLockPollErrorToast) {
          showToast(e.message || 'Unable to check edit lock', true);
          hasShownLockPollErrorToast = true;
        }
      });
  }

  function startLockPolling() {
    if (lockPollTimer) return;
    pollEditLock();
    lockPollTimer = window.setInterval(pollEditLock, 5000);
  }

  function ensureEditAccess(onReady) {
    var lock = state.getEditLock();
    var employeeId = state.getEmployeeId();
    if (!state.isEditMode() || !lock.locked || lock.employee_id !== employeeId) {
      showToast('Switch to edit mode to make changes', true);
      return;
    }
    if (employeeId) {
      onReady(employeeId);
      return;
    }
    promptForEmployeeId(function(value) {
      if (!value) return;
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

  function updateTaskFilterUi() {
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
      el.taskFilterSummary.textContent = count === 0 ? 'All filters off' : ('Filtered by ' + activeLabels.join(', '));
      el.taskFilterSummary.classList.toggle('is-active', count > 0);
    }
    if (el.taskTableWrap) {
      el.taskTableWrap.classList.toggle('has-active-filters', count > 0 || state.getSelectedDomainUid() !== 'all');
    }
    var toolbar = document.querySelector('.task-panel-toolbar');
    if (toolbar) {
      toolbar.classList.toggle('has-active-filters', count > 0 || state.getSelectedDomainUid() !== 'all');
    }
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

  function openTaskDetail(uid) {
    setSelectedTask(uid);
    render();
    detail.renderDetail(refreshAll);
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

  function refreshAll() {
    setLoading(true);
    api.getProject()
      .then(function(p) {
        state.setProject(p);
        var el = state.getEl();
        if (el.projectTitle) el.projectTitle.textContent = p.name || 'Gantt';
        return api.getTasks();
      })
      .then(function(t) {
        state.setTasks(t);
        return api.getDependencies();
      })
      .then(function(d) {
        state.setDependencies(d);
        var tasks = state.getTasks();
        var taskRagMap = {};
        return Promise.all(tasks.map(function(task) {
          return api.getTaskRag(task.uid).then(function(rag) {
            if (rag.length) taskRagMap[task.uid] = rag[rag.length - 1].status;
          });
        })).then(function() {
          state.setTaskRag(taskRagMap);
        });
      })
      .then(function() {
        render();
        setupScrollSync();
        requestAnimationFrame(function() {
          forceScrollSync();
          if (!hasCenteredInitialView) {
            centerTimelineOnToday();
            hasCenteredInitialView = true;
          }
        });
      })
      .catch(function(e) {
        if (e && e.status && !e.isConnectionError) showToast(e.message || 'Load failed', true);
      })
      .finally(function() {
        setLoading(false);
      });
  }

  function render() {
    var tasks = state.getTasks();
    var taskRag = state.getTaskRag();
    var tree = state.buildTaskTree(tasks);
    updateDomainOptions(tree);
    updateTaskFilterOptions(tasks, taskRag);
    updateTaskFilterUi();
    var filteredTree = getFilteredTree(tree);
    var visibleTree = state.getVisibleTree(filteredTree);
    var hasChildren = state.getHasChildren(tree);
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

    updateWorkspaceMeta(visibleTree, selectedTaskUid);
    updateModeUi();

    table.render(visibleTree, taskRag, selectedTaskUid, hasChildren, state.isExpanded.bind(state), function(uid) {
      setSelectedTask(uid);
      render();
      requestAnimationFrame(centerSelectedTaskRow);
    }, function(uid) {
      state.toggleCollapsed(uid);
      render();
    }, function(uid) {
      openTaskDetail(uid);
    }, function(uid) {
      ensureEditAccess(function() {
        detail.showTaskModal('Add subtask', uid, function(name) {
          api.postTask({ name: name, parent_task_uid: uid })
            .then(function() { showToast('Subtask added'); refreshAll(); })
            .catch(function(e) { showToast(e.message, true); });
        });
      });
    });

    gantt.render(visibleTree, taskRag, selectedTaskUid, function(uid) {
      setSelectedTask(uid);
      render();
    }, function(uid) {
      openTaskDetail(uid);
    });
    if (el.ganttZoomSelect) el.ganttZoomSelect.value = state.getTimelineZoom();
    requestAnimationFrame(forceScrollSync);
  }

  function run() {
    var el = state.getEl();
    if (api.setConnectionListener) {
      api.setConnectionListener(setServerConnectionState);
    }
    var normalizedStoredEmployeeId = normalizeEmployeeId(state.getEmployeeId());
    if (state.getEmployeeId() && !normalizedStoredEmployeeId) {
      state.setEmployeeId('');
      state.setEditMode(false);
    } else if (normalizedStoredEmployeeId && normalizedStoredEmployeeId !== state.getEmployeeId()) {
      state.setEmployeeId(normalizedStoredEmployeeId);
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
        render();
      });
    }
    if (el.accountableFilterSelect) {
      el.accountableFilterSelect.addEventListener('change', function() {
        state.setSelectedAccountable(el.accountableFilterSelect.value || 'all');
        render();
      });
    }
    if (el.responsibleFilterSelect) {
      el.responsibleFilterSelect.addEventListener('change', function() {
        state.setSelectedResponsible(el.responsibleFilterSelect.value || 'all');
        render();
      });
    }
    if (el.ragFilterSelect) {
      el.ragFilterSelect.addEventListener('change', function() {
        state.setSelectedRag(el.ragFilterSelect.value || 'all');
        render();
      });
    }
    if (el.statusFilterSelect) {
      el.statusFilterSelect.addEventListener('change', function() {
        state.setSelectedStatus(el.statusFilterSelect.value || 'all');
        render();
      });
    }
    if (el.btnClearFilters) {
      el.btnClearFilters.addEventListener('click', clearTaskFilters);
    }
    if (el.workspaceModeToggle) {
      el.workspaceModeToggle.addEventListener('click', toggleMode);
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

    if (el.ganttZoomSelect) {
      el.ganttZoomSelect.value = state.getTimelineZoom();
      el.ganttZoomSelect.addEventListener('change', function() {
        state.setTimelineZoom(el.ganttZoomSelect.value);
        render();
        requestAnimationFrame(centerTimelineOnToday);
      });
    }
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

    updateServerIndicatorUi();
    updateModeUi();
    startLockPolling();
    refreshAll();
  }

  return {
    run: run,
    refreshAll: refreshAll,
    ensureEditAccess: ensureEditAccess,
    isEditMode: function() { return state.isEditMode(); },
    getEmployeeId: function() { return state.getEmployeeId(); }
  };
})();
