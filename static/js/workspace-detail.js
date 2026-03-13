window.Gantt = window.Gantt || {};

Gantt.detail = (function() {
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var dateStr = function(d) { return Gantt.utils.dateStr(d); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };
  var showToast = function(msg, err) { return Gantt.utils.showToast(msg, err); };

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
  }

  function renderDetail(refreshAll) {
    var state = Gantt.state;
    var el = state.getEl();
    var selectedTaskUid = state.getSelectedTaskUid();
    var tasks = state.getTasks();
    var dependencies = state.getDependencies();

    if (!selectedTaskUid) {
      closeTaskModal();
      return;
    }
    var task = tasks.find(function(t) { return t.uid === selectedTaskUid; });
    if (!task) {
      closeTaskModal();
      return;
    }

    if (el.taskDetailModalTitle) el.taskDetailModalTitle.textContent = task.name || 'Edit task';
    el.detailContent.innerHTML =
      '<div class="detail-topbar">' +
        '<div class="detail-summary">' +
          '<span class="summary-chip">' + escapeHtml(task.accountable_person || 'No accountable') + '</span>' +
          '<span class="summary-chip">' + escapeHtml(task.responsible_party || 'No responsible') + '</span>' +
          '<span class="summary-chip">' + escapeHtml(prettyDate(task.start_date)) + ' - ' + escapeHtml(prettyDate(task.end_date)) + '</span>' +
          '<span class="summary-chip summary-chip-status">' + escapeHtml(titleCaseStatus(task.status || 'not_started')) + ' • ' + (task.progress != null ? task.progress : 0) + '%</span>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" id="detail-save">Save task</button>' +
      '</div>' +
      '<div class="detail-tabs" role="tablist" aria-label="Task detail sections">' +
        '<button type="button" class="detail-tab is-active" data-tab-btn="task">Task</button>' +
        '<button type="button" class="detail-tab" data-tab-btn="health">Health</button>' +
        '<button type="button" class="detail-tab" data-tab-btn="comments">Comments</button>' +
        '<button type="button" class="detail-tab" data-tab-btn="risks">Risks</button>' +
        '<button type="button" class="detail-tab" data-tab-btn="dependencies">Dependencies</button>' +
      '</div>' +
      '<div class="detail-tab-panel is-active" data-tab-panel="task">' +
        '<div class="section">' +
          '<h3>Task</h3>' +
          '<div class="field"><label>Name</label><input type="text" id="detail-name" value="' + escapeHtml(task.name) + '" placeholder="Task name" /></div>' +
          '<div class="field"><label>Description</label><textarea id="detail-desc">' + escapeHtml(task.description) + '</textarea></div>' +
          '<div class="form-row">' +
            '<div class="field"><label>Accountable</label><input type="text" id="detail-accountable" value="' + escapeHtml(task.accountable_person) + '" /></div>' +
            '<div class="field"><label>Responsible</label><input type="text" id="detail-responsible" value="' + escapeHtml(task.responsible_party) + '" /></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="field"><label>Start date</label><input type="date" id="detail-start" value="' + dateStr(task.start_date) + '" /></div>' +
            '<div class="field"><label>End date</label><input type="date" id="detail-end" value="' + dateStr(task.end_date) + '" /></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel" data-tab-panel="health" hidden>' +
        '<div class="section">' +
          '<h3>Health</h3>' +
          '<div class="form-row">' +
            '<div class="field"><label>Status</label>' +
              '<select id="detail-status">' +
                '<option value="not_started"' + (task.status === 'not_started' ? ' selected' : '') + '>not_started</option>' +
                '<option value="in_progress"' + (task.status === 'in_progress' ? ' selected' : '') + '>in_progress</option>' +
                '<option value="complete"' + (task.status === 'complete' ? ' selected' : '') + '>complete</option>' +
                '<option value="blocked"' + (task.status === 'blocked' ? ' selected' : '') + '>blocked</option>' +
              '</select>' +
            '</div>' +
            '<div class="field"><label>Progress %</label><input type="number" id="detail-progress" min="0" max="100" value="' + (task.progress != null ? task.progress : 0) + '" /></div>' +
          '</div>' +
          '<div id="rag-current"></div>' +
          '<div class="form-inline">' +
            '<select id="rag-status"><option value="green">green</option><option value="amber">amber</option><option value="red">red</option></select>' +
            '<input type="text" id="rag-rationale" placeholder="Rationale (required for amber/red)" style="flex:1;min-width:120px" />' +
            '<button type="button" class="btn btn-secondary" id="rag-add">Update RAG</button>' +
          '</div>' +
          '<div id="rag-history"></div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel" data-tab-panel="comments" hidden>' +
        '<div class="section">' +
          '<h3>Comments</h3>' +
          '<div id="comments-list"></div>' +
          '<div class="field"><label>Author</label><input type="text" id="comment-author" placeholder="Your name" /></div>' +
          '<div class="field"><label>Comment</label><textarea id="comment-text" placeholder="Add a comment"></textarea></div>' +
          '<button type="button" class="btn btn-secondary" id="comment-add">Add comment</button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel" data-tab-panel="risks" hidden>' +
        '<div class="section">' +
          '<h3>Risks</h3>' +
          '<div id="risks-list"></div>' +
          '<button type="button" class="btn btn-secondary" id="risk-add-btn">Add risk</button>' +
          '<div id="risk-form" style="display:none; margin-top:0.5rem;">' +
            '<div class="field"><input type="text" id="risk-title" placeholder="Title" /></div>' +
            '<div class="field"><textarea id="risk-desc" placeholder="Description"></textarea></div>' +
            '<div class="form-row">' +
              '<div class="field"><select id="risk-severity"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select></div>' +
              '<div class="field"><select id="risk-status"><option value="open">open</option><option value="mitigated">mitigated</option><option value="closed">closed</option></select></div>' +
            '</div>' +
            '<div class="field"><input type="text" id="risk-owner" placeholder="Owner" /></div>' +
            '<div class="field"><textarea id="risk-mitigation" placeholder="Mitigation plan"></textarea></div>' +
            '<button type="button" class="btn btn-primary" id="risk-save">Save risk</button>' +
            '<button type="button" class="btn btn-secondary" id="risk-cancel">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-tab-panel" data-tab-panel="dependencies" hidden>' +
        '<div class="section">' +
          '<h3>Dependencies</h3>' +
          '<div id="deps-list"></div>' +
          '<div class="form-inline">' +
            '<select id="dep-predecessor"></select>' +
            '<select id="dep-type"><option value="FS">FS</option><option value="SS">SS</option><option value="FF">FF</option><option value="SF">SF</option></select>' +
            '<button type="button" class="btn btn-secondary" id="dep-add">Add dependency</button>' +
          '</div>' +
          '<p class="empty-msg" style="font-size:0.85rem">Add dependency: this task as successor; choose predecessor above.</p>' +
        '</div>' +
      '</div>';

    function activateTab(tabName) {
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
      var payload = {
        name: document.getElementById('detail-name').value.trim(),
        description: document.getElementById('detail-desc').value.trim(),
        accountable_person: document.getElementById('detail-accountable').value.trim(),
        responsible_party: document.getElementById('detail-responsible').value.trim(),
        start_date: document.getElementById('detail-start').value || null,
        end_date: document.getElementById('detail-end').value || null,
        status: document.getElementById('detail-status').value,
        progress: parseInt(document.getElementById('detail-progress').value, 10) || 0
      };
      Gantt.api.patchTask(selectedTaskUid, payload)
        .then(function() { showToast('Task saved'); if (refreshAll) refreshAll(); })
        .catch(function(e) { showToast(e.message, true); });
    });

    // RAG
    function loadRag() {
      Gantt.api.getTaskRag(selectedTaskUid).then(function(rag) {
        var cur = rag.length ? rag[rag.length - 1] : null;
        document.getElementById('rag-current').innerHTML = cur
          ? '<div class="detail-highlight-row"><span class="rag-badge ' + cur.status + '">' + escapeHtml(cur.status) + '</span><span>' + (cur.rationale ? escapeHtml(cur.rationale) : 'No rationale provided') + '</span></div>'
          : '<span class="empty-msg">No RAG status yet</span>';
        document.getElementById('rag-history').innerHTML = rag.length <= 1 ? '' : rag.slice(0, -1).reverse().map(function(r) {
          return '<div class="list-item"><span class="rag-badge ' + r.status + '">' + escapeHtml(r.status) + '</span> ' + escapeHtml(r.rationale) + ' <div class="meta">' + escapeHtml(r.created_at) + '</div></div>';
        }).join('');
      });
    }
    loadRag();
    document.getElementById('rag-add').addEventListener('click', function() {
      var status = document.getElementById('rag-status').value;
      var rationale = document.getElementById('rag-rationale').value.trim();
      if ((status === 'amber' || status === 'red') && !rationale) { showToast('Rationale required for amber/red', true); return; }
      Gantt.api.postRag(selectedTaskUid, { status: status, rationale: rationale })
        .then(function() { showToast('RAG updated'); loadRag(); if (refreshAll) refreshAll(); })
        .catch(function(e) { showToast(e.message, true); });
    });

    // Comments
    function loadComments() {
      Gantt.api.getTaskComments(selectedTaskUid).then(function(comments) {
        var listEl = document.getElementById('comments-list');
        listEl.innerHTML = comments.length === 0 ? '<p class="empty-msg">No comments</p>' : comments.map(function(c) {
          return '<div class="list-item">' + escapeHtml(c.comment_text) + ' <div class="meta">' + escapeHtml(c.author) + ' · ' + escapeHtml(c.created_at) + '</div></div>';
        }).join('');
      });
    }
    loadComments();
    document.getElementById('comment-add').addEventListener('click', function() {
      var author = document.getElementById('comment-author').value.trim();
      var comment_text = document.getElementById('comment-text').value.trim();
      if (!comment_text) { showToast('Enter comment text', true); return; }
      Gantt.api.postComment(selectedTaskUid, { author: author || 'Anonymous', comment_text: comment_text })
        .then(function() {
          document.getElementById('comment-text').value = '';
          loadComments();
          showToast('Comment added');
        })
        .catch(function(e) { showToast(e.message, true); });
    });

    // Risks
    var editingRiskUid = null;
    function loadRisks() {
      Gantt.api.getTaskRisks(selectedTaskUid).then(function(risks) {
        var listEl = document.getElementById('risks-list');
        listEl.innerHTML = risks.length === 0 ? '<p class="empty-msg">No risks</p>' : risks.map(function(r) {
          return '<div class="list-item" data-uid="' + escapeHtml(r.uid) + '">' +
            '<strong>' + escapeHtml(r.title) + '</strong>' +
            ' <span class="severity-badge ' + escapeHtml(r.severity) + '">' + escapeHtml(r.severity) + '</span>' +
            ' <span style="color:var(--text-muted);font-size:0.85rem">' + escapeHtml(r.status) + '</span>' +
            '<div class="meta">' + (r.owner ? escapeHtml(r.owner) : '') + '</div>' +
            '<button type="button" class="btn btn-secondary" style="margin-top:6px" data-edit="' + escapeHtml(r.uid) + '">Edit</button>' +
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
      if (editingRiskUid) {
        Gantt.api.patchRisk(editingRiskUid, payload)
          .then(function() {
            showToast('Risk updated');
            document.getElementById('risk-form').style.display = 'none';
            editingRiskUid = null;
            loadRisks();
          })
          .catch(function(e) { showToast(e.message, true); });
      } else {
        Gantt.api.postRisk(selectedTaskUid, payload)
          .then(function() {
            showToast('Risk added');
            document.getElementById('risk-form').style.display = 'none';
            loadRisks();
          })
          .catch(function(e) { showToast(e.message, true); });
      }
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
      Gantt.api.postDependency({
        predecessor_task_uid: pred,
        successor_task_uid: selectedTaskUid,
        dependency_type: depType
      }).then(function() { showToast('Dependency added'); if (refreshAll) refreshAll(); }).catch(function(e) { showToast(e.message, true); });
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
    depsList.innerHTML = depItems.length === 0 ? '<p class="empty-msg">No dependencies</p>' : depItems.map(function(d) {
      return '<div class="list-item">' + escapeHtml(d.label) + ' <button type="button" class="btn btn-danger btn-dep-remove" style="margin-left:8px" data-dep-uid="' + escapeHtml(d.uid) + '">Remove</button></div>';
    }).join('');
    depsList.querySelectorAll('.btn-dep-remove').forEach(function(b) {
      b.addEventListener('click', function() {
        var uid = b.getAttribute('data-dep-uid');
        Gantt.api.deleteDependency(uid)
          .then(function() { showToast('Dependency removed'); if (refreshAll) refreshAll(); })
          .catch(function(e) { showToast(e.message, true); });
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
