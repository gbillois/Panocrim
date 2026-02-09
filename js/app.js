// PanoCrim - Main Application Logic
// Dynamic multi-dimensional taxonomy

let currentAnalysis = null;
let currentSynthesisContent = null;
let currentDashboardDimension = 'attack_type';

// ==================== Navigation ====================

function navigateTo(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(`view-${viewName}`);
    const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);

    if (view) view.classList.add('active');
    if (btn) btn.classList.add('active');

    if (viewName === 'dashboard') refreshDashboard();
    if (viewName === 'add') refreshAddView();
    if (viewName === 'database') refreshDatabase();
    if (viewName === 'synthesis') refreshSynthesisView();
    if (viewName === 'linkedin') refreshLinkedInView();
    if (viewName === 'settings') loadSettings();
}

// Click on a dimension badge to navigate to database filtered by that value
function filterByDimension(dimension, value) {
    // Close modal if open
    closeModal();

    navigateTo('database');

    // Set filters
    const dimSelect = document.getElementById('filter-dimension');
    const valSelect = document.getElementById('filter-dim-value');
    if (dimSelect) dimSelect.value = dimension;

    // Need to populate value select first, then set value
    updateDimensionValueSelect().then(() => {
        if (valSelect) valSelect.value = value;
        refreshDatabase();
    });
}

// ==================== Dashboard ====================

async function refreshDashboard() {
    const stats = await getStats();

    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-month').textContent = stats.month;
    document.getElementById('stat-tags').textContent = stats.tagsCount;
    document.getElementById('stat-pending').textContent = stats.pending;

    renderArticlesList(stats.recentArticles, 'recent-articles');

    // Update dimension chart
    const taxonomy = await buildTaxonomy();
    populateDashboardDimSelect(taxonomy);
    renderDimensionBars(taxonomy, currentDashboardDimension);
}

function populateDashboardDimSelect(taxonomy) {
    const el = document.getElementById('dashboard-dim-select');
    if (!el) return;
    const current = el.value || currentDashboardDimension;
    el.innerHTML = '';
    DIMENSION_KEYS.forEach(dim => {
        const count = Object.keys(taxonomy[dim]).length;
        if (count > 0) {
            el.innerHTML += `<option value="${dim}">${DIMENSIONS[dim].label}</option>`;
        }
    });
    el.value = current;
    currentDashboardDimension = el.value || 'attack_type';
}

function handleDashboardDimChange() {
    currentDashboardDimension = document.getElementById('dashboard-dim-select').value;
    buildTaxonomy().then(taxonomy => {
        renderDimensionBars(taxonomy, currentDashboardDimension);
    });
}

// ==================== Add URL ====================

async function handleAddUrl(e) {
    e.preventDefault();
    const urlInput = document.getElementById('input-url');
    const notesInput = document.getElementById('input-notes');
    const url = urlInput.value.trim();
    const notes = notesInput.value.trim();

    if (!url) return;
    if (!getApiKey()) {
        showToast('Configurez votre cl\u00e9 API dans Config.', 'error');
        return;
    }

    const existing = await getArticleByUrl(url);
    if (existing) {
        showToast('Cet article est d\u00e9j\u00e0 dans la base.', 'error');
        return;
    }

    const statusEl = document.getElementById('analysis-status');
    const resultEl = document.getElementById('analysis-result');
    const btnEl = document.getElementById('btn-analyze');
    const msgEl = document.getElementById('analysis-message');

    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btnEl.disabled = true;

    try {
        msgEl.textContent = 'R\u00e9cup\u00e9ration du contenu...';
        const content = await fetchArticleContent(url);

        msgEl.textContent = 'Analyse par Claude en cours...';
        const analysis = await analyzeArticle(url, content, notes);

        currentAnalysis = { ...analysis, url, notes, raw_content: content || '' };

        document.getElementById('analysis-content').innerHTML = renderAnalysisPreview(analysis);
        resultEl.classList.remove('hidden');
        showToast('Analyse termin\u00e9e !', 'success');
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        statusEl.classList.add('hidden');
        btnEl.disabled = false;
    }
}

async function saveAnalysis() {
    if (!currentAnalysis) return;
    try {
        await addArticle(currentAnalysis);
        showToast('Article sauvegard\u00e9 !', 'success');
        currentAnalysis = null;
        document.getElementById('add-url-form').reset();
        document.getElementById('analysis-result').classList.add('hidden');
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    }
}

