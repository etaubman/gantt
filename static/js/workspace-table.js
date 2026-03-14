window.Gantt = window.Gantt || {};

Gantt.table = (function() {
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var shortDate = function(d) { return Gantt.utils.shortDate(d); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };
  var taskTooltipEl = null;
  var taskTooltipHideTimer = null;

  function ensureTaskTooltip() {
    if (taskTooltipEl && taskTooltipEl.isConnected) return taskTooltipEl;
    taskTooltipEl = document.createElement('div');
    taskTooltipEl.className = 'task-super-tooltip';
    taskTooltipEl.hidden = true;
    document.body.appendChild(taskTooltipEl);
    return taskTooltipEl;
  }

  function positionTaskTooltip(anchor) {
    if (!taskTooltipEl || taskTooltipEl.hidden || !anchor) return;
    var rect = anchor.getBoundingClientRect();
    var tooltipRect = taskTooltipEl.getBoundingClientRect();
    var top = rect.bottom + 10;
    var left = rect.left;
    var maxLeft = window.innerWidth - tooltipRect.width - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = rect.top - tooltipRect.height - 10;
    }
    if (top < 8) top = 8;
    taskTooltipEl.style.top = top + 'px';
    taskTooltipEl.style.left = left + 'px';
  }

  function hideTaskTooltip() {
    if (taskTooltipHideTimer) {
      window.clearTimeout(taskTooltipHideTimer);
      taskTooltipHideTimer = null;
    }
    if (taskTooltipEl) taskTooltipEl.hidden = true;
  }

  function scheduleHideTaskTooltip() {
    if (taskTooltipHideTimer) window.clearTimeout(taskTooltipHideTimer);
    taskTooltipHideTimer = window.setTimeout(hideTaskTooltip, 60);
  }

  function showTaskTooltip(anchor, task) {
    var tooltip = ensureTaskTooltip();
    if (taskTooltipHideTimer) {
      window.clearTimeout(taskTooltipHideTimer);
      taskTooltipHideTimer = null;
    }
    var durationValue = task.is_milestone
      ? prettyDate(task.start_date || task.end_date)
      : (prettyDate(task.start_date) + ' - ' + prettyDate(task.end_date));
    tooltip.innerHTML =
      '<div class="task-super-tooltip-title">' + escapeHtml(task.name || 'Untitled task') + '</div>' +
      '<div class="task-super-tooltip-desc">' + escapeHtml(task.description || 'No description provided.') + '</div>' +
      '<div class="task-super-tooltip-grid">' +
        '<div class="task-super-tooltip-label">Duration</div><div class="task-super-tooltip-value">' + escapeHtml(durationValue) + '</div>' +
      '</div>';
    tooltip.hidden = false;
    positionTaskTooltip(anchor);
  }

  function bindTaskTooltip(anchor, task) {
    if (!anchor) return;
    anchor.addEventListener('mouseenter', function() {
      showTaskTooltip(anchor, task);
    });
    anchor.addEventListener('mousemove', function() {
      positionTaskTooltip(anchor);
    });
    anchor.addEventListener('mouseleave', scheduleHideTaskTooltip);
    anchor.addEventListener('focus', function() {
      showTaskTooltip(anchor, task);
    });
    anchor.addEventListener('blur', hideTaskTooltip);
  }

  function render(visibleTree, taskRag, selectedTaskUid, hasChildren, isExpanded, onRowSelect, onToggle, onOpenDetail, onAddSubtask) {
    var el = Gantt.state.getEl();
    var isEditable = Gantt.state.isEditMode();
    var disabledAttr = isEditable ? '' : ' disabled';
    var bindRagTooltip = Gantt.ragTooltip && Gantt.ragTooltip.bind;
    if (!el.taskTbody) return;
    el.taskTbody.innerHTML = visibleTree.map(function(t) {
      var rag = taskRag[t.uid] || 'none';
      var milestoneMarker = t.is_milestone ? '<span class="task-milestone-marker" aria-hidden="true"></span>' : '';
      var indent = 'indent-' + Math.min(t.depth, 3);
      var hierarchyNumber = t.hierarchy_number || '';
      var expanded = isExpanded(t.uid);
      var hasKids = hasChildren[t.uid];
      var toggleClass = hasKids ? (expanded ? 'task-toggle expanded' : 'task-toggle collapsed') : 'task-toggle empty';
      var toggleChar = hasKids ? (expanded ? '\u25BC' : '\u25B6') : '\u00A0';
      var toggleTitle = hasKids ? (expanded ? 'Collapse subtasks' : 'Expand subtasks') : '';
      var progress = Math.max(0, Math.min(100, t.progress != null ? t.progress : 0));
      var rowClasses = [];
      if (selectedTaskUid === t.uid) rowClasses.push('selected');
      if (t.status === 'cancelled') rowClasses.push('task-row-cancelled');
      return '<tr data-uid="' + escapeHtml(t.uid) + '" class="' + rowClasses.join(' ') + '">' +
        '<td>' +
          '<div class="task-cell-shell">' +
            '<span class="task-hierarchy-number">' + escapeHtml(hierarchyNumber) + '</span>' +
            '<div class="task-cell-main ' + indent + '">' +
            '<span class="' + toggleClass + '" data-uid="' + escapeHtml(t.uid) + '" data-has-children="' + (hasKids ? '1' : '0') + '" title="' + escapeHtml(toggleTitle) + '" aria-label="' + escapeHtml(toggleTitle) + '">' + toggleChar + '</span>' +
            milestoneMarker +
            '<span class="rag-dot ' + rag + '" aria-hidden="true"></span>' +
            '<div class="task-name task-title-tooltip-anchor' + (t.status === 'cancelled' ? ' is-cancelled' : '') + '" data-task-uid="' + escapeHtml(t.uid) + '" tabindex="0">' + escapeHtml(t.name) + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td><span class="person-chip">' + escapeHtml(t.accountable_person || 'Unassigned') + '</span></td>' +
        '<td><span class="person-chip">' + escapeHtml(t.responsible_party || 'Unassigned') + '</span></td>' +
        '<td>' + shortDate(t.start_date) + '</td>' +
        '<td>' + shortDate(t.end_date) + '</td>' +
        '<td><span class="rag-badge-table rag-tooltip-anchor ' + rag + '" data-task-uid="' + escapeHtml(t.uid) + '" data-task-name="' + escapeHtml(t.name) + '" tabindex="0">' + escapeHtml(rag === 'none' ? '—' : titleCaseStatus(rag)) + '</span></td>' +
        '<td><span class="status-badge status-' + escapeHtml(t.status || 'not_started') + '">' + escapeHtml(titleCaseStatus(t.status || 'not_started')) + '</span></td>' +
        '<td>' +
          '<div class="table-progress" aria-label="Progress ' + progress + ' percent">' +
            '<span class="table-progress-track"><span class="table-progress-fill" style="width:' + progress + '%"></span></span>' +
            '<span class="table-progress-value">' + progress + '%</span>' +
          '</div>' +
        '</td>' +
        '<td class="task-row-actions">' +
          '<button type="button" class="btn-row-action btn-add-subtask-row" data-uid="' + escapeHtml(t.uid) + '" title="' + (isEditable ? 'Add subtask' : 'Switch to edit mode to add subtasks') + '"' + disabledAttr + '>+</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    el.taskTbody.querySelectorAll('.task-toggle[data-has-children="1"]').forEach(function(span) {
      span.addEventListener('click', function(e) {
        e.stopPropagation();
        var uid = span.getAttribute('data-uid');
        if (onToggle) onToggle(uid);
      });
    });

    el.taskTbody.querySelectorAll('.btn-add-subtask-row').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var uid = btn.getAttribute('data-uid');
        if (onAddSubtask) onAddSubtask(uid);
      });
    });

    if (bindRagTooltip) {
      el.taskTbody.querySelectorAll('.rag-tooltip-anchor[data-task-uid]').forEach(function(anchor) {
        bindRagTooltip(anchor, {
          taskUid: anchor.getAttribute('data-task-uid'),
          taskName: anchor.getAttribute('data-task-name')
        });
      });
    }

    el.taskTbody.querySelectorAll('.task-title-tooltip-anchor[data-task-uid]').forEach(function(anchor) {
      var uid = anchor.getAttribute('data-task-uid');
      var task = visibleTree.find(function(item) { return item.uid === uid; });
      if (task) bindTaskTooltip(anchor, task);
    });

    el.taskTbody.querySelectorAll('tr').forEach(function(tr) {
      tr.addEventListener('click', function(e) {
        if (e.target.classList.contains('task-toggle') || e.target.classList.contains('btn-add-subtask-row')) return;
        var uid = tr.getAttribute('data-uid');
        el.taskTbody.querySelectorAll('tr').forEach(function(r) { r.classList.remove('selected'); });
        tr.classList.add('selected');
        if (el.btnAddSubtask) el.btnAddSubtask.disabled = false;
        if (onRowSelect) onRowSelect(uid);
      });
      tr.addEventListener('dblclick', function(e) {
        if (e.target.classList.contains('task-toggle') || e.target.classList.contains('btn-add-subtask-row')) return;
        var uid = tr.getAttribute('data-uid');
        if (onOpenDetail) onOpenDetail(uid);
      });
    });
  }

  return { render: render };
})();
