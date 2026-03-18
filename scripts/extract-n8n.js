// scripts/extract-n8n.js
const fs = require('fs-extra');
const path = require('path');
const { parseWorkflows } = require('../generator/parse.js');
const simpleGit = require('simple-git');

const SOURCE_REPO = 'https://github.com/Zie619/n8n-workflows.git';
const TMP_DIR = path.join(__dirname, '../tmp/n8n-workflows');
const DATA_FILE = path.join(__dirname, '../data/n8n.json');

async function main() {
    console.log('Final Extraction for n8n.json...');
    
    // 1. Clone/Pull
    await fs.ensureDir(TMP_DIR);
    const git = simpleGit();
    if (await fs.pathExists(path.join(TMP_DIR, '.git'))) {
        await git.cwd(TMP_DIR).pull();
    } else {
        await git.clone(SOURCE_REPO, TMP_DIR);
    }

    // 2. Parse
    const data = await parseWorkflows();
    
    // 3. Save to data/n8n.json
    await fs.ensureDir(path.dirname(DATA_FILE));
    await fs.writeJson(DATA_FILE, data.workflows, { spaces: 2 });
    
    console.log(`Successfully extracted ${data.workflows.length} workflows to ${DATA_FILE}`);
    
    // 4. Cleanup
    await fs.remove(TMP_DIR);
}

main().catch(console.error);
