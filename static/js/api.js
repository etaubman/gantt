window.Gantt = window.Gantt || {};

Gantt.api = (function() {
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
    return fetch('/api/tasks/' + taskUid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function postRag(taskUid, payload) {
    return fetch('/api/tasks/' + taskUid + '/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function postComment(taskUid, payload) {
    return fetch('/api/tasks/' + taskUid + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function postRisk(taskUid, payload) {
    return fetch('/api/tasks/' + taskUid + '/risks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function patchRisk(riskUid, payload) {
    return fetch('/api/risks/' + riskUid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function postTask(payload) {
    return fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function postDependency(payload) {
    return fetch('/api/dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  }

  function deleteDependency(depUid) {
    return fetch('/api/dependencies/' + depUid, { method: 'DELETE' });
  }

  function importFile(formData) {
    return fetch('/api/import', { method: 'POST', body: formData }).then(function(r) { return r.json(); });
  }

  function exportUrl() {
    return '/api/export';
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
    exportUrl: exportUrl
  };
})();
