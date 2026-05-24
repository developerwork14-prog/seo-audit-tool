const express = require('express');
const cors = require('cors');
const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');
const axios = require('axios');
const cheerio = require('cheerio');
const PDFDocument = require('pdfkit');

const app = express();

app.use(cors());
app.use(express.static(__dirname));

/*
|--------------------------------------------------------------------------
| HELPER
|--------------------------------------------------------------------------
*/

function safeScore(score) {

    if (score === null || score === undefined) {
        return 0;
    }

    return Math.round(score * 100);

}

function passFail(value) {

    return value ? 'PASS' : 'FAIL';

}

function writePdfSection(doc, title) {

    doc.moveDown();

    doc
        .fontSize(18)
        .text(title);

    doc.moveDown(0.5);

    doc.fontSize(11);

}

function writePdfLine(doc, label, value) {

    doc.text(`${label}: ${value}`);

}

function writePdfIssueUrls(doc, title, items = [], statusKey = null) {

    if (!items.length) {
        return;
    }

    doc.moveDown(0.4);

    doc
        .fontSize(11)
        .text(title);

    items.forEach((item, index) => {

        const url =
            item.url || item.src || '';

        const status =
            statusKey && item[statusKey]
                ? ` (${item[statusKey]})`
                : '';

        const value =
            `${index + 1}. ${url}${status}`;

        splitLongPdfLine(value).forEach((line) => {

            doc
                .fontSize(9)
                .text(line, {
                    width: 500
                });

        });

    });

}

function splitLongPdfLine(text, maxLength = 92) {

    const lines = [];

    for (
        let index = 0;
        index < text.length;
        index += maxLength
    ) {

        lines.push(text.slice(index, index + maxLength));

    }

    return lines;

}

function writePdfImageIssues(doc, page) {

    writePdfIssueUrls(
        doc,
        'Missing ALT image URLs',
        page.missingAltImages || []
    );

    writePdfIssueUrls(
        doc,
        'Empty ALT image URLs',
        page.emptyAltImages || []
    );

    writePdfIssueUrls(
        doc,
        'Missing title image URLs',
        page.missingTitleImages || []
    );

    writePdfIssueUrls(
        doc,
        'Missing dimension image URLs',
        page.missingDimensionImages || []
    );

    writePdfIssueUrls(
        doc,
        'Broken image URLs',
        page.brokenImageUrls || [],
        'status'
    );

}

function getTextLength(text) {

    return (text || '').trim().length;

}

function getLengthStatus(length, min, max) {

    if (length === 0) {
        return 'Missing';
    }

    if (length < min) {
        return 'Too short';
    }

    if (length > max) {
        return 'Too long';
    }

    return 'Good';

}

function extractPageMeta($, url) {

    const titleText =
        $('title').first().text().trim();

    const metaDescription =
        $('meta[name="description"]')
            .first()
            .attr('content') || '';

    const canonicalUrl =
        $('link[rel="canonical"]')
            .first()
            .attr('href') || '';

    const robotsMeta =
        $('meta[name="robots"]')
            .first()
            .attr('content') || '';

    const bodyText =
        $('body').text().replace(/\s+/g, ' ').trim();

    const words = bodyText
        ? bodyText.split(/\s+/)
        : [];

    const h1Texts = $('h1')
        .map((i, el) => $(el).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);

    const duplicateH1 =
        new Set(h1Texts).size !== h1Texts.length;

    return {

        titleText,

        titleLength:
            getTextLength(titleText),

        titleStatus:
            getLengthStatus(getTextLength(titleText), 30, 60),

        metaDescription,

        metaDescriptionLength:
            getTextLength(metaDescription),

        metaDescriptionStatus:
            getLengthStatus(
                getTextLength(metaDescription),
                120,
                160
            ),

        canonicalUrl,

        canonicalMatches:
            canonicalUrl
                ? canonicalUrl.replace(/\/$/, '') === url.replace(/\/$/, '')
                : false,

        robotsMeta,

        indexability:
            robotsMeta.toLowerCase().includes('noindex')
                ? 'Noindex'
                : 'Indexable',

        wordCount:
            words.length,

        h1Texts,

        duplicateH1

    };

}

function toArray(value) {

    if (value === undefined || value === null) {
        return [];
    }

    return Array.isArray(value)
        ? value
        : [value];

}

function getSchemaTypes(item) {

    const types =
        item && item['@type'];

    return toArray(types)
        .flatMap((type) => String(type).split(/\s+/))
        .map((type) => type.trim())
        .filter(Boolean);

}

function flattenSchemaItems(value) {

    const items = [];

    toArray(value).forEach((entry) => {

        if (!entry || typeof entry !== 'object') {
            return;
        }

        items.push(entry);

        toArray(entry['@graph']).forEach((graphItem) => {

            if (
                graphItem &&
                typeof graphItem === 'object'
            ) {
                items.push(graphItem);
            }

        });

    });

    return items;

}

function hasSchemaProperty(item, property) {

    const value =
        item && item[property];

    if (value === undefined || value === null) {
        return false;
    }

    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
        return value.length > 0;
    }

    if (typeof value === 'object') {
        return Object.keys(value).length > 0;
    }

    return true;

}

