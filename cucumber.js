/** Cucumber configuration for e2e tests. */
module.exports = {
  default: {
    require: ['e2e/step_definitions/**/*.js', 'e2e/support/**/*.js'],
    requireModule: [],
    format: ['progress', 'summary'],
    formatOptions: {},
    paths: ['e2e/features/**/*.feature'],
    worldParameters: {
      baseUrl: process.env.BASE_URL || 'http://localhost:8000',
      headless: process.env.CUCUMBER_HEADED !== '1',
      browser: process.env.BROWSER || 'chromium',
    },
  },
};