async function handleBatchAnalyze(e) {
    e.preventDefault();
    const textarea = document.getElementById('input-batch-urls');
    const urls = textarea.value.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));

    if (urls.length === 0) {
        showToast('Aucune URL valide trouv\u00e9e.', 'error');
        return;
    }
    if (!getApiKey()) {
        showToast('Configurez votre cl\u00e9 API dans Config.', 'error');
        return;
    }

    const progressEl = document.getElementById('batch-progress');
    const fillEl = document.getElementById('batch-progress-fill');
    const textEl = document.getElementById('batch-progress-text');
    const btnEl = document.getElementById('btn-batch-analyze');

    progressEl.classList.remove('hidden');
    btnEl.disabled = true;

    let success = 0;
    let errors = 0;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const pct = ((i + 1) / urls.length) * 100;
        fillEl.style.width = `${pct}%`;
        textEl.textContent = `${i + 1}/${urls.length} - ${url.substring(0, 50)}...`;

        try {
            const existing = await getArticleByUrl(url);
            if (existing) { errors++; continue; }

            const content = await fetchArticleContent(url);
            const analysis = await analyzeArticle(url, content, '');
            await addArticle({ ...analysis, url, raw_content: content || '' });
            success++;
        } catch (err) {
            console.error(`Error analyzing ${url}:`, err);
            await addArticle({ url, status: 'error', notes: err.message, dimensions: {} });
            errors++;
        }

        if (i < urls.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    textEl.textContent = `Termin\u00e9 : ${success} analys\u00e9s, ${errors} erreurs`;
    btnEl.disabled = false;
    textarea.value = '';
    showToast(`Lot termin\u00e9 : ${success} articles ajout\u00e9s.`, 'success');
}

// ==================== Database ====================

async function refreshDatabase() {
    await populateMonthFilter();
    await populateDimensionFilterSelects();

    const dimSelect = document.getElementById('filter-dimension');
    const valSelect = document.getElementById('filter-dim-value');

    const filters = {
        dimension: dimSelect?.value || '',
        dimensionValue: valSelect?.value || '',
        month: document.getElementById('filter-month').value,
        impact: document.getElementById('filter-impact').value,
        origin: document.getElementById('filter-origin').value,
        search: document.getElementById('filter-search').value
    };

    const articles = await getArticlesByFilters(filters);
    renderArticlesList(articles, 'database-articles');
}

// ==================== Article Detail ====================