function getSchemaRequirements(type) {

    const rules = {

        Organization: {
            required: ['name', 'url'],
            recommended: ['logo', 'sameAs']
        },

        LocalBusiness: {
            required: ['name', 'address', 'telephone'],
            recommended: ['url', 'openingHours', 'priceRange']
        },

        WebSite: {
            required: ['name', 'url'],
            recommended: ['potentialAction']
        },

        WebPage: {
            required: ['name', 'url'],
            recommended: ['description', 'breadcrumb']
        },

        Article: {
            required: ['headline', 'datePublished', 'author'],
            recommended: ['image', 'dateModified', 'publisher']
        },

        BlogPosting: {
            required: ['headline', 'datePublished', 'author'],
            recommended: ['image', 'dateModified', 'publisher']
        },

        Product: {
            required: ['name', 'image', 'description'],
            recommended: ['offers', 'aggregateRating', 'brand']
        },

        FAQPage: {
            required: ['mainEntity'],
            recommended: []
        },

        BreadcrumbList: {
            required: ['itemListElement'],
            recommended: []
        },

        Review: {
            required: ['itemReviewed', 'reviewRating', 'author'],
            recommended: ['datePublished']
        }

    };

    return rules[type] || {
        required: [],
        recommended: []
    };

}

function getSchemaAudit($, pageUrl) {

    const invalidJsonLd = [];
    const schemaItems = [];

    $('script[type="application/ld+json"]').each((index, element) => {

        const rawJson =
            $(element).contents().text().trim();

        if (!rawJson) {
            invalidJsonLd.push({
                block: index + 1,
                error: 'Empty JSON-LD block'
            });

            return;
        }

        try {

            const parsed =
                JSON.parse(rawJson);

            schemaItems.push(
                ...flattenSchemaItems(parsed)
            );

        } catch (error) {

            invalidJsonLd.push({
                block: index + 1,
                error: error.message
            });

        }

    });

    const microdataItems =
        $('[itemscope]').length;

    const rdfaItems =
        $('[typeof]').length;

    const typeCounts = {};
    const missingRequired = [];
    const missingRecommended = [];

    schemaItems.forEach((item) => {

        const types =
            getSchemaTypes(item);

        if (types.length === 0) {
            missingRequired.push({
                type: 'Unknown',
                property: '@type',
                severity: 'Required'
            });
        }

        types.forEach((type) => {

            typeCounts[type] =
                (typeCounts[type] || 0) + 1;

            const requirements =
                getSchemaRequirements(type);

            requirements.required.forEach((property) => {

                if (!hasSchemaProperty(item, property)) {
                    missingRequired.push({
                        type,
                        property,
                        severity: 'Required'
                    });
                }

            });

            requirements.recommended.forEach((property) => {

                if (!hasSchemaProperty(item, property)) {
                    missingRecommended.push({
                        type,
                        property,
                        severity: 'Recommended'
                    });
                }

            });

        });

    });

    const types =
        Object.keys(typeCounts).sort();

    const hasStructuredData =
        schemaItems.length > 0 ||
        microdataItems > 0 ||
        rdfaItems > 0;

    const status = !hasStructuredData
        ? 'Missing'
        : invalidJsonLd.length > 0
            ? 'Invalid'
            : missingRequired.length > 0
                ? 'Needs required fields'
                : missingRecommended.length > 0
                    ? 'Needs recommended fields'
                    : 'Good';

    const issues = [];

    if (!hasStructuredData) {
        issues.push('No structured data found.');
    }

    invalidJsonLd.forEach((item) => {
        issues.push(`JSON-LD block ${item.block}: ${item.error}`);
    });

    missingRequired.forEach((item) => {
        issues.push(`${item.type} missing required ${item.property}.`);
    });

    missingRecommended.forEach((item) => {
        issues.push(`${item.type} missing recommended ${item.property}.`);
    });

    return {

        hasStructuredData,
        status,
        jsonLdBlocks: $('script[type="application/ld+json"]').length,
        validJsonLdBlocks:
            $('script[type="application/ld+json"]').length -
            invalidJsonLd.length,
        invalidJsonLd: invalidJsonLd.length,
        microdataItems,
        rdfaItems,
        schemaItems: schemaItems.length,
        types,
        typeCounts,
        missingRequired,
        missingRecommended,
        issues: issues.slice(0, 50),
        testedUrl: pageUrl

    };

}

function resolveAssetUrl(src, pageUrl) {

    if (!src) {
        return '';
    }

    if (
        src.startsWith('data:') ||
        src.startsWith('blob:')
    ) {
        return src;
    }

    try {

        return new URL(src, pageUrl).href;

    } catch (error) {

        return src;

    }

}

async function checkImageUrl(imageUrl) {

    if (
        !imageUrl ||
        imageUrl.startsWith('data:') ||
        imageUrl.startsWith('blob:')
    ) {
        return null;
    }

    try {

        const response = await axios.head(imageUrl, {

            timeout: 8000,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 SEO Audit Tool'
            }

        });

        if (response.status >= 400) {

            return {
                url: imageUrl,
                status: response.status
            };

        }

        return null;

    } catch (error) {

        try {

            const response = await axios.get(imageUrl, {

                timeout: 8000,
                maxRedirects: 5,
                responseType: 'arraybuffer',
                validateStatus: () => true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 SEO Audit Tool',
                    Range: 'bytes=0-0'
                }

            });

            if (response.status >= 400) {

                return {
                    url: imageUrl,
                    status: response.status
                };

            }

            return null;

        } catch (fallbackError) {

            return {
                url: imageUrl,
                status:
                    fallbackError.response?.status ||
                    'Request failed'
            };

        }

    }

}

