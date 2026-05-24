let latestAuditData = null;

async function runAudit() {

    const url =
        document.getElementById('urlInput').value.trim();

    if (!url) {

        showError('Please enter a website URL.');

        return;

    }

    const scope = getAuditScope();
    const maxPages = getMaxPages();
    const resultsDiv =
        document.getElementById('results');

    resultsDiv.innerHTML = `
        <div class="loading wide-card">
            ${scope === 'site'
                ? `Running whole website audit for up to ${maxPages} pages...`
                : 'Running single page audit...'}
        </div>
    `;

    try {

        const response = await fetch(
            `${getApiBaseUrl()}/audit?url=${encodeURIComponent(url)}&scope=${scope}&maxPages=${maxPages}`
        );

        if (!response.ok) {

            throw new Error(`Server returned ${response.status}`);

        }

        const data = await response.json();

        if (data.error) {

            showError(data.error);

            return;

        }

        latestAuditData = normalizeAuditData(data);

        renderSeoWorkbench(latestAuditData);

    } catch (error) {

        console.error(error);

        showError(
            'Error running audit. Make sure the server is running on port 3000.'
        );

    }

}

function normalizeAuditData(data) {

    if (data.type === 'site') {

        return data;

    }

    return {

        type: 'single',
        startUrl: data.url,
        sitemapPagesFound: 1,
        auditedPages: 1,
        partialPages: data.partial ? 1 : 0,
        failedPages: [],
        summary: {

            performance: data.performance,
            seo: data.seo,
            accessibility: data.accessibility,
            bestPractices: data.bestPractices

        },
        pages: [data]

    };

}

function renderSeoWorkbench(data) {

    const resultsDiv =
        document.getElementById('results');

    resultsDiv.innerHTML = `
        ${renderSummaryCards(data)}

        <div class="card wide-card workbench">
            <div class="workbench-header">
                <h2>SEO Specialist Report</h2>
                <div class="export-actions">
                    <button onclick="exportAuditCsv('all')">Export All CSV</button>
                    <button onclick="downloadReport()">PDF</button>
                </div>
            </div>

            <div class="tabs">
                ${renderTabButton('overview', 'Overview', true)}
                ${renderTabButton('pages', 'Pages')}
                ${renderTabButton('meta', 'Meta')}
                ${renderTabButton('headings', 'Headings')}
                ${renderTabButton('schema', 'Schema')}
                ${renderTabButton('images', 'Images')}
                ${renderTabButton('links', 'Links')}
                ${renderTabButton('actions', 'Actions')}
                ${renderTabButton('failures', 'Failures')}
            </div>

            <div id="tabContent" class="tab-content"></div>
        </div>
    `;

    showTab('overview');

}

function renderSummaryCards(data) {

    return `
        <div class="card">
            <h2>Pages</h2>
            <div class="score unknown">${data.auditedPages}</div>
            <p class="muted">${data.failedPages.length} failed, ${data.partialPages} partial</p>
        </div>

        ${renderScoreCard('Performance', data.summary.performance)}
        ${renderScoreCard('SEO', data.summary.seo)}
        ${renderScoreCard('Accessibility', data.summary.accessibility)}
        ${renderScoreCard('Best Practices', data.summary.bestPractices)}
    `;

}

function renderScoreCard(label, score) {

    return `
        <div class="card">
            <h2>${label}</h2>
            <div class="score ${getScoreClass(score)}">${formatScore(score)}</div>
        </div>
    `;

}

function renderTabButton(tab, label, active = false) {

    return `
        <button
            class="tab-button ${active ? 'active' : ''}"
            onclick="showTab('${tab}')"
        >
            ${label}
        </button>
    `;

}

function showTab(tab) {

    if (!latestAuditData) {
        return;
    }

    document.querySelectorAll('.tab-button').forEach((button) => {

        button.classList.toggle(
            'active',
            button.textContent.trim().toLowerCase() === tab
        );

    });

    const tabContent =
        document.getElementById('tabContent');

    const renderers = {

        overview: renderOverviewTab,
        pages: renderPagesTab,
        meta: renderMetaTab,
        headings: renderHeadingsTab,
        schema: renderSchemaTab,
        images: renderImagesTab,
        links: renderLinksTab,
        actions: renderActionsTab,
        failures: renderFailuresTab

    };

    tabContent.innerHTML =
        (renderers[tab] || renderers.overview)(latestAuditData);

}

