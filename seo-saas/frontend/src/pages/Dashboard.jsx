import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const tabs = [
    'Overview',
    'Pages',
    'Meta',
    'HTTPS',
    'Headings',
    'Schema',
    'Site Files',
    'Images',
    'Links',
    'Internal Links',
    'NAP',
    'Actions',
    'Failures'
];

function getTechnicalAudit(audit) {
    return audit?.fullReport?.technicalAudit || {};
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
    return typeof score === 'number' ? Math.round(score) : 'N/A';
}

function yesNo(value) {
    return value ? 'Yes' : 'No';
}

function renderScoreCard(label, score) {
    return (
        <div className="card" key={label}>
            <h2>{label}</h2>
            <div className={`score ${getScoreClass(score)}`}>
                {formatScore(score)}
            </div>
        </div>
    );
}

function Metric({ label, value }) {
    return (
        <div className="metric">
            <span>{label}</span>
            <strong>{value ?? ''}</strong>
        </div>
    );
}

function Table({ headers, rows }) {
    if (!rows.length) {
        return <p className="muted">No rows found for this task.</p>;
    }

    return (
        <div className="table-wrap">
            <table>
                <thead>
                    <tr>
                        {headers.map((header) => (
                            <th key={header}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={`${rowIndex}-${row[0]}`}>
                            {row.map((cell, cellIndex) => (
                                <td key={`${cellIndex}-${cell}`}>
                                    {cell ?? ''}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function getIssues(technical, audit) {
    const issues = [...(technical.issues || [])];

    if (
        typeof audit.performanceScore === 'number' &&
        audit.performanceScore < 50 &&
        !issues.includes('Poor performance score')
    ) {
        issues.push('Poor performance score');
    }

    if (
        !technical.napAudit?.hasNAP &&
        !issues.includes('NAP information missing')
    ) {
        issues.push('NAP information missing');
    }

    if (
        technical.siteFileAudit &&
        !technical.siteFileAudit.hasRobotsTxt &&
        !issues.includes('robots.txt missing')
    ) {
        issues.push('robots.txt missing');
    }

    if (
        technical.siteFileAudit &&
        !technical.siteFileAudit.hasSitemapXml &&
        !issues.includes('sitemap.xml missing')
    ) {
        issues.push('sitemap.xml missing');
    }

    if (
        technical.siteFileAudit &&
        !technical.siteFileAudit.hasLlmsTxt &&
        !issues.includes('llms.txt missing')
    ) {
        issues.push('llms.txt missing');
    }

    if (
        technical.protocolAudit &&
        !technical.protocolAudit.isHttps &&
        !issues.includes('Page is not served over HTTPS')
    ) {
        issues.push('Page is not served over HTTPS');
    }

    if (
        technical.protocolAudit &&
        !technical.protocolAudit.hasHttps &&
        !issues.includes('HTTPS version is not reachable')
    ) {
        issues.push('HTTPS version is not reachable');
    }

    if (
        technical.protocolAudit?.servesHttpWithoutRedirect &&
        !issues.includes('HTTP version does not redirect to HTTPS')
    ) {
        issues.push('HTTP version does not redirect to HTTPS');
    }

    if (
        technical.canonicalUrl?.toLowerCase().startsWith('http://') &&
        technical.protocolAudit?.isHttps &&
        !issues.includes('Canonical URL uses HTTP')
    ) {
        issues.push('Canonical URL uses HTTP');
    }

    return issues;
}

function getIssuePriority(issue) {
    if (
        issue.includes('noindex') ||
        issue.includes('Missing H1') ||
        issue.includes('Title Missing') ||
        issue.includes('Poor performance') ||
        issue.includes('NAP') ||
        issue.includes('robots.txt') ||
        issue.includes('sitemap.xml') ||
        issue.includes('HTTPS') ||
        issue.includes('HTTP')
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

    if (issue.includes('schema') || issue.includes('JSON-LD')) {
        return 'Fix structured data markup and required schema properties.';
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

    if (issue.includes('dimensions')) {
        return 'Add width and height attributes to images.';
    }

    if (issue.includes('Broken image')) {
        return 'Replace or fix broken image URLs.';
    }

    if (issue.includes('performance')) {
        return 'Optimize images, scripts, render blocking assets, and server response.';
    }

    if (issue.includes('NAP')) {
        return 'Add business name, address, phone number, and email consistently across the page.';
    }

    if (issue.includes('robots.txt')) {
        return 'Create a robots.txt file at the domain root and include sitemap directives.';
    }

    if (issue.includes('sitemap.xml')) {
        return 'Create a sitemap.xml file at the domain root with indexable page URLs.';
    }

    if (issue.includes('llms.txt')) {
        return 'Create an llms.txt file at the domain root for AI crawler guidance.';
    }

    if (issue.includes('not served over HTTPS')) {
        return 'Serve the audited page over HTTPS.';
    }

    if (issue.includes('HTTPS version is not reachable')) {
        return 'Fix SSL, hosting, or redirect configuration so HTTPS responds successfully.';
    }

    if (issue.includes('HTTP version does not redirect')) {
        return 'Add a 301 redirect from HTTP to HTTPS.';
    }

    if (issue.includes('Canonical URL uses HTTP')) {
        return 'Update the canonical URL to use HTTPS.';
    }

    return 'Review and fix this SEO issue.';
}

function getImageRows(audit) {
    const technical = getTechnicalAudit(audit);
    const imageAudit = technical.imageAudit || {};
    const rows = [];

    (imageAudit.missingTitleImages || []).forEach((image) => {
        rows.push([
            audit.url,
            'Missing Title',
            image.url || image.src || '',
            ''
        ]);
    });

    (imageAudit.missingAltImages || []).forEach((image) => {
        rows.push([
            audit.url,
            'Missing ALT',
            image.url || image.src || '',
            ''
        ]);
    });

    (imageAudit.emptyAltImages || []).forEach((image) => {
        rows.push([
            audit.url,
            'Empty ALT',
            image.url || image.src || '',
            ''
        ]);
    });

    (imageAudit.missingDimensionImages || []).forEach((image) => {
        rows.push([
            audit.url,
            'Missing Dimensions',
            image.url || image.src || '',
            ''
        ]);
    });

    (imageAudit.brokenImageUrls || []).forEach((image) => {
        rows.push([
            audit.url,
            'Broken Image',
            image.url || '',
            image.status || ''
        ]);
    });

    return rows;
}

function getFilenameFromUrl(url) {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.replace(/\/$/, '');

        return pathname.split('/').pop() || url;
    } catch (error) {
        return url;
    }
}

function getChildSitemapPreview(sitemapXml) {
    const sitemapUrls = sitemapXml?.sitemapUrls || [];

    if (!sitemapUrls.length) {
        return sitemapXml?.preview || '';
    }

    const visibleSitemaps = sitemapUrls
        .slice(0, 4)
        .map(getFilenameFromUrl);
    const hiddenCount = Math.max(
        (sitemapXml?.sitemapCount || sitemapUrls.length) -
            visibleSitemaps.length,
        0
    );

    return [
        ...visibleSitemaps,
        ...(hiddenCount > 0 ? [`+${hiddenCount} more`] : [])
    ].join('\n');
}

function getProtocolResult(check, protocolAudit) {
    if (!check?.reachable) {
        return check?.error ? `Not reachable: ${check.error}` : 'Not reachable';
    }

    if (check.url?.startsWith('http://')) {
        return protocolAudit?.redirectsHttpToHttps
            ? 'Redirects to HTTPS'
            : 'Serves HTTP';
    }

    return 'HTTPS reachable';
}

function getCurrentProtocolCheck(protocolAudit) {
    return protocolAudit?.isHttps ? protocolAudit.https : protocolAudit?.http;
}

function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}

function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');

    const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8'
    });

    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    URL.revokeObjectURL(link.href);
}

function buildRows(tab, audit) {
    const technical = getTechnicalAudit(audit);
    const issues = getIssues(technical, audit);
    const sitemapType =
        (technical.siteFileAudit?.sitemapXml?.sitemapCount || 0) > 0
            ? 'Sitemap Index'
            : 'URL Sitemap';
    const currentProtocolCheck = getCurrentProtocolCheck(
        technical.protocolAudit
    );

    const rows = {
        Overview: [
            ['Metric', 'Value'],
            ['Start URL', audit.url],
            ['Pages selected', 1],
            ['Pages audited', 1],
            ['Partial audits', 0],
            ['Failed pages', 0],
            ['Open issues', issues.length],
            ['Performance', audit.performanceScore],
            ['SEO', audit.seoScore],
            ['Accessibility', audit.accessibilityScore],
            ['Best Practices', audit.bestPracticesScore],
            [
                'HTTPS',
                technical.protocolAudit
                    ? yesNo(technical.protocolAudit.isHttps)
                    : 'N/A'
            ],
            [
                'HTTP redirects to HTTPS',
                technical.protocolAudit
                    ? yesNo(technical.protocolAudit.redirectsHttpToHttps)
                    : 'N/A'
            ],
            [
                'NAP Found',
                technical.napAudit?.hasNAP ? 'Yes' : 'No'
            ]
        ],

        Pages: [
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
            [
                audit.url,
                'Lighthouse audit',
                technical.indexability || '',
                audit.performanceScore,
                audit.seoScore,
                audit.accessibilityScore,
                audit.bestPracticesScore,
                technical.wordCount || 0,
                issues.join('; ')
            ]
        ],

        Meta: [
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
            [
                audit.url,
                technical.titleText || '',
                technical.titleLength || 0,
                technical.titleStatus || '',
                technical.metaDescription || '',
                technical.metaDescriptionLength || 0,
                technical.metaDescriptionStatus || '',
                technical.canonicalUrl || '',
                yesNo(technical.canonicalMatches),
                technical.robotsMeta || '',
                technical.indexability || ''
            ]
        ],

        HTTPS: [
            [
                'Check',
                'URL',
                'Reachable',
                'Status',
                'Final URL',
                'Result'
            ],
            [
                'Current page',
                audit.url,
                technical.protocolAudit
                    ? yesNo(technical.protocolAudit.isHttps)
                    : 'N/A',
                currentProtocolCheck?.status || '',
                currentProtocolCheck?.finalUrl || audit.url,
                technical.protocolAudit
                    ? technical.protocolAudit.isHttps ? 'HTTPS' : 'HTTP'
                    : 'N/A'
            ],
            [
                'HTTP version',
                technical.protocolAudit?.http?.url || '',
                yesNo(technical.protocolAudit?.http?.reachable),
                technical.protocolAudit?.http?.status || '',
                technical.protocolAudit?.http?.finalUrl || '',
                getProtocolResult(
                    technical.protocolAudit?.http,
                    technical.protocolAudit
                )
            ],
            [
                'HTTPS version',
                technical.protocolAudit?.https?.url || '',
                yesNo(technical.protocolAudit?.https?.reachable),
                technical.protocolAudit?.https?.status || '',
                technical.protocolAudit?.https?.finalUrl || '',
                getProtocolResult(
                    technical.protocolAudit?.https,
                    technical.protocolAudit
                )
            ],
            [
                'Canonical protocol',
                technical.canonicalUrl || '',
                technical.canonicalUrl ? 'Yes' : 'No',
                '',
                '',
                technical.canonicalUrl?.toLowerCase().startsWith('http://')
                    ? 'Canonical uses HTTP'
                    : technical.canonicalUrl
                        ? 'Canonical uses HTTPS or relative URL'
                        : 'Missing canonical'
            ]
        ],

        Headings: [
            [
                'URL',
                'H1 Count',
                'H1 Text',
                'Duplicate H1',
                'H2',
                'H3',
                'Issues'
            ],
            [
                audit.url,
                technical.headings?.h1 || 0,
                (technical.h1Texts || []).join(' | '),
                yesNo(technical.duplicateH1),
                technical.headings?.h2 || 0,
                technical.headings?.h3 || 0,
                (technical.headingIssues || []).join('; ')
            ]
        ],

        Schema: [
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
                'Missing Recommended'
            ],
            [
                audit.url,
                technical.schemaAudit?.status || '',
                (technical.schemaAudit?.types || []).join(', '),
                technical.schemaAudit?.jsonLdBlocks || 0,
                technical.schemaAudit?.validJsonLdBlocks || 0,
                technical.schemaAudit?.invalidJsonLd || 0,
                technical.schemaAudit?.microdataItems || 0,
                technical.schemaAudit?.rdfaItems || 0,
                (technical.schemaAudit?.missingRequired || [])
                    .map((item) => `${item.type}: ${item.property}`)
                    .join('; '),
                (technical.schemaAudit?.missingRecommended || [])
                    .map((item) => `${item.type}: ${item.property}`)
                    .join('; ')
            ]
        ],

        'Site Files': [
            [
                'File',
                'URL',
                'Found',
                'Status',
                'Size',
                'Lines',
                'Details',
                'Preview'
            ],
            [
                'robots.txt',
                technical.siteFileAudit?.robotsTxt?.url || '',
                yesNo(technical.siteFileAudit?.robotsTxt?.exists),
                technical.siteFileAudit?.robotsTxt?.status || '',
                technical.siteFileAudit?.robotsTxt?.contentLength || 0,
                technical.siteFileAudit?.robotsTxt?.lineCount || 0,
                [
                    `${technical.siteFileAudit?.robotsTxt?.disallowCount || 0} disallow rules`,
                    `${technical.siteFileAudit?.robotsTxt?.allowCount || 0} allow rules`,
                    `${technical.siteFileAudit?.robotsTxt?.sitemapUrls?.length || 0} sitemap directives`
                ].join('; '),
                technical.siteFileAudit?.robotsTxt?.preview || ''
            ],
            [
                'llms.txt',
                technical.siteFileAudit?.llmsTxt?.url || '',
                yesNo(technical.siteFileAudit?.llmsTxt?.exists),
                technical.siteFileAudit?.llmsTxt?.status || '',
                technical.siteFileAudit?.llmsTxt?.contentLength || 0,
                technical.siteFileAudit?.llmsTxt?.lineCount || 0,
                [
                    `${technical.siteFileAudit?.llmsTxt?.headings?.length || 0} headings`,
                    `${technical.siteFileAudit?.llmsTxt?.links?.length || 0} links`
                ].join('; '),
                technical.siteFileAudit?.llmsTxt?.preview || ''
            ],
            [
                'sitemap.xml',
                technical.siteFileAudit?.sitemapXml?.url || '',
                yesNo(technical.siteFileAudit?.sitemapXml?.exists),
                technical.siteFileAudit?.sitemapXml?.status || '',
                technical.siteFileAudit?.sitemapXml?.contentLength || 0,
                technical.siteFileAudit?.sitemapXml?.lineCount || 0,
                [
                    sitemapType,
                    `${technical.siteFileAudit?.sitemapXml?.urlCount || 0} URLs`,
                    `${technical.siteFileAudit?.sitemapXml?.sitemapCount || 0} child sitemaps`,
                    technical.siteFileAudit?.sitemapXml?.parseError
                        ? `Parse error: ${technical.siteFileAudit.sitemapXml.parseError}`
                        : ''
                ].filter(Boolean).join('; '),
                getChildSitemapPreview(technical.siteFileAudit?.sitemapXml)
            ]
        ],

        Images: [
            ['Page URL', 'Issue Type', 'Image URL', 'Status'],
            ...getImageRows(audit)
        ],

        Links: [
            [
                'URL',
                'Total Links',
                'Internal Links',
                'External Links',
                'Broken Links'
            ],
            [
                audit.url,
                technical.linkAudit?.totalLinks || 0,
                technical.linkAudit?.internalLinks || 0,
                technical.linkAudit?.externalLinks || 0,
                technical.linkAudit?.brokenLinks?.length || 0
            ]
        ],
        'Internal Links': [
    [
        'Page URL',
        'Anchor Text',
        'Target URL',
        'Status'
    ],

    ...(technical.internalLinkAudit?.links || []).map((link) => [
        link.pageUrl || audit.url,
        link.anchorText || '',
        link.targetUrl || '',
        link.status || ''
    ])
],

        NAP: [
            [
                'URL',
                'Business Name',
                'Address',
                'Phone Numbers',
                'Emails',
                'Has NAP'
            ],
            [
                audit.url,
                technical.napAudit?.businessName || '',
                (technical.napAudit?.addresses || []).join(' | '),
                (technical.napAudit?.phones || [])
    .map(phone => `+91 ${phone}`)
    .join(' | '),
                (technical.napAudit?.emails || []).join(' | '),
                technical.napAudit?.hasNAP ? 'Yes' : 'No'
            ]
        ],

        Actions: [
            ['URL', 'Issue', 'Priority', 'Recommended Task'],
            ...issues.map((issue) => [
                audit.url,
                issue,
                getIssuePriority(issue),
                getIssueTask(issue)
            ])
        ],

        Failures: [['URL', 'Error']]
    };

    return rows[tab] || rows.Overview;
}

function TabContent({ tab, audit }) {
    const technical = getTechnicalAudit(audit);
    const issues = getIssues(technical, audit);

    if (tab === 'Overview') {
        return (
            <div className="metric-grid">
                <Metric label="Start URL" value={audit.url} />
                <Metric label="Pages selected" value={1} />
                <Metric label="Pages audited" value={1} />
                <Metric label="Partial audits" value={0} />
                <Metric label="Failed pages" value={0} />
                <Metric label="Open issues" value={issues.length} />
                <Metric
                    label="HTTPS"
                    value={
                        technical.protocolAudit
                            ? yesNo(technical.protocolAudit.isHttps)
                            : 'N/A'
                    }
                />
                <Metric
                    label="HTTP Redirect"
                    value={
                        technical.protocolAudit
                            ? yesNo(
                                technical.protocolAudit.redirectsHttpToHttps
                            )
                            : 'N/A'
                    }
                />
                <Metric
                    label="NAP Found"
                    value={technical.napAudit?.hasNAP ? 'Yes' : 'No'}
                />
                <Metric
                    label="robots.txt"
                    value={technical.siteFileAudit?.hasRobotsTxt ? 'Yes' : 'No'}
                />
                <Metric
                    label="llms.txt"
                    value={technical.siteFileAudit?.hasLlmsTxt ? 'Yes' : 'No'}
                />
                <Metric
                    label="sitemap.xml"
                    value={technical.siteFileAudit?.hasSitemapXml ? 'Yes' : 'No'}
                />
            </div>
        );
    }

    const rows = buildRows(tab, audit);

    return <Table headers={rows[0]} rows={rows.slice(1)} />;
}

function Dashboard() {
    const [url, setUrl] = useState('https://bilgromark.com/');
    const [scope, setScope] = useState('single');
    const [pages, setPages] = useState(10);
    const [latestAudit, setLatestAudit] = useState(null);
    const [history, setHistory] = useState([]);
    const [activeTab, setActiveTab] = useState('Overview');
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [error, setError] = useState('');

    const displayedAudit = latestAudit;

    const technical = displayedAudit
    ? getTechnicalAudit(displayedAudit)
    : {};

    const issues = useMemo(
        () => (displayedAudit ? getIssues(technical, displayedAudit) : []),
        [displayedAudit, technical]
    );

    async function loadHistory() {
        setHistoryLoading(true);

        try {
            const { data } = await api.get('/audit/history');
            setHistory(data.audits || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load history');
        } finally {
            setHistoryLoading(false);
        }
    }

    useEffect(() => {
        loadHistory();
    }, []);

    async function runAudit(event) {
        event.preventDefault();

        setError('');
        setLatestAudit(null);
        setLoading(true);

        try {
            const { data } = await api.post('/audit/run', { url });

            setLatestAudit(data.audit);
            setActiveTab('Overview');

            await loadHistory();
        } catch (err) {
            setError(err.response?.data?.message || 'Audit failed');
        } finally {
            setLoading(false);
        }
    }

    function exportTab(tab) {
        if (!displayedAudit) {
            return;
        }

        downloadCsv(
            `seo-${tab.toLowerCase()}-report.csv`,
            buildRows(tab, displayedAudit)
        );
    }

    function exportAll() {
        if (!displayedAudit) {
            return;
        }

        const rows = tabs.flatMap((tab) => [
            [`SECTION: ${tab.toUpperCase()}`],
            ...buildRows(tab, displayedAudit),
            []
        ]);

        downloadCsv('seo-all-report.csv', rows);
    }

    return (
        <>
            <form className="audit-panel" onSubmit={runAudit}>
                <div className="field-group url-field">
                    <label htmlFor="urlInput">URL</label>

                    <input
                        id="urlInput"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://example.com/"
                        required
                    />
                </div>

                <div className="field-group">
                    <span className="field-label">Scope</span>

                    <div className="scope-toggle" aria-label="Audit scope">
                        <label>
                            <input
                                type="radio"
                                name="auditScope"
                                value="single"
                                checked={scope === 'single'}
                                onChange={() => setScope('single')}
                            />

                            <span>Single</span>
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="auditScope"
                                value="site"
                                checked={scope === 'site'}
                                onChange={() => setScope('site')}
                            />

                            <span>Site</span>
                        </label>
                    </div>
                </div>

                <label className="field-group page-limit">
                    <span>Pages</span>

                    <input
                        type="number"
                        min="1"
                        max="25"
                        value={pages}
                        onChange={(event) => setPages(event.target.value)}
                    />
                </label>

                <div className="command-group">
                    <button className="primary-action" disabled={loading}>
                        {loading ? 'Running...' : 'Run Audit'}
                    </button>

                    <button
                        type="button"
                        className="secondary-action"
                    >
                        PDF
                    </button>

                    <button
                        type="button"
                        className="secondary-action"
                        onClick={exportAll}
                    >
                        CSV
                    </button>
                </div>
            </form>

            <main id="results">
                {error && (
                    <div className="error-box wide-card">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="loading wide-card">
                        Running single page audit...
                    </div>
                )}

                {displayedAudit && (
                    <>
                        <div className="card">
                            <h2>Pages</h2>

                            <div className="score unknown">
                                1
                            </div>

                            <p className="muted">
                                0 failed, 0 partial
                            </p>
                        </div>

                        {renderScoreCard(
                            'Performance',
                            displayedAudit.performanceScore
                        )}

                        {renderScoreCard(
                            'SEO',
                            displayedAudit.seoScore
                        )}

                        {renderScoreCard(
                            'Accessibility',
                            displayedAudit.accessibilityScore
                        )}

                        {renderScoreCard(
                            'Best Practices',
                            displayedAudit.bestPracticesScore
                        )}

                        <div className="card wide-card workbench">
                            <div className="workbench-header">
                                <h2>SEO Specialist Report</h2>

                                <div className="export-actions">
                                    <button onClick={exportAll}>
                                        Export All CSV
                                    </button>

                                    <button>
                                        PDF
                                    </button>
                                </div>
                            </div>

                            <div className="tabs">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab}
                                        className={`tab-button ${
                                            activeTab === tab ? 'active' : ''
                                        }`}
                                        onClick={() => setActiveTab(tab)}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            <div className="tab-content">
                                <div className="task-toolbar">
                                    <button
                                        onClick={() => exportTab(activeTab)}
                                    >
                                        Export {activeTab} CSV
                                    </button>
                                </div>

                                <TabContent
                                    tab={activeTab}
                                    audit={displayedAudit}
                                />
                            </div>
                        </div>
                    </>
                )}

                {!displayedAudit && !loading && !error && (
                    <div className="loading wide-card">
                        Enter a URL and run an audit to open the SEO Specialist Report.
                    </div>
                )}

                {!displayedAudit &&
                    !historyLoading &&
                    history.length > 0 && (
                        <div className="card wide-card">
                            <h2>Audit History</h2>

                            <p className="muted">
                                {history.length} saved audits in your account.
                            </p>
                        </div>
                    )}
            </main>
        </>
    );
}

export default Dashboard;
