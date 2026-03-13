window.Gantt = window.Gantt || {};

Gantt.workspace = (function() {
  var state = Gantt.state;
  var api = Gantt.api;
  var table = Gantt.table;
  var gantt = Gantt.gantt;
  var detail = Gantt.detail;
  var escapeHtml = Gantt.utils.escapeHtml;
  var showToast = Gantt.utils.showToast;
  var prettyDate = Gantt.utils.prettyDate;
  var GANTT_VERTICAL_OFFSET = 5;

  var scrollSyncDone = false;
  var hasCenteredInitialView = false;
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
    if (el.workspaceModeIndicator) {
      el.workspaceModeIndicator.textContent = editMode
        ? ('Edit mode' + (employeeId ? ' • ' + employeeId : ''))
        : 'Read mode';
      el.workspaceModeIndicator.classList.toggle('is-edit', editMode);
    }
    if (el.workspaceModeToggle) {
      el.workspaceModeToggle.textContent = editMode ? 'Switch to read' : 'Switch to edit';
    }
    if (el.btnImport) el.btnImport.disabled = !editMode;
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
      var value = (input.value || '').trim();
      if (!value) {
        showToast('Employee ID is required for edit mode', true);
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
    state.setEditMode(enabled);
    updateModeUi();
    rerenderDetailIfOpen();
  }

  function ensureEditAccess(onReady) {
    if (!state.isEditMode()) {
      showToast('Switch to edit mode to make changes', true);
      return;
    }
    var employeeId = state.getEmployeeId();
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

  function toggleMode() {
    if (state.isEditMode()) {
      setEditMode(false);
      return;
    }
    if (state.getEmployeeId()) {
      setEditMode(true);
      return;
    }
    promptForEmployeeId(function(value) {
      if (!value) return;
      state.setEmployeeId(value);
      setEditMode(true);
    });
  }

  function getFilteredTree(tree) {
    var domainUid = state.getSelectedDomainUid();
    if (!domainUid || domainUid === 'all') return tree;
    var startIndex = -1;
    for (var i = 0; i < tree.length; i++) {
      if (tree[i].uid === domainUid) {
        startIndex = i;
        break;
      }
    }
    if (startIndex === -1) return tree;
    var rootDepth = tree[startIndex].depth;
    var filtered = [];
    for (var j = startIndex; j < tree.length; j++) {
      var task = tree[j];
      if (j > startIndex && task.depth <= rootDepth) break;
      filtered.push(task);
    }
    return filtered;
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
        showToast(e.message || 'Load failed', true);
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
    if (el.workspaceModeToggle) {
      el.workspaceModeToggle.addEventListener('click', toggleMode);
    }

    el.btnExport.addEventListener('click', function() {
      window.location.href = api.exportUrl();
      showToast('Export started');
    });

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

    updateModeUi();
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