function renderOverviewTab(data) {

    const totalIssues =
        data.pages.reduce(
            (total, page) => total + getPageIssues(page).length,
            0
        ) + data.failedPages.length;

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('overview')">Export Overview CSV</button>
        </div>

        <div class="metric-grid">
            ${renderMetric('Start URL', data.startUrl)}
            ${renderMetric('Pages selected', data.sitemapPagesFound)}
            ${renderMetric('Pages audited', data.auditedPages)}
            ${renderMetric('Partial audits', data.partialPages)}
            ${renderMetric('Failed pages', data.failedPages.length)}
            ${renderMetric('Open issues', totalIssues)}
        </div>
    `;

}

function renderPagesTab(data) {

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('pages')">Export Pages CSV</button>
        </div>

        ${renderTable([
            'URL',
            'Status',
            'Indexability',
            'Performance',
            'SEO',
            'Accessibility',
            'Best Practices',
            'Word Count',
            'Issues'
        ], data.pages.map((page) => [
            page.url,
            page.partial ? 'Partial HTML audit' : 'Lighthouse audit',
            page.indexability || 'Unknown',
            formatScore(page.performance),
            formatScore(page.seo),
            formatScore(page.accessibility),
            formatScore(page.bestPractices),
            page.wordCount || 0,
            getPageIssues(page).join('; ')
        ]))}
    `;

}

function renderMetaTab(data) {

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('meta')">Export Meta CSV</button>
        </div>

        ${renderTable([
            'URL',
            'Title',
            'Title Length',
            'Title Status',
            'Meta Description',
            'Description Length',
            'Description Status',
            'Canonical',
            'Canonical Matches',
            'Robots',
            'Indexability'
        ], data.pages.map((page) => [
            page.url,
            page.titleText || '',
            page.titleLength || 0,
            page.titleStatus || '',
            page.metaDescription || '',
            page.metaDescriptionLength || 0,
            page.metaDescriptionStatus || '',
            page.canonicalUrl || '',
            yesNo(page.canonicalMatches),
            page.robotsMeta || '',
            page.indexability || ''
        ]))}
    `;

}

function renderHeadingsTab(data) {

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('headings')">Export Headings CSV</button>
        </div>

        ${renderTable([
            'URL',
            'H1 Count',
            'H1 Text',
            'Duplicate H1',
            'H2',
            'H3',
            'Issues'
        ], data.pages.map((page) => [
            page.url,
            page.headings?.h1 || 0,
            (page.h1Texts || []).join(' | '),
            yesNo(page.duplicateH1),
            page.headings?.h2 || 0,
            page.headings?.h3 || 0,
            (page.headingIssues || []).join('; ')
        ]))}
    `;

}

