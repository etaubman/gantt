window.Gantt = window.Gantt || {};

Gantt.landing = (function() {
  function run() {
    var listEl = document.getElementById('project-list');
    if (!listEl) return;
    var escapeHtml = Gantt.utils.escapeHtml;

    fetch('/api/projects')
      .then(function(r) { return r.json(); })
      .then(function(projects) {
        if (projects.length === 0) {
          listEl.innerHTML = '<li style="color:var(--text-muted)">Loading…</li>';
          return;
        }
        var p = projects[0];
        listEl.innerHTML =
          '<li>' +
            '<div>' +
              '<span class="name">' + escapeHtml(p.name) + '</span>' +
              '<div class="meta">' + escapeHtml(p.created_at.slice(0, 19)) + ' UTC</div>' +
            '</div>' +
            '<div class="actions">' +
              '<button class="btn btn-primary" data-open="' + escapeHtml(p.uid) + '">Open project</button>' +
            '</div>' +
          '</li>';
        listEl.querySelector('[data-open]').addEventListener('click', function() {
          window.location.href = '/project.html?uid=' + p.uid;
        });
      })
      .catch(function() {
        listEl.innerHTML = '<li style="color:var(--red)">Failed to load project.</li>';
      });
  }

  return { run: run };
})();
