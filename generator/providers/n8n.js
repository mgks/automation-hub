// generator/providers/n8n.js
const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/n8n.json');

/**
 * Updates the n8n.json index with new workflows discovered from GitHub.
 */
async function updateN8nWorkflows() {
    console.log('Searching GitHub for new n8n workflows...');
    
    // 1. Read existing workflows to avoid duplicates
    let existingWorkflows = [];
    if (await fs.pathExists(DATA_FILE)) {
        existingWorkflows = await fs.readJson(DATA_FILE);
    }
    const existingIds = new Set(existingWorkflows.map(wf => wf.id));

    // 2. Discover new workflows via GitHub API
    const queries = ['n8n+workflows', 'topic:n8n-workflow'];
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

                console.log(` - Adding repository: ${repo.full_name}`);
                
                const wf = {
                    id: `repo-${repo.id}`,
                    title: repo.name,
                    tool: 'n8n',
                    tags: repo.topics || [],
                    description: repo.description || 'n8n Workflow Repository',
                    path: `n8n/${repo.owner.login}-${repo.name}/`.toLowerCase(),
                    type: 'repo', // DIFFERENTIATION
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

    // 3. Merge and Save
    if (discoveredWorkflows.length > 0) {
        const merged = [...existingWorkflows, ...discoveredWorkflows];
        await fs.writeJson(DATA_FILE, merged, { spaces: 2 });
        console.log(`Added ${discoveredWorkflows.length} new workflows to n8n.json.`);
    } else {
        console.log('Discovery complete. No new workflows were found or added.');
    }
}

updateN8nWorkflows().catch(console.error);
