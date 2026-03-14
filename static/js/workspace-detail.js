window.Gantt = window.Gantt || {};

Gantt.detail = (function() {
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var dateStr = function(d) { return Gantt.utils.dateStr(d); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };
  var showToast = function(msg, err) { return Gantt.utils.showToast(msg, err); };
  var activeTabName = 'task';
  var lastRenderedTaskUid = null;
  var bindRagTooltip = function(anchor, options) {
    if (Gantt.ragTooltip && Gantt.ragTooltip.bind) {
      Gantt.ragTooltip.bind(anchor, options);
    }
  };
  var cacheRagTooltip = function(taskUid, history) {
    if (Gantt.ragTooltip && Gantt.ragTooltip.setCache) {
      Gantt.ragTooltip.setCache(taskUid, history);
    }
  };

  function renderSkeletonCards(count) {
    return new Array(count).fill('').map(function() {
      return '<div class="loading-skeleton-card">' +
        '<div class="loading-skeleton-line w-40"></div>' +
        '<div class="loading-skeleton-line w-90"></div>' +
        '<div class="loading-skeleton-line w-70"></div>' +
      '</div>';
    }).join('');
  }

  function flashButtonSuccess(buttonId, successLabel) {
    var button = document.getElementById(buttonId);
    if (!button) return;
    var originalLabel = button.textContent;
    button.textContent = successLabel;
    button.classList.add('is-success-pulse');
    window.setTimeout(function() {
      button.textContent = originalLabel;
      button.classList.remove('is-success-pulse');
    }, 1200);
  }

  function openTaskModal() {
    var el = Gantt.state.getEl();
    if (el.taskDetailModal) {
      el.taskDetailModal.classList.add('visible');
      el.taskDetailModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeTaskModal() {
    var el = Gantt.state.getEl();
    if (el.taskDetailModal) {
      el.taskDetailModal.classList.remove('visible');
      el.taskDetailModal.setAttribute('aria-hidden', 'true');
    }
    activeTabName = 'task';
    lastRenderedTaskUid = null;
  }

  function renderDetail(refreshAll) {
    var state = Gantt.state;
    var el = state.getEl();
    var selectedTaskUid = state.getSelectedTaskUid();
    var tasks = state.getTasks();
    var dependencies = state.getDependencies();
    var workspace = Gantt.workspace;
    var isEditable = workspace && workspace.isEditMode && workspace.isEditMode();
    var employeeId = workspace && workspace.getEmployeeId ? workspace.getEmployeeId() : '';
    var disabledAttr = isEditable ? '' : ' disabled';

    if (!selectedTaskUid) {
      closeTaskModal();
      return;
    }
    var task = tasks.find(function(t) { return t.uid === selectedTaskUid; });
    if (!task) {
      closeTaskModal();
      return;
    }
    if (lastRenderedTaskUid !== selectedTaskUid) {
      activeTabName = 'task';
      lastRenderedTaskUid = selectedTaskUid;
    }

    if (el.taskDetailModalTitle) el.taskDetailModalTitle.textContent = task.name || 'Edit task';
    el.detailContent.innerHTML =
      '<div class="detail-topbar">' +
        '<div class="detail-summary">' +
          (task.is_milestone ? '<span class="summary-chip summary-chip-milestone">Milestone</span>' : '') +
          '<span class="summary-chip">' + escapeHtml(task.accountable_person || 'No accountable') + '</span>' +
          '<span class="summary-chip">' + escapeHtml(task.responsible_party || 'No responsible') + '</span>' +
          '<span class="summary-chip">' + escapeHtml(task.is_milestone ? prettyDate(task.start_date || task.end_date) : (prettyDate(task.start_date) + ' - ' + prettyDate(task.end_date))) + '</span>' +
          '<span class="summary-chip summary-chip-status">' + escapeHtml(titleCaseStatus(task.status || 'not_started')) + ' • ' + (task.progress != null ? task.progress : 0) + '%</span>' +
          '<span class="summary-chip summary-chip-mode">' + (isEditable ? ('Edit mode' + (employeeId ? ' • ' + escapeHtml(employeeId) : '')) : 'Read mode') + '</span>' +
        '</div>' +
        '<div class="detail-save-stack">' +
          '<button type="button" class="btn btn-primary" id="detail-save"' + disabledAttr + '>Save task</button>' +
          '<div class="detail-save-hint">' + (isEditable ? 'Changes update the plan immediately.' : 'Switch to edit mode to save changes.') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tabs" role="tablist" aria-label="Task detail sections">' +
        '<button type="button" class="detail-tab' + (activeTabName === 'task' ? ' is-active' : '') + '" data-tab-btn="task">Task</button>' +
        '<button type="button" class="detail-tab' + (activeTabName === 'health' ? ' is-active' : '') + '" data-tab-btn="health">Health</button>' +
        '<button type="button" class="detail-tab' + (activeTabName === 'comments' ? ' is-active' : '') + '" data-tab-btn="comments">Comments</button>' +
        '<button type="button" class="detail-tab' + (activeTabName === 'risks' ? ' is-active' : '') + '" data-tab-btn="risks">Risks</button>' +
        '<button type="button" class="detail-tab' + (activeTabName === 'dependencies' ? ' is-active' : '') + '" data-tab-btn="dependencies">Dependencies</button>' +
      '</div>' +
      '<div class="detail-tab-panel' + (activeTabName === 'task' ? ' is-active' : '') + '" data-tab-panel="task"' + (activeTabName === 'task' ? '' : ' hidden') + '>' +
        '<div class="section">' +
          '<div class="section-heading">' +
            '<div>' +
              '<h3>Task</h3>' +
              '<p class="section-copy">Core task details, ownership, and schedule window.</p>' +
            '</div>' +
          '</div>' +
          '<div class="field"><label>Name</label><input type="text" id="detail-name" value="' + escapeHtml(task.name) + '" placeholder="Task name"' + disabledAttr + ' /></div>' +
          '<div class="field"><label>Description</label><textarea id="detail-desc"' + disabledAttr + '>' + escapeHtml(task.description) + '</textarea></div>' +
          '<div class="form-row">' +
            '<div class="field"><label>Accountable</label><input type="text" id="detail-accountable" value="' + escapeHtml(task.accountable_person) + '"' + disabledAttr + ' /></div>' +
            '<div class="field"><label>Responsible</label><input type="text" id="detail-responsible" value="' + escapeHtml(task.responsible_party) + '"' + disabledAttr + ' /></div>' +
          '</div>' +
          '<label class="detail-toggle-row">' +
            '<input type="checkbox" id="detail-is-milestone"' + (task.is_milestone ? ' checked' : '') + disabledAttr + ' />' +
            '<span>Render as milestone on the timeline</span>' +
          '</label>' +
          '<div class="form-row">' +
            '<div class="field"><label>' + (task.is_milestone ? 'Milestone date' : 'Start date') + '</label><input type="date" id="detail-start" value="' + dateStr(task.start_date) + '"' + disabledAttr + ' /></div>' +
            '<div class="field"><label>' + (task.is_milestone ? 'Mirror date' : 'End date') + '</label><input type="date" id="detail-end" value="' + dateStr(task.end_date) + '"' + disabledAttr + ' /></div>' +
          '</div>' +
          '<div class="detail-danger-zone">' +
            '<div class="detail-danger-copy">' +
              '<div class="detail-danger-title">Remove from plan view</div>' +
              '<div class="detail-danger-text">Soft-deleted tasks disappear from the workspace. You can either keep subtasks by shifting them up one level, or soft-delete the entire subtree.</div>' +
            '</div>' +
            '<div class="detail-danger-actions">' +
              '<button type="button" class="btn btn-secondary" id="detail-soft-delete-shift"' + disabledAttr + '>Delete, keep subtasks</button>' +
              '<button type="button" class="btn btn-danger" id="detail-soft-delete-cascade"' + disabledAttr + '>Delete with subtasks</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel' + (activeTabName === 'health' ? ' is-active' : '') + '" data-tab-panel="health"' + (activeTabName === 'health' ? '' : ' hidden') + '>' +
        '<div class="section section-health">' +
          '<div class="section-heading">' +
            '<div>' +
              '<h3>Health</h3>' +
              '<p class="section-copy">Track delivery health, recovery plan, and the latest RAG signal.</p>' +
            '</div>' +
          '</div>' +
          '<div class="health-metrics">' +
            '<div class="field"><label>Status</label>' +
              '<select id="detail-status"' + disabledAttr + '>' +
                '<option value="not_started"' + (task.status === 'not_started' ? ' selected' : '') + '>Not Started</option>' +
                '<option value="in_progress"' + (task.status === 'in_progress' ? ' selected' : '') + '>In Progress</option>' +
                '<option value="complete"' + (task.status === 'complete' ? ' selected' : '') + '>Complete</option>' +
                '<option value="blocked"' + (task.status === 'blocked' ? ' selected' : '') + '>Blocked</option>' +
                '<option value="cancelled"' + (task.status === 'cancelled' ? ' selected' : '') + '>Cancelled</option>' +
              '</select>' +
            '</div>' +
            '<div class="field"><label>Progress %</label><input type="number" id="detail-progress" min="0" max="100" value="' + (task.progress != null ? task.progress : 0) + '"' + disabledAttr + ' /></div>' +
          '</div>' +
          '<div id="rag-current"></div>' +
          '<div class="rag-composer">' +
            '<div class="rag-composer-header">' +
              '<div class="section-kicker">Update RAG</div>' +
              '<div class="section-copy">Rationale is required for amber and red.</div>' +
            '</div>' +
            '<div class="rag-composer-row">' +
              '<select id="rag-status"' + disabledAttr + '><option value="green">green</option><option value="amber">amber</option><option value="red">red</option></select>' +
              '<input type="text" id="rag-rationale" placeholder="What changed and why?"' + disabledAttr + ' />' +
              '<button type="button" class="btn btn-secondary" id="rag-add"' + disabledAttr + '>Update RAG</button>' +
            '</div>' +
            '<div class="field field-path-to-green"><label>Path to green</label><textarea id="rag-path-to-green" placeholder="Recovery plan, mitigation actions, owners, and milestones to return to green"' + disabledAttr + '></textarea></div>' +
          '</div>' +
          '<div id="rag-history"></div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel' + (activeTabName === 'comments' ? ' is-active' : '') + '" data-tab-panel="comments"' + (activeTabName === 'comments' ? '' : ' hidden') + '>' +
        '<div class="section">' +
          '<div class="section-heading">' +
            '<div>' +
              '<h3>Comments</h3>' +
              '<p class="section-copy">Capture updates, decisions, and context for this task.</p>' +
            '</div>' +
          '</div>' +
          '<div id="comments-list"></div>' +
          '<div class="field"><label>Comment</label><textarea id="comment-text" placeholder="' + (isEditable ? 'Add a comment' : 'Switch to edit mode to comment') + '"' + disabledAttr + '></textarea></div>' +
          '<button type="button" class="btn btn-secondary" id="comment-add"' + disabledAttr + '>Add comment</button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel' + (activeTabName === 'risks' ? ' is-active' : '') + '" data-tab-panel="risks"' + (activeTabName === 'risks' ? '' : ' hidden') + '>' +
        '<div class="section">' +
          '<div class="section-heading">' +
            '<div>' +
              '<h3>Risks</h3>' +
              '<p class="section-copy">Track blockers, mitigation plans, and open delivery risks.</p>' +
            '</div>' +
          '</div>' +
          '<div id="risks-list"></div>' +
          '<button type="button" class="btn btn-secondary" id="risk-add-btn"' + disabledAttr + '>Add risk</button>' +
          '<div id="risk-form" style="display:none; margin-top:0.5rem;">' +
            '<div class="field"><input type="text" id="risk-title" placeholder="Title"' + disabledAttr + ' /></div>' +
            '<div class="field"><textarea id="risk-desc" placeholder="Description"' + disabledAttr + '></textarea></div>' +
            '<div class="form-row">' +
              '<div class="field"><select id="risk-severity"' + disabledAttr + '><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select></div>' +
              '<div class="field"><select id="risk-status"' + disabledAttr + '><option value="open">open</option><option value="mitigated">mitigated</option><option value="closed">closed</option></select></div>' +
            '</div>' +
            '<div class="field"><input type="text" id="risk-owner" placeholder="Owner"' + disabledAttr + ' /></div>' +
            '<div class="field"><textarea id="risk-mitigation" placeholder="Mitigation plan"' + disabledAttr + '></textarea></div>' +
            '<button type="button" class="btn btn-primary" id="risk-save"' + disabledAttr + '>Save risk</button>' +
            '<button type="button" class="btn btn-secondary" id="risk-cancel"' + disabledAttr + '>Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel' + (activeTabName === 'dependencies' ? ' is-active' : '') + '" data-tab-panel="dependencies"' + (activeTabName === 'dependencies' ? '' : ' hidden') + '>' +
        '<div class="section">' +
          '<div class="section-heading">' +
            '<div>' +
              '<h3>Dependencies</h3>' +
              '<p class="section-copy">Manage predecessor and successor links that affect delivery flow.</p>' +
            '</div>' +
          '</div>' +
          '<div id="deps-list"></div>' +
          '<div class="form-inline">' +
            '<select id="dep-predecessor"' + disabledAttr + '></select>' +
            '<select id="dep-type"' + disabledAttr + '><option value="FS">FS</option><option value="SS">SS</option><option value="FF">FF</option><option value="SF">SF</option></select>' +
            '<button type="button" class="btn btn-secondary" id="dep-add"' + disabledAttr + '>Add dependency</button>' +
          '</div>' +
          '<p class="empty-msg" style="font-size:0.85rem">Add dependency: this task as successor; choose predecessor above.</p>' +
        '</div>' +
      '</div>';

    function activateTab(tabName) {
      activeTabName = tabName;
      el.detailContent.querySelectorAll('[data-tab-btn]').forEach(function(btn) {
        var active = btn.getAttribute('data-tab-btn') === tabName;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      el.detailContent.querySelectorAll('[data-tab-panel]').forEach(function(panel) {
        var active = panel.getAttribute('data-tab-panel') === tabName;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    }

    el.detailContent.querySelectorAll('[data-tab-btn]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activateTab(btn.getAttribute('data-tab-btn'));
      });
    });

    // Save task
    document.getElementById('detail-save').addEventListener('click', function() {
      if (!workspace || !workspace.ensureEditAccess) return;
      var isMilestone = document.getElementById('detail-is-milestone').checked;
      var startDate = document.getElementById('detail-start').value || null;
      var endDate = document.getElementById('detail-end').value || null;
      if (isMilestone) {
        if (startDate && !endDate) endDate = startDate;
        if (!startDate && endDate) startDate = endDate;
        if (startDate && endDate && startDate !== endDate) endDate = startDate;
      }
      var payload = {
        name: document.getElementById('detail-name').value.trim(),
        description: document.getElementById('detail-desc').value.trim(),
        accountable_person: document.getElementById('detail-accountable').value.trim(),
        responsible_party: document.getElementById('detail-responsible').value.trim(),
        start_date: startDate,
        end_date: endDate,
        is_milestone: isMilestone,
        status: document.getElementById('detail-status').value,
        progress: parseInt(document.getElementById('detail-progress').value, 10) || 0
      };
      workspace.ensureEditAccess(function() {
        Gantt.api.patchTask(selectedTaskUid, payload)
          .then(function() { showToast('Task saved'); flashButtonSuccess('detail-save', 'Saved'); if (refreshAll) refreshAll(); })
          .catch(function(e) { showToast(e.message, true); });
      });
    });

    function runSoftDelete(strategy) {
      if (!workspace || !workspace.ensureEditAccess) return;
      var confirmMessage = strategy === 'delete_subtasks'
        ? 'Soft-delete this task and all subtasks? They will disappear from the workspace view.'
        : 'Soft-delete this task and shift its subtasks up one level?';
      if (!window.confirm(confirmMessage)) return;
      workspace.ensureEditAccess(function() {
        Gantt.api.softDeleteTask(selectedTaskUid, { strategy: strategy })
          .then(function() {
            showToast(strategy === 'delete_subtasks' ? 'Task and subtasks removed from view' : 'Task removed and subtasks shifted up');
            closeTaskModal();
            if (refreshAll) refreshAll();
          })
          .catch(function(e) { showToast(e.message, true); });
      });
    }

    var btnSoftDeleteShift = document.getElementById('detail-soft-delete-shift');
    if (btnSoftDeleteShift) {
      btnSoftDeleteShift.addEventListener('click', function() {
        runSoftDelete('shift_up');
      });
    }
    var btnSoftDeleteCascade = document.getElementById('detail-soft-delete-cascade');
    if (btnSoftDeleteCascade) {
      btnSoftDeleteCascade.addEventListener('click', function() {
        runSoftDelete('delete_subtasks');
      });
    }

    // RAG
    function loadRag() {
      document.getElementById('rag-current').innerHTML = renderSkeletonCards(1);
      document.getElementById('rag-history').innerHTML = '';
      Gantt.api.getTaskRag(selectedTaskUid).then(function(rag) {
        var cur = rag.length ? rag[rag.length - 1] : null;
        cacheRagTooltip(selectedTaskUid, rag);
        document.getElementById('rag-current').innerHTML = cur
          ? '<div class="rag-current-card">' +
              '<div class="rag-current-header">' +
                '<span class="rag-badge rag-tooltip-anchor" id="rag-current-badge" tabindex="0">' + escapeHtml(titleCaseStatus(cur.status)) + '</span>' +
                '<span class="rag-current-meta">' + escapeHtml(prettyDate(cur.created_at)) + '</span>' +
              '</div>' +
              '<div class="rag-current-body">' + escapeHtml(cur.rationale || 'No rationale provided') + '</div>' +
              (cur.status !== 'green'
                ? '<div class="rag-current-foot"><span class="rag-current-foot-label">Path to green</span><span>' + escapeHtml(cur.path_to_green || 'Not provided yet') + '</span></div>'
                : '') +
            '</div>'
          : '<div class="rag-current-empty">No RAG status yet. Set the current signal and recovery plan here.</div>';
        document.getElementById('rag-history').innerHTML = rag.length <= 1 ? '' : rag.slice(0, -1).reverse().map(function(r) {
          return '<div class="list-item"><span class="rag-badge ' + r.status + '">' + escapeHtml(titleCaseStatus(r.status)) + '</span> ' + escapeHtml(r.rationale || 'No rationale provided') + ' <div class="meta">' + escapeHtml(prettyDate(r.created_at)) + '</div></div>';
        }).join('');
        if (cur) {
          var badge = document.getElementById('rag-current-badge');
          if (badge) {
            badge.classList.add(cur.status);
            bindRagTooltip(badge, {
              taskUid: selectedTaskUid,
              taskName: task.name,
              history: rag
            });
          }
          if (document.getElementById('rag-path-to-green')) {
            document.getElementById('rag-path-to-green').value = cur.path_to_green || '';
          }
        } else if (document.getElementById('rag-path-to-green')) {
          document.getElementById('rag-path-to-green').value = '';
        }
      });
    }
    loadRag();
    document.getElementById('rag-add').addEventListener('click', function() {
      var status = document.getElementById('rag-status').value;
      var rationale = document.getElementById('rag-rationale').value.trim();
      var pathToGreen = document.getElementById('rag-path-to-green').value.trim();
      if ((status === 'amber' || status === 'red') && !rationale) { showToast('Rationale required for amber/red', true); return; }
      workspace.ensureEditAccess(function() {
        Gantt.api.postRag(selectedTaskUid, { status: status, rationale: rationale, path_to_green: pathToGreen })
          .then(function() { showToast('RAG updated'); flashButtonSuccess('rag-add', 'Updated'); loadRag(); if (refreshAll) refreshAll(); })
          .catch(function(e) { showToast(e.message, true); });
      });
    });

    // Comments
    function loadComments() {
      var listEl = document.getElementById('comments-list');
      listEl.innerHTML = renderSkeletonCards(2);
      Gantt.api.getTaskComments(selectedTaskUid).then(function(comments) {
        listEl.innerHTML = comments.length === 0 ? '<div class="empty-state-card">No comments yet. Add updates, decisions, or notes for this task.</div>' : comments.slice().reverse().map(function(c) {
          return '<div class="list-item list-item-comment">' +
            '<div class="list-item-body">' + escapeHtml(c.comment_text) + '</div>' +
            '<div class="meta">' + escapeHtml(c.author || 'Unknown') + ' · ' + escapeHtml(prettyDate(c.created_at)) + '</div>' +
          '</div>';
        }).join('');
      }).catch(function() {
        listEl.innerHTML = '<div class="empty-state-card">Comments could not be loaded right now.</div>';
      });
    }
    loadComments();
    document.getElementById('comment-add').addEventListener('click', function() {
      var comment_text = document.getElementById('comment-text').value.trim();
      if (!comment_text) { showToast('Enter comment text', true); return; }
      workspace.ensureEditAccess(function(authorId) {
        Gantt.api.postComment(selectedTaskUid, { author: authorId, comment_text: comment_text })
          .then(function() {
            document.getElementById('comment-text').value = '';
            loadComments();
            showToast('Comment added');
            flashButtonSuccess('comment-add', 'Added');
          })
          .catch(function(e) { showToast(e.message, true); });
      });
    });

    // Risks
    var editingRiskUid = null;
    function loadRisks() {
      var listEl = document.getElementById('risks-list');
      listEl.innerHTML = renderSkeletonCards(2);
      Gantt.api.getTaskRisks(selectedTaskUid).then(function(risks) {
        listEl.innerHTML = risks.length === 0 ? '<div class="empty-state-card">No risks yet. Add delivery risks, owners, and mitigation actions here.</div>' : risks.map(function(r) {
          return '<div class="list-item list-item-risk" data-uid="' + escapeHtml(r.uid) + '">' +
            '<div class="list-item-header">' +
              '<strong>' + escapeHtml(r.title) + '</strong>' +
              '<div class="list-item-badges">' +
                '<span class="severity-badge ' + escapeHtml(r.severity) + '">' + escapeHtml(r.severity) + '</span>' +
                '<span class="risk-status-chip">' + escapeHtml(titleCaseStatus(r.status)) + '</span>' +
              '</div>' +
            '</div>' +
            (r.description ? '<div class="list-item-body">' + escapeHtml(r.description) + '</div>' : '') +
            ((r.owner || r.mitigation_plan)
              ? '<div class="meta">' +
                  (r.owner ? ('Owner: ' + escapeHtml(r.owner)) : '') +
                  (r.owner && r.mitigation_plan ? ' · ' : '') +
                  (r.mitigation_plan ? ('Mitigation: ' + escapeHtml(r.mitigation_plan)) : '') +
                '</div>'
              : '') +
            '<button type="button" class="btn btn-secondary btn-inline-action"' + disabledAttr + ' data-edit="' + escapeHtml(r.uid) + '">Edit</button>' +
          '</div>';
        }).join('');
        listEl.querySelectorAll('[data-edit]').forEach(function(b) {
          b.addEventListener('click', function() {
            editingRiskUid = b.getAttribute('data-edit');
            var risk = risks.find(function(x) { return x.uid === editingRiskUid; });
            if (!risk) return;
            document.getElementById('risk-form').style.display = 'block';
            document.getElementById('risk-title').value = risk.title;
            document.getElementById('risk-desc').value = risk.description || '';
            document.getElementById('risk-severity').value = risk.severity;
            document.getElementById('risk-status').value = risk.status;
            document.getElementById('risk-owner').value = risk.owner || '';
            document.getElementById('risk-mitigation').value = risk.mitigation_plan || '';
          });
        });
      }).catch(function() {
        listEl.innerHTML = '<div class="empty-state-card">Risks could not be loaded right now.</div>';
      });
    }
    loadRisks();
    document.getElementById('risk-add-btn').addEventListener('click', function() {
      editingRiskUid = null;
      document.getElementById('risk-form').style.display = 'block';
      document.getElementById('risk-title').value = '';
      document.getElementById('risk-desc').value = '';
      document.getElementById('risk-severity').value = 'medium';
      document.getElementById('risk-status').value = 'open';
      document.getElementById('risk-owner').value = '';
      document.getElementById('risk-mitigation').value = '';
    });
    document.getElementById('risk-cancel').addEventListener('click', function() {
      document.getElementById('risk-form').style.display = 'none';
      editingRiskUid = null;
    });
    document.getElementById('risk-save').addEventListener('click', function() {
      var payload = {
        title: document.getElementById('risk-title').value.trim(),
        description: document.getElementById('risk-desc').value.trim(),
        severity: document.getElementById('risk-severity').value,
        status: document.getElementById('risk-status').value,
        owner: document.getElementById('risk-owner').value.trim(),
        mitigation_plan: document.getElementById('risk-mitigation').value.trim()
      };
      if (!payload.title) { showToast('Title required', true); return; }
      workspace.ensureEditAccess(function() {
        if (editingRiskUid) {
          Gantt.api.patchRisk(editingRiskUid, payload)
            .then(function() {
              showToast('Risk updated');
              document.getElementById('risk-form').style.display = 'none';
              editingRiskUid = null;
              flashButtonSuccess('risk-save', 'Saved');
              loadRisks();
            })
            .catch(function(e) { showToast(e.message, true); });
        } else {
          Gantt.api.postRisk(selectedTaskUid, payload)
            .then(function() {
              showToast('Risk added');
              document.getElementById('risk-form').style.display = 'none';
              flashButtonSuccess('risk-save', 'Saved');
              loadRisks();
            })
            .catch(function(e) { showToast(e.message, true); });
        }
      });
    });

    // Dependencies
    var predSelect = document.getElementById('dep-predecessor');
    predSelect.innerHTML = '<option value="">Select predecessor</option>' + tasks.filter(function(t) { return t.uid !== selectedTaskUid; }).map(function(t) {
      return '<option value="' + escapeHtml(t.uid) + '">' + escapeHtml(t.name) + '</option>';
    }).join('');
    document.getElementById('dep-add').addEventListener('click', function() {
      var pred = predSelect.value;
      if (!pred) { showToast('Select a predecessor', true); return; }
      var depType = document.getElementById('dep-type').value;
      workspace.ensureEditAccess(function() {
        Gantt.api.postDependency({
          predecessor_task_uid: pred,
          successor_task_uid: selectedTaskUid,
          dependency_type: depType
        }).then(function() { showToast('Dependency added'); flashButtonSuccess('dep-add', 'Added'); if (refreshAll) refreshAll(); }).catch(function(e) { showToast(e.message, true); });
      });
    });

    var depsList = document.getElementById('deps-list');
    var succDeps = dependencies.filter(function(d) { return d.successor_task_uid === selectedTaskUid; });
    var predDeps = dependencies.filter(function(d) { return d.predecessor_task_uid === selectedTaskUid; });
    var taskNames = {};
    tasks.forEach(function(t) { taskNames[t.uid] = t.name; });
    var depItems = succDeps.map(function(d) {
      return { ...d, label: (taskNames[d.predecessor_task_uid] || d.predecessor_task_uid) + ' → this (' + d.dependency_type + ')' };
    }).concat(predDeps.map(function(d) {
      return { ...d, label: 'this → ' + (taskNames[d.successor_task_uid] || d.successor_task_uid) + ' (' + d.dependency_type + ')' };
    }));
    depsList.innerHTML = depItems.length === 0 ? '<div class="empty-state-card">No dependencies yet. Add predecessor links to map sequencing and delivery impact.</div>' : depItems.map(function(d) {
      return '<div class="list-item">' + escapeHtml(d.label) + ' <button type="button" class="btn btn-danger btn-dep-remove" style="margin-left:8px"' + disabledAttr + ' data-dep-uid="' + escapeHtml(d.uid) + '">Remove</button></div>';
    }).join('');
    depsList.querySelectorAll('.btn-dep-remove').forEach(function(b) {
      b.addEventListener('click', function() {
        var uid = b.getAttribute('data-dep-uid');
        workspace.ensureEditAccess(function() {
          Gantt.api.deleteDependency(uid)
            .then(function() { showToast('Dependency removed'); if (refreshAll) refreshAll(); })
            .catch(function(e) { showToast(e.message, true); });
        });
      });
    });

    openTaskModal();
  }

  function showTaskModal(title, parentTaskUid, onAdd) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML =
      '<div class="modal">' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<div class="field">' +
          '<label for="modal-task-name">Task name</label>' +
          '<input type="text" id="modal-task-name" placeholder="Enter task name" autofocus />' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-secondary btn-modal-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary btn-modal-add">Add</button>' +
        '</div>' +
      '</div>';
    var input = overlay.querySelector('#modal-task-name');
    var close = function() { overlay.remove(); };
    overlay.querySelector('.btn-modal-cancel').addEventListener('click', close);
    overlay.querySelector('.btn-modal-add').addEventListener('click', function() {
      var name = (input.value || '').trim();
      if (!name) { showToast('Enter a task name', true); return; }
      onAdd(name);
      close();
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') overlay.querySelector('.btn-modal-add').click();
      if (e.key === 'Escape') close();
    });
    document.body.appendChild(overlay);
    setTimeout(function() { input.focus(); }, 50);
  }

  return {
    openTaskModal: openTaskModal,
    closeTaskModal: closeTaskModal,
    renderDetail: renderDetail,
    showTaskModal: showTaskModal
  };
})();
