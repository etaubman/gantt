/** Cucumber hooks: browser lifecycle. */
const { Before, After, setDefaultTimeout } = require('@cucumber/cucumber');

setDefaultTimeout(30 * 1000);

Before(async function () {
  await this.init();
});

Before({ tags: '@edit-lock' }, async function () {
  try {
    const res = await this.context.request.get('/api/edit-lock');
    const lock = await res.json();
    if (lock && lock.locked && lock.employee_id) {
      await this.context.request.post('/api/edit-lock/release', {
        data: { employee_id: lock.employee_id, force: true },
      });
    }
  } catch (_) {}
});

After(async function () {
  await this.destroy();
});
