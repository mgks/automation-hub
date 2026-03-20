// generator/render.js
const fs = require('fs-extra');
const path = require('path');
const { SitemapStream, streamToPromise } = require('sitemap');

const DOCS_DIR = path.join(__dirname, '../docs');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const HIGHLIGHT_FILE = path.join(__dirname, '../highlight.json');
const BASE_URL = 'https://hub.mgks.dev';
const MAIN_TOOLS = ['n8n', 'openclaw'];
const PAGE_SIZE = 25;

let templates;
async function loadTemplates() {
    if (templates) return templates;
    const [layout, homepage, workflow, tool] = await Promise.all([
        fs.readFile(path.join(TEMPLATES_DIR, 'layout.html'), 'utf-8'),
        fs.readFile(path.join(TEMPLATES_DIR, 'homepage.html'), 'utf-8'),
        fs.readFile(path.join(TEMPLATES_DIR, 'workflow.html'), 'utf-8'),
        fs.readFile(path.join(TEMPLATES_DIR, 'tag.html'), 'utf-8'),
    ]);
    templates = { layout, homepage, workflow, tool };
    return templates;
}

function renderInLayout(content, meta, bodyClass = '', data) {
    if (!data || !data.workflows) {
        throw new Error('The "data" object with a "workflows" property must be provided to renderInLayout.');
    }
    const canonicalUrl = `${BASE_URL}${meta.url || ''}`;
    const ogImage = `${BASE_URL}/src/og-image.png`;
    
    // Generate Navigation HTML - Only the two main platforms
    const platformCounts = data.workflows.reduce((acc, wf) => {
        const platform = (wf.tool === 'openclaw' || wf.source === 'openclaw') ? 'openclaw' : 'n8n';
        acc[platform] = (acc[platform] || 0) + 1;
        return acc;
    }, {});
    
    const navHTML = MAIN_TOOLS
        .filter(t => platformCounts[t])
        .map(t => `<a href="/workflow/${t}/" class="nav-link">${t.toUpperCase()} <span>(${platformCounts[t]})</span></a>`)
        .join('');

    return templates.layout
        .replace('{{content}}', content)
        .replace('{{nav}}', navHTML)
        .replace(/{{title}}/g, meta.title)
        .replace(/{{meta_description}}/g, meta.description)
        .replace('{{body_class}}', bodyClass)
        .replace('{{workflow_count}}', data.workflows.length)
        .replace(/{{canonical_url}}/g, canonicalUrl)
        .replace(/{{og_image}}/g, ogImage);
}

function createPill(text, type, url = null) {
    if (url) {
        return `<a href="${url}" class="pill pill-${type}">${text}</a>`;
    }
    return `<span class="pill pill-${type}">${text}</span>`;
}

