document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    const scrapeBtn = document.getElementById('scrape-btn');
    const btnText = scrapeBtn.querySelector('.btn-text');
    const loader = scrapeBtn.querySelector('.loader');
    const statusArea = document.getElementById('status-area');
    const resultArea = document.getElementById('result-area');
    const downloadLink = document.getElementById('download-link');

    let currentTab = 'profile';

    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(target).classList.add('active');
            currentTab = target;

            // Reset UI
            resultArea.classList.add('hidden');
            statusArea.classList.add('hidden');
        });
    });

    // Scrape Action
    scrapeBtn.addEventListener('click', async () => {
        let input, limit, likes = false;

        // Get data based on current tab
        if (currentTab === 'profile') {
            input = document.getElementById('profile-input').value;
            limit = document.getElementById('profile-limit').value;
            likes = document.getElementById('profile-likes').checked;
        } else if (currentTab === 'thread') {
            input = document.getElementById('thread-input').value;
            limit = document.getElementById('thread-limit').value;
        } else if (currentTab === 'search') {
            input = document.getElementById('search-input').value;
            limit = document.getElementById('search-limit').value;
        }

        if (!input) {
            alert('Please enter a valid input (username, URL, or query).');
            return;
        }

        // UI Loading State
        setLoading(true);
        resultArea.classList.add('hidden');
        statusArea.classList.remove('hidden');
        statusArea.querySelector('.status-text').textContent = 'Browser is running... This may take a minute.';

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: currentTab,
                    input,
                    limit,
                    likes,
                    mergeResults: document.getElementById(`${currentTab}-merge`)?.checked || false,
                    deleteMerged: document.getElementById(`${currentTab}-delete`)?.checked || false
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success
                statusArea.classList.add('hidden');
                resultArea.classList.remove('hidden');
                downloadLink.href = data.downloadUrl;
                resultArea.querySelector('p').textContent = `Successfully scraped ${data.stats.count} tweets!`;
            } else {
                // Error
                throw new Error(data.error || 'Unknown error occurred');
            }

        } catch (error) {
            statusArea.classList.remove('hidden');
            statusArea.querySelector('.status-text').textContent = `Error: ${error.message}`;
            statusArea.querySelector('.status-text').style.color = '#ff4444';
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        scrapeBtn.disabled = isLoading;
        if (isLoading) {
            btnText.textContent = 'Scraping...';
            loader.classList.remove('hidden');
        } else {
            btnText.textContent = 'Start Scraping';
            loader.classList.add('hidden');
        }
    }
});