async function getImageAudit($, pageUrl) {

    const images = $('img');

    const missingAltImages = [];
    const emptyAltImages = [];
    const missingTitleImages = [];
    const missingDimensionImages = [];
    const brokenImages = [];
    const imageUrls = [];

    images.each((i, img) => {

        const src =
            $(img).attr('src') ||
            $(img).attr('data-src') ||
            $(img).attr('data-lazy-src') ||
            '';

        const resolvedUrl =
            resolveAssetUrl(src, pageUrl);

        const alt = $(img).attr('alt');
        const title = $(img).attr('title');
        const width = $(img).attr('width');
        const height = $(img).attr('height');

        if (resolvedUrl) {
            imageUrls.push(resolvedUrl);
        }

        if (alt === undefined) {

            missingAltImages.push({
                url: resolvedUrl,
                src
            });

        }

        if (
            alt !== undefined &&
            alt.trim() === ''
        ) {

            emptyAltImages.push({
                url: resolvedUrl,
                src
            });

        }

        if (
            title === undefined ||
            title.trim() === ''
        ) {

            missingTitleImages.push({
                url: resolvedUrl,
                src
            });

        }

        if (!width || !height) {

            missingDimensionImages.push({
                url: resolvedUrl,
                src
            });

        }

    });

    const uniqueImageUrls =
        [...new Set(imageUrls)].slice(0, 40);

    for (const imageUrl of uniqueImageUrls) {

        const brokenImage =
            await checkImageUrl(imageUrl);

        if (brokenImage) {
            brokenImages.push(brokenImage);
        }

    }

    return {

        totalImages: images.length,
        missingAlt: missingAltImages.length,
        emptyAlt: emptyAltImages.length,
        missingTitle: missingTitleImages.length,
        missingDimensions: missingDimensionImages.length,
        brokenImages: brokenImages.length,
        missingAltImages: missingAltImages.slice(0, 50),
        emptyAltImages: emptyAltImages.slice(0, 50),
        missingTitleImages: missingTitleImages.slice(0, 50),
        missingDimensionImages: missingDimensionImages.slice(0, 50),
        brokenImageUrls: brokenImages.slice(0, 50)

    };

}

function normalizeUrl(url) {

    if (
        !url.startsWith('http://') &&
        !url.startsWith('https://')
    ) {

        return `https://${url}`;

    }

    return url;

}

function getRequestedMaxPages(req) {

    const parsed =
        Number.parseInt(req.query.maxPages, 10);

    if (Number.isNaN(parsed)) {

        return 10;

    }

    return Math.min(
        Math.max(parsed, 1),
        25
    );

}

function calculateHtmlSeoScore(seoChecks, headings, imageAudit, schemaAudit = null) {

    let score = 100;

    if (!seoChecks.metaDescription) {
        score -= 15;
    }

    if (!seoChecks.title) {
        score -= 20;
    }

    if (!seoChecks.canonical) {
        score -= 10;
    }

    if (!seoChecks.structuredData) {
        score -= 10;
    }

    if (schemaAudit?.invalidJsonLd > 0) {
        score -= 8;
    }

    if ((schemaAudit?.missingRequired || []).length > 0) {
        score -= 8;
    }

    if (headings.h1 === 0) {
        score -= 15;
    }

    if (headings.h1 > 1) {
        score -= 10;
    }

    if (imageAudit.missingAlt > 0) {
        score -= 10;
    }

    if (imageAudit.missingTitle > 0) {
        score -= 5;
    }

    return Math.max(score, 0);

}

function getAverageScore(pages, key) {

    const scoredPages = pages.filter(
        (page) => typeof page[key] === 'number'
    );

    if (scoredPages.length === 0) {

        return null;

    }

    return Math.round(
        scoredPages.reduce(
            (total, page) => total + page[key],
            0
        ) / scoredPages.length
    );

}