function renderSchemaTab(data) {

    const summary =
        getSchemaSummary(data);

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('schema')">Export Schema CSV</button>
        </div>

        <div class="metric-grid">
            ${renderMetric('Pages with schema', summary.pagesWithSchema)}
            ${renderMetric('JSON-LD blocks', summary.jsonLdBlocks)}
            ${renderMetric('Invalid JSON-LD', summary.invalidJsonLd)}
            ${renderMetric('Missing required', summary.missingRequired)}
            ${renderMetric('Missing recommended', summary.missingRecommended)}
        </div>

        ${renderTable([
            'URL',
            'Status',
            'Types',
            'JSON-LD',
            'Microdata',
            'RDFa',
            'Missing Required',
            'Missing Recommended',
            'Issues'
        ], data.pages.map((page) => {

            const audit =
                page.schemaAudit || {};

            return [
                page.url,
                audit.status || 'Unknown',
                (audit.types || []).join(', '),
                audit.jsonLdBlocks || 0,
                audit.microdataItems || 0,
                audit.rdfaItems || 0,
                (audit.missingRequired || [])
                    .map((item) => `${item.type}: ${item.property}`)
                    .join('; '),
                (audit.missingRecommended || [])
                    .map((item) => `${item.type}: ${item.property}`)
                    .join('; '),
                (audit.issues || []).join('; ')
            ];

        }))}
    `;

}

function getSchemaSummary(data) {

    return data.pages.reduce((summary, page) => {

        const audit =
            page.schemaAudit || {};

        if (audit.hasStructuredData) {
            summary.pagesWithSchema++;
        }

        summary.jsonLdBlocks +=
            audit.jsonLdBlocks || 0;

        summary.invalidJsonLd +=
            audit.invalidJsonLd || 0;

        summary.missingRequired +=
            (audit.missingRequired || []).length;

        summary.missingRecommended +=
            (audit.missingRecommended || []).length;

        return summary;

    }, {
        pagesWithSchema: 0,
        jsonLdBlocks: 0,
        invalidJsonLd: 0,
        missingRequired: 0,
        missingRecommended: 0
    });

}

function renderImagesTab(data) {

    const rows =
        getImageIssueRows(data);
    const summary =
        getImageIssueSummary(data);

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('images')">Export Images CSV</button>
        </div>

        <div class="metric-grid">
            ${renderMetric('Missing title', summary.missingTitle)}
            ${renderMetric('Missing ALT', summary.missingAlt)}
            ${renderMetric('Empty ALT', summary.emptyAlt)}
            ${renderMetric('Missing dimensions', summary.missingDimensions)}
            ${renderMetric('Broken images', summary.brokenImages)}
        </div>

        ${renderTable([
            'Page URL',
            'Issue Type',
            'Image URL',
            'Status'
        ], rows)}
    `;

}

function getImageIssueSummary(data) {

    return data.pages.reduce((summary, page) => {

        summary.missingTitle +=
            page.imageAudit?.missingTitle ||
            page.missingTitleImages?.length ||
            0;

        summary.missingAlt +=
            page.imageAudit?.missingAlt ||
            page.missingAltImages?.length ||
            0;

        summary.emptyAlt +=
            page.imageAudit?.emptyAlt ||
            page.emptyAltImages?.length ||
            0;

        summary.missingDimensions +=
            page.imageAudit?.missingDimensions ||
            page.missingDimensionImages?.length ||
            0;

        summary.brokenImages +=
            page.imageAudit?.brokenImages ||
            page.brokenImageUrls?.length ||
            0;

        return summary;

    }, {
        missingTitle: 0,
        missingAlt: 0,
        emptyAlt: 0,
        missingDimensions: 0,
        brokenImages: 0
    });

}

function renderLinksTab(data) {

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('links')">Export Links CSV</button>
        </div>

        ${renderTable([
            'URL',
            'Total Links',
            'Internal Links',
            'External Links',
            'Broken Links'
        ], data.pages.map((page) => [
            page.url,
            page.linkAudit?.totalLinks || 0,
            page.linkAudit?.internalLinks || 0,
            page.linkAudit?.externalLinks || 0,
            page.linkAudit?.brokenLinks?.length || 0
        ]))}
    `;

}

function renderActionsTab(data) {

    const rows = [];

    data.pages.forEach((page) => {

        getPageIssues(page).forEach((issue) => {

            rows.push([
                page.url,
                issue,
                getIssuePriority(issue),
                getIssueTask(issue)
            ]);

        });

    });

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('actions')">Export Actions CSV</button>
        </div>

        ${renderTable([
            'URL',
            'Issue',
            'Priority',
            'Recommended Task'
        ], rows)}
    `;

}

function renderFailuresTab(data) {

    return `
        <div class="task-toolbar">
            <button onclick="exportAuditCsv('failures')">Export Failures CSV</button>
        </div>

        ${renderTable([
            'URL',
            'Error'
        ], data.failedPages.map((page) => [
            page.url,
            page.error
        ]))}
    `;

}

function renderMetric(label, value) {

    return `
        <div class="metric">
            <span>${label}</span>
            <strong>${value}</strong>
        </div>
    `;

}

