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
  let selectedDomainUid = 'all';

  const ZOOM_PX_PER_DAY = { years: 1, quarters: 2, months: 4, weeks: 8, days: 16 };
  const DEFAULT_ZOOM = 'months';
  let timelineZoom = DEFAULT_ZOOM;

  function getRowHeight() {
    var value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-height'), 10);
    return isNaN(value) ? 44 : value;
  }

  function getPxPerDay() {
    return ZOOM_PX_PER_DAY[timelineZoom] != null ? ZOOM_PX_PER_DAY[timelineZoom] : ZOOM_PX_PER_DAY[DEFAULT_ZOOM];
  }

  const el = {
    projectTitle: document.getElementById('project-title'),
    projectMeta: document.getElementById('project-meta'),
    ganttTimelineInner: document.getElementById('gantt-timeline-inner'),
    ganttScrollWrap: document.getElementById('gantt-scroll-wrap'),
    ganttDateRange: document.getElementById('gantt-date-range'),
    ganttZoomSelect: document.getElementById('gantt-zoom-select'),
    ganttResetView: document.getElementById('gantt-reset-view'),
    ganttPanLeft: document.getElementById('gantt-pan-left'),
    ganttPanRight: document.getElementById('gantt-pan-right'),
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
    workspaceModeIndicator: document.getElementById('workspace-mode-indicator'),
    workspaceModeToggle: document.getElementById('workspace-mode-toggle'),
    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    fileImport: document.getElementById('file-import'),
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
    function walk(parentKey, depth) {
      const list = byParent[parentKey] || [];
      list.forEach(function(t) {
        out.push({ ...t, depth: depth });
        walk(t.uid, depth + 1);
      });
    }
    walk('__root__', 0);
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
    isEditMode: function() { return editMode; },
    getEmployeeId: function() { return employeeId; },
    getEl: function() { return el; },
    getConstants: function() {
      var px = getPxPerDay();
      return { PX_PER_DAY: px, ROW_HEIGHT: getRowHeight(), GANTT_CELL_WIDTH: 7 * px };
    },
    getTimelineZoom: function() { return timelineZoom; },
    setTimelineZoom: function(z) { timelineZoom = z; },
    buildTaskTree: buildTaskTree,
    setProject: function(p) { project = p; },
    setTasks: function(t) { tasks = t; },
    setDependencies: function(d) { dependencies = d; },
    setTaskRag: function(r) { taskRag = r; },
    setSelectedTaskUid: function(uid) { selectedTaskUid = uid; },
    setSelectedDomainUid: function(uid) { selectedDomainUid = uid || 'all'; },
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
