// generator/providers/openclaw.js
const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/openclaw.json');

async function updateOpenClawWorkflows() {
    console.log('Searching GitHub for OpenClaw skills and use-cases...');
    
    let existingWorkflows = [];
    if (await fs.pathExists(DATA_FILE)) {
        existingWorkflows = await fs.readJson(DATA_FILE);
    }
    const existingIds = new Set(existingWorkflows.map(wf => wf.id));
    
    // Keywords: "openclaw skills", "openclaw use-cases"
    const queries = ['openclaw+skills', 'openclaw+use-cases'];
    const discoveredWorkflows = [];
    const maxNewRepos = 10;
    let reposProcessed = 0;
    
    for (const q of queries) {
        if (reposProcessed >= maxNewRepos) break;

        try {
            console.log(`Querying: ${q}...`);
            const response = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=updated`, {
                headers: { 'User-Agent': 'n8n-workflow-hub-generator' }
            });
            
            if (!response.ok) continue;

            const data = await response.json();
            for (const repo of data.items) {
                if (reposProcessed >= maxNewRepos) break;
                if (existingIds.has(`repo-${repo.id}`)) continue;

                console.log(` - Adding OpenClaw repository: ${repo.full_name}`);
                
                const wf = {
                    id: `repo-${repo.id}`,
                    title: repo.name,
                    tool: 'openclaw',
                    tags: repo.topics || [],
                    description: repo.description || 'OpenClaw Skill / Use-case Repository',
                    path: `openclaw/${repo.owner.login}-${repo.name}/`.toLowerCase(),
                    type: 'repo',
                    repoUrl: repo.html_url,
                    source: 'github-discovery'
                };

                discoveredWorkflows.push(wf);
                existingIds.add(wf.id);
                reposProcessed++;
            }
        } catch (error) {
            console.error(`Failed to fetch for query ${q}:`, error);
        }
    }

    if (discoveredWorkflows.length > 0) {
        const merged = [...existingWorkflows, ...discoveredWorkflows];
        await fs.writeJson(DATA_FILE, merged, { spaces: 2 });
        console.log(`Added ${discoveredWorkflows.length} new repositories to openclaw.json.`);
    } else {
        console.log('Discovery complete for OpenClaw. No new repos added.');
    }
}

updateOpenClawWorkflows().catch(console.error);
