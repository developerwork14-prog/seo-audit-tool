const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');

(async () => {

    // Launch Chrome
    const chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless']
    });

    // Run Lighthouse
    const result = await lighthouse(
        'http://jitsy.in/',
        {
            port: chrome.port,
            output: 'json',
            logLevel: 'info'
        }
    );

    const report = result.lhr;

    const fs = require('fs');

fs.writeFileSync(
    'report.json',
    JSON.stringify(report, null, 2)
);

console.log('Full report saved as report.json');

    console.log(
        'Performance:',
        report.categories.performance.score * 100
    );

    console.log(
        'SEO:',
        report.categories.seo.score * 100
    );

    console.log(
        'Accessibility:',
        report.categories.accessibility.score * 100
    );

    console.log(
        'Best Practices:',
        report.categories['best-practices'].score * 100
    );

    // Close Chrome
    await chrome.kill();

})();