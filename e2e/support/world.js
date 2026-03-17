/** Cucumber world: shared context and Playwright browser/page. */
const { setWorldConstructor } = require('@cucumber/cucumber');
const { chromium, firefox, webkit } = require('playwright');

class CustomWorld {
  constructor({ parameters }) {
    this.parameters = parameters;
    this.baseUrl = parameters.baseUrl || 'http://localhost:8000';
    this.headless = parameters.headless !== false;
    this.browserName = parameters.browser || 'chromium';
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    const launcher = { chromium, firefox, webkit }[this.browserName] || chromium;
    this.browser = await launcher.launch({
      headless: this.headless,
      args: this.headless ? ['--no-sandbox'] : [],
    });
    this.context = await this.browser.newContext({
      baseURL: this.baseUrl,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    this.page = await this.context.newPage();
  }

  async destroy() {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
  }
}

setWorldConstructor(CustomWorld);
