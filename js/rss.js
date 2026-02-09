// PanoCrim - RSS Feed Management
// Fetch, parse and auto-import articles from RSS/Atom feeds

const RSS_REFRESH_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
let rssRefreshTimer = null;

// ==================== RSS/Atom Parsing ====================

async function fetchRSSFeed(feedUrl) {
    const proxiedUrl = CORS_PROXY + encodeURIComponent(feedUrl);
    try {
        const response = await fetch(proxiedUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return parseRSSXml(text, feedUrl);
    } catch (e) {
        console.warn('RSS fetch via proxy failed, trying direct:', e.message);
        try {
            const response = await fetch(feedUrl, { mode: 'cors', signal: AbortSignal.timeout(10000) });
            const text = await response.text();
            return parseRSSXml(text, feedUrl);
        } catch (e2) {
            throw new Error(`Impossible de récupérer le flux : ${e2.message}`);
        }
    }
}

function parseRSSXml(xmlText, feedUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('XML invalide : impossible de parser le flux RSS.');
    }

    const items = [];
    let feedName = '';

    // Try RSS 2.0 format
    const channel = doc.querySelector('channel');
    if (channel) {
        feedName = channel.querySelector('title')?.textContent || '';
        channel.querySelectorAll('item').forEach(item => {
            items.push(parseRSSItem(item));
        });
    }

    // Try Atom format
    if (items.length === 0) {
        const feed = doc.querySelector('feed');
        if (feed) {
            feedName = feed.querySelector('title')?.textContent || '';
            feed.querySelectorAll('entry').forEach(entry => {
                items.push(parseAtomEntry(entry));
            });
        }
    }

    if (items.length === 0) {
        throw new Error('Aucun article trouvé dans le flux.');
    }

    return { feedName, items };
}

function parseRSSItem(item) {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const description = item.querySelector('description')?.textContent || '';
    const creator = item.querySelector('dc\\:creator, creator')?.textContent || '';

    let dateStr = null;
    if (pubDate) {
        try { dateStr = new Date(pubDate).toISOString().split('T')[0]; } catch (e) {}
    }

    return {
        title: title.trim(),
        url: link.trim(),
        date_published: dateStr,
        description: stripHtml(description).substring(0, 500),
        author: creator.trim()
    };
}

function parseAtomEntry(entry) {
    const title = entry.querySelector('title')?.textContent || '';
    const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector('link');
    const link = linkEl?.getAttribute('href') || '';
    const published = entry.querySelector('published')?.textContent || entry.querySelector('updated')?.textContent || '';
    const summary = entry.querySelector('summary')?.textContent || entry.querySelector('content')?.textContent || '';
    const author = entry.querySelector('author name')?.textContent || '';

    let dateStr = null;
    if (published) {
        try { dateStr = new Date(published).toISOString().split('T')[0]; } catch (e) {}
    }

    return {
        title: title.trim(),
        url: link.trim(),
        date_published: dateStr,
        description: stripHtml(summary).substring(0, 500),
        author: author.trim()
    };
}

function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
}

// ==================== Feed Processing ====================

async function processNewFeedArticles(feed) {
    const { items } = await fetchRSSFeed(feed.url);
    let added = 0;

    for (const item of items) {
        if (!item.url) continue;

        const existing = await getArticleByUrl(item.url);
        if (existing) continue;

        // Add as pending (not yet analyzed)
        await addArticle({
            url: item.url,
            title: item.title,
            source: feed.name || '',
            date_published: item.date_published,
            summary_fr: item.description,
            dimensions: {},
            status: 'pending',
            origin: 'rss',
            feed_id: feed.id,
            notes: item.author ? `Auteur : ${item.author}` : ''
        });
        added++;
    }

    // Update feed last_checked
    await updateFeed(feed.id, { last_checked: new Date().toISOString() });

    return added;
}

async function checkAllFeeds() {
    const feeds = await getAllFeeds();
    const enabledFeeds = feeds.filter(f => f.enabled);
    let totalAdded = 0;
    let errors = 0;

    for (const feed of enabledFeeds) {
        try {
            const added = await processNewFeedArticles(feed);
            totalAdded += added;
        } catch (err) {
            console.error(`Erreur flux ${feed.name || feed.url}:`, err);
            errors++;
        }
    }

    localStorage.setItem('panocrim_last_rss_check', new Date().toISOString());
    return { totalAdded, errors, feedsChecked: enabledFeeds.length };
}

// ==================== Auto-analyze pending RSS articles ====================

async function analyzePendingArticles(progressCallback) {
    const all = await getAllArticles();
    const pending = all.filter(a => a.status === 'pending');

    if (pending.length === 0) return { analyzed: 0, errors: 0 };
    if (!getApiKey()) throw new Error('Clé API non configurée.');

    let analyzed = 0;
    let errors = 0;

    for (let i = 0; i < pending.length; i++) {
        const article = pending[i];
        if (progressCallback) progressCallback(i + 1, pending.length, article.title || article.url);

        try {
            const content = await fetchArticleContent(article.url);
            const analysis = await analyzeArticle(article.url, content, article.notes || '');

            await updateArticle(article.id, {
                title: analysis.title || article.title,
                source: analysis.source || article.source,
                date_published: analysis.date_published || article.date_published,
                dimensions: analysis.dimensions || {},
                impact: analysis.impact || 'moyen',
                summary_fr: analysis.summary_fr || article.summary_fr || '',
                summary_en: analysis.summary_en || '',
                key_facts: analysis.key_facts || [],
                technical_details: analysis.technical_details || '',
                recommendations: analysis.recommendations || '',
                raw_content: content || '',
                status: 'analyzed'
            });
            analyzed++;
        } catch (err) {
            console.error(`Erreur analyse ${article.url}:`, err);
            await updateArticle(article.id, { status: 'error', notes: (article.notes || '') + '\nErreur: ' + err.message });
            errors++;
        }

        // Rate limiting
        if (i < pending.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    return { analyzed, errors };
}

// ==================== Auto-refresh Timer ====================

function startAutoRefresh() {
    stopAutoRefresh();

    // Check if enough time has passed since last check
    const lastCheck = localStorage.getItem('panocrim_last_rss_check');
    if (lastCheck) {
        const elapsed = Date.now() - new Date(lastCheck).getTime();
        if (elapsed < RSS_REFRESH_INTERVAL) {
            // Schedule next check for remaining time
            const remaining = RSS_REFRESH_INTERVAL - elapsed;
            rssRefreshTimer = setTimeout(() => {
                doAutoRefresh();
                rssRefreshTimer = setInterval(doAutoRefresh, RSS_REFRESH_INTERVAL);
            }, remaining);
            return;
        }
    }

    // Do immediate check, then schedule every 12h
    doAutoRefresh();
    rssRefreshTimer = setInterval(doAutoRefresh, RSS_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (rssRefreshTimer) {
        clearInterval(rssRefreshTimer);
        clearTimeout(rssRefreshTimer);
        rssRefreshTimer = null;
    }
}

async function doAutoRefresh() {
    try {
        const feeds = await getAllFeeds();
        if (feeds.filter(f => f.enabled).length === 0) return;

        console.log('[PanoCrim] Auto-refresh RSS...');
        const result = await checkAllFeeds();
        if (result.totalAdded > 0) {
            showToast(`RSS : ${result.totalAdded} nouveaux articles importés.`, 'success');
        }
    } catch (err) {
        console.error('[PanoCrim] Auto-refresh error:', err);
    }
}

function getLastRSSCheck() {
    return localStorage.getItem('panocrim_last_rss_check') || null;
}
