window.Gantt = window.Gantt || {};

Gantt.api = (function() {
  var EMPLOYEE_ID_STORAGE_KEY = 'gantt-employee-id';
  var connectionListener = null;
  var API_BASE_URL = resolveApiBaseUrl();

  function notifyConnection(status) {
    if (typeof connectionListener === 'function') connectionListener(status);
  }

  function normalizeBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function resolveApiBaseUrl() {
    var override = normalizeBaseUrl(window.GANTT_API_BASE_URL || window.localStorage.getItem('gantt-api-base-url'));
    if (override) return override;
    var origin = window.location.origin;
    if (!origin || origin === 'null' || origin === 'file://' || origin.indexOf('file:') === 0) {
      return 'http://127.0.0.1:8000';
    }
    try {
      var parsed = new URL(origin);
      var host = (parsed.hostname || '').toLowerCase();
      var isLocalHost = host === 'localhost' || host === '127.0.0.1';
      if (isLocalHost && parsed.port && parsed.port !== '8000') {
        return parsed.protocol + '//' + parsed.hostname + ':8000';
      }
    } catch (e) {
      return origin;
    }
    return origin;
  }

  function apiUrl(path) {
    return API_BASE_URL + path;
  }

  function isCoreConnectionEndpoint(url) {
    return /\/api\/(?:project|tasks|dependencies|edit-lock)(?:$|[\/?])/.test(url || '');
  }

  var FETCH_TIMEOUT_MS = 12000;
  function requestJson(url, options) {
    var controller = new AbortController();
    var to = setTimeout(function() { controller.abort(); }, FETCH_TIMEOUT_MS);
    var opts = options ? Object.assign({}, options) : {};
    opts.signal = controller.signal;
    return fetch(url, opts)
      .then(function(r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        return r.text().then(function(text) {
          if (ct.indexOf('text/html') !== -1 && isCoreConnectionEndpoint(url)) {
            var err = new Error('Server returned HTML instead of JSON. The API may not be reachable.');
            err.status = r.status;
            err.isConnectionError = true;
            throw err;
          }
          var data = {};
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (e) {
              if (isCoreConnectionEndpoint(url)) {
                var parseErr = new Error('Invalid response from server (expected JSON).');
                parseErr.status = r.status;
                parseErr.isConnectionError = true;
                throw parseErr;
              }
              throw e;
            }
          }
          if (!r.ok) {
            var error = new Error((data && (data.message || data.detail && (typeof data.detail === 'string' ? data.detail : data.detail.message))) || 'Request failed');
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
        var isCore = isCoreConnectionEndpoint(url);
        var shouldNotifyOffline = !error || !error.status || (isCore && (error.isConnectionError || (error.status && error.status >= 400)));
        if (shouldNotifyOffline) notifyConnection('offline');
        throw error;
      })
      .finally(function() { clearTimeout(to); });
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

  function getProjects() {
    return requestJson(apiUrl('/api/projects'));
  }

  function getProject(uid) {
    if (uid) return requestJson(apiUrl('/api/projects/' + encodeURIComponent(uid)));
    return requestJson(apiUrl('/api/project'));
  }

  function createProject(body) {
    return requestJson(apiUrl('/api/projects'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body || {})
    });
  }

  function getTasks(projectUid) {
    if (projectUid) return requestJson(apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/tasks'));
    return requestJson(apiUrl('/api/tasks'));
  }

  function getDependencies(projectUid) {
    if (projectUid) return requestJson(apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/dependencies'));
    return requestJson(apiUrl('/api/dependencies'));
  }

  function getTaskRag(taskUid) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/rag'));
  }

  function getBulkRag(projectUid) {
    if (projectUid) return requestJson(apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/rag'));
    return requestJson(apiUrl('/api/rag'));
  }

  function getTaskComments(taskUid) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/comments'));
  }

  function getTaskRisks(taskUid) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/risks'));
  }

  function patchTask(taskUid, payload) {
    return requestJson(apiUrl('/api/tasks/' + taskUid), {
      method: 'PATCH',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postRag(taskUid, payload) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/rag'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postComment(taskUid, payload) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/comments'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postRisk(taskUid, payload) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/risks'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function patchRisk(riskUid, payload) {
    return requestJson(apiUrl('/api/risks/' + riskUid), {
      method: 'PATCH',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function postTask(projectUid, payload) {
    var url = projectUid
      ? apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/tasks')
      : apiUrl('/api/tasks');
    return requestJson(url, {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function softDeleteTask(taskUid, payload) {
    return requestJson(apiUrl('/api/tasks/' + taskUid + '/soft-delete'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
  }

  function postDependency(projectUid, payload) {
    var url = projectUid
      ? apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/dependencies')
      : apiUrl('/api/dependencies');
    return requestJson(url, {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function deleteDependency(depUid) {
    return requestJson(apiUrl('/api/dependencies/' + depUid), {
      method: 'DELETE',
      headers: buildWriteHeaders()
    });
  }

  function importFile(formData) {
    return requestJson(apiUrl('/api/import'), {
      method: 'POST',
      headers: buildWriteHeaders(),
      body: formData
    });
  }

  function exportUrl(projectUid) {
    if (projectUid) return apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/export');
    return apiUrl('/api/export');
  }

  function exportReportUrl(projectUid) {
    if (projectUid) return apiUrl('/api/projects/' + encodeURIComponent(projectUid) + '/export-report');
    return apiUrl('/api/export-report');
  }

  function getEditLock() {
    return requestJson(apiUrl('/api/edit-lock'));
  }

  function getAuditEvents(filters) {
    return requestJson(apiUrl('/api/audit-events' + buildQuery(filters || {})));
  }

  function acquireEditLock(payload) {
    return requestJson(apiUrl('/api/edit-lock/acquire'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function releaseEditLock(payload) {
    return requestJson(apiUrl('/api/edit-lock/release'), {
      method: 'POST',
      headers: buildWriteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
  }

  function setConnectionListener(listener) {
    connectionListener = typeof listener === 'function' ? listener : null;
  }

  return {
    apiUrl: apiUrl,
    getApiBaseUrl: function() { return API_BASE_URL; },
    getProjects: getProjects,
    getProject: getProject,
    createProject: createProject,
    getTasks: getTasks,
    getDependencies: getDependencies,
    getTaskRag: getTaskRag,
    getBulkRag: getBulkRag,
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
    exportReportUrl: exportReportUrl,
    getEditLock: getEditLock,
    getAuditEvents: getAuditEvents,
    acquireEditLock: acquireEditLock,
    releaseEditLock: releaseEditLock,
    setConnectionListener: setConnectionListener
  };
})();