async function runPageAudit(url, chrome) {

    const result = await lighthouse(url, {

        port: chrome.port,

        output: 'json',

        logLevel: 'error',

        onlyCategories: [
            'performance',
            'seo',
            'accessibility',
            'best-practices'
        ]

    });

    const report = result.lhr;

    const response = await axios.get(url, {

        timeout: 15000,

        headers: {

            'User-Agent':
                'Mozilla/5.0 SEO Audit Tool'

        }

    });

    const $ = cheerio.load(response.data);

    const pageMeta =
        extractPageMeta($, url);

    const schemaAudit =
        getSchemaAudit($, url);

    const audits = report.audits;

    const seoChecks = {

        metaDescription:
            audits['meta-description']?.score === 1,

        title:
            audits['document-title']?.score === 1,

        canonical:
            audits['canonical']?.score === 1,

        hreflang:
            audits['hreflang']?.score === 1,

        structuredData:
            schemaAudit.hasStructuredData &&
            schemaAudit.invalidJsonLd === 0

    };

    const openGraph = {

        ogTitle:
            $('meta[property="og:title"]').length > 0,

        ogDescription:
            $('meta[property="og:description"]').length > 0,

        ogImage:
            $('meta[property="og:image"]').length > 0,

        ogUrl:
            $('meta[property="og:url"]').length > 0

    };

    const headings = {

        h1: $('h1').length,
        h2: $('h2').length,
        h3: $('h3').length,
        h4: $('h4').length,
        h5: $('h5').length,
        h6: $('h6').length

    };

    const headingIssues = [];

    if (headings.h1 === 0) {

        headingIssues.push('Missing H1');

    }

    if (headings.h1 > 1) {

        headingIssues.push('Multiple H1 tags');

    }

    const imageAudit =
        await getImageAudit($, url);

    const links = $('a');

    let internalLinks = 0;
    let externalLinks = 0;

    const brokenLinks = [];

    for (const link of links.toArray()) {

        const href = $(link).attr('href');

        if (!href) {
            continue;
        }

        if (
            href.startsWith('#') ||
            href.startsWith('javascript') ||
            href.startsWith('mailto:')
        ) {

            continue;

        }

        try {

            let fullUrl = href;

            if (href.startsWith('/')) {

                fullUrl =
                    new URL(href, url).href;

            }

            if (
                fullUrl.includes(
                    new URL(url).hostname
                )
            ) {

                internalLinks++;

            } else {

                externalLinks++;

            }

        } catch (err) {}

    }

    const linkAudit = {

        totalLinks: links.length,

        internalLinks,

        externalLinks,

        brokenLinks

    };

    const recommendations = [];

    if (!seoChecks.metaDescription) {

        recommendations.push(
            'Add a meta description.'
        );

    }

    if (pageMeta.titleStatus !== 'Good') {

        recommendations.push(
            `Fix title length. Current status: ${pageMeta.titleStatus}.`
        );

    }

    if (pageMeta.metaDescriptionStatus !== 'Good') {

        recommendations.push(
            `Fix meta description length. Current status: ${pageMeta.metaDescriptionStatus}.`
        );

    }

    if (pageMeta.wordCount < 300) {

        recommendations.push(
            'Add more useful body content. Word count is below 300.'
        );

    }

    if (!schemaAudit.hasStructuredData) {

        recommendations.push(
            'Add structured schema markup.'
        );

    }

    if (schemaAudit.invalidJsonLd > 0) {

        recommendations.push(
            'Fix invalid JSON-LD schema markup.'
        );

    }

    if (schemaAudit.missingRequired.length > 0) {

        recommendations.push(
            'Add required schema properties.'
        );

    }

    if (headings.h1 === 0) {

        recommendations.push(
            'Add one H1 heading.'
        );

    }

    if (headings.h1 > 1) {

        recommendations.push(
            'Use only one H1.'
        );

    }

    if (imageAudit.missingAlt > 0) {

        recommendations.push(
            `${imageAudit.missingAlt} images missing ALT text.`
        );

    }

    if (imageAudit.missingTitle > 0) {

        recommendations.push(
            `${imageAudit.missingTitle} images missing title text.`
        );

    }

    if (
        imageAudit.missingDimensions > 0
    ) {

        recommendations.push(
            'Add image width and height attributes.'
        );

    }

    if (imageAudit.brokenImages > 0) {

        recommendations.push(
            `${imageAudit.brokenImages} broken image URLs found.`
        );

    }

    if (
        safeScore(
            report.categories.performance.score
        ) < 90
    ) {

        recommendations.push(
            'Improve page speed and optimize assets.'
        );

    }

    return {

        url,

        ...pageMeta,
        missingAltImages: imageAudit.missingAltImages,
        emptyAltImages: imageAudit.emptyAltImages,
        missingTitleImages: imageAudit.missingTitleImages,
        missingDimensionImages: imageAudit.missingDimensionImages,
        brokenImageUrls: imageAudit.brokenImageUrls,

        performance:
            safeScore(
                report.categories.performance.score
            ),

        seo:
            safeScore(
                report.categories.seo.score
            ),

        accessibility:
            safeScore(
                report.categories.accessibility.score
            ),

        bestPractices:
            safeScore(
                report.categories['best-practices'].score
            ),

        checks: seoChecks,

        schemaAudit,

        openGraph,

        headings,

        headingIssues,

        imageAudit,

        linkAudit,

        recommendations

    };

}

