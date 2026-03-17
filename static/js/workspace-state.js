window.Gantt = window.Gantt || {};

Gantt.state = (function() {
  var MODE_STORAGE_KEY = 'gantt-workspace-mode';
  var EMPLOYEE_ID_STORAGE_KEY = 'gantt-employee-id';
  let project = null;
  let tasks = [];
  let dependencies = [];
  let taskRag = {};
  let selectedTaskUid = null;
  let collapsedSet = {};
  let employeeId = window.localStorage.getItem(EMPLOYEE_ID_STORAGE_KEY) || '';
  let editMode = window.localStorage.getItem(MODE_STORAGE_KEY) === 'edit' && !!employeeId;
  let editLock = { locked: false, employee_id: null, locked_at: null, updated_at: null };
  let selectedDomainUid = 'all';
  let selectedAccountable = 'all';
  let selectedResponsible = 'all';
  let selectedRag = 'all';
  let selectedStatus = 'all';
  let focusedTaskUid = null;
  let timelineEditMode = false;

  const ZOOM_PX_PER_DAY = { years: 1, quarters: 2, months: 4, weeks: 8, days: 16 };
  const DEFAULT_ZOOM = 'months';
  const MIN_PX_PER_DAY = 0.5;
  const MAX_PX_PER_DAY = 32;
  let timelineZoom = DEFAULT_ZOOM;
  let timelinePxPerDay = ZOOM_PX_PER_DAY[DEFAULT_ZOOM];

  function getRowHeight() {
    var value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-height'), 10);
    return isNaN(value) ? 44 : value;
  }

  function nearestZoomLevel(pxPerDay) {
    var best = DEFAULT_ZOOM;
    var bestDist = Infinity;
    Object.keys(ZOOM_PX_PER_DAY).forEach(function(level) {
      var d = Math.abs(ZOOM_PX_PER_DAY[level] - pxPerDay);
      if (d < bestDist) { bestDist = d; best = level; }
    });
    return best;
  }

  function getPxPerDay() {
    return Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, timelinePxPerDay));
  }

  function setTimelinePxPerDay(px) {
    var clamped = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, px));
    timelinePxPerDay = clamped;
    timelineZoom = nearestZoomLevel(clamped);
  }

  function normalizeDurationDays(task) {
    if (!task) return 7;
    if (task.is_milestone) return 1;
    var raw = parseInt(task.duration_days, 10);
    if (!isNaN(raw) && raw > 0) return raw;
    if (task.start_date && task.end_date) {
      var start = new Date(task.start_date);
      var end = new Date(task.end_date);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
      }
    }
    return 7;
  }

  const el = {
    projectTitle: document.getElementById('project-title'),
    projectSelect: document.getElementById('project-select'),
    projectMeta: document.getElementById('project-meta'),
    ganttTimelineInner: document.getElementById('gantt-timeline-inner'),
    ganttPanel: document.getElementById('gantt-panel'),
    ganttScrollWrap: document.getElementById('gantt-scroll-wrap'),
    ganttDragFeedback: document.getElementById('gantt-drag-feedback'),
    ganttDateRange: document.getElementById('gantt-date-range'),
    ganttZoomSelect: document.getElementById('gantt-zoom-select'),
    ganttResetView: document.getElementById('gantt-reset-view'),
    ganttPanLeft: document.getElementById('gantt-pan-left'),
    ganttPanRight: document.getElementById('gantt-pan-right'),
    btnTimelineEdit: document.getElementById('btn-timeline-edit'),
    ganttTimelineEditHint: document.getElementById('gantt-timeline-edit-hint'),
    taskTbody: document.getElementById('task-tbody'),
    taskTableWrap: document.getElementById('task-table-wrap'),
    ganttHeader: document.getElementById('gantt-header'),
    ganttBodyViewport: document.getElementById('gantt-body-viewport'),
    ganttBody: document.getElementById('gantt-body'),
    detailContent: document.getElementById('detail-content'),
    taskDetailModal: document.getElementById('task-detail-modal'),
    taskDetailModalTitle: document.getElementById('task-detail-modal-title'),
    taskDetailModalClose: document.getElementById('task-detail-modal-close'),
    domainFilterSelect: document.getElementById('domain-filter-select'),
    accountableFilterSelect: document.getElementById('accountable-filter-select'),
    responsibleFilterSelect: document.getElementById('responsible-filter-select'),
    ragFilterSelect: document.getElementById('rag-filter-select'),
    statusFilterSelect: document.getElementById('status-filter-select'),
    btnFocusTask: document.getElementById('btn-focus-task'),
    taskFilterSummary: document.getElementById('task-filter-summary'),
    btnClearFilters: document.getElementById('btn-clear-filters'),
    workspaceServerIndicator: document.getElementById('workspace-server-indicator'),
    workspaceModeIndicator: document.getElementById('workspace-mode-indicator'),
    workspaceModeToggle: document.getElementById('workspace-mode-toggle'),
    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    fileImport: document.getElementById('file-import'),
    btnAddTopLevelTask: document.getElementById('btn-add-top-level-task'),
    taskCountBadge: document.getElementById('task-count-badge'),
    timelineSummaryBadge: document.getElementById('timeline-summary-badge')
  };

  function buildTaskTree(flatTasks) {
    const byParent = {};
    flatTasks.forEach(function(t) {
      const p = t.parent_task_uid || '__root__';
      if (!byParent[p]) byParent[p] = [];
      byParent[p].push(t);
    });
    byParent['__root__'] = byParent['__root__'] || [];
    byParent['__root__'].sort(function(a, b) {
      return a.sort_order - b.sort_order || (a.created_at || '').localeCompare(b.created_at || '');
    });
    Object.keys(byParent).filter(function(k) { return k !== '__root__'; }).forEach(function(k) {
      byParent[k].sort(function(a, b) {
        return a.sort_order - b.sort_order || (a.created_at || '').localeCompare(b.created_at || '');
      });
    });
    const out = [];
    function walk(parentKey, depth, prefix) {
      const list = byParent[parentKey] || [];
      list.forEach(function(t, index) {
        var hierarchyNumber = prefix ? (prefix + '.' + (index + 1)) : String(index + 1);
        out.push({ ...t, depth: depth, hierarchy_number: hierarchyNumber });
        walk(t.uid, depth + 1, hierarchyNumber);
      });
    }
    walk('__root__', 0, '');
    return out;
  }

  function getHasChildren(tree) {
    var out = {};
    tree.forEach(function(t) {
      if (t.parent_task_uid) out[t.parent_task_uid] = true;
    });
    return out;
  }

  function getVisibleTree(tree) {
    var collapsed = collapsedSet;
    var visible = [];
    var visibleUids = {};
    for (var i = 0; i < tree.length; i++) {
      var t = tree[i];
      var parentVisible = !t.parent_task_uid || visibleUids[t.parent_task_uid];
      var parentExpanded = !t.parent_task_uid || !collapsed[t.parent_task_uid];
      if (parentVisible && parentExpanded) {
        visible.push(t);
        visibleUids[t.uid] = true;
      }
    }
    return visible;
  }

  function toggleCollapsed(uid) {
    if (collapsedSet[uid]) {
      delete collapsedSet[uid];
    } else {
      collapsedSet[uid] = true;
    }
  }

  function expandAll() {
    collapsedSet = {};
  }

  function collapseAll(tree) {
    var hasChildren = getHasChildren(tree);
    collapsedSet = {};
    Object.keys(hasChildren).forEach(function(uid) {
      collapsedSet[uid] = true;
    });
  }

  function isExpanded(uid) {
    return !collapsedSet[uid];
  }

  return {
    getProject: function() { return project; },
    getTasks: function() { return tasks; },
    getDependencies: function() { return dependencies; },
    getTaskRag: function() { return taskRag; },
    getSelectedTaskUid: function() { return selectedTaskUid; },
    getSelectedDomainUid: function() { return selectedDomainUid; },
    getSelectedAccountable: function() { return selectedAccountable; },
    getSelectedResponsible: function() { return selectedResponsible; },
    getSelectedRag: function() { return selectedRag; },
    getSelectedStatus: function() { return selectedStatus; },
    getFocusedTaskUid: function() { return focusedTaskUid; },
    isTimelineEditMode: function() { return timelineEditMode; },
    setTimelineEditMode: function(enabled) { timelineEditMode = !!enabled; },
    isEditMode: function() { return editMode; },
    getEmployeeId: function() { return employeeId; },
    getEditLock: function() { return editLock; },
    getEl: function() { return el; },
    getConstants: function() {
      var px = getPxPerDay();
      return { PX_PER_DAY: px, ROW_HEIGHT: getRowHeight(), GANTT_CELL_WIDTH: 7 * px };
    },
    getPxPerDay: getPxPerDay,
    getTimelineZoom: function() { return timelineZoom; },
    setTimelineZoom: function(z) {
      timelineZoom = z;
      timelinePxPerDay = ZOOM_PX_PER_DAY[z] != null ? ZOOM_PX_PER_DAY[z] : ZOOM_PX_PER_DAY[DEFAULT_ZOOM];
    },
    setTimelinePxPerDay: setTimelinePxPerDay,
    buildTaskTree: buildTaskTree,
    setProject: function(p) { project = p; },
    setTasks: function(t) { tasks = t; },
    setDependencies: function(d) { dependencies = d; },
    setTaskRag: function(r) { taskRag = r; },
    mergeTask: function(task) {
      if (!task || !task.uid) return;
      var idx = tasks.findIndex(function(t) { return t.uid === task.uid; });
      var normalized = Object.assign({}, task);
      normalized.is_milestone = !!task.is_milestone;
      normalized.is_deleted = !!task.is_deleted;
      normalized.scheduling_mode = task.scheduling_mode || 'fixed';
      normalized.duration_days = normalizeDurationDays(task);
      if (idx >= 0) {
        tasks[idx] = normalized;
      } else {
        tasks.push(normalized);
      }
    },
    addTask: function(task) {
      if (!task || !task.uid) return;
      if (tasks.some(function(t) { return t.uid === task.uid; })) return;
      var normalized = Object.assign({}, task);
      normalized.is_milestone = !!task.is_milestone;
      normalized.is_deleted = !!task.is_deleted;
      normalized.scheduling_mode = task.scheduling_mode || 'fixed';
      normalized.duration_days = normalizeDurationDays(task);
      tasks.push(normalized);
    },
    mergeTaskRag: function(taskUid, status) {
      if (!taskUid) return;
      taskRag = Object.assign({}, taskRag);
      if (status) {
        taskRag[taskUid] = status;
      } else {
        delete taskRag[taskUid];
      }
    },
    addDependency: function(dep) {
      if (!dep || !dep.uid) return;
      if (dependencies.some(function(d) { return d.uid === dep.uid; })) return;
      dependencies = dependencies.concat([dep]);
    },
    removeDependency: function(depUid) {
      if (!depUid) return;
      dependencies = dependencies.filter(function(d) { return d.uid !== depUid; });
    },
    setSelectedTaskUid: function(uid) { selectedTaskUid = uid; },
    setSelectedDomainUid: function(uid) { selectedDomainUid = uid || 'all'; },
    setSelectedAccountable: function(value) { selectedAccountable = value || 'all'; },
    setSelectedResponsible: function(value) { selectedResponsible = value || 'all'; },
    setSelectedRag: function(value) { selectedRag = value || 'all'; },
    setSelectedStatus: function(value) { selectedStatus = value || 'all'; },
    setFocusedTaskUid: function(uid) { focusedTaskUid = uid || null; },
    setEditLock: function(lock) {
      editLock = lock || { locked: false, employee_id: null, locked_at: null, updated_at: null };
    },
    setEditMode: function(enabled) {
      editMode = !!enabled;
      window.localStorage.setItem(MODE_STORAGE_KEY, editMode ? 'edit' : 'read');
    },
    setEmployeeId: function(value) {
      employeeId = (value || '').trim();
      if (employeeId) {
        window.localStorage.setItem(EMPLOYEE_ID_STORAGE_KEY, employeeId);
      } else {
        window.localStorage.removeItem(EMPLOYEE_ID_STORAGE_KEY);
      }
    },
    getVisibleTree: getVisibleTree,
    getHasChildren: getHasChildren,
    toggleCollapsed: toggleCollapsed,
    expandAll: expandAll,
    collapseAll: collapseAll,
    isExpanded: isExpanded
  };
})();
