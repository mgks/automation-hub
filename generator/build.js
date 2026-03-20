// generator/build.js
const fs = require('fs-extra');
const path = require('path');
const { parseWorkflows } = require('./parse.js');
const { renderSite, generateSitemap } = require('./render.js');

const STATIC_DIR = path.join(__dirname, '../static');
const OUTPUT_DIR = path.join(__dirname, '../docs');

async function main() {
    console.log('Starting build process...');

    // 1. Parse workflows from permanent data/ directory
    console.log('Parsing permanent workflow data...');
    const data = await parseWorkflows();
    
    // Ensure the output directory exists
    await fs.ensureDir(OUTPUT_DIR);

    // Copy everything from /static into /docs/src
    console.log('Copying static assets...');
    await fs.copy(STATIC_DIR, path.join(OUTPUT_DIR, 'src'));

    // Ensure robots.txt is at the root of /docs/
    if (await fs.pathExists(path.join(STATIC_DIR, 'robots.txt'))) {
        await fs.copy(path.join(STATIC_DIR, 'robots.txt'), path.join(OUTPUT_DIR, 'robots.txt'));
        console.log('Copied robots.txt to the root of /docs/');
    }

    // 2. Generate the searchable index file
    await fs.writeJson(path.join(OUTPUT_DIR, 'index.json'), data.workflows);
    console.log(`Created index.json with ${data.workflows.length} workflows.`);

    // 3. Generate static HTML pages
    console.log('Generating static site...');
    await renderSite(data);

    // 4. Generate sitemap
    console.log('Generating sitemap...');
    await generateSitemap(data);
    console.log('Created sitemap.xml');

    console.log('Build process completed successfully!');
}

main().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
});