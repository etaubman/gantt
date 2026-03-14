window.Gantt = window.Gantt || {};

Gantt.api = (function() {
  var EMPLOYEE_ID_STORAGE_KEY = 'gantt-employee-id';

  function requestJson(url, options) {
    return fetch(url, options).then(function(r) {
      return r.text().then(function(text) {
        var data = text ? JSON.parse(text) : {};
        if (!r.ok) {
          var error = new Error((data && (data.message || data.detail && data.detail.message || data.detail)) || 'Request failed');
          error.status = r.status;
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  function getEmployeeId() {
    return (window.localStorage.getItem(EMPLOYEE_ID_STORAGE_KEY) || '').trim();
  }

  function buildWriteHeaders(extraHeaders) {
    var headers = extraHeaders ? Object.assign({}, extraHeaders) : {};
    var employeeId = getEmployeeId();
    if (employeeId) headers['X-Employee-Id'] = employeeId;
    return headers;
  }

  function buildQuery(params) {
    var search = new URLSearchParams();
    Object.keys(params || {}).forEach(function(key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    var query = search.toString();
    return query ? ('?' + query) : '';
  }

  function getProject() {
    return fetch('/api/project').then(function(r) { return r.json(); });
  }

  function getTasks() {
    return fetch('/api/tasks').then(function(r) { return r.json(); });
  }

  function getDependencies() {
    return fetch('/api/dependencies').then(function(r) { return r.json(); });
  }

  function getTaskRag(taskUid) {
    return fetch('/api/tasks/' + taskUid + '/rag').then(function(r) { return r.json(); });
  }

  function getTaskComments(taskUid) {
    return fetch('/api/tasks/' + taskUid + '/comments').then(function(r) { return r.json(); });
  }

  function getTaskRisks(taskUid) {
    return fetch('/api/tasks/' + taskUid + '/risks').then(function(r) { return r.json(); });
  }

  function patchTask(taskUid, payload) {
    return requestJson('/api/tasks/' + taskUid, {
      method: 'PATCH',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postRag(taskUid, payload) {
    return requestJson('/api/tasks/' + taskUid + '/rag', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postComment(taskUid, payload) {
    return requestJson('/api/tasks/' + taskUid + '/comments', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postRisk(taskUid, payload) {
    return requestJson('/api/tasks/' + taskUid + '/risks', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function patchRisk(riskUid, payload) {
    return requestJson('/api/risks/' + riskUid, {
      method: 'PATCH',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postTask(payload) {
    return requestJson('/api/tasks', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postDependency(payload) {
    return requestJson('/api/dependencies', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function deleteDependency(depUid) {
    return requestJson('/api/dependencies/' + depUid, {
      method: 'DELETE',
      headers: buildWriteHeaders()
    });
  }

  function importFile(formData) {
    return requestJson('/api/import', {
      method: 'POST',
      headers: buildWriteHeaders(),
      body: formData
    });
  }

  function exportUrl() {
    return '/api/export';
  }

  function getEditLock() {
    return requestJson('/api/edit-lock');
  }

  function getAuditEvents(filters) {
    return requestJson('/api/audit-events' + buildQuery(filters || {}));
  }

  function acquireEditLock(payload) {
    return requestJson('/api/edit-lock/acquire', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function releaseEditLock(payload) {
    return requestJson('/api/edit-lock/release', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  return {
    getProject: getProject,
    getTasks: getTasks,
    getDependencies: getDependencies,
    getTaskRag: getTaskRag,
    getTaskComments: getTaskComments,
    getTaskRisks: getTaskRisks,
    patchTask: patchTask,
    postRag: postRag,
    postComment: postComment,
    postRisk: postRisk,
    patchRisk: patchRisk,
    postTask: postTask,
    postDependency: postDependency,
    deleteDependency: deleteDependency,
    importFile: importFile,
    exportUrl: exportUrl,
    getEditLock: getEditLock,
    getAuditEvents: getAuditEvents,
    acquireEditLock: acquireEditLock,
    releaseEditLock: releaseEditLock
  };
})();