// --- THIS FUNCTION IS NOW THE TEMPLATE FOR ALL WORKFLOW CARDS ---
function createWorkflowListItem(wf) {
    const sourcePath = wf.source || 'n8n';
    const toolPill = createPill(wf.tool, 'tool', `/workflow/${wf.tool}/`); // Now a link
    const tagsHTML = wf.tags.slice(0, 4).map(tag => createPill(tag, 'tag')).join('');
    
    const trimmedDescription = wf.description.length > 120 
        ? wf.description.substring(0, 120) + '...' 
        : wf.description;

    const actionUrl = wf.type === 'repo' ? wf.repoUrl : wf.downloadUrl;
    const actionIcon = wf.type === 'repo' 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>`;
    const actionTitle = wf.type === 'repo' ? 'View Repository' : 'Download JSON';

    return `
        <div class="list-item">
            <div class="item-content">
                <h3><a href="/${wf.path}">${wf.title}</a></h3>
                <p class="item-description">${trimmedDescription}</p>
                <div class="pills-container">${toolPill}${tagsHTML}</div>
            </div>
            <div class="item-actions">
                <a href="${actionUrl}" class="icon-button" ${wf.type === 'repo' ? '' : 'download'} target="_blank" title="${actionTitle}">
                    ${actionIcon}
                </a>
            </div>
        </div>
    `;
}

function getRelatedWorkflows(currentWf, allWorkflows, limit = 6) {
    // 1. Group by source/tool
    const bySource = allWorkflows.reduce((acc, wf) => {
        if (wf.id === currentWf.id) return acc;
        if (!acc[wf.source]) acc[wf.source] = [];
        acc[wf.source].push(wf);
        return acc;
    }, {});

    const sources = Object.keys(bySource).sort();
    const suggestions = [];
    let sourceIdx = 0;

    // 2. Round-robin through sources to get variety
    while (suggestions.length < limit && sources.length > 0) {
        const source = sources[sourceIdx % sources.length];
        const sourceWfs = bySource[source];
        
        if (sourceWfs.length > 0) {
            // Pick a random one from this source
            const entryIdx = Math.floor(Math.random() * sourceWfs.length);
            suggestions.push(sourceWfs.splice(entryIdx, 1)[0]);
        } else {
            sources.splice(sourceIdx % sources.length, 1);
            continue;
        }
        sourceIdx++;
    }

    return suggestions;
}

function createRelatedWorkflowCard(wf) {
    return `
        <a href="/${wf.path}" class="related-card">
            <div class="related-card-content">
                <span class="related-source">${wf.source}</span>
                <h4>${wf.title}</h4>
                <div class="related-tool">${wf.tool}</div>
            </div>
        </a>
    `;
}

function createPaginationHTML(currentPage, totalPages, baseUrl) {
    if (totalPages <= 1) return '';
    
    let html = '<div class="pagination">';
    
    // Helper to get page URL
    const getPageUrl = (p) => p === 1 ? baseUrl : `${baseUrl}page/${p}/`;

    // Previous Link
    if (currentPage > 1) {
        html += `<a href="${getPageUrl(currentPage - 1)}" class="pagination-link">&larr;</a>`;
    } else {
        html += `<span class="pagination-link disabled">&larr;</span>`;
    }
    
    // Page Numbers
    const delta = 2; // Number of pages to show around current
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
            range.push(i);
        }
    }

    for (let i of range) {
        if (l) {
            if (i - l === 2) {
                rangeWithDots.push(l + 1);
            } else if (i - l !== 1) {
                rangeWithDots.push('...');
            }
        }
        rangeWithDots.push(i);
        l = i;
    }

    for (let i of rangeWithDots) {
        if (i === '...') {
            html += `<span class="pagination-dots">...</span>`;
        } else if (i === currentPage) {
            html += `<span class="pagination-link active">${i}</span>`;
        } else {
            html += `<a href="${getPageUrl(i)}" class="pagination-link">${i}</a>`;
        }
    }

    // Next Link
    if (currentPage < totalPages) {
        html += `<a href="${getPageUrl(currentPage + 1)}" class="pagination-link">&rarr;</a>`;
    } else {
        html += `<span class="pagination-link disabled">&rarr;</span>`;
    }
    
    html += '</div>';
    return html;
}

async function renderSite(data) {
    await loadTemplates();
    const defaultDesc = "The universal, searchable, and hosted directory for automation workflows across n8n, OpenClaw, and more.";

    // 1. Prepare Hub Data
    const platformCounts = data.workflows.reduce((acc, wf) => {
        const platform = (wf.tool === 'openclaw' || wf.source === 'openclaw') ? 'openclaw' : 'n8n';
        acc[platform] = (acc[platform] || 0) + 1;
        return acc;
    }, {});

    const toolCardsHTML = MAIN_TOOLS
        .filter(t => platformCounts[t])
        .map(tool => `
            <a href="/workflow/${tool}/" class="tool-card">
                <div class="tool-card-icon">${tool.charAt(0).toUpperCase()}</div>
                <div class="tool-card-info">
                    <h4>${tool === 'n8n' ? 'n8n Workflows' : 'OpenClaw Skills'}</h4>
                    <span>${platformCounts[tool]} items</span>
                </div>
            </a>
        `).join('');

    // Pick 4 representative workflows for the main tools to show on home
    const n8nFeatured = data.workflows.filter(w => w.tool === 'n8n').slice(0, 4);
    const openClawFeatured = data.workflows.filter(w => w.tool === 'openclaw').slice(0, 4);

    const createShowcase = (title, workflows) => `
        <div class="tool-showcase">
            <div class="section-header">
                <h3>${title}</h3>
                <a href="/workflow/${workflows[0]?.tool}/" class="view-all">View All →</a>
            </div>
            <div class="showcase-grid">
                ${workflows.map(createWorkflowListItem).join('')}
            </div>
        </div>
    `;

    const showcasesHTML = (n8nFeatured.length ? createShowcase('Top n8n Workflows', n8nFeatured) : '') +
                        (openClawFeatured.length ? createShowcase('Latest OpenClaw Skills', openClawFeatured) : '');

    // 2. Render Homepage
    let homepageContent = templates.homepage
        .replace('{{tools}}', toolCardsHTML)
        .replace('{{showcases}}', showcasesHTML)
        .replace('{{workflow_count}}', data.workflows.length)
        .replace('{{tool_count}}', Object.keys(platformCounts).length);

    const homepageMeta = { 
    title: 'Automation Hub - Universal Workflow Directory', 
    description: defaultDesc, 
    url: '/' 
};
    const homepageHtml = renderInLayout(homepageContent, homepageMeta, 'homepage', data);
    await fs.writeFile(path.join(DOCS_DIR, 'index.html'), homepageHtml);

    // 2. Render Workflow Pages
    for (const wf of data.workflows) {
        const isRepo = wf.type === 'repo';
        const pillsHTML = createPill(wf.tool, 'tool', `/workflow/${wf.tool}/`) + wf.tags.map(t => createPill(t, 'tag')).join('');
        
        let actionsHTML = '';
        let usageHTML = '';

        if (isRepo) {
            // REPO TYPE: Show clone instructions and repo link
            actionsHTML = `
                <a href="${wf.repoUrl}" target="_blank" rel="noopener noreferrer" class="button button-primary">
                    <svg class="theme-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-github-icon lucide-github"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
                    <span>Inspect Repository</span>
                </a>
            `;
            usageHTML = `
                <div class="instructions-container card">
                    <h3>How to Use This Repository</h3>
                    <p>This is a community-contributed repository for ${wf.tool}. To use these workflows:</p>
                    <ol>
                        <li>Clone the repository to your local machine:
                            <div class="code-block-container">
                                <code>git clone ${wf.repoUrl}</code>
                            </div>
                        </li>
                        <li>Explore the repository for <code>.json</code> or documentation files.</li>
                        <li>Follow the repository's internal README for specific setup instructions.</li>
                    </ol>
                </div>
            `;
        } else {
            // FILE TYPE: Traditional download logic
            actionsHTML = `
                <a href="${wf.downloadUrl}" download class="button button-primary" target="_blank">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon lucide lucide-arrow-down-to-line-icon lucide-arrow-down-to-line"><path d="M12 17V3"></path><path d="m6 11 6 6 6-6"></path><path d="M19 21H5"></path></svg>
                    <span>Download JSON</span>
                </a>
                <a href="${wf.sourceFile}" target="_blank" rel="noopener noreferrer" class="button button-secondary">
                    <svg class="theme-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-github-icon lucide-github"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
                    <span>View Original File</span>
                </a>
            `;
            usageHTML = `
                <div class="instructions-container card">
                    <h3>How to Import This Workflow</h3>
                    <ol>
                        <li>Click the "Download JSON" button to save the file: <code>${wf.rawFilename || 'workflow.json'}</code>.</li>
                        <li>Open your ${wf.tool} canvas. In the top menu, go to <strong>File > Import from File...</strong></li>
                        <li>Select the downloaded file.</li>
                        <li>The workflow will appear on your canvas, ready to be configured.</li>
                    </ol>
                </div>
            `;
        }

        // Generate Related Workflows HTML
        const related = getRelatedWorkflows(wf, data.workflows, 6);
        const relatedHTML = related.map(createRelatedWorkflowCard).join('');

        const wfContent = templates.workflow
            .replace(/{{title}}/g, wf.title)
            .replace('{{pills}}', pillsHTML)
            .replace('{{description}}', wf.description)
            .replace('{{actions}}', actionsHTML)
            .replace('{{usageInstructions}}', usageHTML)
            .replace('{{relatedWorkflows}}', relatedHTML);
        
        const meta = { title: `${wf.title} | Automation Hub`, description: wf.description, url: `/${wf.path}` };
        const wfHtml = renderInLayout(wfContent, meta, 'subpage', data);
        
        const wfDir = path.join(DOCS_DIR, wf.path);
        await fs.ensureDir(wfDir);
        await fs.writeFile(path.join(wfDir, 'index.html'), wfHtml);
    }

    // 3. Render Tool & Platform Pages
    const workflowsByTool = data.workflows.reduce((acc, wf) => {
        // Group by specific tool
        if (!acc[wf.tool]) acc[wf.tool] = [];
        acc[wf.tool].push(wf);
        
        // ALSO group by platform for higher-level pages
        const platform = (wf.tool === 'openclaw' || wf.source === 'openclaw') ? 'openclaw' : 'n8n';
        if (platform !== wf.tool) {
            if (!acc[platform]) acc[platform] = [];
            acc[platform].push(wf);
        }
        return acc;
    }, {});

    for (const toolName in workflowsByTool) {
        const toolWorkflows = workflowsByTool[toolName];
        const totalPages = Math.ceil(toolWorkflows.length / PAGE_SIZE);
        const titlePrefix = MAIN_TOOLS.includes(toolName.toLowerCase()) ? '' : 'Tool: ';
        const baseUrl = `/workflow/${toolName.toLowerCase()}/`;

        for (let page = 1; page <= totalPages; page++) {
            const start = (page - 1) * PAGE_SIZE;
            const end = start + PAGE_SIZE;
            const pageWorkflows = toolWorkflows.slice(start, end);
            
            const workflowListHtml = pageWorkflows.map(createWorkflowListItem).join('');
            const paginationHTML = createPaginationHTML(page, totalPages, baseUrl);
            
            const toolContent = templates.tool
                .replace('{{title}}', `${titlePrefix}${toolName.toUpperCase()}${totalPages > 1 ? ` (Page ${page})` : ''}`)
                .replace('{{list}}', workflowListHtml)
                .replace('{{pagination}}', paginationHTML);
                
            const meta = { 
                title: `${toolName.toUpperCase()} Workflows - Page ${page} | Automation Hub`, 
                description: `Find ${toolWorkflows.length} automation workflows for ${toolName} in our universal directory. Page ${page}.`,
                url: page === 1 ? baseUrl : `${baseUrl}page/${page}/`
            };
            
            const toolHtml = renderInLayout(toolContent, meta, 'subpage', data);
            
            const pageDir = page === 1 
                ? path.join(DOCS_DIR, 'workflow', toolName.toLowerCase())
                : path.join(DOCS_DIR, 'workflow', toolName.toLowerCase(), 'page', page.toString());
                
            await fs.ensureDir(pageDir);
            await fs.writeFile(path.join(pageDir, 'index.html'), toolHtml);
        }
    }
}

async function generateSitemap(data) {
    console.log('[Sitemap] Starting sitemap generation...');
    try {
        const stream = new SitemapStream({
            hostname: BASE_URL,
            xmlns: {
                xsi: true,
            }
        });

        const lastmod = new Date().toISOString();

        const links = [
            { url: '/', changefreq: 'daily', priority: 1.0, lastmod }
        ];

        for (const toolName in data.tools) {
            links.push({ url: `/workflow/${toolName}/`, changefreq: 'daily', priority: 0.8, lastmod });
        }

        for (const wf of data.workflows) {
            links.push({ url: `/${wf.path}`, changefreq: 'weekly', priority: 0.6, lastmod });
        }

        links.forEach(link => stream.write(link));
        stream.end();

        const sitemapXml = (await streamToPromise(stream)).toString();
        console.log(`[Sitemap] Generated XML content (${sitemapXml.length} bytes).`);

        const sitemapPath = path.join(DOCS_DIR, 'sitemap.xml');
        await fs.writeFile(sitemapPath, sitemapXml);
        console.log(`[Sitemap] Successfully written to ${sitemapPath}`);

    } catch (error) {
        console.error('[Sitemap] Failed to generate sitemap:', error);
        throw error;
    }
}

module.exports = { renderSite, generateSitemap };