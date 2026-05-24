const axios = require('axios');
const cheerio = require('cheerio');
const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse').default;

function normalizeUrl(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('URL is required');
    }

    const withProtocol = /^https?:\/\//i.test(url)
        ? url
        : `https://${url}`;

    const parsed = new URL(withProtocol);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
    }

    return parsed.href;
}

function safeScore(score) {
    if (score === null || score === undefined) {
        return 0;
    }

    return Math.round(score * 100);
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

function resolveAssetUrl(src, pageUrl) {
    if (!src) {
        return '';
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
        return src;
    }

    try {
        return new URL(src, pageUrl).href;
    } catch (error) {
        return src;
    }
}

function toArray(value) {
    if (value === undefined || value === null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function flattenSchemaItems(value) {
    const items = [];

    toArray(value).forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }

        items.push(entry);

        toArray(entry['@graph']).forEach((graphItem) => {
            if (graphItem && typeof graphItem === 'object') {
                items.push(graphItem);
            }
        });
    });

    return items;
}

function getSchemaTypes(item) {
    return toArray(item?.['@type'])
        .flatMap((type) => String(type).split(/\s+/))
        .map((type) => type.trim())
        .filter(Boolean);
}

function hasSchemaProperty(item, property) {
    const value = item?.[property];

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

function getSchemaAudit($) {
    const invalidJsonLd = [];
    const schemaItems = [];

    $('script[type="application/ld+json"]').each((index, element) => {
        const rawJson = $(element).contents().text().trim();

        if (!rawJson) {
            invalidJsonLd.push({
                block: index + 1,
                error: 'Empty JSON-LD block'
            });
            return;
        }

        try {
            schemaItems.push(...flattenSchemaItems(JSON.parse(rawJson)));
        } catch (error) {
            invalidJsonLd.push({
                block: index + 1,
                error: error.message
            });
        }
    });

    const microdataItems = $('[itemscope]').length;
    const rdfaItems = $('[typeof]').length;
    const typeCounts = {};
    const missingRequired = [];
    const missingRecommended = [];

    schemaItems.forEach((item) => {
        const types = getSchemaTypes(item);

        if (types.length === 0) {
            missingRequired.push({
                type: 'Unknown',
                property: '@type',
                severity: 'Required'
            });
        }

        types.forEach((type) => {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
            const requirements = getSchemaRequirements(type);

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

    const types = Object.keys(typeCounts).sort();
    const hasStructuredData =
        schemaItems.length > 0 || microdataItems > 0 || rdfaItems > 0;

    const status = !hasStructuredData
        ? 'Missing'
        : invalidJsonLd.length > 0
            ? 'Invalid'
            : missingRequired.length > 0
                ? 'Needs required fields'
                : missingRecommended.length > 0
                    ? 'Needs recommended fields'
                    : 'Good';

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
        missingRecommended
    };
}

function normalizePhone(phone) {
    return phone.replace(/\D/g, '');
}

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function extractFooterText($) {
    return $('footer').text().replace(/\s+/g, ' ');
}

function getNAPAudit($) {

    /*
    |--------------------------------------------------------------------------
    | PAGE TEXT
    |--------------------------------------------------------------------------
    */

    $('script, style, noscript').remove();

const bodyText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim();

    const footerText = extractFooterText($);

    /*
    |--------------------------------------------------------------------------
    | PHONE DETECTION
    |--------------------------------------------------------------------------
    */

    const phoneRegex = /(?<!\d)(?:\+91[\s\-]?)?[6-9]\d{9}(?!\d)/g;

const rawPhones =
    bodyText.match(phoneRegex) || [];

const phones =
    [...new Set(
        rawPhones.map(phone => {

            let cleaned =
                phone.replace(/\D/g, '');

            /*
            |--------------------------------------------------------------------------
            | REMOVE COUNTRY CODE
            |--------------------------------------------------------------------------
            */

            if (
                cleaned.startsWith('91') &&
                cleaned.length === 12
            ) {
                cleaned = cleaned.substring(2);
            }

            return cleaned;

        })
    )]
    .filter(phone =>
        /^[6-9]\d{9}$/.test(phone)
    );

    /*
    |--------------------------------------------------------------------------
    | EMAIL DETECTION
    |--------------------------------------------------------------------------
    */

    const emailRegex =
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;

    const emails =
        [...new Set(
            bodyText.match(emailRegex) || []
        )];

    /*
    |--------------------------------------------------------------------------
    | BUSINESS NAME
    |--------------------------------------------------------------------------
    */

    let businessName = '';

    /*
    |--------------------------------------------------------------------------
    | ADDRESS DETECTION
    |--------------------------------------------------------------------------
    */

    const addresses = [];

    $('script[type="application/ld+json"]').each((i, el) => {

        try {

            const json =
                JSON.parse($(el).html());

            const items =
                flattenSchemaItems(json);

            items.forEach(item => {

                const type =
                    item?.['@type'];

                /*
                |--------------------------------------------------------------------------
                | BUSINESS NAME
                |--------------------------------------------------------------------------
                */

                if (
                    (
                        type === 'Organization' ||
                        type === 'LocalBusiness'
                    ) &&
                    item.name &&
                    !businessName
                ) {

                    businessName = item.name;

                }

                /*
                |--------------------------------------------------------------------------
                | ADDRESS
                |--------------------------------------------------------------------------
                */

                if (
                    item.address &&
                    typeof item.address === 'object'
                ) {

                    const addr =
                        item.address;

                    const fullAddress = [
                        addr.streetAddress,
                        addr.addressLocality,
                        addr.addressRegion,
                        addr.postalCode,
                        addr.addressCountry
                    ]
                    .filter(Boolean)
                    .join(', ');

                    if (fullAddress) {
                        addresses.push(fullAddress);
                    }

                }

            });

        } catch (e) {}

    });

    /*
    |--------------------------------------------------------------------------
    | FALLBACK BUSINESS NAME
    |--------------------------------------------------------------------------
    */

    if (!businessName) {

        businessName =
            $('title')
                .first()
                .text()
                .trim();

    }

    /*
    |--------------------------------------------------------------------------
    | REMOVE DUPLICATES
    |--------------------------------------------------------------------------
    */

    const uniqueAddresses =
        [...new Set(addresses)];

    /*
    |--------------------------------------------------------------------------
    | CONSISTENCY CHECK
    |--------------------------------------------------------------------------
    */

    const issues = [];

    if (!businessName) {
        issues.push('Business name missing');
    }

    if (uniqueAddresses.length === 0) {
        issues.push('Address missing');
    }

    if (phones.length === 0) {
        issues.push('Phone number missing');
    }

    if (emails.length === 0) {
        issues.push('Email missing');
    }

    /*
    |--------------------------------------------------------------------------
    | FOOTER CHECK
    |--------------------------------------------------------------------------
    */

    const footerIssues = [];

    if (
        businessName &&
        !normalizeText(footerText).includes(
            normalizeText(businessName)
        )
    ) {

        footerIssues.push(
            'Business name not found in footer'
        );

    }

    /*
    |--------------------------------------------------------------------------
    | CONSISTENCY SCORE
    |--------------------------------------------------------------------------
    */

    let score = 100;

    score -= issues.length * 20;
    score -= footerIssues.length * 10;

    if (score < 0) {
        score = 0;
    }

    /*
    |--------------------------------------------------------------------------
    | HAS NAP
    |--------------------------------------------------------------------------
    */

    const hasNAP =
        !!businessName &&
        uniqueAddresses.length > 0 &&
        phones.length > 0;

    return {

        hasNAP,

        businessName,

        addresses: uniqueAddresses,

        phones,

        emails,

        score,

        issues,

        footerIssues,

        checks: {

            hasBusinessName:
                !!businessName,

            hasAddress:
                uniqueAddresses.length > 0,

            hasPhone:
                phones.length > 0,

            hasEmail:
                emails.length > 0

        }

    };

}

function getChromeFlags() {
    return [
        '--headless',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking'
    ];
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
            timeout: 6000,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 SEO Audit SaaS'
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
        return {
            url: imageUrl,
            status: error.response?.status || 'Request failed'
        };
    }
}

async function getImageAudit($, pageUrl) {
    const images = $('img');
    const missingAltImages = [];
    const emptyAltImages = [];
    const missingTitleImages = [];
    const missingDimensionImages = [];
    const imageUrls = [];

    images.each((index, img) => {
        const src =
            $(img).attr('src') ||
            $(img).attr('data-src') ||
            $(img).attr('data-lazy-src') ||
            '';
        const resolvedUrl = resolveAssetUrl(src, pageUrl);
        const alt = $(img).attr('alt');
        const title = $(img).attr('title');
        const width = $(img).attr('width');
        const height = $(img).attr('height');

        if (resolvedUrl) {
            imageUrls.push(resolvedUrl);
        }

        if (alt === undefined) {
            missingAltImages.push({ url: resolvedUrl, src });
        }

        if (alt !== undefined && alt.trim() === '') {
            emptyAltImages.push({ url: resolvedUrl, src });
        }

        if (title === undefined || title.trim() === '') {
            missingTitleImages.push({ url: resolvedUrl, src });
        }

        if (!width || !height) {
            missingDimensionImages.push({ url: resolvedUrl, src });
        }
    });

    const brokenImageUrls = [];
    const uniqueImageUrls = [...new Set(imageUrls)].slice(0, 20);

    for (const imageUrl of uniqueImageUrls) {
        const brokenImage = await checkImageUrl(imageUrl);

        if (brokenImage) {
            brokenImageUrls.push(brokenImage);
        }
    }

    return {
        totalImages: images.length,
        missingAlt: missingAltImages.length,
        emptyAlt: emptyAltImages.length,
        missingTitle: missingTitleImages.length,
        missingDimensions: missingDimensionImages.length,
        brokenImages: brokenImageUrls.length,
        missingAltImages: missingAltImages.slice(0, 50),
        emptyAltImages: emptyAltImages.slice(0, 50),
        missingTitleImages: missingTitleImages.slice(0, 50),
        missingDimensionImages: missingDimensionImages.slice(0, 50),
        brokenImageUrls: brokenImageUrls.slice(0, 50)
    };
}
async function fetchTextFile(url) {
    try {
        const response = await axios.get(url, {
            timeout: 8000,
            maxContentLength: 1024 * 1024,
            responseType: 'text',
            transformResponse: [(data) => data],
            headers: {
                'User-Agent': 'Mozilla/5.0 SEO Audit SaaS'
            },
            validateStatus: () => true
        });

        if (response.status >= 400) {
            return {
                url,
                exists: false,
                status: response.status,
                content: '',
                contentLength: 0
            };
        }

        const content =
            typeof response.data === 'string'
                ? response.data
                : JSON.stringify(response.data || '');

        return {
            url,
            exists: true,
            status: response.status,
            content,
            contentLength: content.length
        };
    } catch (error) {
        return {
            url,
            exists: false,
            status: 'error',
            content: '',
            contentLength: 0,
            error: error.message
        };
    }
}

function getOriginFileUrl(pageUrl, filename) {
    const parsed = new URL(pageUrl);

    return `${parsed.origin}/${filename}`;
}

function summarizeTextFile(file) {
    const content = file.content || '';
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    return {
        url: file.url,
        exists: file.exists,
        status: file.status,
        contentLength: file.contentLength || 0,
        lineCount: lines.length,
        preview: content.slice(0, 4000),
        error: file.error || ''
    };
}

function parseRobotsTxt(file) {
    const summary = summarizeTextFile(file);
    const lines = (file.content || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

    const directives = lines
        .map((line) => {
            const separatorIndex = line.indexOf(':');

            if (separatorIndex === -1) {
                return null;
            }

            return {
                name: line.slice(0, separatorIndex).trim().toLowerCase(),
                value: line.slice(separatorIndex + 1).trim()
            };
        })
        .filter(Boolean);

    const sitemapUrls = directives
        .filter((directive) => directive.name === 'sitemap')
        .map((directive) => directive.value)
        .filter(Boolean);

    return {
        ...summary,
        userAgents: [
            ...new Set(
                directives
                    .filter((directive) => directive.name === 'user-agent')
                    .map((directive) => directive.value)
                    .filter(Boolean)
            )
        ],
        disallowCount: directives.filter(
            (directive) => directive.name === 'disallow'
        ).length,
        allowCount: directives.filter(
            (directive) => directive.name === 'allow'
        ).length,
        sitemapUrls
    };
}

function parseLlmsTxt(file) {
    const summary = summarizeTextFile(file);
    const content = file.content || '';

    return {
        ...summary,
        headings: (content.match(/^#{1,6}\s+.+$/gm) || [])
            .map((heading) => heading.replace(/^#{1,6}\s+/, '').trim())
            .slice(0, 20),
        links: (content.match(/\[[^\]]+\]\([^)]+\)/g) || []).slice(0, 50)
    };
}

function parseSitemapXml(file) {
    const summary = summarizeTextFile(file);

    if (!file.exists || !file.content) {
        return {
            ...summary,
            urlCount: 0,
            sitemapCount: 0,
            sampleUrls: []
        };
    }

    try {
        const $ = cheerio.load(file.content, {
            xmlMode: true
        });
        const urls = $('url > loc')
            .map((index, element) => $(element).text().trim())
            .get()
            .filter(Boolean);
        const sitemapUrls = $('sitemap > loc')
            .map((index, element) => $(element).text().trim())
            .get()
            .filter(Boolean);

        return {
            ...summary,
            urlCount: urls.length,
            sitemapCount: sitemapUrls.length,
            sampleUrls: urls.slice(0, 20),
            sitemapUrls: sitemapUrls.slice(0, 20),
            parseError: ''
        };
    } catch (error) {
        return {
            ...summary,
            urlCount: 0,
            sitemapCount: 0,
            sampleUrls: [],
            sitemapUrls: [],
            parseError: error.message
        };
    }
}

async function getSiteFileAudit(pageUrl) {
    const [robotsFile, llmsFile, sitemapFile] = await Promise.all([
        fetchTextFile(getOriginFileUrl(pageUrl, 'robots.txt')),
        fetchTextFile(getOriginFileUrl(pageUrl, 'llms.txt')),
        fetchTextFile(getOriginFileUrl(pageUrl, 'sitemap.xml'))
    ]);

    const robotsTxt = parseRobotsTxt(robotsFile);
    const llmsTxt = parseLlmsTxt(llmsFile);
    const sitemapXml = parseSitemapXml(sitemapFile);

    return {
        robotsTxt,
        llmsTxt,
        sitemapXml,
        hasRobotsTxt: robotsTxt.exists,
        hasLlmsTxt: llmsTxt.exists,
        hasSitemapXml: sitemapXml.exists,
        robotsSitemapCount: robotsTxt.sitemapUrls.length,
        sitemapUrlCount: sitemapXml.urlCount
    };
}

async function checkProtocolUrl(url) {
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            maxRedirects: 5,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 SEO Audit SaaS'
            },
            validateStatus: () => true
        });
        const finalUrl = response.request?.res?.responseUrl || url;

        if (response.data?.destroy) {
            response.data.destroy();
        }

        return {
            url,
            reachable: response.status >= 200 && response.status < 400,
            status: response.status,
            finalUrl,
            finalProtocol: new URL(finalUrl).protocol.replace(':', ''),
            redirected: finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '')
        };
    } catch (error) {
        return {
            url,
            reachable: false,
            status: 'error',
            finalUrl: '',
            finalProtocol: '',
            redirected: false,
            error: error.message
        };
    }
}

async function getProtocolAudit(pageUrl) {
    const parsed = new URL(pageUrl);
    const httpUrl = `http://${parsed.host}/`;
    const httpsUrl = `https://${parsed.host}/`;
    const [http, https] = await Promise.all([
        checkProtocolUrl(httpUrl),
        checkProtocolUrl(httpsUrl)
    ]);
    const requestedProtocol = parsed.protocol.replace(':', '');
    const redirectsHttpToHttps = http.finalProtocol === 'https';
    const servesHttpWithoutRedirect =
        http.reachable && http.finalProtocol === 'http';

    return {
        requestedProtocol,
        isHttps: requestedProtocol === 'https',
        http,
        https,
        hasHttps: https.reachable,
        httpReachable: http.reachable,
        redirectsHttpToHttps,
        servesHttpWithoutRedirect
    };
}
function getInternalLinkAudit($, pageUrl) {

    const links = [];
    const issues = [];

    $('a').each((index, element) => {

        /*
        |------------------------------------------------------------------
        | HREF
        |------------------------------------------------------------------
        */

        const href =
            ($(element).attr('href') || '').trim();

        if (
            !href ||
            href.startsWith('#') ||
            href.startsWith('javascript:') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:')
        ) {
            return;
        }

        try {

            const fullUrl =
                new URL(href, pageUrl).href;

            /*
            |------------------------------------------------------------------
            | INTERNAL LINKS ONLY
            |------------------------------------------------------------------
            */

            const isInternal =
                new URL(fullUrl).hostname ===
                new URL(pageUrl).hostname;

            if (!isInternal) {
                return;
            }

            /*
            |------------------------------------------------------------------
            | ANCHOR TEXT
            |------------------------------------------------------------------
            */

            let anchorText =
                $(element)
                    .text()
                    .replace(/\s+/g, ' ')
                    .trim();

            /*
            |------------------------------------------------------------------
            | IMAGE ALT FALLBACK
            |------------------------------------------------------------------
            */

            if (!anchorText) {

                const imageAlt =
                    $(element)
                        .find('img')
                        .first()
                        .attr('alt');

                if (imageAlt) {

                    anchorText =
                        imageAlt
                            .replace(/\s+/g, ' ')
                            .trim();

                }

            }

            /*
            |------------------------------------------------------------------
            | ARIA LABEL FALLBACK
            |------------------------------------------------------------------
            */

            if (!anchorText) {

                const ariaLabel =
                    $(element).attr('aria-label');

                if (ariaLabel) {

                    anchorText =
                        ariaLabel
                            .replace(/\s+/g, ' ')
                            .trim();

                }

            }

            /*
            |------------------------------------------------------------------
            | TITLE FALLBACK
            |------------------------------------------------------------------
            */

            if (!anchorText) {

                const title =
                    $(element).attr('title');

                if (title) {

                    anchorText =
                        title
                            .replace(/\s+/g, ' ')
                            .trim();

                }

            }

            /*
            |------------------------------------------------------------------
            | STATUS
            |------------------------------------------------------------------
            */

            let status = 'Good';

            const lowerAnchor =
                anchorText.toLowerCase();

            const genericAnchors = [
                'click here',
                'read more',
                'learn more',
                'continue reading',
                'view more',
                'more',
                'here',
                'details'
            ];

            /*
            |------------------------------------------------------------------
            | MISSING ANCHOR
            |------------------------------------------------------------------
            */

            if (!anchorText) {

                status = 'Missing Anchor Text';

                issues.push(
                    `Internal link missing anchor text: ${fullUrl}`
                );

            }

            /*
            |------------------------------------------------------------------
            | WEAK ANCHOR
            |------------------------------------------------------------------
            */

            else if (anchorText.length < 3) {

                status = 'Weak Anchor';

                issues.push(
                    `Weak anchor text: ${anchorText}`
                );

            }

            /*
            |------------------------------------------------------------------
            | GENERIC ANCHOR
            |------------------------------------------------------------------
            */

            else if (
                genericAnchors.includes(lowerAnchor)
            ) {

                status = 'Generic Anchor';

                issues.push(
                    `Generic anchor text used: ${anchorText}`
                );

            }

            /*
            |------------------------------------------------------------------
            | KEYWORD RICH
            |------------------------------------------------------------------
            */

            /*
|------------------------------------------------------------------
| KEYWORD RICH
|------------------------------------------------------------------
*/

else {

    const keywordPatterns = [
    'buy',
    'best',
    'services',
    'solutions',
    'manufacturer',
    'supplier',
    'wholesale',
    'seo services',
    'digital marketing',
    'software development'
];

    const words =
        lowerAnchor.split(/\s+/);

    const hasKeyword =
        keywordPatterns.some(keyword =>
            lowerAnchor.includes(keyword)
        );

    if (
        words.length >= 4 &&
        hasKeyword
    ) {

        status = 'Keyword Rich';

    }

}

            /*
            |------------------------------------------------------------------
            | NOFOLLOW
            |------------------------------------------------------------------
            */

            const rel =
                ($(element).attr('rel') || '')
                    .toLowerCase();

            const isNoFollow =
                rel.includes('nofollow');

            /*
            |------------------------------------------------------------------
            | PUSH
            |------------------------------------------------------------------
            */

            links.push({

    pageUrl,

    anchorText,

    targetUrl: fullUrl,

    status

});

        } catch (error) {

            issues.push(
                `Invalid internal link: ${href}`
            );

        }

    });

    /*
    |----------------------------------------------------------------------
    | REMOVE DUPLICATES
    |----------------------------------------------------------------------
    */

    const uniqueLinks = [];

    const seen = new Set();

    links.forEach(link => {

        const key =
            `${link.targetUrl}-${link.anchorText}`;

        if (!seen.has(key)) {

            seen.add(key);

            uniqueLinks.push(link);

        }

    });

    return {

        totalInternalLinks:
            uniqueLinks.length,

        issues,

        links:
            uniqueLinks.slice(0, 300)

    };

}

function getPageIssues(technicalAudit, scores) {
    const issues = [];

    if (technicalAudit.indexability === 'Noindex') {
        issues.push('Page is noindex');
    }

    if (technicalAudit.titleStatus !== 'Good') {
        issues.push(`Title ${technicalAudit.titleStatus}`);
    }

    if (technicalAudit.metaDescriptionStatus !== 'Good') {
        issues.push(`Meta description ${technicalAudit.metaDescriptionStatus}`);
    }

    if (!technicalAudit.canonicalUrl) {
        issues.push('Missing canonical');
    } else if (!technicalAudit.canonicalMatches) {
        issues.push('Canonical does not match page URL');
    }

    if (technicalAudit.headings.h1 === 0) {
        issues.push('Missing H1');
    }

    if (technicalAudit.headings.h1 > 1) {
        issues.push('Multiple H1 tags');
    }

    if (technicalAudit.duplicateH1) {
        issues.push('Duplicate H1 text');
    }

    if (technicalAudit.schemaAudit.status === 'Missing') {
        issues.push('Missing schema markup');
    }

    if (technicalAudit.schemaAudit.invalidJsonLd > 0) {
        issues.push('Invalid JSON-LD schema');
    }

    if (technicalAudit.schemaAudit.missingRequired.length > 0) {
        issues.push('Schema missing required fields');
    }

    if (technicalAudit.wordCount < 300) {
        issues.push('Thin content');
    }

    if (technicalAudit.imageAudit.missingAlt > 0) {
        issues.push('Images missing ALT text');
    }

    if (technicalAudit.imageAudit.missingTitle > 0) {
        issues.push('Images missing title text');
    }

    if (technicalAudit.imageAudit.missingDimensions > 0) {
        issues.push('Images missing dimensions');
    }

    if (technicalAudit.imageAudit.brokenImages > 0) {
        issues.push('Broken image URLs');
    }

    if (scores.performanceScore < 50) {
        issues.push('Poor performance score');
    }

    if (!technicalAudit.napAudit.hasNAP) {
        issues.push('NAP information missing');
    }

    if (!technicalAudit.siteFileAudit?.hasRobotsTxt) {
        issues.push('robots.txt missing');
    }

    if (!technicalAudit.siteFileAudit?.hasSitemapXml) {
        issues.push('sitemap.xml missing');
    }

    if (!technicalAudit.siteFileAudit?.hasLlmsTxt) {
        issues.push('llms.txt missing');
    }

    if (!technicalAudit.protocolAudit?.isHttps) {
        issues.push('Page is not served over HTTPS');
    }

    if (!technicalAudit.protocolAudit?.hasHttps) {
        issues.push('HTTPS version is not reachable');
    }

    if (technicalAudit.protocolAudit?.servesHttpWithoutRedirect) {
        issues.push('HTTP version does not redirect to HTTPS');
    }

    if (
        technicalAudit.canonicalUrl &&
        technicalAudit.protocolAudit?.isHttps &&
        technicalAudit.canonicalUrl.toLowerCase().startsWith('http://')
    ) {
        issues.push('Canonical URL uses HTTP');
    }

    if (
    technicalAudit.internalLinkAudit?.issues?.length > 0
) {
    issues.push('Internal link anchor text issues');
}

    return issues;
}

function getRecommendations(technicalAudit, scores) {
    const recommendations = [];

    if (technicalAudit.metaDescriptionStatus !== 'Good') {
        recommendations.push(
            `Fix meta description length. Current status: ${technicalAudit.metaDescriptionStatus}.`
        );
    }

    if (technicalAudit.titleStatus !== 'Good') {
        recommendations.push(
            `Fix title length. Current status: ${technicalAudit.titleStatus}.`
        );
    }

    if (!technicalAudit.canonicalUrl) {
        recommendations.push('Add a self-referencing canonical URL.');
    }

    if (technicalAudit.wordCount < 300) {
        recommendations.push('Add more useful body content. Word count is below 300.');
    }

    if (!technicalAudit.schemaAudit.hasStructuredData) {
        recommendations.push('Add structured schema markup.');
    }

    if (technicalAudit.schemaAudit.invalidJsonLd > 0) {
        recommendations.push('Fix invalid JSON-LD schema markup.');
    }

    if (technicalAudit.schemaAudit.missingRequired.length > 0) {
        recommendations.push('Add required schema properties.');
    }

    if (technicalAudit.headings.h1 === 0) {
        recommendations.push('Add one H1 heading.');
    }

    if (technicalAudit.headings.h1 > 1) {
        recommendations.push('Use only one H1.');
    }

    if (technicalAudit.imageAudit.missingAlt > 0) {
        recommendations.push(
            `${technicalAudit.imageAudit.missingAlt} images missing ALT text.`
        );
    }

    if (technicalAudit.imageAudit.missingTitle > 0) {
        recommendations.push(
            `${technicalAudit.imageAudit.missingTitle} images missing title text.`
        );
    }

    if (technicalAudit.imageAudit.missingDimensions > 0) {
        recommendations.push('Add image width and height attributes.');
    }

    if (technicalAudit.imageAudit.brokenImages > 0) {
        recommendations.push(
            `${technicalAudit.imageAudit.brokenImages} broken image URLs found.`
        );
    }

    if (scores.performanceScore < 90) {
        recommendations.push('Improve page speed and optimize assets.');
    }

    if (!technicalAudit.napAudit.hasNAP) {
    recommendations.push(
        'Add complete NAP details including business name, address, and phone number.'
    );
}

if (
    technicalAudit.internalLinkAudit?.issues?.length > 0
) {
    recommendations.push(
        'Improve internal link anchor text quality and avoid generic anchors.'
    );
}

if (!technicalAudit.siteFileAudit?.hasRobotsTxt) {
    recommendations.push('Add a robots.txt file at the domain root.');
}

if (!technicalAudit.siteFileAudit?.hasSitemapXml) {
    recommendations.push('Add a sitemap.xml file at the domain root.');
}

if (!technicalAudit.siteFileAudit?.hasLlmsTxt) {
    recommendations.push('Add an llms.txt file at the domain root for AI crawler guidance.');
}

if (!technicalAudit.protocolAudit?.isHttps) {
    recommendations.push('Serve the audited page over HTTPS.');
}

if (!technicalAudit.protocolAudit?.hasHttps) {
    recommendations.push('Make sure the HTTPS version of the site is reachable.');
}

if (technicalAudit.protocolAudit?.servesHttpWithoutRedirect) {
    recommendations.push('Redirect all HTTP traffic to the HTTPS version.');
}

if (
    technicalAudit.canonicalUrl &&
    technicalAudit.protocolAudit?.isHttps &&
    technicalAudit.canonicalUrl.toLowerCase().startsWith('http://')
) {
    recommendations.push('Update the canonical URL to use HTTPS.');
}

    return recommendations;
}

async function getTechnicalSeoData(url, scores) {
    const response = await axios.get(url, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 SEO Audit SaaS'
        }
    });

    const $ = cheerio.load(response.data);
    const titleText = $('title').first().text().trim();
    const metaDescription =
        $('meta[name="description"]').first().attr('content') || '';
    const canonicalUrl =
        $('link[rel="canonical"]').first().attr('href') || '';
    const robotsMeta =
        $('meta[name="robots"]').first().attr('content') || '';
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const words = bodyText ? bodyText.split(/\s+/) : [];
    const h1Texts = $('h1')
        .map((index, element) => $(element).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);
    const headings = {
        h1: $('h1').length,
        h2: $('h2').length,
        h3: $('h3').length,
        h4: $('h4').length,
        h5: $('h5').length,
        h6: $('h6').length
    };
    const links = $('a');
    let internalLinks = 0;
    let externalLinks = 0;

    links.each((index, link) => {
        const href = $(link).attr('href');

        if (
            !href ||
            href.startsWith('#') ||
            href.startsWith('javascript') ||
            href.startsWith('mailto:')
        ) {
            return;
        }

        try {
            const fullUrl = new URL(href, url).href;

            if (new URL(fullUrl).hostname === new URL(url).hostname) {
                internalLinks++;
            } else {
                externalLinks++;
            }
        } catch (error) {}
    });

    const imageAudit = await getImageAudit($, url);
    const schemaAudit = getSchemaAudit($);
    const napAudit = getNAPAudit($);
    const internalLinkAudit = getInternalLinkAudit($, url);
    const siteFileAudit = await getSiteFileAudit(url);
    const protocolAudit = await getProtocolAudit(url);
    const technicalAudit = {
        titleText,
        titleLength: getTextLength(titleText),
        titleStatus: getLengthStatus(getTextLength(titleText), 30, 60),
        metaDescription,
        metaDescriptionLength: getTextLength(metaDescription),
        metaDescriptionStatus:
            getLengthStatus(getTextLength(metaDescription), 120, 160),
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
        wordCount: words.length,
        h1Texts,
        duplicateH1: new Set(h1Texts).size !== h1Texts.length,
        headings,
        headingIssues: [
            ...(headings.h1 === 0 ? ['Missing H1'] : []),
            ...(headings.h1 > 1 ? ['Multiple H1 tags'] : [])
        ],
        imageAudit,
        schemaAudit,
        napAudit,
        internalLinkAudit,
        siteFileAudit,
        protocolAudit,
        openGraph: {
            ogTitle: $('meta[property="og:title"]').length > 0,
            ogDescription: $('meta[property="og:description"]').length > 0,
            ogImage: $('meta[property="og:image"]').length > 0,
            ogUrl: $('meta[property="og:url"]').length > 0
        },
        linkAudit: {
            totalLinks: links.length,
            internalLinks,
            externalLinks,
            brokenLinks: []
        }
    };

    technicalAudit.issues = getPageIssues(technicalAudit, scores);
    technicalAudit.recommendations = getRecommendations(technicalAudit, scores);

    return technicalAudit;
}

async function runLighthouseAudit(inputUrl) {
    const url = normalizeUrl(inputUrl);
    let chrome;

    try {
        chrome = await chromeLauncher.launch({
            chromeFlags: getChromeFlags()
        });

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
        const scores = {
            performanceScore: safeScore(report.categories.performance?.score),
            seoScore: safeScore(report.categories.seo?.score),
            accessibilityScore: safeScore(
                report.categories.accessibility?.score
            ),
            bestPracticesScore: safeScore(
                report.categories['best-practices']?.score
            )
        };
        const technicalAudit =
            await getTechnicalSeoData(url, scores).catch((error) => ({
                error: error.message
            }));

        return {
            url,
            ...scores,
            fullReport: {
                lighthouse: report,
                technicalAudit
            }
        };
    } finally {
        if (chrome) {
            try {
                await chrome.kill();
            } catch (error) {}
        }
    }
}

module.exports = {
    normalizeUrl,
    runLighthouseAudit
};
