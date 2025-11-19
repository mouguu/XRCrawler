document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    const scrapeBtn = document.getElementById('scrape-btn');
    const stopBtn = document.getElementById('stop-btn');
    const btnText = document.getElementById('btn-text');
    const btnIcon = document.getElementById('btn-icon');
    const loader = document.getElementById('loader');
    const statusArea = document.getElementById('status-area');
    const resultArea = document.getElementById('result-area');
    const downloadLink = document.getElementById('download-link');
    const resultStats = document.getElementById('result-stats');

    let currentTab = 'profile';
    let eventSource = null; // SSE connection for progress updates

    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active state from all tabs
            tabs.forEach(t => {
                t.classList.remove('tab-active');
                t.classList.add('tab-inactive');
            });

            // Hide all contents
            contents.forEach(c => c.classList.add('hidden'));

            // Activate clicked tab
            tab.classList.remove('tab-inactive');
            tab.classList.add('tab-active');

            const target = tab.dataset.tab;
            document.getElementById(`${target}-form`).classList.remove('hidden');
            currentTab = target;

            // Reset UI
            resultArea.classList.add('hidden');
            statusArea.innerHTML = '<p class="opacity-50">Waiting for command...</p>';
        });
    });

    // Scrape Action
    scrapeBtn.addEventListener('click', async () => {
        let input, limit, likes = false;
        let mergeResults = true;
        let deleteMerged = true;

        // Get data based on current tab
        if (currentTab === 'profile') {
            input = document.getElementById('profile-input').value;
            limit = document.getElementById('profile-limit').value;
            likes = document.getElementById('profile-likes').checked;
            mergeResults = document.getElementById('profile-merge').checked;
            deleteMerged = document.getElementById('profile-delete').checked;
        } else if (currentTab === 'thread') {
            input = document.getElementById('thread-input').value;
            limit = document.getElementById('thread-limit').value;
        } else if (currentTab === 'search') {
            input = document.getElementById('search-input').value;
            limit = document.getElementById('search-limit').value;
            mergeResults = document.getElementById('search-merge').checked;
            deleteMerged = document.getElementById('search-delete').checked;
        }

        if (!input) {
            logStatus('Please enter a valid input (username, URL, or query).', 'error');
            return;
        }

        const clearCache = document.getElementById('clear-cache')?.checked || false;

        console.log('[DEBUG] Clear cache checkbox:', {
            element: document.getElementById('clear-cache'),
            checked: document.getElementById('clear-cache')?.checked,
            clearCache: clearCache
        });

        // UI Loading State
        setLoading(true);
        resultArea.classList.add('hidden');
        logStatus('Initializing extraction sequence...', 'info');

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: currentTab,
                    input,
                    limit: parseInt(limit),
                    likes,
                    mergeResults,
                    deleteMerged,
                    clearCache
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success
                setLoading(false);
                resultArea.classList.remove('hidden');

                console.log('Scrape response:', data); // Debug log

                if (data.success && data.downloadUrl) {
                    logStatus('Extraction complete. Artifact ready.', 'success');
                    resultArea.classList.remove('hidden'); // Assuming resultSection refers to resultArea
                    resultStats.textContent = `Collected ${data.stats?.count || 0} fragments.`;

                    // Set the download link properly
                    downloadLink.href = data.downloadUrl;
                    downloadLink.onclick = (e) => {
                        e.preventDefault();
                        // Trigger actual download
                        window.location.href = data.downloadUrl;
                    };
                } else {
                    logStatus(data.error || 'Extraction done, but no file path returned.', 'warning');
                    console.error('Response missing downloadUrl:', data);
                }

                // Scroll to results
                document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

            } else {
                // Error
                throw new Error(data.error || 'Unknown error occurred');
            }

        } catch (error) {
            setLoading(false);
            logStatus(`Error: ${error.message}`, 'error');
        }
    });

    // Stop Action
    stopBtn.addEventListener('click', async () => {
        logStatus('Sending stop signal...', 'warning');

        try {
            const response = await fetch('/api/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.success) {
                logStatus('Stop signal sent. Waiting for scraper to finish current batch...', 'warning');
                stopBtn.disabled = true;
                stopBtn.textContent = 'Stopping...';
            } else {
                logStatus(data.message || 'No active scraping session', 'warning');
            }
        } catch (error) {
            logStatus(`Stop request failed: ${error.message}`, 'error');
        }
    });

    function setLoading(isLoading) {
        scrapeBtn.disabled = isLoading;
        if (isLoading) {
            btnText.textContent = 'Extracting...';
            btnIcon.classList.add('hidden');
            loader.classList.remove('hidden');
            stopBtn.classList.remove('hidden'); // Show stop button
            stopBtn.disabled = false;
            stopBtn.textContent = 'Stop';

            // Connect to SSE for progress updates
            if (!eventSource) {
                eventSource = new EventSource('/api/progress');

                eventSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);

                    if (data.type === 'progress') {
                        btnText.textContent = `Extracting... (${data.current}/${data.target})`;
                        logStatus(`Progress: ${data.current}/${data.target} tweets collected`, 'info');
                    }
                };

                eventSource.onerror = () => {
                    console.warn('SSE connection error, will retry automatically');
                };
            }
        } else {
            btnText.textContent = 'Begin Extraction';
            btnIcon.classList.remove('hidden');
            loader.classList.add('hidden');
            stopBtn.classList.add('hidden'); // Hide stop button

            // Close SSE connection
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
        }
    }

    function logStatus(message, type = 'info') {
        const p = document.createElement('p');
        p.textContent = `> ${message}`;
        p.className = 'font-mono text-sm mb-1';

        if (type === 'error') p.classList.add('text-red-400');
        else if (type === 'success') p.classList.add('text-green-400');
        else if (type === 'warning') p.classList.add('text-yellow-400');
        else p.classList.add('text-stone');

        // Clear "Waiting..." message if present
        if (statusArea.querySelector('.opacity-50')) {
            statusArea.innerHTML = '';
        }

        statusArea.appendChild(p);
        statusArea.scrollTop = statusArea.scrollHeight;
    }
});
