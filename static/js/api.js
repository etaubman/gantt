window.Gantt = window.Gantt || {};

Gantt.api = (function() {
  var EMPLOYEE_ID_STORAGE_KEY = 'gantt-employee-id';
  var connectionListener = null;

  function notifyConnection(status) {
    if (typeof connectionListener === 'function') connectionListener(status);
  }

  function isCoreConnectionEndpoint(url) {
    return /^\/api\/(?:project|tasks|dependencies|edit-lock)(?:$|[\/?])/.test(url || '');
  }

  function requestJson(url, options) {
    return fetch(url, options)
      .then(function(r) {
        return r.text().then(function(text) {
          var data = text ? JSON.parse(text) : {};
          if (!r.ok) {
            var error = new Error((data && (data.message || data.detail && data.detail.message || data.detail)) || 'Request failed');
            error.status = r.status;
            error.data = data;
            error.isConnectionError =
              r.status >= 500 ||
              (r.status === 404 && isCoreConnectionEndpoint(url));
            throw error;
          }
          notifyConnection('online');
          return data;
        });
      })
      .catch(function(error) {
        if (!error || !error.status || error.isConnectionError) notifyConnection('offline');
        throw error;
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
    return requestJson('/api/project');
  }

  function getTasks() {
    return requestJson('/api/tasks');
  }

  function getDependencies() {
    return requestJson('/api/dependencies');
  }

  function getTaskRag(taskUid) {
    return requestJson('/api/tasks/' + taskUid + '/rag');
  }

  function getTaskComments(taskUid) {
    return requestJson('/api/tasks/' + taskUid + '/comments');
  }

  function getTaskRisks(taskUid) {
    return requestJson('/api/tasks/' + taskUid + '/risks');
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

  function softDeleteTask(taskUid, payload) {
    return requestJson('/api/tasks/' + taskUid + '/soft-delete', {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
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

  function setConnectionListener(listener) {
    connectionListener = typeof listener === 'function' ? listener : null;
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
    softDeleteTask: softDeleteTask,
    postDependency: postDependency,
    deleteDependency: deleteDependency,
    importFile: importFile,
    exportUrl: exportUrl,
    getEditLock: getEditLock,
    getAuditEvents: getAuditEvents,
    acquireEditLock: acquireEditLock,
    releaseEditLock: releaseEditLock,
    setConnectionListener: setConnectionListener
  };
})();