function renderTable(headers, rows) {

    if (rows.length === 0) {

        return '<p class="muted">No rows found for this task.</p>';

    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        ${headers.map((header) => `<th>${header}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `
                        <tr>
                            ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

}

function getPageIssues(page) {

    const issues = [];

    if (page.indexability === 'Noindex') {
        issues.push('Page is noindex');
    }

    if (page.titleStatus && page.titleStatus !== 'Good') {
        issues.push(`Title ${page.titleStatus}`);
    }

    if (
        page.metaDescriptionStatus &&
        page.metaDescriptionStatus !== 'Good'
    ) {
        issues.push(`Meta description ${page.metaDescriptionStatus}`);
    }

    if (!page.canonicalUrl) {
        issues.push('Missing canonical');
    } else if (!page.canonicalMatches) {
        issues.push('Canonical does not match page URL');
    }

    if ((page.headings?.h1 || 0) === 0) {
        issues.push('Missing H1');
    }

    if ((page.headings?.h1 || 0) > 1) {
        issues.push('Multiple H1 tags');
    }

    if (page.duplicateH1) {
        issues.push('Duplicate H1 text');
    }

    if (page.schemaAudit?.status === 'Missing') {
        issues.push('Missing schema markup');
    }

    if ((page.schemaAudit?.invalidJsonLd || 0) > 0) {
        issues.push('Invalid JSON-LD schema');
    }

    if ((page.schemaAudit?.missingRequired || []).length > 0) {
        issues.push('Schema missing required fields');
    }

    if ((page.schemaAudit?.missingRecommended || []).length > 0) {
        issues.push('Schema missing recommended fields');
    }

    if ((page.wordCount || 0) < 300) {
        issues.push('Thin content');
    }

    if ((page.imageAudit?.missingAlt || 0) > 0) {
        issues.push('Images missing ALT text');
    }

    if ((page.imageAudit?.missingTitle || 0) > 0) {
        issues.push('Images missing title text');
    }

    if ((page.imageAudit?.missingDimensions || 0) > 0) {
        issues.push('Images missing dimensions');
    }

    if ((page.imageAudit?.brokenImages || 0) > 0) {
        issues.push('Broken image URLs');
    }

    if (typeof page.performance === 'number' && page.performance < 50) {
        issues.push('Poor performance score');
    }

    return issues;

}

function getIssuePriority(issue) {

    if (
        issue.includes('noindex') ||
        issue.includes('Missing H1') ||
        issue.includes('Title Missing') ||
        issue.includes('Poor performance')
    ) {
        return 'High';
    }

    if (
        issue.includes('canonical') ||
        issue.includes('Schema missing required') ||
        issue.includes('Invalid JSON-LD') ||
        issue.includes('Multiple H1') ||
        issue.includes('Thin content') ||
        issue.includes('Broken image')
    ) {
        return 'Medium';
    }

    return 'Low';

}

function getIssueTask(issue) {

    if (issue.includes('Title')) {
        return 'Rewrite title tag to 30-60 characters.';
    }

    if (issue.includes('Meta description')) {
        return 'Rewrite meta description to 120-160 characters.';
    }

    if (issue.includes('canonical')) {
        return 'Set a self-referencing canonical URL.';
    }

    if (issue.includes('Missing schema')) {
        return 'Add JSON-LD schema that matches the page type.';
    }

    if (issue.includes('Invalid JSON-LD')) {
        return 'Fix JSON-LD syntax so schema can be parsed.';
    }

    if (issue.includes('Schema missing required')) {
        return 'Add required properties for the detected schema type.';
    }

    if (issue.includes('Schema missing recommended')) {
        return 'Add recommended schema properties where available.';
    }

    if (issue.includes('H1')) {
        return 'Use one clear primary H1 per page.';
    }

    if (issue.includes('Thin content')) {
        return 'Expand useful page copy above 300 words.';
    }

    if (issue.includes('ALT')) {
        return 'Add descriptive ALT text to important images.';
    }

    if (issue.includes('Images') && issue.includes('title')) {
        return 'Add title text to images.';
    }

    if (issue.includes('dimensions')) {
        return 'Add width and height attributes to images.';
    }

    if (issue.includes('Broken image')) {
        return 'Replace or fix broken image URLs.';
    }

    if (issue.includes('performance')) {
        return 'Optimize images, scripts, render blocking assets, and server response.';
    }

    return 'Review and fix this SEO issue.';

}

function getImageIssueRows(data) {

    const rows = [];

    data.pages.forEach((page) => {

        (page.missingTitleImages || []).forEach((image) => {

            rows.push([
                page.url,
                'Missing Title',
                image.url || image.src || '',
                ''
            ]);

        });

        (page.missingAltImages || []).forEach((image) => {

            rows.push([
                page.url,
                'Missing ALT',
                image.url || image.src || '',
                ''
            ]);

        });

        (page.emptyAltImages || []).forEach((image) => {

            rows.push([
                page.url,
                'Empty ALT',
                image.url || image.src || '',
                ''
            ]);

        });

        (page.missingDimensionImages || []).forEach((image) => {

            rows.push([
                page.url,
                'Missing Dimensions',
                image.url || image.src || '',
                ''
            ]);

        });

        (page.brokenImageUrls || []).forEach((image) => {

            rows.push([
                page.url,
                'Broken Image',
                image.url || '',
                image.status || ''
            ]);

        });

    });

    return rows;

}

function exportAuditCsv(tab) {

    if (!latestAuditData) {

        showError('Run an audit before exporting CSV.');

        return;

    }

    const sections = buildCsvSections(latestAuditData);
    const csv = tab === 'all'
        ? Object.entries(sections)
            .map(([name, rows]) => sectionToCsv(name, rows))
            .join('\n\n')
        : rowsToCsv(sections[tab] || []);

    downloadTextFile(
        `seo-${tab}-report.csv`,
        csv,
        'text/csv;charset=utf-8'
    );

}

function buildCsvSections(data) {

    return {

        overview: [
            ['Metric', 'Value'],
            ['Start URL', data.startUrl],
            ['Pages selected', data.sitemapPagesFound],
            ['Pages audited', data.auditedPages],
            ['Partial audits', data.partialPages],
            ['Failed pages', data.failedPages.length],
            ['Average performance', formatScore(data.summary.performance)],
            ['Average SEO', formatScore(data.summary.seo)],
            ['Average accessibility', formatScore(data.summary.accessibility)],
            ['Average best practices', formatScore(data.summary.bestPractices)]
        ],

        pages: [
            [
                'URL',
                'Status',
                'Indexability',
                'Performance',
                'SEO',
                'Accessibility',
                'Best Practices',
                'Word Count',
                'Issues'
            ],
            ...data.pages.map((page) => [
                page.url,
                page.partial ? 'Partial HTML audit' : 'Lighthouse audit',
                page.indexability || 'Unknown',
                formatScore(page.performance),
                formatScore(page.seo),
                formatScore(page.accessibility),
                formatScore(page.bestPractices),
                page.wordCount || 0,
                getPageIssues(page).join('; ')
            ])
        ],

        meta: [
            [
                'URL',
                'Title',
                'Title Length',
                'Title Status',
                'Meta Description',
                'Description Length',
                'Description Status',
                'Canonical',
                'Canonical Matches',
                'Robots',
                'Indexability'
            ],
            ...data.pages.map((page) => [
                page.url,
                page.titleText || '',
                page.titleLength || 0,
                page.titleStatus || '',
                page.metaDescription || '',
                page.metaDescriptionLength || 0,
                page.metaDescriptionStatus || '',
                page.canonicalUrl || '',
                yesNo(page.canonicalMatches),
                page.robotsMeta || '',
                page.indexability || ''
            ])
        ],

        headings: [
            [
                'URL',
                'H1 Count',
                'H1 Text',
                'Duplicate H1',
                'H2',
                'H3',
                'Issues'
            ],
            ...data.pages.map((page) => [
                page.url,
                page.headings?.h1 || 0,
                (page.h1Texts || []).join(' | '),
                yesNo(page.duplicateH1),
                page.headings?.h2 || 0,
                page.headings?.h3 || 0,
                (page.headingIssues || []).join('; ')
            ])
        ],

        schema: [
            [
                'URL',
                'Status',
                'Types',
                'JSON-LD Blocks',
                'Valid JSON-LD Blocks',
                'Invalid JSON-LD Blocks',
                'Microdata Items',
                'RDFa Items',
                'Missing Required',
                'Missing Recommended',
                'Issues'
            ],
            ...data.pages.map((page) => {

                const audit =
                    page.schemaAudit || {};

                return [
                    page.url,
                    audit.status || 'Unknown',
                    (audit.types || []).join(', '),
                    audit.jsonLdBlocks || 0,
                    audit.validJsonLdBlocks || 0,
                    audit.invalidJsonLd || 0,
                    audit.microdataItems || 0,
                    audit.rdfaItems || 0,
                    (audit.missingRequired || [])
                        .map((item) => `${item.type}: ${item.property}`)
                        .join('; '),
                    (audit.missingRecommended || [])
                        .map((item) => `${item.type}: ${item.property}`)
                        .join('; '),
                    (audit.issues || []).join('; ')
                ];

            })
        ],

        images: [
            [
                'Page URL',
                'Issue Type',
                'Image URL',
                'Status'
            ],
            ...getImageIssueRows(data)
        ],

        links: [
            [
                'URL',
                'Total Links',
                'Internal Links',
                'External Links',
                'Broken Links'
            ],
            ...data.pages.map((page) => [
                page.url,
                page.linkAudit?.totalLinks || 0,
                page.linkAudit?.internalLinks || 0,
                page.linkAudit?.externalLinks || 0,
                page.linkAudit?.brokenLinks?.length || 0
            ])
        ],

        actions: [
            [
                'URL',
                'Issue',
                'Priority',
                'Recommended Task'
            ],
            ...data.pages.flatMap((page) =>
                getPageIssues(page).map((issue) => [
                    page.url,
                    issue,
                    getIssuePriority(issue),
                    getIssueTask(issue)
                ])
            )
        ],

        failures: [
            ['URL', 'Error'],
            ...data.failedPages.map((page) => [
                page.url,
                page.error
            ])
        ]

    };

}

function sectionToCsv(name, rows) {

    return rowsToCsv([
        [`SECTION: ${name.toUpperCase()}`],
        ...rows
    ]);

}

function rowsToCsv(rows) {

    return rows
        .map((row) => row.map(csvEscape).join(','))
        .join('\n');

}

function csvEscape(value) {

    const text = String(value ?? '');

    if (/[",\n]/.test(text)) {

        return `"${text.replace(/"/g, '""')}"`;

    }

    return text;

}

function downloadTextFile(filename, content, mimeType) {

    const blob = new Blob([content], {
        type: mimeType
    });

    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    URL.revokeObjectURL(link.href);

}

function downloadReport() {

    const url =
        document.getElementById('urlInput').value.trim();

    if (!url) {

        showError('Please enter a website URL before downloading the report.');

        return;

    }

    window.location.href =
        `${getApiBaseUrl()}/download-report?url=${encodeURIComponent(url)}&scope=${getAuditScope()}&maxPages=${getMaxPages()}`;

}

function getAuditScope() {

    const selectedScope =
        document.querySelector('input[name="auditScope"]:checked');

    return selectedScope ? selectedScope.value : 'single';

}

function getMaxPages() {

    const input =
        document.getElementById('maxPagesInput');

    const value =
        Number.parseInt(input?.value || '10', 10);

    if (Number.isNaN(value)) {

        return 10;

    }

    return Math.min(
        Math.max(value, 1),
        25
    );

}

function getApiBaseUrl() {

    if (window.location.protocol === 'file:') {

        return 'http://localhost:3000';

    }

    return window.location.origin;

}

function showError(message) {

    const resultsDiv =
        document.getElementById('results');

    resultsDiv.innerHTML = `
        <div class="card wide-card">
            <h2>Error</h2>
            <p>${message}</p>
        </div>
    `;

}

function getScoreClass(score) {

    if (typeof score !== 'number') {
        return 'unknown';
    }

    if (score >= 90) {
        return 'good';
    }

    if (score >= 50) {
        return 'average';
    }

    return 'bad';

}

function formatScore(score) {

    return typeof score === 'number'
        ? Math.round(score)
        : 'N/A';

}

function yesNo(value) {

    return value ? 'Yes' : 'No';

}

function escapeHtml(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

}
