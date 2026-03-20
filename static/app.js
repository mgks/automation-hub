document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing script.");

    // --- Theme Switcher ---
    const themeSwitcher = document.getElementById('theme-switcher');
    if (themeSwitcher) {
        const html = document.documentElement;
        themeSwitcher.addEventListener('click', () => {
            const newTheme = html.className === 'dark' ? 'light' : 'dark';
            html.className = newTheme;
            localStorage.setItem('theme', newTheme);
        });
    }

    // --- Tool Shuffling (Homepage only) ---
    const toolsContainer = document.getElementById('toolsContainer');
    if (toolsContainer) {
        const tools = Array.from(toolsContainer.children);
        for (let i = tools.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tools[i], tools[j]] = [tools[j], tools[i]];
        }
        tools.forEach(tool => toolsContainer.appendChild(tool));
    }

    // --- UNIVERSAL SEARCH LOGIC ---
    const searchInput = document.getElementById('searchInput');
    const pageContent = document.getElementById('pageContent'); // The main content of any page
    const resultsContainer = document.getElementById('resultsContainer'); // The dedicated results div
    let fuse;

    if (!searchInput || !pageContent || !resultsContainer) {
        console.error("Search components not found. Exiting search script.");
        return;
    }

    console.log("Search components found. Fetching search index...");
    fetch('/index.json')
        .then(res => res.json())
        .then(data => {
            fuse = new Fuse(data, {
                keys: ['title', 'tool', 'tags'],
                threshold: 0.4
            });
            console.log("Search index loaded successfully.", fuse);

            // Now that the index is loaded, attach the search listener
            searchInput.addEventListener('input', handleSearch);

            // Check for a URL query and trigger a search if present
            const urlParams = new URLSearchParams(window.location.search);
            const query = urlParams.get('q');
            if (query) {
                searchInput.value = query;
                handleSearch({ target: { value: query } }); // Simulate an input event
            }
        })
        .catch(error => console.error("Failed to load search index:", error));

    function handleSearch(e) {
        const query = e.target.value.trim();
        console.log(`Search triggered with query: "${query}"`);

        // --- This is the core logic ---
        // If there's a query, show results and hide page content.
        // If the query is empty, hide results and show page content.
        if (query.length > 0) {
            pageContent.style.display = 'none';
            resultsContainer.style.display = 'block';
        } else {
            pageContent.style.display = 'block';
            resultsContainer.style.display = 'none';
        }

        // Don't search for very short strings
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        if (!fuse) {
            console.warn("Fuse index not ready yet.");
            return;
        }

        const results = fuse.search(query).slice(0, 30);
        console.log(`Found ${results.length} results.`);
        displayResults(results.map(r => r.item));
    }

    function displayResults(items) {
        resultsContainer.innerHTML = items.map(item => {
            const toolPill = `<a href="/workflow/${item.tool}/" class="pill pill-tool">${item.tool}</a>`;
            const tagsHTML = item.tags.slice(0, 4).map(tag => `<span class="pill pill-tag">${tag}</span>`).join('');
            
            // Trim the description for the card view
            const trimmedDescription = item.description.length > 120 
                ? item.description.substring(0, 120) + '...' 
                : item.description;

            // --- THIS HTML NOW MIRRORS THE SERVER-SIDE FUNCTION ---
            return `
                <div class="list-item">
                    <div class="item-content">
                        <h3><a href="/${item.path}">${item.title}</a></h3>
                        <p class="item-description">${trimmedDescription}</p>
                        <div class="pills-container">${toolPill}${tagsHTML}</div>
                    </div>
                    </div>`;
        }).join('');
    }

    // --- NEW: SHARE FUNCTIONALITY (Workflow Detail Page) ---
    const shareContainer = document.getElementById('shareContainer');
    if (shareContainer) {
        const shareButton = document.getElementById('share-button');
        const shareButtonText = document.getElementById('share-button-text');
        const copyLinkButton = document.getElementById('copy-link-button');

        // Populate dynamic share links
        const pageUrl = window.location.href;
        const pageTitle = document.title;
        const encodedUrl = encodeURIComponent(pageUrl);
        const encodedTitle = encodeURIComponent(pageTitle);

        document.getElementById('share-twitter').href = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
        document.getElementById('share-linkedin').href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

        // Toggle visibility of share options
        shareButton.addEventListener('click', (e) => {
            e.stopPropagation();
            shareContainer.classList.toggle('active');
        });

        // Hide options when clicking anywhere else
        document.addEventListener('click', () => {
            shareContainer.classList.remove('active');
        });

        // Copy link to clipboard
        copyLinkButton.addEventListener('click', () => {
            navigator.clipboard.writeText(pageUrl).then(() => {
                const originalText = shareButtonText.textContent;
                shareButtonText.textContent = 'Copied!';
                setTimeout(() => {
                    shareButtonText.textContent = originalText;
                    shareContainer.classList.remove('active');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
    }
});