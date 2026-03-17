window.Gantt = window.Gantt || {};

Gantt.table = (function() {
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var shortDate = function(d) { return Gantt.utils.shortDate(d); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var dateStr = function(d) { return Gantt.utils.dateStr(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };
  var isTaskPastDue = function(task) { return Gantt.utils.isTaskPastDue(task); };
  var showToast = function(msg, err) { return Gantt.utils.showToast(msg, err); };
  var taskTooltipEl = null;
  var taskTooltipHideTimer = null;
  var taskTooltipLoadDelayTimer = null;
  var taskTooltipRequestId = 0;
  var taskTooltipDetailsCache = {};
  var activeTaskTooltipAnchor = null;
  var taskTooltipHovered = false;
  var TOOLTIP_LOAD_DELAY_MS = 280;
  var quickEditPopoverEl = null;
  var quickEditActiveAnchor = null;
  var quickEditActiveUid = null;
  var quickEditActiveField = null;
  var quickEditDocumentHandlerBound = false;
  var quickEditKeyHandlerBound = false;
  var quickEditRagRequestId = 0;
  var quickCommentPopoverEl = null;
  var quickCommentDocumentHandlerBound = false;
  var quickCommentKeyHandlerBound = false;

  var QUICK_EDIT_LABELS = {
    accountable: 'Accountable',
    responsible: 'Responsible',
    start: 'Start date',
    end: 'End date',
    rag: 'RAG',
    status: 'Status',
    progress: 'Percent complete'
  };

  function ensureQuickEditPopover() {
    if (quickEditPopoverEl && quickEditPopoverEl.isConnected) return quickEditPopoverEl;
    quickEditPopoverEl = document.createElement('div');
    quickEditPopoverEl.className = 'quick-edit-popover';
    quickEditPopoverEl.hidden = true;
    quickEditPopoverEl.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    document.body.appendChild(quickEditPopoverEl);
    if (!quickEditDocumentHandlerBound) {
      document.addEventListener('click', function(e) {
        if (!quickEditPopoverEl || quickEditPopoverEl.hidden) return;
        if (quickEditPopoverEl.contains(e.target)) return;
        if (quickEditActiveAnchor && quickEditActiveAnchor.contains && quickEditActiveAnchor.contains(e.target)) return;
        closeQuickEditPopover();
      });
      quickEditDocumentHandlerBound = true;
    }
    if (!quickEditKeyHandlerBound) {
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeQuickEditPopover();
      });
      quickEditKeyHandlerBound = true;
    }
    return quickEditPopoverEl;
  }

  function closeQuickEditPopover() {
    if (quickEditActiveAnchor) quickEditActiveAnchor.classList.remove('is-active-quick-edit');
    quickEditActiveAnchor = null;
    quickEditActiveUid = null;
    quickEditActiveField = null;
    quickEditRagRequestId += 1;
    if (quickEditPopoverEl) {
      quickEditPopoverEl.hidden = true;
      quickEditPopoverEl.innerHTML = '';
    }
  }

  function ensureQuickCommentPopover() {
    if (quickCommentPopoverEl && quickCommentPopoverEl.isConnected) return quickCommentPopoverEl;
    quickCommentPopoverEl = document.createElement('div');
    quickCommentPopoverEl.className = 'quick-edit-popover quick-comment-popover';
    quickCommentPopoverEl.hidden = true;
    quickCommentPopoverEl.addEventListener('click', function(e) { e.stopPropagation(); });
    document.body.appendChild(quickCommentPopoverEl);
    if (!quickCommentDocumentHandlerBound) {
      document.addEventListener('click', function(e) {
        if (!quickCommentPopoverEl || quickCommentPopoverEl.hidden) return;
        if (quickCommentPopoverEl.contains(e.target)) return;
        var btn = document.querySelector('.btn-quick-comment-row.is-active-quick-comment');
        if (btn && btn.contains(e.target)) return;
        closeQuickCommentPopover();
      });
      quickCommentDocumentHandlerBound = true;
    }
    if (!quickCommentKeyHandlerBound) {
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && quickCommentPopoverEl && !quickCommentPopoverEl.hidden) closeQuickCommentPopover();
      });
      quickCommentKeyHandlerBound = true;
    }
    return quickCommentPopoverEl;
  }

  function closeQuickCommentPopover() {
    var btn = document.querySelector('.btn-quick-comment-row.is-active-quick-comment');
    if (btn) btn.classList.remove('is-active-quick-comment');
    if (quickCommentPopoverEl) {
      quickCommentPopoverEl.hidden = true;
      quickCommentPopoverEl.innerHTML = '';
    }
  }

  function positionQuickCommentPopover(clientX, clientY) {
    var popover = ensureQuickCommentPopover();
    if (popover.hidden) return;
    var popoverRect = popover.getBoundingClientRect();
    var offset = 12;
    var top = clientY + offset;
    var left = clientX + offset;
    if (left + popoverRect.width > window.innerWidth - 12) left = window.innerWidth - popoverRect.width - 12;
    if (left < 12) left = 12;
    if (top + popoverRect.height > window.innerHeight - 12) top = clientY - popoverRect.height - offset;
    if (top < 12) top = 12;
    popover.style.position = 'fixed';
    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
  }

  function openQuickCommentPopover(anchor, task, onQuickComment, onRowSelect, clickEvent) {
    if (!anchor || !task || !onQuickComment) return;
    closeQuickEditPopover();
    closeQuickCommentPopover();
    if (onRowSelect) onRowSelect(task.uid, true);
    anchor.classList.add('is-active-quick-comment');
    var clientX = (clickEvent && typeof clickEvent.clientX === 'number') ? clickEvent.clientX : (anchor.getBoundingClientRect().left + anchor.getBoundingClientRect().width / 2);
    var clientY = (clickEvent && typeof clickEvent.clientY === 'number') ? clickEvent.clientY : (anchor.getBoundingClientRect().top + anchor.getBoundingClientRect().height / 2);
    var popover = ensureQuickCommentPopover();
    popover.innerHTML =
      '<div class="quick-edit-popover-header">' +
        '<div class="quick-edit-title">Quick comment</div>' +
        '<div class="quick-edit-task-name">' + escapeHtml(task.name || 'Untitled task') + '</div>' +
      '</div>' +
      '<div class="quick-edit-body">' +
        '<div class="field"><label>Comment</label><textarea data-quick-comment-text placeholder="Add a quick update, note, or decision..." rows="3"></textarea></div>' +
      '</div>' +
      '<div class="quick-edit-actions">' +
        '<button type="button" class="btn btn-ghost" data-quick-comment-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-primary" data-quick-comment-add>Add</button>' +
      '</div>';
    popover.hidden = false;
    popover.style.visibility = 'hidden';
    requestAnimationFrame(function() {
      positionQuickCommentPopover(clientX, clientY);
      popover.style.visibility = '';
    });
    var textarea = popover.querySelector('[data-quick-comment-text]');
    if (textarea) window.setTimeout(function() { textarea.focus(); }, 0);
    popover.querySelector('[data-quick-comment-cancel]').addEventListener('click', closeQuickCommentPopover);
    popover.querySelector('[data-quick-comment-add]').addEventListener('click', function() {
      var commentText = (textarea && textarea.value || '').trim();
      if (!commentText) { showToast('Enter comment text', true); return; }
      var addBtn = popover.querySelector('[data-quick-comment-add]');
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      Promise.resolve(onQuickComment(task.uid, commentText))
        .then(function() {
          delete taskTooltipDetailsCache[task.uid];
          closeQuickCommentPopover();
          showToast('Comment added');
        })
        .catch(function(err) {
          addBtn.disabled = false;
          addBtn.textContent = 'Add';
          showToast((err && err.message) || 'Unable to add comment', true);
        });
    });
    popover.querySelectorAll('textarea').forEach(function(ta) {
      ta.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          popover.querySelector('[data-quick-comment-add]').click();
        }
      });
    });
  }

  function positionQuickEditPopover(clientX, clientY) {
    var popover = ensureQuickEditPopover();
    if (popover.hidden) return;
    var popoverRect = popover.getBoundingClientRect();
    var offset = 12;
    var top = clientY + offset;
    var left = clientX + offset;
    if (left + popoverRect.width > window.innerWidth - 12) {
      left = window.innerWidth - popoverRect.width - 12;
    }
    if (left < 12) left = 12;
    if (top + popoverRect.height > window.innerHeight - 12) {
      top = clientY - popoverRect.height - offset;
    }
    if (top < 12) top = 12;
    popover.style.position = 'fixed';
    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
  }

  function buildQuickEditBody(task, field, taskRag) {
    var progress = Math.max(0, Math.min(100, task.progress != null ? task.progress : 0));
    var rag = taskRag[task.uid] || 'green';
    if (field === 'accountable') {
      return '<div class="field"><label>Accountable</label><input type="text" data-quick-input="accountable_person" value="' + escapeHtml(task.accountable_person || '') + '" placeholder="Accountable owner" /></div>';
    }
    if (field === 'responsible') {
      return '<div class="field"><label>Responsible</label><input type="text" data-quick-input="responsible_party" value="' + escapeHtml(task.responsible_party || '') + '" placeholder="Responsible owner" /></div>';
    }
    if (field === 'start') {
      return '<div class="field"><label>Start date</label><input type="date" data-quick-input="start_date" value="' + escapeHtml(dateStr(task.start_date)) + '" /></div>';
    }
    if (field === 'end') {
      return '<div class="field"><label>End date</label><input type="date" data-quick-input="end_date" value="' + escapeHtml(dateStr(task.end_date)) + '" /></div>';
    }
    if (field === 'status') {
      return '<div class="field"><label>Status</label>' +
        '<select data-quick-input="status">' +
          '<option value="not_started"' + (task.status === 'not_started' ? ' selected' : '') + '>Not Started</option>' +
          '<option value="in_progress"' + (task.status === 'in_progress' ? ' selected' : '') + '>In Progress</option>' +
          '<option value="complete"' + (task.status === 'complete' ? ' selected' : '') + '>Complete</option>' +
          '<option value="blocked"' + (task.status === 'blocked' ? ' selected' : '') + '>Blocked</option>' +
          '<option value="cancelled"' + (task.status === 'cancelled' ? ' selected' : '') + '>Cancelled</option>' +
        '</select>' +
      '</div>';
    }
    if (field === 'rag') {
      return '<div class="field"><label>RAG</label>' +
        '<select data-quick-input="rag_status">' +
          '<option value="green"' + (rag === 'green' ? ' selected' : '') + '>Green</option>' +
          '<option value="amber"' + (rag === 'amber' ? ' selected' : '') + '>Amber</option>' +
          '<option value="red"' + (rag === 'red' ? ' selected' : '') + '>Red</option>' +
        '</select>' +
      '</div>' +
      '<div class="field"><label>Rationale</label><textarea data-quick-input="rationale" placeholder="What changed and why?"></textarea></div>' +
      '<div class="field"><label>Path to green</label><textarea data-quick-input="path_to_green" placeholder="Recovery actions, owners, and milestones"></textarea></div>' +
      '<div class="quick-edit-hint">Rationale is required for amber and red.</div>';
    }
    if (field === 'progress') {
      return '<div class="quick-progress-value"><span data-quick-progress-label>' + progress + '%</span></div>' +
        '<input type="range" min="0" max="100" step="5" value="' + progress + '" data-quick-input="progress" class="quick-progress-slider" />' +
        '<div class="quick-progress-presets">' +
          [0, 25, 50, 75, 100].map(function(value) {
            return '<button type="button" class="quick-progress-preset' + (value === progress ? ' is-selected' : '') + '" data-quick-progress-preset="' + value + '">' + value + '%</button>';
          }).join('') +
        '</div>';
    }
    return '';
  }

  function getQuickEditPayload(popover, field) {
    if (field === 'accountable') {
      return { accountable_person: (popover.querySelector('[data-quick-input="accountable_person"]').value || '').trim() };
    }
    if (field === 'responsible') {
      return { responsible_party: (popover.querySelector('[data-quick-input="responsible_party"]').value || '').trim() };
    }
    if (field === 'start') {
      return { start_date: popover.querySelector('[data-quick-input="start_date"]').value || null };
    }
    if (field === 'end') {
      return { end_date: popover.querySelector('[data-quick-input="end_date"]').value || null };
    }
    if (field === 'status') {
      return { status: popover.querySelector('[data-quick-input="status"]').value };
    }
    if (field === 'rag') {
      return {
        status: popover.querySelector('[data-quick-input="rag_status"]').value,
        rationale: (popover.querySelector('[data-quick-input="rationale"]').value || '').trim(),
        path_to_green: (popover.querySelector('[data-quick-input="path_to_green"]').value || '').trim()
      };
    }
    if (field === 'progress') {
      return { progress: parseInt(popover.querySelector('[data-quick-input="progress"]').value, 10) || 0 };
    }
    return {};
  }

  function syncProgressUi(popover) {
    var slider = popover.querySelector('[data-quick-input="progress"]');
    var label = popover.querySelector('[data-quick-progress-label]');
    if (!slider || !label) return;
    var value = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
    label.textContent = value + '%';
    popover.querySelectorAll('[data-quick-progress-preset]').forEach(function(button) {
      button.classList.toggle('is-selected', parseInt(button.getAttribute('data-quick-progress-preset'), 10) === value);
    });
  }

  function hydrateRagPopover(taskUid, popover) {
    var requestId = ++quickEditRagRequestId;
    Gantt.api.getTaskRag(taskUid).then(function(history) {
      if (!quickEditPopoverEl || quickEditPopoverEl.hidden || requestId !== quickEditRagRequestId || quickEditActiveUid !== taskUid || quickEditActiveField !== 'rag') return;
      var latest = history && history.length ? history[history.length - 1] : null;
      if (!latest) return;
      var rationaleInput = popover.querySelector('[data-quick-input="rationale"]');
      var pathInput = popover.querySelector('[data-quick-input="path_to_green"]');
      var statusInput = popover.querySelector('[data-quick-input="rag_status"]');
      if (statusInput && !statusInput.dataset.userTouched) statusInput.value = latest.status || statusInput.value;
      if (rationaleInput && !rationaleInput.dataset.userTouched) rationaleInput.value = latest.rationale || '';
      if (pathInput && !pathInput.dataset.userTouched) pathInput.value = latest.path_to_green || '';
    }).catch(function() {
      /* no-op: quick edit can still save without prefill */
    });
  }

  function openQuickEditPopover(anchor, task, field, taskRag, onQuickEditSave, onRowSelect, clickEvent) {
    if (!anchor || !task || !field || !onQuickEditSave) return;
    if (quickEditActiveAnchor === anchor && quickEditActiveField === field && quickEditActiveUid === task.uid && quickEditPopoverEl && !quickEditPopoverEl.hidden) {
      closeQuickEditPopover();
      return;
    }
    closeQuickEditPopover();
    closeQuickCommentPopover();
    if (onRowSelect) onRowSelect(task.uid, true);
    quickEditActiveAnchor = anchor;
    quickEditActiveUid = task.uid;
    quickEditActiveField = field;
    anchor.classList.add('is-active-quick-edit');
    var clientX = (clickEvent && typeof clickEvent.clientX === 'number') ? clickEvent.clientX : (anchor.getBoundingClientRect().left + anchor.getBoundingClientRect().width / 2);
    var clientY = (clickEvent && typeof clickEvent.clientY === 'number') ? clickEvent.clientY : (anchor.getBoundingClientRect().top + anchor.getBoundingClientRect().height / 2);
    var popover = ensureQuickEditPopover();
    popover.innerHTML =
      '<div class="quick-edit-popover-header">' +
        '<div class="quick-edit-title">' + escapeHtml(QUICK_EDIT_LABELS[field] || 'Quick edit') + '</div>' +
        '<div class="quick-edit-task-name">' + escapeHtml(task.name || 'Untitled task') + '</div>' +
      '</div>' +
      '<div class="quick-edit-body">' + buildQuickEditBody(task, field, taskRag) + '</div>' +
      '<div class="quick-edit-actions">' +
        '<button type="button" class="btn btn-ghost" data-quick-edit-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-primary" data-quick-edit-save>Save</button>' +
      '</div>';
    popover.hidden = false;
    popover.style.visibility = 'hidden';
    requestAnimationFrame(function() {
      positionQuickEditPopover(clientX, clientY);
      popover.style.visibility = '';
    });

    var primaryInput = popover.querySelector('input, select, textarea');
    if (primaryInput) window.setTimeout(function() { primaryInput.focus(); }, 0);

    popover.querySelector('[data-quick-edit-cancel]').addEventListener('click', function() {
      closeQuickEditPopover();
    });
    popover.querySelector('[data-quick-edit-save]').addEventListener('click', function() {
      var saveButton = popover.querySelector('[data-quick-edit-save]');
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
      Promise.resolve(onQuickEditSave(task, field, getQuickEditPayload(popover, field)))
        .then(function() {
          closeQuickEditPopover();
        })
        .catch(function(error) {
          saveButton.disabled = false;
          saveButton.textContent = 'Save';
          showToast((error && error.message) || 'Unable to save quick edit', true);
        });
    });

    popover.querySelectorAll('input, textarea, select').forEach(function(input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && input.tagName !== 'TEXTAREA' && !e.shiftKey) {
          e.preventDefault();
          popover.querySelector('[data-quick-edit-save]').click();
        }
      });
      if (field === 'rag') {
        input.addEventListener('input', function() {
          input.dataset.userTouched = '1';
        });
        input.addEventListener('change', function() {
          input.dataset.userTouched = '1';
        });
      }
    });

    if (field === 'progress') {
      var slider = popover.querySelector('[data-quick-input="progress"]');
      if (slider) {
        slider.addEventListener('input', function() { syncProgressUi(popover); });
      }
      popover.querySelectorAll('[data-quick-progress-preset]').forEach(function(button) {
        button.addEventListener('click', function() {
          if (!slider) return;
          slider.value = button.getAttribute('data-quick-progress-preset');
          syncProgressUi(popover);
        });
      });
      syncProgressUi(popover);
    }

    if (field === 'rag') {
      hydrateRagPopover(task.uid, popover);
    }
  }

  function ensureTaskTooltip() {
    if (taskTooltipEl && taskTooltipEl.isConnected) return taskTooltipEl;
    taskTooltipEl = document.createElement('div');
    taskTooltipEl.className = 'task-super-tooltip';
    taskTooltipEl.hidden = true;
    taskTooltipEl.addEventListener('mouseenter', function() {
      taskTooltipHovered = true;
      if (taskTooltipHideTimer) {
        window.clearTimeout(taskTooltipHideTimer);
        taskTooltipHideTimer = null;
      }
    });
    taskTooltipEl.addEventListener('mouseleave', function() {
      taskTooltipHovered = false;
      scheduleHideTaskTooltip();
    });
    document.body.appendChild(taskTooltipEl);
    return taskTooltipEl;
  }

  function positionTaskTooltip(anchor) {
    if (!taskTooltipEl || taskTooltipEl.hidden || !anchor) return;
    var rect = anchor.getBoundingClientRect();
    var tooltipRect = taskTooltipEl.getBoundingClientRect();
    var top = rect.bottom + 10;
    var left = rect.left + ((rect.width - tooltipRect.width) / 2);
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
    if (taskTooltipHovered) return;
    if (taskTooltipHideTimer) {
      window.clearTimeout(taskTooltipHideTimer);
      taskTooltipHideTimer = null;
    }
    if (taskTooltipLoadDelayTimer) {
      window.clearTimeout(taskTooltipLoadDelayTimer);
      taskTooltipLoadDelayTimer = null;
    }
    activeTaskTooltipAnchor = null;
    if (taskTooltipEl) taskTooltipEl.hidden = true;
  }

  function scheduleHideTaskTooltip() {
    if (taskTooltipHideTimer) window.clearTimeout(taskTooltipHideTimer);
    taskTooltipHideTimer = window.setTimeout(hideTaskTooltip, 180);
  }

  function getTaskDurationValue(task) {
    var durationValue = task.is_milestone
      ? prettyDate(task.start_date || task.end_date)
      : (prettyDate(task.start_date) + ' - ' + prettyDate(task.end_date));
    return durationValue;
  }

  function renderTaskTooltip(task, details) {
    var tooltip = ensureTaskTooltip();
    var latestComment = details && details.latestComment;
    var risks = details && details.risks;
    var riskOverflowCount = details && details.riskOverflowCount;
    var risksMarkup = !risks
      ? '<div class="task-super-tooltip-muted">Loading risks...</div>'
      : risks.length === 0
        ? '<div class="task-super-tooltip-muted">No risks.</div>'
        : '<div class="task-super-tooltip-list">' + risks.map(function(risk) {
            var summary = [risk.severity, risk.status].filter(Boolean).map(titleCaseStatus).join(' • ');
            return '<div class="task-super-tooltip-list-item">' +
              '<div class="task-super-tooltip-list-title">' + escapeHtml(risk.title || 'Untitled risk') + '</div>' +
              (summary ? '<div class="task-super-tooltip-list-meta">' + escapeHtml(summary) + '</div>' : '') +
            '</div>';
          }).join('') +
          (riskOverflowCount > 0 ? '<div class="task-super-tooltip-muted">+' + riskOverflowCount + ' more risk' + (riskOverflowCount === 1 ? '' : 's') + '</div>' : '') +
          '</div>';
    var pastDueBadge = isTaskPastDue(task) ? '<div class="task-super-tooltip-past-due">Past due</div>' : '';
    tooltip.innerHTML =
      '<div class="task-super-tooltip-title">' + escapeHtml(task.name || 'Untitled task') + '</div>' +
      pastDueBadge +
      '<div class="task-super-tooltip-desc">' + escapeHtml(task.description || 'No description provided.') + '</div>' +
      '<div class="task-super-tooltip-grid">' +
        '<div class="task-super-tooltip-label">Duration</div><div class="task-super-tooltip-value">' + escapeHtml(getTaskDurationValue(task)) + '</div>' +
      '</div>' +
      '<div class="task-super-tooltip-section">' +
        '<div class="task-super-tooltip-section-label">Latest Comment</div>' +
        '<div class="task-super-tooltip-section-value">' + escapeHtml(latestComment ? latestComment.comment_text : 'Loading latest comment...') + '</div>' +
      '</div>' +
      '<div class="task-super-tooltip-section">' +
        '<div class="task-super-tooltip-section-label">Risks</div>' +
        risksMarkup +
      '</div>';
    return tooltip;
  }

  function loadTaskTooltipDetails(task) {
    if (taskTooltipDetailsCache[task.uid]) return Promise.resolve(taskTooltipDetailsCache[task.uid]);
    return Promise.all([
      Gantt.api.getTaskComments(task.uid),
      Gantt.api.getTaskRisks(task.uid)
    ]).then(function(results) {
      var comments = results[0] || [];
      var risks = results[1] || [];
      var details = {
        latestComment: comments.length ? comments[comments.length - 1] : { comment_text: 'No comments yet.' },
        risks: risks.slice(0, 3),
        riskOverflowCount: Math.max(0, risks.length - 3)
      };
      taskTooltipDetailsCache[task.uid] = details;
      return details;
    }).catch(function() {
      return {
        latestComment: { comment_text: 'Unable to load comments.' },
        risks: [],
        riskOverflowCount: 0
      };
    });
  }

  function showTaskTooltip(anchor, task) {
    if (taskTooltipLoadDelayTimer) {
      window.clearTimeout(taskTooltipLoadDelayTimer);
      taskTooltipLoadDelayTimer = null;
    }
    var tooltip = renderTaskTooltip(task, null);
    activeTaskTooltipAnchor = anchor;
    taskTooltipHovered = false;
    if (taskTooltipHideTimer) {
      window.clearTimeout(taskTooltipHideTimer);
      taskTooltipHideTimer = null;
    }
    var requestId = ++taskTooltipRequestId;
    tooltip.hidden = false;
    positionTaskTooltip(anchor);
    taskTooltipLoadDelayTimer = window.setTimeout(function() {
      taskTooltipLoadDelayTimer = null;
      loadTaskTooltipDetails(task).then(function(details) {
        if (!taskTooltipEl || taskTooltipEl.hidden || requestId !== taskTooltipRequestId || activeTaskTooltipAnchor !== anchor) return;
        renderTaskTooltip(task, details);
        positionTaskTooltip(anchor);
      });
    }, TOOLTIP_LOAD_DELAY_MS);
  }

  function bindTaskTooltip(anchor, task) {
    if (!anchor) return;
    anchor.addEventListener('mouseenter', function() {
      showTaskTooltip(anchor, task);
    });
    anchor.addEventListener('mousemove', function() {
      if (!taskTooltipHovered) positionTaskTooltip(anchor);
    });
    anchor.addEventListener('mouseleave', scheduleHideTaskTooltip);
    anchor.addEventListener('focus', function() {
      showTaskTooltip(anchor, task);
    });
    anchor.addEventListener('blur', hideTaskTooltip);
  }

  function renderQuickEditCell(task, field, content, extraClass) {
    var classes = ['quick-edit-trigger'];
    if (extraClass) classes.push(extraClass);
    return '<button type="button" class="' + classes.join(' ') + '" data-quick-edit="' + escapeHtml(field) + '" data-task-uid="' + escapeHtml(task.uid) + '">' + content + '</button>';
  }

  function render(visibleTree, taskRag, selectedTaskUid, hasChildren, isExpanded, onRowSelect, onToggle, onOpenDetail, onAddSubtask, onQuickEditSave, onQuickComment) {
    var el = Gantt.state.getEl();
    var isEditable = Gantt.state.isEditMode();
    var bindRagTooltip = Gantt.ragTooltip && Gantt.ragTooltip.bind;
    taskTooltipDetailsCache = {};
    closeQuickEditPopover();
    closeQuickCommentPopover();
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
      if (isTaskPastDue(t)) rowClasses.push('task-row-past-due');
      var accountableCell = isEditable
        ? renderQuickEditCell(t, 'accountable', '<span class="person-chip">' + escapeHtml(t.accountable_person || 'Unassigned') + '</span>')
        : '<span class="person-chip">' + escapeHtml(t.accountable_person || 'Unassigned') + '</span>';
      var responsibleCell = isEditable
        ? renderQuickEditCell(t, 'responsible', '<span class="person-chip">' + escapeHtml(t.responsible_party || 'Unassigned') + '</span>')
        : '<span class="person-chip">' + escapeHtml(t.responsible_party || 'Unassigned') + '</span>';
      var startCell = isEditable
        ? renderQuickEditCell(t, 'start', '<span class="quick-edit-date-value">' + escapeHtml(shortDate(t.start_date)) + '</span>', 'quick-edit-date-trigger')
        : shortDate(t.start_date);
      var endCell = isEditable
        ? renderQuickEditCell(t, 'end', '<span class="quick-edit-date-value">' + escapeHtml(shortDate(t.end_date)) + '</span>', 'quick-edit-date-trigger')
        : shortDate(t.end_date);
      var ragCell = isEditable
        ? renderQuickEditCell(t, 'rag', '<span class="rag-badge-table rag-tooltip-anchor ' + rag + '" data-task-uid="' + escapeHtml(t.uid) + '" data-task-name="' + escapeHtml(t.name) + '" tabindex="0">' + escapeHtml(rag === 'none' ? '—' : titleCaseStatus(rag)) + '</span>')
        : '<span class="rag-badge-table rag-tooltip-anchor ' + rag + '" data-task-uid="' + escapeHtml(t.uid) + '" data-task-name="' + escapeHtml(t.name) + '" tabindex="0">' + escapeHtml(rag === 'none' ? '—' : titleCaseStatus(rag)) + '</span>';
      var statusCell = isEditable
        ? renderQuickEditCell(t, 'status', '<span class="status-badge status-' + escapeHtml(t.status || 'not_started') + '">' + escapeHtml(titleCaseStatus(t.status || 'not_started')) + '</span>')
        : '<span class="status-badge status-' + escapeHtml(t.status || 'not_started') + '">' + escapeHtml(titleCaseStatus(t.status || 'not_started')) + '</span>';
      var progressCell = '<div class="table-progress" aria-label="Progress ' + progress + ' percent">' +
        '<span class="table-progress-track"><span class="table-progress-fill" style="width:' + progress + '%"></span></span>' +
        '<span class="table-progress-value">' + progress + '%</span>' +
      '</div>';
      if (isEditable) progressCell = renderQuickEditCell(t, 'progress', progressCell, 'quick-edit-progress-trigger');
      return '<tr data-uid="' + escapeHtml(t.uid) + '" class="' + rowClasses.join(' ') + '">' +
        '<td>' +
          '<div class="task-cell-shell">' +
            '<span class="task-hierarchy-number">' + escapeHtml(hierarchyNumber) + '</span>' +
            '<div class="task-cell-main ' + indent + '">' +
            '<span class="' + toggleClass + '" data-uid="' + escapeHtml(t.uid) + '" data-has-children="' + (hasKids ? '1' : '0') + '" title="' + escapeHtml(toggleTitle) + '" aria-label="' + escapeHtml(toggleTitle) + '">' + toggleChar + '</span>' +
            milestoneMarker +
            '<span class="rag-dot ' + rag + '" aria-hidden="true"></span>' +
            '<div class="task-name task-title-tooltip-anchor' + (t.status === 'cancelled' ? ' is-cancelled' : '') + (isTaskPastDue(t) ? ' has-past-due-indicator' : '') + '" data-task-uid="' + escapeHtml(t.uid) + '" tabindex="0">' + (isTaskPastDue(t) ? '<span class="past-due-icon" title="Past due" aria-label="Past due">!</span>' : '') + escapeHtml(t.name) + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + accountableCell + '</td>' +
        '<td>' + responsibleCell + '</td>' +
        '<td>' + startCell + '</td>' +
        '<td>' + endCell + '</td>' +
        '<td>' + ragCell + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td>' + progressCell + '</td>' +
        '<td class="task-row-actions">' + (isEditable
          ? ('<button type="button" class="btn-row-action btn-add-subtask-row" data-uid="' + escapeHtml(t.uid) + '" title="Add subtask">+</button>' +
            '<button type="button" class="btn-row-action btn-quick-comment-row" data-uid="' + escapeHtml(t.uid) + '" title="Quick comment" aria-label="Add quick comment">\u{1F4AC}</button>')
          : '') +
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

    if (isEditable && onQuickComment) {
      el.taskTbody.querySelectorAll('.btn-quick-comment-row').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var uid = btn.getAttribute('data-uid');
          var task = visibleTree.find(function(t) { return t.uid === uid; });
          if (!task) return;
          openQuickCommentPopover(btn, task, onQuickComment, onRowSelect, e);
        });
      });
    }

    if (bindRagTooltip) {
      el.taskTbody.querySelectorAll('.rag-tooltip-anchor[data-task-uid]').forEach(function(anchor) {
        bindRagTooltip(anchor, {
          taskUid: anchor.getAttribute('data-task-uid'),
          taskName: anchor.getAttribute('data-task-name')
        });
      });
    }

    if (isEditable && onQuickEditSave) {
      el.taskTbody.querySelectorAll('[data-quick-edit][data-task-uid]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
          e.stopPropagation();
          var uid = anchor.getAttribute('data-task-uid');
          var field = anchor.getAttribute('data-quick-edit');
          var task = visibleTree.find(function(item) { return item.uid === uid; });
          if (!task) return;
          openQuickEditPopover(anchor, task, field, taskRag, onQuickEditSave, onRowSelect, e);
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
        if (e.target.classList.contains('task-toggle') || e.target.classList.contains('btn-add-subtask-row') || e.target.classList.contains('btn-quick-comment-row') || e.target.closest('[data-quick-edit]')) return;
        var uid = tr.getAttribute('data-uid');
        el.taskTbody.querySelectorAll('tr').forEach(function(r) { r.classList.remove('selected'); });
        tr.classList.add('selected');
        if (el.btnAddSubtask) el.btnAddSubtask.disabled = false;
        if (onRowSelect) onRowSelect(uid);
      });
      tr.addEventListener('dblclick', function(e) {
        if (e.target.classList.contains('task-toggle') || e.target.classList.contains('btn-add-subtask-row') || e.target.classList.contains('btn-quick-comment-row') || e.target.closest('[data-quick-edit]')) return;
        var uid = tr.getAttribute('data-uid');
        if (onOpenDetail) onOpenDetail(uid);
      });
    });
  }

  return { render: render };
})();