async function runPartialPageAudit(url, auditError) {

    const response = await axios.get(url, {

        timeout: 20000,

        headers: {

            'User-Agent':
                'Mozilla/5.0 SEO Audit Tool'

        }

    });

    const $ = cheerio.load(response.data);

    const pageMeta =
        extractPageMeta($, url);

    const schemaAudit =
        getSchemaAudit($, url);

    const seoChecks = {

        metaDescription:
            $('meta[name="description"]').length > 0,

        title:
            $('title').text().trim().length > 0,

        canonical:
            $('link[rel="canonical"]').length > 0,

        hreflang:
            $('link[rel="alternate"][hreflang]').length > 0,

        structuredData:
            schemaAudit.hasStructuredData &&
            schemaAudit.invalidJsonLd === 0

    };

    const openGraph = {

        ogTitle:
            $('meta[property="og:title"]').length > 0,

        ogDescription:
            $('meta[property="og:description"]').length > 0,

        ogImage:
            $('meta[property="og:image"]').length > 0,

        ogUrl:
            $('meta[property="og:url"]').length > 0

    };

    const headings = {

        h1: $('h1').length,
        h2: $('h2').length,
        h3: $('h3').length,
        h4: $('h4').length,
        h5: $('h5').length,
        h6: $('h6').length

    };

    const headingIssues = [];

    if (headings.h1 === 0) {

        headingIssues.push('Missing H1');

    }

    if (headings.h1 > 1) {

        headingIssues.push('Multiple H1 tags');

    }

    const imageAudit =
        await getImageAudit($, url);

    const links = $('a');

    let internalLinks = 0;
    let externalLinks = 0;

    for (const link of links.toArray()) {

        const href = $(link).attr('href');

        if (!href) {
            continue;
        }

        if (
            href.startsWith('#') ||
            href.startsWith('javascript') ||
            href.startsWith('mailto:')
        ) {
            continue;
        }

        try {

            const fullUrl = href.startsWith('/')
                ? new URL(href, url).href
                : href;

            if (
                new URL(fullUrl).hostname ===
                new URL(url).hostname
            ) {
                internalLinks++;
            } else {
                externalLinks++;
            }

        } catch (err) {}

    }

    const linkAudit = {

        totalLinks: links.length,
        internalLinks,
        externalLinks,
        brokenLinks: []

    };

    const recommendations = [];

    if (!seoChecks.metaDescription) {
        recommendations.push('Add a meta description.');
    }

    if (pageMeta.titleStatus !== 'Good') {
        recommendations.push(
            `Fix title length. Current status: ${pageMeta.titleStatus}.`
        );
    }

    if (pageMeta.metaDescriptionStatus !== 'Good') {
        recommendations.push(
            `Fix meta description length. Current status: ${pageMeta.metaDescriptionStatus}.`
        );
    }

    if (pageMeta.wordCount < 300) {
        recommendations.push(
            'Add more useful body content. Word count is below 300.'
        );
    }

    if (!schemaAudit.hasStructuredData) {
        recommendations.push('Add structured schema markup.');
    }

    if (schemaAudit.invalidJsonLd > 0) {
        recommendations.push('Fix invalid JSON-LD schema markup.');
    }

    if (schemaAudit.missingRequired.length > 0) {
        recommendations.push('Add required schema properties.');
    }

    if (headings.h1 === 0) {
        recommendations.push('Add one H1 heading.');
    }

    if (headings.h1 > 1) {
        recommendations.push('Use only one H1.');
    }

    if (imageAudit.missingAlt > 0) {
        recommendations.push(
            `${imageAudit.missingAlt} images missing ALT text.`
        );
    }

    if (imageAudit.missingTitle > 0) {
        recommendations.push(
            `${imageAudit.missingTitle} images missing title text.`
        );
    }

    if (imageAudit.missingDimensions > 0) {
        recommendations.push(
            'Add image width and height attributes.'
        );
    }

    if (imageAudit.brokenImages > 0) {
        recommendations.push(
            `${imageAudit.brokenImages} broken image URLs found.`
        );
    }

    return {

        url,

        ...pageMeta,
        missingAltImages: imageAudit.missingAltImages,
        emptyAltImages: imageAudit.emptyAltImages,
        missingTitleImages: imageAudit.missingTitleImages,
        missingDimensionImages: imageAudit.missingDimensionImages,
        brokenImageUrls: imageAudit.brokenImageUrls,

        partial: true,

        partialReason:
            auditError?.message ||
            'Lighthouse failed, HTML audit completed.',

        performance: null,

        seo:
            calculateHtmlSeoScore(
                seoChecks,
                headings,
                imageAudit,
                schemaAudit
            ),

        accessibility: null,

        bestPractices: null,

        checks: seoChecks,

        schemaAudit,

        openGraph,

        headings,

        headingIssues,

        imageAudit,

        linkAudit,

        recommendations

    };

}

async function getSitemapUrls(siteUrl, maxPages = 10) {

    const origin = new URL(siteUrl).origin;
    const normalizedSiteUrl =
        new URL(siteUrl).href;

    const sitemapUrl = `${origin}/sitemap.xml`;

    const response = await axios.get(sitemapUrl, {

        timeout: 15000,

        headers: {

            'User-Agent':
                'Mozilla/5.0 SEO Audit Tool'

        }

    });

    const $ = cheerio.load(response.data, {

        xmlMode: true

    });

    let urls = $('url > loc')
        .map((i, el) => $(el).text().trim())
        .get();

    if (urls.length === 0) {

        const childSitemaps = $('sitemap > loc')
            .map((i, el) => $(el).text().trim())
            .get()
            .slice(0, 3);

        for (const childSitemap of childSitemaps) {

            if (urls.length >= maxPages) {
                break;
            }

            try {

                const childResponse =
                    await axios.get(childSitemap, {

                        timeout: 15000,

                        headers: {

                            'User-Agent':
                                'Mozilla/5.0 SEO Audit Tool'

                        }

                    });

                const childXml = cheerio.load(
                    childResponse.data,
                    {
                        xmlMode: true
                    }
                );

                urls = urls.concat(
                    childXml('url > loc')
                        .map((i, el) =>
                            childXml(el).text().trim()
                        )
                        .get()
                );

            } catch (error) {}

        }

    }

    const filteredUrls = [...new Set(urls)]
        .filter((pageUrl) => {

            try {

                return new URL(pageUrl).origin === origin;

            } catch (error) {

                return false;

            }

        })
        .filter((pageUrl) => pageUrl !== normalizedSiteUrl);

    return [
        normalizedSiteUrl,
        ...filteredUrls
    ].slice(0, maxPages);

}

/*
|--------------------------------------------------------------------------
| SEO AUDIT ROUTE
|--------------------------------------------------------------------------
*/

