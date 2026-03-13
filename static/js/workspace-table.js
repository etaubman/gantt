window.Gantt = window.Gantt || {};

Gantt.table = (function() {
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var shortDate = function(d) { return Gantt.utils.shortDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };

  function render(visibleTree, taskRag, selectedTaskUid, hasChildren, isExpanded, onRowSelect, onToggle, onOpenDetail, onAddSubtask) {
    var el = Gantt.state.getEl();
    var isEditable = Gantt.state.isEditMode();
    var disabledAttr = isEditable ? '' : ' disabled';
    var bindRagTooltip = Gantt.ragTooltip && Gantt.ragTooltip.bind;
    if (!el.taskTbody) return;
    el.taskTbody.innerHTML = visibleTree.map(function(t) {
      var rag = taskRag[t.uid] || 'none';
      var indent = 'indent-' + Math.min(t.depth, 3);
      var expanded = isExpanded(t.uid);
      var hasKids = hasChildren[t.uid];
      var toggleClass = hasKids ? (expanded ? 'task-toggle expanded' : 'task-toggle collapsed') : 'task-toggle empty';
      var toggleChar = hasKids ? (expanded ? '\u25BC' : '\u25B6') : '\u00A0';
      var toggleTitle = hasKids ? (expanded ? 'Collapse subtasks' : 'Expand subtasks') : '';
      var progress = Math.max(0, Math.min(100, t.progress != null ? t.progress : 0));
      var description = t.description || 'No description';
      return '<tr data-uid="' + escapeHtml(t.uid) + '" class="' + (selectedTaskUid === t.uid ? 'selected' : '') + '">' +
        '<td class="' + indent + '">' +
          '<div class="task-cell-main">' +
            '<span class="' + toggleClass + '" data-uid="' + escapeHtml(t.uid) + '" data-has-children="' + (hasKids ? '1' : '0') + '" title="' + escapeHtml(toggleTitle) + '" aria-label="' + escapeHtml(toggleTitle) + '">' + toggleChar + '</span>' +
            '<span class="rag-dot ' + rag + '" aria-hidden="true"></span>' +
            '<div class="task-name" title="' + escapeHtml(description) + '">' + escapeHtml(t.name) + '</div>' +
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
          '<button type="button" class="btn-row-action btn-open-task" data-uid="' + escapeHtml(t.uid) + '" title="Open task">Open</button>' +
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

    el.taskTbody.querySelectorAll('.btn-open-task').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var uid = btn.getAttribute('data-uid');
        if (onOpenDetail) onOpenDetail(uid);
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

    el.taskTbody.querySelectorAll('tr').forEach(function(tr) {
      tr.addEventListener('click', function(e) {
        if (e.target.classList.contains('task-toggle') || e.target.classList.contains('btn-open-task') || e.target.classList.contains('btn-add-subtask-row')) return;
        var uid = tr.getAttribute('data-uid');
        el.taskTbody.querySelectorAll('tr').forEach(function(r) { r.classList.remove('selected'); });
        tr.classList.add('selected');
        if (el.btnAddSubtask) el.btnAddSubtask.disabled = false;
        if (onRowSelect) onRowSelect(uid);
      });
    });
  }

  return { render: render };
})();
