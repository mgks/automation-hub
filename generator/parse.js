// generator/parse.js
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Aggregates workflows from all JSON files in the data directory.
 * Each workflow's path is updated to be prefixed by its source (filename).
 */
async function parseWorkflows() {
    console.log('Starting multi-source workflow aggregation...');
    
    if (!await fs.pathExists(DATA_DIR)) {
        console.warn('Data directory not found. Please ensure workflows exist in /data.');
        return { workflows: [], tools: {} };
    }

    const files = await fs.readdir(DATA_DIR);
    const allWorkflows = [];
    const toolsMap = {};
    const seenIds = new Set();
    const seenUrls = new Set();

    for (const file of files) {
        if (path.extname(file) === '.json') {
            const sourceName = path.basename(file, '.json');
            const filePath = path.join(DATA_DIR, file);
            const workflows = await fs.readJson(filePath, { throws: false }) || [];
            
            console.log(`Processing ${workflows.length} workflows from source: ${sourceName}`);
            
            for (const wf of workflows) {
                // Deduplicate by ID and URLs
                const uniqueUrl = wf.repoUrl || wf.downloadUrl || wf.sourceFile;
                
                if (!wf.id || seenIds.has(wf.id) || (uniqueUrl && seenUrls.has(uniqueUrl))) {
                    continue; // Skip duplicate or invalid entries
                }
                
                seenIds.add(wf.id);
                if (uniqueUrl) seenUrls.add(uniqueUrl);

                // Normalize workflow data
                wf.source = sourceName;
                
                // Restructure path: SOURCE/SLUG/
                // extract slug from current path if ID is not clean
                const slugMatch = wf.path ? wf.path.match(/\/([^\/]+)\/?$/) : null;
                const slug = slugMatch ? slugMatch[1] : wf.id.split('-').pop();
                wf.path = `${sourceName}/${slug}/`;
                
                allWorkflows.push(wf);

                // Track tool counts
                if (!toolsMap[wf.tool]) toolsMap[wf.tool] = 0;
                toolsMap[wf.tool]++;
            }
        }
    }

    console.log(`Aggregation complete. Total workflows: ${allWorkflows.length}`);
    return { workflows: allWorkflows, tools: toolsMap };
}

module.exports = { parseWorkflows };