app.get('/audit', async (req, res) => {

    let url = req.query.url;

    const scope = req.query.scope === 'site'
        ? 'site'
        : 'single';

    const maxPages =
        getRequestedMaxPages(req);

    if (!url) {

        return res.json({
            error: 'URL is required'
        });

    }

    url = normalizeUrl(url);

    let chrome;

    try {

        chrome = await chromeLauncher.launch({

            chromeFlags: [

                '--headless',

                '--no-sandbox',

                '--disable-setuid-sandbox',

                '--disable-dev-shm-usage',

                '--disable-gpu'

            ]

        });

        if (scope === 'single') {

            const pageAudit =
                await runPageAudit(url, chrome);

            await chrome.kill();

            return res.json(pageAudit);

        }

        let urls;

        try {

            urls = await getSitemapUrls(url, maxPages);

        } catch (error) {

            await chrome.kill();

            return res.json({

                error:
                    'Could not find sitemap.xml for whole website audit.'

            });

        }

        if (urls.length === 0) {

            await chrome.kill();

            return res.json({

                error:
                    'No pages found in sitemap.xml.'

            });

        }

        const pages = [];
        const failedPages = [];
        let partialPages = 0;

        for (const pageUrl of urls) {

            try {

                pages.push(
                    await runPageAudit(pageUrl, chrome)
                );

            } catch (error) {

                try {

                    const partialAudit =
                        await runPartialPageAudit(
                            pageUrl,
                            error
                        );

                    pages.push(partialAudit);

                    partialPages++;

                } catch (partialError) {

                    failedPages.push({

                        url: pageUrl,
                        error:
                            partialError.message ||
                            'Failed to audit this page.'

                    });

                }

            }

        }

        await chrome.kill();

        if (pages.length === 0) {

            return res.json({

                error:
                    'Found sitemap pages, but every page audit failed.'

            });

        }

        const average = (key) =>
            getAverageScore(pages, key);

        return res.json({

            type: 'site',

            startUrl: url,

            sitemapPagesFound: urls.length,

            auditedPages: pages.length,

            partialPages,

            failedPages,

            summary: {

                performance: average('performance'),
                seo: average('seo'),
                accessibility: average('accessibility'),
                bestPractices: average('bestPractices')

            },

            pages

        });

    } catch (error) {

        console.error('Audit error:', error);

        if (chrome) {

            try {

                await chrome.kill();

            } catch (e) {}

        }

        res.json({

            error:
                'Failed to audit website.'

        });

    }

});

/*
|--------------------------------------------------------------------------
| PDF REPORT
|--------------------------------------------------------------------------
*/

