(function() {
  const params = new URLSearchParams(window.location.search);
  const projectUid = params.get('uid');
  if (!projectUid) {
    window.location.href = '/';
    return;
  }

  let project = null;
  let tasks = [];
  let dependencies = [];
  let taskRag = {}; // task_uid -> latest RAG status string
  let selectedTaskUid = null;
  const PX_PER_DAY = 4;
  const ROW_HEIGHT = 36;
  const GANTT_CELL_WIDTH = 7 * PX_PER_DAY;

  const el = {
    projectTitle: document.getElementById('project-title'),
    taskTbody: document.getElementById('task-tbody'),
    taskTableWrap: document.getElementById('task-table-wrap'),
    ganttScrollWrap: document.getElementById('gantt-scroll-wrap'),
    ganttHeader: document.getElementById('gantt-header'),
    ganttBody: document.getElementById('gantt-body'),
    detailContent: document.getElementById('detail-content'),
    taskDetailModal: document.getElementById('task-detail-modal'),
    taskDetailModalTitle: document.getElementById('task-detail-modal-title'),
    taskDetailModalClose: document.getElementById('task-detail-modal-close'),
    btnAddTask: document.getElementById('btn-add-task'),
    btnAddSubtask: document.getElementById('btn-add-subtask'),
    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    fileImport: document.getElementById('file-import'),
  };

  function openTaskModal() {
    if (el.taskDetailModal) {
      el.taskDetailModal.classList.add('visible');
      el.taskDetailModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeTaskModal() {
    if (el.taskDetailModal) {
      el.taskDetailModal.classList.remove('visible');
      el.taskDetailModal.setAttribute('aria-hidden', 'true');
    }
  }

  let scrollSyncDone = false;
  function setupScrollSync() {
    if (scrollSyncDone || !el.taskTableWrap || !el.ganttScrollWrap) return;
    let syncing = false;
    function syncScroll(from, to) {
      if (syncing) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      requestAnimationFrame(function() { syncing = false; });
    }
    el.taskTableWrap.addEventListener('scroll', function() {
      syncScroll(el.taskTableWrap, el.ganttScrollWrap);
    });
    el.ganttScrollWrap.addEventListener('scroll', function() {
      syncScroll(el.ganttScrollWrap, el.taskTableWrap);
    });
    scrollSyncDone = true;
  }

  function showToast(msg, isError) {
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function escapeHtml(s) {
    if (s == null || s === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function dateStr(d) {
    if (!d) return '—';
    return String(d).slice(0, 10);
  }

  function buildTaskTree(flatTasks) {
    const byParent = {};
    flatTasks.forEach(t => {
    const p = t.parent_task_uid || '__root__';
    if (!byParent[p]) byParent[p] = [];
    byParent[p].push(t);
    });
    byParent['__root__']?.sort((a, b) => a.sort_order - b.sort_order || (a.created_at || '').localeCompare(b.created_at || ''));
    Object.keys(byParent).filter(k => k !== '__root__').forEach(k => {
    byParent[k].sort((a, b) => a.sort_order - b.sort_order || (a.created_at || '').localeCompare(b.created_at || ''));
    });
    const out = [];
    function walk(parentKey, depth) {
      const list = byParent[parentKey] || [];
      list.forEach(t => {
        out.push({ ...t, depth });
        walk(t.uid, depth + 1);
      });
    }
    walk('__root__', 0);
    return out;
  }

  function loadProject() {
    return fetch('/api/projects/' + projectUid).then(r => r.json()).then(p => { project = p; el.projectTitle.textContent = p.name || 'Project'; });
  }

  function loadTasks() {
    return fetch('/api/projects/' + projectUid + '/tasks').then(r => r.json()).then(t => { tasks = t; });
  }

  function loadDependencies() {
    return fetch('/api/projects/' + projectUid + '/dependencies').then(r => r.json()).then(d => { dependencies = d; });
  }

  function loadRagForTasks() {
    taskRag = {};
    const flat = tasks.filter(t => true);
    return Promise.all(flat.map(t => fetch('/api/tasks/' + t.uid + '/rag').then(r => r.json()).then(rag => {
      if (rag.length) taskRag[t.uid] = rag[rag.length - 1].status;
    }))).then(() => {});
  }

  function setLoading(visible) {
    const el = document.getElementById('workspace-loading');
    if (el) el.classList.toggle('visible', !!visible);
  }

  function refreshAll() {
    setLoading(true);
    loadProject()
      .then(() => loadTasks())
      .then(() => loadDependencies())
      .then(() => loadRagForTasks())
      .then(render)
      .then(setupScrollSync)
      .finally(() => setLoading(false));
  }

  function render() {
    const tree = buildTaskTree(tasks);
    const taskMap = {};
    tasks.forEach(t => { taskMap[t.uid] = t; });

    // Table
    el.taskTbody.innerHTML = tree.map(t => {
      const rag = taskRag[t.uid] || 'none';
      const indent = 'indent-' + Math.min(t.depth, 3);
      return `<tr data-uid="${escapeHtml(t.uid)}" class="${selectedTaskUid === t.uid ? 'selected' : ''}">
        <td class="${indent}"><span class="rag-dot ${rag}" aria-hidden="true"></span>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.accountable_person)}</td>
        <td>${dateStr(t.start_date)}</td>
        <td>${dateStr(t.end_date)}</td>
        <td>${escapeHtml(t.status)}</td>
        <td>${t.progress != null ? t.progress : 0}</td>
      </tr>`;
    }).join('');

    el.taskTbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => {
        selectedTaskUid = tr.getAttribute('data-uid');
        el.taskTbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        el.btnAddSubtask.disabled = false;
        renderDetail();
        renderGantt(tree);
      });
    });

    // Gantt
    let minDate = null, maxDate = null;
    tree.forEach(t => {
      if (t.start_date) { const d = new Date(t.start_date); if (!minDate || d < minDate) minDate = d; }
      if (t.end_date) { const d = new Date(t.end_date); if (!maxDate || d > maxDate) maxDate = d; }
    });
    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date(minDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / (24 * 60 * 60 * 1000)) + 14);
    const totalWidth = totalDays * PX_PER_DAY;

    el.ganttHeader.innerHTML = '';
    el.ganttHeader.style.minWidth = totalWidth + 'px';
    const weekWidth = 7 * PX_PER_DAY;
    for (let i = 0; i < totalDays; i += 7) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      const span = document.createElement('span');
      span.className = 'gantt-header-cell';
      span.style.width = weekWidth + 'px';
      span.style.minWidth = weekWidth + 'px';
      span.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      el.ganttHeader.appendChild(span);
    }

    el.ganttBody.style.setProperty('--gantt-cell-width', PX_PER_DAY + 'px');
    el.ganttBody.innerHTML = '';
    el.ganttBody.style.minWidth = totalWidth + 'px';
    tree.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'gantt-row';
      row.style.height = ROW_HEIGHT + 'px';
      const barWrap = document.createElement('div');
      barWrap.className = 'bar-wrap';
      barWrap.style.height = ROW_HEIGHT + 'px';
      barWrap.style.width = totalWidth + 'px';
      barWrap.style.position = 'relative';
      let left = 0, w = 0;
      if (t.start_date && t.end_date) {
        const start = new Date(t.start_date);
        const end = new Date(t.end_date);
        left = Math.max(0, (start - minDate) / (24 * 60 * 60 * 1000)) * PX_PER_DAY;
        w = Math.max(6, ((end - start) / (24 * 60 * 60 * 1000)) * PX_PER_DAY);
      } else {
        left = 0;
        w = 48;
      }
      const rag = taskRag[t.uid] || 'none';
      const pct = t.progress != null ? t.progress : 0;
      const bar = document.createElement('div');
      bar.className = 'bar rag-' + rag;
      bar.style.left = left + 'px';
      bar.style.width = w + 'px';
      bar.setAttribute('title', t.name + (pct ? ' — ' + pct + '%' : ''));
      if (pct > 0 && pct < 100) {
        const progressEl = document.createElement('div');
        progressEl.className = 'bar-progress';
        progressEl.style.width = pct + '%';
        bar.appendChild(progressEl);
      }
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      el.ganttBody.appendChild(row);
    });

    if (!selectedTaskUid && tree.length) {
      selectedTaskUid = tree[0].uid;
      el.taskTbody.querySelector('tr')?.classList.add('selected');
      el.btnAddSubtask.disabled = false;
    }
  }

  function renderDetail() {
    if (!selectedTaskUid) {
      closeTaskModal();
      return;
    }
    const task = tasks.find(t => t.uid === selectedTaskUid);
    if (!task) {
      closeTaskModal();
      return;
    }

    if (el.taskDetailModalTitle) el.taskDetailModalTitle.textContent = task.name || 'Edit task';
    el.detailContent.innerHTML = `
      <div class="section">
        <h3>Task</h3>
        <div class="field"><label>Name</label><input type="text" id="detail-name" value="${escapeHtml(task.name)}" placeholder="Task name" /></div>
        <div class="field"><label>Description</label><textarea id="detail-desc">${escapeHtml(task.description)}</textarea></div>
        <div class="field"><label>Accountable</label><input type="text" id="detail-accountable" value="${escapeHtml(task.accountable_person)}" /></div>
        <div class="field"><label>Responsible</label><input type="text" id="detail-responsible" value="${escapeHtml(task.responsible_party)}" /></div>
        <div class="field"><label>Start date</label><input type="date" id="detail-start" value="${dateStr(task.start_date)}" /></div>
        <div class="field"><label>End date</label><input type="date" id="detail-end" value="${dateStr(task.end_date)}" /></div>
        <div class="field"><label>Status</label>
          <select id="detail-status">
            <option value="not_started" ${task.status === 'not_started' ? 'selected' : ''}>not_started</option>
            <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>in_progress</option>
            <option value="complete" ${task.status === 'complete' ? 'selected' : ''}>complete</option>
            <option value="blocked" ${task.status === 'blocked' ? 'selected' : ''}>blocked</option>
          </select>
        </div>
        <div class="field"><label>Progress %</label><input type="number" id="detail-progress" min="0" max="100" value="${task.progress != null ? task.progress : 0}" /></div>
        <button type="button" class="btn btn-primary" id="detail-save">Save task</button>
      </div>
      <div class="section" id="section-rag">
        <h3>RAG status</h3>
        <div id="rag-current"></div>
        <div class="form-inline">
          <select id="rag-status"><option value="green">green</option><option value="amber">amber</option><option value="red">red</option></select>
          <input type="text" id="rag-rationale" placeholder="Rationale (required for amber/red)" style="flex:1;min-width:120px" />
          <button type="button" class="btn btn-secondary" id="rag-add">Update RAG</button>
        </div>
        <div id="rag-history"></div>
      </div>
      <div class="section" id="section-comments">
        <h3>Comments</h3>
        <div id="comments-list"></div>
        <div class="field"><label>Author</label><input type="text" id="comment-author" placeholder="Your name" /></div>
        <div class="field"><label>Comment</label><textarea id="comment-text" placeholder="Add a comment"></textarea></div>
        <button type="button" class="btn btn-secondary" id="comment-add">Add comment</button>
      </div>
      <div class="section" id="section-risks">
        <h3>Risks</h3>
        <div id="risks-list"></div>
        <button type="button" class="btn btn-secondary" id="risk-add-btn">Add risk</button>
        <div id="risk-form" style="display:none; margin-top:0.5rem;">
          <div class="field"><input type="text" id="risk-title" placeholder="Title" /></div>
          <div class="field"><textarea id="risk-desc" placeholder="Description"></textarea></div>
          <div class="field">
            <select id="risk-severity"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select>
            <select id="risk-status"><option value="open">open</option><option value="mitigated">mitigated</option><option value="closed">closed</option></select>
          </div>
          <div class="field"><input type="text" id="risk-owner" placeholder="Owner" /></div>
          <div class="field"><textarea id="risk-mitigation" placeholder="Mitigation plan"></textarea></div>
          <button type="button" class="btn btn-primary" id="risk-save">Save risk</button>
          <button type="button" class="btn btn-secondary" id="risk-cancel">Cancel</button>
        </div>
      </div>
      <div class="section" id="section-deps">
        <h3>Dependencies</h3>
        <div id="deps-list"></div>
        <div class="form-inline">
          <select id="dep-predecessor"></select>
          <select id="dep-type"><option value="FS">FS</option><option value="SS">SS</option><option value="FF">FF</option><option value="SF">SF</option></select>
          <button type="button" class="btn btn-secondary" id="dep-add">Add dependency</button>
        </div>
        <p class="empty-msg" style="font-size:0.85rem">Add dependency: this task as successor; choose predecessor above.</p>
      </div>
    `;

    // Save task
    document.getElementById('detail-save').addEventListener('click', () => {
      const payload = {
        name: document.getElementById('detail-name').value.trim(),
        description: document.getElementById('detail-desc').value.trim(),
        accountable_person: document.getElementById('detail-accountable').value.trim(),
        responsible_party: document.getElementById('detail-responsible').value.trim(),
        start_date: document.getElementById('detail-start').value || null,
        end_date: document.getElementById('detail-end').value || null,
        status: document.getElementById('detail-status').value,
        progress: parseInt(document.getElementById('detail-progress').value, 10) || 0,
      };
      fetch('/api/tasks/' + selectedTaskUid, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(r => r.json()).then(() => { showToast('Task saved'); refreshAll(); }).catch(e => showToast(e.message, true));
    });

    // RAG
    function loadRag() {
      fetch('/api/tasks/' + selectedTaskUid + '/rag').then(r => r.json()).then(rag => {
        const cur = rag.length ? rag[rag.length - 1] : null;
        document.getElementById('rag-current').innerHTML = cur
          ? `<span class="rag-badge ${cur.status}">${escapeHtml(cur.status)}</span> ${cur.rationale ? escapeHtml(cur.rationale) : ''}`
          : '<span class="empty-msg">No RAG status yet</span>';
        document.getElementById('rag-history').innerHTML = rag.length <= 1 ? '' : rag.slice(0, -1).reverse().map(r =>
          `<div class="list-item"><span class="rag-badge ${r.status}">${escapeHtml(r.status)}</span> ${escapeHtml(r.rationale)} <div class="meta">${escapeHtml(r.created_at)}</div></div>`
        ).join('');
      });
    }
    loadRag();
    document.getElementById('rag-add').addEventListener('click', () => {
      const status = document.getElementById('rag-status').value;
      const rationale = document.getElementById('rag-rationale').value.trim();
      if ((status === 'amber' || status === 'red') && !rationale) { showToast('Rationale required for amber/red', true); return; }
      fetch('/api/tasks/' + selectedTaskUid + '/rag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, rationale })
      }).then(r => r.json()).then(() => { showToast('RAG updated'); loadRag(); refreshAll(); }).catch(e => showToast(e.message, true));
    });

    // Comments
    function loadComments() {
      fetch('/api/tasks/' + selectedTaskUid + '/comments').then(r => r.json()).then(comments => {
        const el = document.getElementById('comments-list');
        el.innerHTML = comments.length === 0 ? '<p class="empty-msg">No comments</p>' : comments.map(c =>
          `<div class="list-item">${escapeHtml(c.comment_text)} <div class="meta">${escapeHtml(c.author)} · ${escapeHtml(c.created_at)}</div></div>`
        ).join('');
      });
    }
    loadComments();
    document.getElementById('comment-add').addEventListener('click', () => {
      const author = document.getElementById('comment-author').value.trim();
      const comment_text = document.getElementById('comment-text').value.trim();
      if (!comment_text) { showToast('Enter comment text', true); return; }
      fetch('/api/tasks/' + selectedTaskUid + '/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author || 'Anonymous', comment_text })
      }).then(r => r.json()).then(() => { document.getElementById('comment-text').value = ''; loadComments(); showToast('Comment added'); }).catch(e => showToast(e.message, true));
    });

    // Risks
    let editingRiskUid = null;
    function loadRisks() {
      fetch('/api/tasks/' + selectedTaskUid + '/risks').then(r => r.json()).then(risks => {
        const el = document.getElementById('risks-list');
        el.innerHTML = risks.length === 0 ? '<p class="empty-msg">No risks</p>' : risks.map(r =>
          `<div class="list-item" data-uid="${escapeHtml(r.uid)}">
            <strong>${escapeHtml(r.title)}</strong>
            <span class="severity-badge ${escapeHtml(r.severity)}">${escapeHtml(r.severity)}</span>
            <span style="color:var(--text-muted);font-size:0.85rem">${escapeHtml(r.status)}</span>
            <div class="meta">${r.owner ? escapeHtml(r.owner) : ''}</div>
            <button type="button" class="btn btn-secondary" style="margin-top:6px" data-edit="${escapeHtml(r.uid)}">Edit</button>
          </div>`
        ).join('');
        el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
          editingRiskUid = b.getAttribute('data-edit');
          const risk = risks.find(x => x.uid === editingRiskUid);
          if (!risk) return;
          document.getElementById('risk-form').style.display = 'block';
          document.getElementById('risk-title').value = risk.title;
          document.getElementById('risk-desc').value = risk.description || '';
          document.getElementById('risk-severity').value = risk.severity;
          document.getElementById('risk-status').value = risk.status;
          document.getElementById('risk-owner').value = risk.owner || '';
          document.getElementById('risk-mitigation').value = risk.mitigation_plan || '';
        }));
      });
    }
    loadRisks();
    document.getElementById('risk-add-btn').addEventListener('click', () => {
      editingRiskUid = null;
      document.getElementById('risk-form').style.display = 'block';
      document.getElementById('risk-title').value = '';
      document.getElementById('risk-desc').value = '';
      document.getElementById('risk-severity').value = 'medium';
      document.getElementById('risk-status').value = 'open';
      document.getElementById('risk-owner').value = '';
      document.getElementById('risk-mitigation').value = '';
    });
    document.getElementById('risk-cancel').addEventListener('click', () => {
      document.getElementById('risk-form').style.display = 'none';
      editingRiskUid = null;
    });
    document.getElementById('risk-save').addEventListener('click', () => {
      const payload = {
        title: document.getElementById('risk-title').value.trim(),
        description: document.getElementById('risk-desc').value.trim(),
        severity: document.getElementById('risk-severity').value,
        status: document.getElementById('risk-status').value,
        owner: document.getElementById('risk-owner').value.trim(),
        mitigation_plan: document.getElementById('risk-mitigation').value.trim(),
      };
      if (!payload.title) { showToast('Title required', true); return; }
      if (editingRiskUid) {
        fetch('/api/risks/' + editingRiskUid, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          .then(r => r.json()).then(() => { showToast('Risk updated'); document.getElementById('risk-form').style.display = 'none'; editingRiskUid = null; loadRisks(); }).catch(e => showToast(e.message, true));
      } else {
        fetch('/api/tasks/' + selectedTaskUid + '/risks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          .then(r => r.json()).then(() => { showToast('Risk added'); document.getElementById('risk-form').style.display = 'none'; loadRisks(); }).catch(e => showToast(e.message, true));
      }
    });

    // Dependencies (this task = successor)
    const predSelect = document.getElementById('dep-predecessor');
    predSelect.innerHTML = '<option value="">Select predecessor</option>' + tasks.filter(t => t.uid !== selectedTaskUid).map(t =>
      `<option value="${escapeHtml(t.uid)}">${escapeHtml(t.name)}</option>`
    ).join('');
    document.getElementById('dep-add').addEventListener('click', () => {
      const pred = predSelect.value;
      if (!pred) { showToast('Select a predecessor', true); return; }
      const depType = document.getElementById('dep-type').value;
      fetch('/api/projects/' + projectUid + '/dependencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predecessor_task_uid: pred, successor_task_uid: selectedTaskUid, dependency_type: depType })
      }).then(r => r.json()).then(() => { showToast('Dependency added'); refreshAll(); }).catch(e => showToast(e.message, true));
    });

    const depsList = document.getElementById('deps-list');
    const succDeps = dependencies.filter(d => d.successor_task_uid === selectedTaskUid);
    const predDeps = dependencies.filter(d => d.predecessor_task_uid === selectedTaskUid);
    const taskNames = {};
    tasks.forEach(t => { taskNames[t.uid] = t.name; });
    const depItems = [...succDeps.map(d => ({ ...d, label: (taskNames[d.predecessor_task_uid] || d.predecessor_task_uid) + ' → this (' + d.dependency_type + ')' })),
      ...predDeps.map(d => ({ ...d, label: 'this → ' + (taskNames[d.successor_task_uid] || d.successor_task_uid) + ' (' + d.dependency_type + ')' }))];
    depsList.innerHTML = depItems.length === 0 ? '<p class="empty-msg">No dependencies</p>' : depItems.map(d =>
      `<div class="list-item">${escapeHtml(d.label)} <button type="button" class="btn btn-danger btn-dep-remove" style="margin-left:8px" data-dep-uid="${escapeHtml(d.uid)}">Remove</button></div>`
    ).join('');
    depsList.querySelectorAll('.btn-dep-remove').forEach(b => b.addEventListener('click', () => {
      const uid = b.getAttribute('data-dep-uid');
      fetch('/api/dependencies/' + uid, { method: 'DELETE' })
        .then(() => { showToast('Dependency removed'); refreshAll(); }).catch(e => showToast(e.message, true));
    }));

    openTaskModal();
  }

  function showTaskModal(title, parentTaskUid, onAdd) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
      <div class="modal">
        <h2>${escapeHtml(title)}</h2>
        <div class="field">
          <label for="modal-task-name">Task name</label>
          <input type="text" id="modal-task-name" placeholder="Enter task name" autofocus />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary btn-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-modal-add">Add</button>
        </div>
      </div>
    `;
    const input = overlay.querySelector('#modal-task-name');
    const close = () => overlay.remove();
    overlay.querySelector('.btn-modal-cancel').addEventListener('click', close);
    overlay.querySelector('.btn-modal-add').addEventListener('click', () => {
      const name = (input.value || '').trim();
      if (!name) { showToast('Enter a task name', true); return; }
      onAdd(name);
      close();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') overlay.querySelector('.btn-modal-add').click();
      if (e.key === 'Escape') close();
    });
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
  }

  el.btnAddTask.addEventListener('click', () => {
    showTaskModal('Add task', null, (name) => {
      fetch('/api/projects/' + projectUid + '/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }).then(r => r.json()).then(() => { showToast('Task added'); refreshAll(); }).catch(e => showToast(e.message, true));
    });
  });

  el.btnAddSubtask.addEventListener('click', () => {
    if (!selectedTaskUid) return;
    showTaskModal('Add subtask', selectedTaskUid, (name) => {
      const parent = tasks.find(t => t.uid === selectedTaskUid);
      const startDate = (parent && parent.start_date) ? parent.start_date : new Date().toISOString().slice(0, 10);
      const start = new Date(startDate);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const endDate = end.toISOString().slice(0, 10);
      fetch('/api/projects/' + projectUid + '/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_task_uid: selectedTaskUid, start_date: startDate, end_date: endDate })
      }).then(r => r.json()).then(() => { showToast('Subtask added'); refreshAll(); }).catch(e => showToast(e.message, true));
    });
  });

  el.btnExport.addEventListener('click', () => {
    window.location.href = '/api/projects/' + projectUid + '/export';
    showToast('Export started');
  });

  el.btnImport.addEventListener('click', () => el.fileImport.click());
  el.fileImport.addEventListener('change', () => {
    const file = el.fileImport.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fetch('/api/import', { method: 'POST', body: fd })
      .then(r => r.json()).then(data => { showToast('Imported: ' + data.projects + ' project(s), ' + data.tasks + ' task(s)'); refreshAll(); el.fileImport.value = ''; })
      .catch(e => showToast(e.message || 'Import failed', true));
  });

  if (el.taskDetailModalClose) {
    el.taskDetailModalClose.addEventListener('click', closeTaskModal);
  }
  if (el.taskDetailModal) {
    const backdrop = el.taskDetailModal.querySelector('.task-detail-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeTaskModal);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && el.taskDetailModal.classList.contains('visible')) closeTaskModal();
    });
  }

  refreshAll();
})();