async function showArticleDetail(id) {
    const article = await getArticle(id);
    if (!article) return;
    document.getElementById('modal-body').innerHTML = renderArticleDetail(article);
    document.getElementById('article-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('article-modal').classList.add('hidden');
}

async function confirmDeleteArticle(id) {
    if (confirm('Supprimer cet article ?')) {
        await deleteArticle(id);
        closeModal();
        refreshDashboard();
        refreshDatabase();
        showToast('Article supprim\u00e9.', 'info');
    }
}

// ==================== Synthesis ====================

async function refreshSynthesisView() {
    await populateSynthDimensionSelects();

    const monthInput = document.getElementById('synth-month');
    if (!monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const syntheses = await getAllSyntheses();
    const container = document.getElementById('saved-syntheses');
    if (syntheses.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucune synth\u00e8se sauvegard\u00e9e.</p>';
    } else {
        container.innerHTML = syntheses.map(renderSynthesisCard).join('');
    }
}

function handleSynthTypeChange() {
    const type = document.getElementById('synth-type').value;
    document.getElementById('synth-month-group').classList.toggle('hidden', type !== 'monthly');
    document.getElementById('synth-dim-group').classList.toggle('hidden', type !== 'dimension');
}

async function handleGenerateSynthesis() {
    const type = document.getElementById('synth-type').value;
    const statusEl = document.getElementById('synthesis-status');
    const resultEl = document.getElementById('synthesis-result');
    const btnEl = document.getElementById('btn-generate-synthesis');

    if (!getApiKey()) {
        showToast('Configurez votre cl\u00e9 API dans Config.', 'error');
        return;
    }

    let articles = [];
    let options = {};

    if (type === 'monthly') {
        const month = document.getElementById('synth-month').value;
        if (!month) { showToast('S\u00e9lectionnez un mois.', 'error'); return; }
        const [year, mo] = month.split('-').map(Number);
        articles = await getArticlesByMonth(year, mo);
        options.period = new Date(year, mo - 1).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
    } else if (type === 'dimension') {
        const dim = document.getElementById('synth-dimension').value;
        const val = document.getElementById('synth-dim-value').value;
        if (!dim || !val) { showToast('S\u00e9lectionnez dimension et valeur.', 'error'); return; }
        articles = await getArticlesByDimensionValue(dim, val);
        options.dimension = dim;
        options.dimensionValue = val;
    } else {
        articles = await getAllArticles();
    }

    if (articles.length === 0) {
        showToast('Aucun article pour cette s\u00e9lection.', 'error');
        return;
    }

    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btnEl.disabled = true;

    try {
        const content = await generateSynthesis(articles, type, options);
        currentSynthesisContent = {
            type, content,
            period: options.period || null,
            dimension: options.dimension || null,
            dimensionValue: options.dimensionValue || null
        };

        document.getElementById('synthesis-content').innerHTML = marked.parse(content);
        resultEl.classList.remove('hidden');
        showToast('Synth\u00e8se g\u00e9n\u00e9r\u00e9e !', 'success');
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        statusEl.classList.add('hidden');
        btnEl.disabled = false;
    }
}

async function saveSynthesis() {
    if (!currentSynthesisContent) return;
    try {
        await addSynthesis(currentSynthesisContent);
        showToast('Synth\u00e8se sauvegard\u00e9e !', 'success');
        refreshSynthesisView();
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    }
}

function copySynthesis() {
    if (!currentSynthesisContent) return;
    navigator.clipboard.writeText(currentSynthesisContent.content)
        .then(() => showToast('Copi\u00e9 !', 'success'))
        .catch(() => showToast('Erreur de copie.', 'error'));
}

async function showSynthesisDetail(id) {
    const syntheses = await getAllSyntheses();
    const s = syntheses.find(x => x.id === id);
    if (!s) return;

    const typeLabels = { monthly: 'Mensuelle', dimension: 'Th\u00e9matique', global: 'Globale' };
    const title = `${typeLabels[s.type] || s.type}${s.period ? ' - ' + s.period : ''}${s.dimensionValue ? ' - ' + s.dimensionValue : ''}`;

    document.getElementById('modal-body').innerHTML = `
        <h2>${escapeHtml(title)}</h2>
        <p style="color:var(--text-muted);margin-bottom:16px;">${s.date_generated?.split('T')[0]}</p>
        <div class="markdown-content">${marked.parse(s.content || '')}</div>
        <div class="detail-actions">
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(${JSON.stringify(JSON.stringify(s.content))}).then(()=>showToast('Copi\u00e9 !','success'))">Copier</button>
            <button class="btn btn-danger" onclick="deleteSynthesisAndClose(${s.id})">Supprimer</button>
        </div>
    `;
    document.getElementById('article-modal').classList.remove('hidden');
}

async function deleteSynthesisAndClose(id) {
    if (confirm('Supprimer cette synth\u00e8se ?')) {
        await deleteSynthesis(id);
        closeModal();
        refreshSynthesisView();
        showToast('Synth\u00e8se supprim\u00e9e.', 'info');
    }
}

// ==================== LinkedIn ====================

async function refreshLinkedInView() {
    await populateSynthDimensionSelects();
    await populateArticleSelect();
}

function handleLinkedInTypeChange() {
    const type = document.getElementById('linkedin-type').value;
    document.getElementById('linkedin-article-group').classList.toggle('hidden', type !== 'highlight');
    document.getElementById('linkedin-dim-group').classList.toggle('hidden', type !== 'synthesis');
}

async function handleGenerateLinkedIn() {
    const type = document.getElementById('linkedin-type').value;
    const tone = document.getElementById('linkedin-tone').value;
    const language = document.getElementById('linkedin-language').value;
    const statusEl = document.getElementById('linkedin-status');
    const resultEl = document.getElementById('linkedin-result');
    const btnEl = document.getElementById('btn-generate-linkedin');

    if (!getApiKey()) {
        showToast('Configurez votre cl\u00e9 API dans Config.', 'error');
        return;
    }

    let options = { tone, language };

    if (type === 'highlight') {
        const articleId = parseInt(document.getElementById('linkedin-article').value);
        if (!articleId) { showToast('S\u00e9lectionnez un article.', 'error'); return; }
        options.article = await getArticle(articleId);
    } else {
        const dim = document.getElementById('linkedin-dimension').value;
        const val = document.getElementById('linkedin-dim-value').value;
        if (!dim || !val) { showToast('S\u00e9lectionnez dimension et valeur.', 'error'); return; }
        options.dimension = dim;
        options.dimensionValue = val;
        options.articles = await getArticlesByDimensionValue(dim, val);
        if (options.articles.length === 0) {
            showToast('Aucun article pour cette s\u00e9lection.', 'error');
            return;
        }
    }

    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btnEl.disabled = true;

    try {
        const post = await generateLinkedInPost(type, options);
        document.getElementById('linkedin-preview').textContent = post;
        document.getElementById('linkedin-chars').textContent = post.length;
        resultEl.classList.remove('hidden');
        showToast('Post g\u00e9n\u00e9r\u00e9 !', 'success');
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        statusEl.classList.add('hidden');
        btnEl.disabled = false;
    }
}

function copyLinkedInPost() {
    const text = document.getElementById('linkedin-preview').textContent;
    navigator.clipboard.writeText(text)
        .then(() => showToast('Post copi\u00e9 !', 'success'))
        .catch(() => showToast('Erreur de copie.', 'error'));
}

function regenerateLinkedIn() {
    handleGenerateLinkedIn();
}

// ==================== RSS Feeds ====================

async function refreshAddView() {
    await renderFeedsList();
    updateLastCheckDisplay();
}

async function handleAddFeed(e) {
    e.preventDefault();
    const urlInput = document.getElementById('input-feed-url');
    const nameInput = document.getElementById('input-feed-name');
    const url = urlInput.value.trim();
    const name = nameInput.value.trim();

    if (!url) return;

    const existing = await getFeedByUrl(url);
    if (existing) {
        showToast('Ce flux est déjà configuré.', 'error');
        return;
    }

    const btnEl = document.getElementById('btn-add-feed');
    btnEl.disabled = true;

    try {
        // Validate the feed by fetching it
        const { feedName } = await fetchRSSFeed(url);
        const finalName = name || feedName || new URL(url).hostname;

        await addFeed({ url, name: finalName });
        showToast(`Flux "${finalName}" ajouté !`, 'success');

        urlInput.value = '';
        nameInput.value = '';
        await renderFeedsList();
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        btnEl.disabled = false;
    }
}

async function handleToggleFeed(feedId, enabled) {
    await updateFeed(feedId, { enabled });
    showToast(enabled ? 'Flux activé.' : 'Flux désactivé.', 'info');
}

async function handleDeleteFeed(feedId) {
    if (!confirm('Supprimer ce flux ? Les articles déjà importés seront conservés.')) return;
    await deleteFeed(feedId);
    showToast('Flux supprimé.', 'info');
    await renderFeedsList();
}

async function handleCheckSingleFeed(feedId) {
    const statusEl = document.getElementById('rss-status');
    const textEl = document.getElementById('rss-status-text');

    statusEl.classList.remove('hidden');
    textEl.textContent = 'Vérification du flux...';

    try {
        const feeds = await getAllFeeds();
        const feed = feeds.find(f => f.id === feedId);
        if (!feed) throw new Error('Flux introuvable.');

        const added = await processNewFeedArticles(feed);
        showToast(`${added} nouvel(s) article(s) importé(s).`, 'success');
        await renderFeedsList();
        updateLastCheckDisplay();
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        statusEl.classList.add('hidden');
    }
}

async function handleCheckAllFeeds() {
    const statusEl = document.getElementById('rss-status');
    const textEl = document.getElementById('rss-status-text');
    const btnEl = document.getElementById('btn-check-feeds');

    statusEl.classList.remove('hidden');
    textEl.textContent = 'Vérification de tous les flux...';
    btnEl.disabled = true;

    try {
        const result = await checkAllFeeds();
        showToast(`${result.totalAdded} article(s) importé(s) depuis ${result.feedsChecked} flux.`, 'success');
        await renderFeedsList();
        updateLastCheckDisplay();
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        statusEl.classList.add('hidden');
        btnEl.disabled = false;
    }
}

async function handleAnalyzePending() {
    if (!getApiKey()) {
        showToast('Configurez votre clé API dans Config.', 'error');
        return;
    }

    const statusEl = document.getElementById('rss-status');
    const textEl = document.getElementById('rss-status-text');
    const btnEl = document.getElementById('btn-analyze-pending');

    statusEl.classList.remove('hidden');
    btnEl.disabled = true;

    try {
        const result = await analyzePendingArticles((current, total, title) => {
            textEl.textContent = `Analyse ${current}/${total} : ${(title || '').substring(0, 40)}...`;
        });
        showToast(`${result.analyzed} article(s) analysé(s), ${result.errors} erreur(s).`, 'success');
        await renderFeedsList();
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    } finally {
        statusEl.classList.add('hidden');
        btnEl.disabled = false;
    }
}

// ==================== Settings ====================

function loadSettings() {
    document.getElementById('setting-api-key').value = getApiKey();
    document.getElementById('setting-model').value = getModel();
}

function handleSaveSettings() {
    const apiKey = document.getElementById('setting-api-key').value.trim();
    const model = document.getElementById('setting-model').value;
    setApiKey(apiKey);
    setModel(model);
    showToast('Param\u00e8tres sauvegard\u00e9s.', 'success');
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('setting-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleExportDb() {
    try {
        const json = await exportDatabase();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `panocrim-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Export t\u00e9l\u00e9charg\u00e9.', 'success');
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    }
}

function handleImportDb() {
    document.getElementById('import-file').click();
}

async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        await importDatabase(text);
        showToast('Import r\u00e9ussi !', 'success');
        refreshDashboard();
    } catch (err) {
        showToast(`Erreur d'import : ${err.message}`, 'error');
    }
    e.target.value = '';
}

async function handleClearDb() {
    if (confirm('\u00cates-vous s\u00fbr de vouloir effacer toutes les donn\u00e9es ? Cette action est irr\u00e9versible.')) {
        await clearDatabase();
        showToast('Base de donn\u00e9es effac\u00e9e.', 'info');
        refreshDashboard();
    }
}

// ==================== Init ====================

document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    // Add URL
    document.getElementById('add-url-form').addEventListener('submit', handleAddUrl);
    document.getElementById('btn-save-analysis').addEventListener('click', saveAnalysis);
    document.getElementById('batch-url-form').addEventListener('submit', handleBatchAnalyze);

    // RSS feeds
    document.getElementById('add-feed-form').addEventListener('submit', handleAddFeed);
    document.getElementById('btn-check-feeds').addEventListener('click', handleCheckAllFeeds);
    document.getElementById('btn-analyze-pending').addEventListener('click', handleAnalyzePending);

    // Database filters
    document.getElementById('filter-dimension').addEventListener('change', async () => {
        await updateDimensionValueSelect();
        refreshDatabase();
    });
    document.getElementById('filter-dim-value').addEventListener('change', refreshDatabase);
    document.getElementById('filter-month').addEventListener('change', refreshDatabase);
    document.getElementById('filter-impact').addEventListener('change', refreshDatabase);
    document.getElementById('filter-origin').addEventListener('change', refreshDatabase);
    document.getElementById('filter-search').addEventListener('input', debounce(refreshDatabase, 300));

    // Dashboard dimension selector
    document.getElementById('dashboard-dim-select').addEventListener('change', handleDashboardDimChange);

    // Synthesis
    document.getElementById('synth-type').addEventListener('change', handleSynthTypeChange);
    document.getElementById('synth-dimension').addEventListener('change', () => updateSynthValueSelect('synth-dimension', 'synth-dim-value'));
    document.getElementById('btn-generate-synthesis').addEventListener('click', handleGenerateSynthesis);
    document.getElementById('btn-copy-synthesis').addEventListener('click', copySynthesis);
    document.getElementById('btn-save-synthesis').addEventListener('click', saveSynthesis);

    // LinkedIn
    document.getElementById('linkedin-type').addEventListener('change', handleLinkedInTypeChange);
    document.getElementById('linkedin-dimension').addEventListener('change', () => updateSynthValueSelect('linkedin-dimension', 'linkedin-dim-value'));
    document.getElementById('btn-generate-linkedin').addEventListener('click', handleGenerateLinkedIn);
    document.getElementById('btn-copy-linkedin').addEventListener('click', copyLinkedInPost);
    document.getElementById('btn-regenerate-linkedin').addEventListener('click', regenerateLinkedIn);

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
    document.getElementById('toggle-api-key').addEventListener('click', toggleApiKeyVisibility);
    document.getElementById('btn-export-db').addEventListener('click', handleExportDb);
    document.getElementById('btn-import-db').addEventListener('click', handleImportDb);
    document.getElementById('import-file').addEventListener('change', handleImportFile);
    document.getElementById('btn-clear-db').addEventListener('click', handleClearDb);

    // Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('article-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Initial load
    refreshDashboard();

    // Start RSS auto-refresh (12h interval)
    getAllFeeds().then(feeds => {
        if (feeds.length > 0) startAutoRefresh();
    });

    if (!getApiKey()) {
        showToast('Configurez votre cl\u00e9 API Gemini dans Config.', 'info');
    }
});

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}