app.get('/download-report', async (req, res) => {

    let url = req.query.url;

    const scope = req.query.scope === 'site'
        ? 'site'
        : 'single';

    const maxPages =
        getRequestedMaxPages(req);

    if (!url) {

        return res.send('URL required');

    }

    url = normalizeUrl(url);

    let chrome;

    try {

        chrome = await chromeLauncher.launch({

            chromeFlags: [

                '--headless',

                '--no-sandbox',

                '--disable-gpu'

            ]

        });

        if (scope === 'site') {

            const urls = await getSitemapUrls(url, maxPages);
            const pages = [];
            const failedPages = [];
            let partialPages = 0;

            for (const pageUrl of urls) {

                try {

                    pages.push(
                        await runPageAudit(pageUrl, chrome)
                    );

                } catch (error) {

                    try {

                        const partialAudit =
                            await runPartialPageAudit(
                                pageUrl,
                                error
                            );

                        pages.push(partialAudit);

                        partialPages++;

                    } catch (partialError) {

                        failedPages.push({

                            url: pageUrl,
                            error:
                                partialError.message ||
                                'Failed to audit this page.'

                        });

                    }

                }

            }

            await chrome.kill();

            if (pages.length === 0) {

                return res.send(
                    'Failed to generate whole website PDF report.'
                );

            }

            const average = (key) =>
                getAverageScore(pages, key);

            const doc = new PDFDocument({

                margin: 40

            });

            res.setHeader(
                'Content-Type',
                'application/pdf'
            );

            res.setHeader(
                'Content-Disposition',
                'attachment; filename=seo-site-report.pdf'
            );

            doc.pipe(res);

            doc
                .fontSize(26)
                .text('Whole Website SEO Audit Report');

            doc.moveDown();

            doc
                .fontSize(14)
                .text(`Website: ${url}`);

            doc.text(
                `Generated: ${new Date().toLocaleString()}`
            );

            writePdfSection(doc, 'Average Scores');

            writePdfLine(
                doc,
                'Pages Selected',
                urls.length
            );

            writePdfLine(
                doc,
                'Pages Audited',
                pages.length
            );

            writePdfLine(
                doc,
                'Partial Pages',
                partialPages
            );

            writePdfLine(
                doc,
                'Performance',
                average('performance')
            );

            writePdfLine(
                doc,
                'SEO',
                average('seo')
            );

            writePdfLine(
                doc,
                'Accessibility',
                average('accessibility')
            );

            writePdfLine(
                doc,
                'Best Practices',
                average('bestPractices')
            );

            writePdfSection(doc, 'Pages Audited');

            pages.forEach((page) => {

                doc.text(page.url);
                doc.text(
                    `Performance: ${page.performance ?? 'N/A'} | SEO: ${page.seo ?? 'N/A'} | Accessibility: ${page.accessibility ?? 'N/A'} | Best Practices: ${page.bestPractices ?? 'N/A'}`
                );
                doc.text(
                    `Schema: ${page.schemaAudit?.status || 'Unknown'} | Types: ${(page.schemaAudit?.types || []).join(', ') || 'None'} | Schema Issues: ${page.schemaAudit?.issues?.length || 0}`
                );
                doc.text(
                    `H1 Tags: ${page.headings.h1} | Missing ALT: ${page.imageAudit.missingAlt} | Empty ALT: ${page.imageAudit.emptyAlt} | Missing Title: ${page.imageAudit.missingTitle} | Missing Dimensions: ${page.imageAudit.missingDimensions} | Broken Images: ${page.imageAudit.brokenImages}`
                );
                if (page.partial) {

                    doc.text('Status: Partial HTML audit');

                }

                writePdfImageIssues(doc, page);

                doc.moveDown(0.5);

            });

            if (failedPages.length > 0) {

                writePdfSection(doc, 'Failed Pages');

                failedPages.forEach((page) => {

                    doc.text(`- ${page.url}`);

                });

            }

            doc.end();

            return;

        }

        const result = await lighthouse(url, {

            port: chrome.port,

            output: 'json',

            logLevel: 'error'

        });

        const report = result.lhr;

        const response = await axios.get(url, {

            timeout: 15000,

            headers: {

                'User-Agent':
                    'Mozilla/5.0 SEO Audit Tool'

            }

        });

        const $ = cheerio.load(response.data);

        const schemaAudit =
            getSchemaAudit($, url);

        const audits = report.audits;

        const seoChecks = {

            metaDescription:
                audits['meta-description']?.score === 1,

            title:
                audits['document-title']?.score === 1,

            canonical:
                audits['canonical']?.score === 1,

            hreflang:
                audits['hreflang']?.score === 1,

            structuredData:
                schemaAudit.hasStructuredData &&
                schemaAudit.invalidJsonLd === 0

        };

        const openGraph = {

            ogTitle:
                $('meta[property="og:title"]').length > 0,

            ogDescription:
                $('meta[property="og:description"]').length > 0,

            ogImage:
                $('meta[property="og:image"]').length > 0,

            ogUrl:
                $('meta[property="og:url"]').length > 0

        };

        const headings = {

            h1: $('h1').length,
            h2: $('h2').length,
            h3: $('h3').length,
            h4: $('h4').length,
            h5: $('h5').length,
            h6: $('h6').length

        };

        const headingIssues = [];

        if (headings.h1 === 0) {

            headingIssues.push('Missing H1');

        }

        if (headings.h1 > 1) {

            headingIssues.push('Multiple H1 tags');

        }

        const imageAudit =
            await getImageAudit($, url);

        const links = $('a');

        let internalLinks = 0;
        let externalLinks = 0;

        for (const link of links.toArray()) {

            const href = $(link).attr('href');

            if (!href) {
                continue;
            }

            if (
                href.startsWith('#') ||
                href.startsWith('javascript') ||
                href.startsWith('mailto:')
            ) {

                continue;

            }

            try {

                let fullUrl = href;

                if (href.startsWith('/')) {

                    fullUrl =
                        new URL(href, url).href;

                }

                if (
                    fullUrl.includes(
                        new URL(url).hostname
                    )
                ) {

                    internalLinks++;

                } else {

                    externalLinks++;

                }

            } catch (err) {}

        }

        const linkAudit = {

            totalLinks: links.length,

            internalLinks,

            externalLinks,

            brokenLinks: []

        };

        const recommendations = [];

        if (!seoChecks.metaDescription) {

            recommendations.push(
                'Add a meta description.'
            );

        }

        if (!schemaAudit.hasStructuredData) {

            recommendations.push(
                'Add structured schema markup.'
            );

        }

        if (schemaAudit.invalidJsonLd > 0) {

            recommendations.push(
                'Fix invalid JSON-LD schema markup.'
            );

        }

        if (schemaAudit.missingRequired.length > 0) {

            recommendations.push(
                'Add required schema properties.'
            );

        }

        if (headings.h1 === 0) {

            recommendations.push(
                'Add one H1 heading.'
            );

        }

        if (headings.h1 > 1) {

            recommendations.push(
                'Use only one H1.'
            );

        }

        if (imageAudit.missingAlt > 0) {

            recommendations.push(
                `${imageAudit.missingAlt} images missing ALT text.`
            );

        }

        if (imageAudit.missingTitle > 0) {

            recommendations.push(
                `${imageAudit.missingTitle} images missing title text.`
            );

        }

        if (
            imageAudit.missingDimensions > 0
        ) {

            recommendations.push(
                'Add image width and height attributes.'
            );

        }

        if (
            safeScore(
                report.categories.performance.score
            ) < 90
        ) {

            recommendations.push(
                'Improve page speed and optimize assets.'
            );

        }

        await chrome.kill();

        /*
        |--------------------------------------------------------------------------
        | PDF
        |--------------------------------------------------------------------------
        */

        const doc = new PDFDocument({

            margin: 40

        });

        res.setHeader(
            'Content-Type',
            'application/pdf'
        );

        res.setHeader(
            'Content-Disposition',
            'attachment; filename=seo-report.pdf'
        );

        doc.pipe(res);

        doc
            .fontSize(26)
            .text('SEO Audit Report');

        doc.moveDown();

        doc
            .fontSize(14)
            .text(`Website: ${url}`);

        doc.text(
            `Generated: ${new Date().toLocaleString()}`
        );

        doc.moveDown();

        doc
            .fontSize(20)
            .text('Scores');

        doc.moveDown();

        doc.fontSize(11);

        writePdfLine(
            doc,
            'Performance',
            safeScore(report.categories.performance.score)
        );

        writePdfLine(
            doc,
            'SEO',
            safeScore(report.categories.seo.score)
        );

        writePdfLine(
            doc,
            'Accessibility',
            safeScore(report.categories.accessibility.score)
        );

        writePdfLine(
            doc,
            'Best Practices',
            safeScore(report.categories['best-practices'].score)
        );

        writePdfSection(doc, 'SEO Checks');

        writePdfLine(
            doc,
            'Meta Description',
            passFail(seoChecks.metaDescription)
        );

        writePdfLine(
            doc,
            'Title Tag',
            passFail(seoChecks.title)
        );

        writePdfLine(
            doc,
            'Canonical',
            passFail(seoChecks.canonical)
        );

        writePdfLine(
            doc,
            'Hreflang',
            passFail(seoChecks.hreflang)
        );

        writePdfLine(
            doc,
            'Structured Data',
            passFail(seoChecks.structuredData)
        );

        writePdfSection(doc, 'Schema Structure');

        writePdfLine(
            doc,
            'Schema Status',
            schemaAudit.status
        );

        writePdfLine(
            doc,
            'JSON-LD Blocks',
            schemaAudit.jsonLdBlocks
        );

        writePdfLine(
            doc,
            'Schema Types',
            schemaAudit.types.join(', ') || 'None'
        );

        writePdfLine(
            doc,
            'Required Fields Missing',
            schemaAudit.missingRequired.length
        );

        writePdfLine(
            doc,
            'Recommended Fields Missing',
            schemaAudit.missingRecommended.length
        );

        if (schemaAudit.issues.length > 0) {

            schemaAudit.issues.slice(0, 10).forEach((issue) => {

                doc.text(`- ${issue}`);

            });

        }

        writePdfSection(doc, 'Open Graph');

        writePdfLine(
            doc,
            'OG Title',
            passFail(openGraph.ogTitle)
        );

        writePdfLine(
            doc,
            'OG Description',
            passFail(openGraph.ogDescription)
        );

        writePdfLine(
            doc,
            'OG Image',
            passFail(openGraph.ogImage)
        );

        writePdfLine(
            doc,
            'OG URL',
            passFail(openGraph.ogUrl)
        );

        writePdfSection(doc, 'Heading Structure');

        writePdfLine(doc, 'H1 Tags', headings.h1);
        writePdfLine(doc, 'H2 Tags', headings.h2);
        writePdfLine(doc, 'H3 Tags', headings.h3);
        writePdfLine(doc, 'H4 Tags', headings.h4);
        writePdfLine(doc, 'H5 Tags', headings.h5);
        writePdfLine(doc, 'H6 Tags', headings.h6);

        writePdfSection(doc, 'Heading Issues');

        if (headingIssues.length > 0) {

            headingIssues.forEach((issue) => {

                doc.text(`- ${issue}`);

            });

        } else {

            doc.text('No heading issues found.');

        }

        writePdfSection(doc, 'Image Audit');

        writePdfLine(
            doc,
            'Total Images',
            imageAudit.totalImages
        );

        writePdfLine(
            doc,
            'Missing ALT',
            imageAudit.missingAlt
        );

        writePdfLine(
            doc,
            'Empty ALT',
            imageAudit.emptyAlt
        );

        writePdfLine(
            doc,
            'Missing Title',
            imageAudit.missingTitle
        );

        writePdfLine(
            doc,
            'Missing Dimensions',
            imageAudit.missingDimensions
        );

        writePdfLine(
            doc,
            'Broken Images',
            imageAudit.brokenImages
        );

        writePdfImageIssues(doc, {

            missingAltImages:
                imageAudit.missingAltImages,

            emptyAltImages:
                imageAudit.emptyAltImages,

            missingTitleImages:
                imageAudit.missingTitleImages,

            missingDimensionImages:
                imageAudit.missingDimensionImages,

            brokenImageUrls:
                imageAudit.brokenImageUrls

        });

        writePdfSection(doc, 'Link Audit');

        writePdfLine(
            doc,
            'Total Links',
            linkAudit.totalLinks
        );

        writePdfLine(
            doc,
            'Internal Links',
            linkAudit.internalLinks
        );

        writePdfLine(
            doc,
            'External Links',
            linkAudit.externalLinks
        );

        writePdfLine(
            doc,
            'Broken Links',
            linkAudit.brokenLinks.length
        );

        writePdfSection(doc, 'SEO Recommendations');

        if (recommendations.length > 0) {

            recommendations.forEach((recommendation) => {

                doc.text(`- ${recommendation}`);

            });

        } else {

            doc.text('No major SEO recommendations.');

        }

        doc
            .fontSize(18)
            .text('Summary');

        doc.moveDown();

        doc.text(
            'This report was generated automatically using Lighthouse.'
        );

        doc.end();

    } catch (error) {

        if (chrome) {

            try {

                await chrome.kill();

            } catch (e) {}

        }

        res.send(
            'Failed to generate PDF report.'
        );

    }

});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const port =
    process.env.PORT || 3000;

app.listen(port, () => {

    console.log(
        `SEO Audit Server Running On Port ${port}`
    );

});
