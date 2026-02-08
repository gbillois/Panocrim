// PanoCrim - Main Application Logic

let currentAnalysis = null;
let currentSynthesisContent = null;

// ==================== Navigation ====================

function navigateTo(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(`view-${viewName}`);
    const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);

    if (view) view.classList.add('active');
    if (btn) btn.classList.add('active');

    // Refresh data when navigating
    if (viewName === 'dashboard') refreshDashboard();
    if (viewName === 'database') refreshDatabase();
    if (viewName === 'synthesis') refreshSynthesisView();
    if (viewName === 'linkedin') refreshLinkedInView();
    if (viewName === 'settings') loadSettings();
}

// ==================== Dashboard ====================

async function refreshDashboard() {
    const stats = await getStats();

    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-month').textContent = stats.month;
    document.getElementById('stat-categories').textContent = stats.categories;
    document.getElementById('stat-pending').textContent = stats.pending;

    renderArticlesList(stats.recentArticles, 'recent-articles');
    renderCategoryBars(stats.categoryCount, stats.total);
}

// ==================== Add URL ====================

async function handleAddUrl(e) {
    e.preventDefault();
    const urlInput = document.getElementById('input-url');
    const notesInput = document.getElementById('input-notes');
    const url = urlInput.value.trim();
    const notes = notesInput.value.trim();

    if (!url) return;

    // Check API key
    if (!getApiKey()) {
        showToast('Configurez votre clé API dans Config.', 'error');
        return;
    }

    // Check duplicate
    const existing = await getArticleByUrl(url);
    if (existing) {
        showToast('Cet article est déjà dans la base.', 'error');
        return;
    }

    // Show analysis status
    const statusEl = document.getElementById('analysis-status');
    const resultEl = document.getElementById('analysis-result');
    const btnEl = document.getElementById('btn-analyze');
    const msgEl = document.getElementById('analysis-message');

    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btnEl.disabled = true;

    try {
        // Step 1: Fetch content
        msgEl.textContent = 'Récupération du contenu...';
        const content = await fetchArticleContent(url);

        // Step 2: Analyze with Claude
        msgEl.textContent = 'Analyse par Claude en cours...';
        const analysis = await analyzeArticle(url, content, notes);

        // Store analysis for saving
        currentAnalysis = { ...analysis, url, notes, raw_content: content || '' };

        // Show preview
        document.getElementById('analysis-content').innerHTML = renderAnalysisPreview(analysis);
        resultEl.classList.remove('hidden');
        showToast('Analyse terminée !', 'success');
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
        showToast('Article sauvegardé !', 'success');
        currentAnalysis = null;

        // Reset form
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
        showToast('Aucune URL valide trouvée.', 'error');
        return;
    }

    if (!getApiKey()) {
        showToast('Configurez votre clé API dans Config.', 'error');
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
            if (existing) {
                errors++;
                continue;
            }

            const content = await fetchArticleContent(url);
            const analysis = await analyzeArticle(url, content, '');
            await addArticle({ ...analysis, url, raw_content: content || '' });
            success++;
        } catch (err) {
            console.error(`Error analyzing ${url}:`, err);
            // Save as pending
            await addArticle({ url, status: 'error', notes: err.message });
            errors++;
        }

        // Small delay between API calls
        if (i < urls.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    textEl.textContent = `Terminé : ${success} analysés, ${errors} erreurs`;
    btnEl.disabled = false;
    textarea.value = '';
    showToast(`Lot terminé : ${success} articles ajoutés.`, 'success');
}

// ==================== Database ====================

async function refreshDatabase() {
    await populateMonthFilter();
    populateFilterSelects();

    const filters = {
        category: document.getElementById('filter-category').value,
        month: document.getElementById('filter-month').value,
        impact: document.getElementById('filter-impact').value,
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
        showToast('Article supprimé.', 'info');
    }
}

// ==================== Synthesis ====================

async function refreshSynthesisView() {
    populateFilterSelects();

    // Set default month to current
    const monthInput = document.getElementById('synth-month');
    if (!monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Render saved syntheses
    const syntheses = await getAllSyntheses();
    const container = document.getElementById('saved-syntheses');
    if (syntheses.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucune synthèse sauvegardée.</p>';
    } else {
        container.innerHTML = syntheses.map(renderSynthesisCard).join('');
    }
}

function handleSynthTypeChange() {
    const type = document.getElementById('synth-type').value;
    document.getElementById('synth-month-group').classList.toggle('hidden', type === 'category');
    document.getElementById('synth-category-group').classList.toggle('hidden', type !== 'category');
}

async function handleGenerateSynthesis() {
    const type = document.getElementById('synth-type').value;
    const statusEl = document.getElementById('synthesis-status');
    const resultEl = document.getElementById('synthesis-result');
    const btnEl = document.getElementById('btn-generate-synthesis');

    if (!getApiKey()) {
        showToast('Configurez votre clé API dans Config.', 'error');
        return;
    }

    let articles = [];
    let options = {};

    if (type === 'monthly') {
        const month = document.getElementById('synth-month').value;
        if (!month) {
            showToast('Sélectionnez un mois.', 'error');
            return;
        }
        const [year, mo] = month.split('-').map(Number);
        articles = await getArticlesByMonth(year, mo);
        options.period = new Date(year, mo - 1).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
    } else if (type === 'category') {
        const category = document.getElementById('synth-category').value;
        if (!category) {
            showToast('Sélectionnez une catégorie.', 'error');
            return;
        }
        articles = await getArticlesByCategory(category);
        options.category = category;
    } else {
        articles = await getAllArticles();
    }

    if (articles.length === 0) {
        showToast('Aucun article pour cette sélection.', 'error');
        return;
    }

    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btnEl.disabled = true;

    try {
        const content = await generateSynthesis(articles, type, options);
        currentSynthesisContent = { type, content, period: options.period || null, category: options.category || null };

        document.getElementById('synthesis-content').innerHTML = marked.parse(content);
        resultEl.classList.remove('hidden');
        showToast('Synthèse générée !', 'success');
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
        showToast('Synthèse sauvegardée !', 'success');
        refreshSynthesisView();
    } catch (err) {
        showToast(`Erreur : ${err.message}`, 'error');
    }
}

function copySynthesis() {
    if (!currentSynthesisContent) return;
    navigator.clipboard.writeText(currentSynthesisContent.content)
        .then(() => showToast('Copié !', 'success'))
        .catch(() => showToast('Erreur de copie.', 'error'));
}

async function showSynthesisDetail(id) {
    const syntheses = await getAllSyntheses();
    const s = syntheses.find(x => x.id === id);
    if (!s) return;

    const typeLabels = { monthly: 'Mensuelle', category: 'Catégorie', global: 'Globale' };
    document.getElementById('modal-body').innerHTML = `
        <h2>${typeLabels[s.type] || s.type}${s.period ? ` - ${s.period}` : ''}${s.category ? ` - ${CATEGORIES[s.category] || s.category}` : ''}</h2>
        <p style="color:var(--text-muted);margin-bottom:16px;">${s.date_generated?.split('T')[0]}</p>
        <div class="markdown-content">${marked.parse(s.content || '')}</div>
        <div class="detail-actions">
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(${JSON.stringify(JSON.stringify(s.content))}).then(()=>showToast('Copié !','success'))">Copier</button>
            <button class="btn btn-danger" onclick="deleteSynthesisAndClose(${s.id})">Supprimer</button>
        </div>
    `;
    document.getElementById('article-modal').classList.remove('hidden');
}

async function deleteSynthesisAndClose(id) {
    if (confirm('Supprimer cette synthèse ?')) {
        await deleteSynthesis(id);
        closeModal();
        refreshSynthesisView();
        showToast('Synthèse supprimée.', 'info');
    }
}

// ==================== LinkedIn ====================

async function refreshLinkedInView() {
    populateFilterSelects();
    await populateArticleSelect();
}

function handleLinkedInTypeChange() {
    const type = document.getElementById('linkedin-type').value;
    document.getElementById('linkedin-article-group').classList.toggle('hidden', type !== 'highlight');
    document.getElementById('linkedin-category-group').classList.toggle('hidden', type !== 'synthesis');
}

async function handleGenerateLinkedIn() {
    const type = document.getElementById('linkedin-type').value;
    const tone = document.getElementById('linkedin-tone').value;
    const language = document.getElementById('linkedin-language').value;
    const statusEl = document.getElementById('linkedin-status');
    const resultEl = document.getElementById('linkedin-result');
    const btnEl = document.getElementById('btn-generate-linkedin');

    if (!getApiKey()) {
        showToast('Configurez votre clé API dans Config.', 'error');
        return;
    }

    let options = { tone, language };

    if (type === 'highlight') {
        const articleId = parseInt(document.getElementById('linkedin-article').value);
        if (!articleId) {
            showToast('Sélectionnez un article.', 'error');
            return;
        }
        options.article = await getArticle(articleId);
    } else {
        const category = document.getElementById('linkedin-category').value;
        if (!category) {
            showToast('Sélectionnez une catégorie.', 'error');
            return;
        }
        options.category = category;
        options.articles = await getArticlesByCategory(category);
        if (options.articles.length === 0) {
            showToast('Aucun article dans cette catégorie.', 'error');
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
        showToast('Post généré !', 'success');
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
        .then(() => showToast('Post copié !', 'success'))
        .catch(() => showToast('Erreur de copie.', 'error'));
}

function regenerateLinkedIn() {
    handleGenerateLinkedIn();
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
    showToast('Paramètres sauvegardés.', 'success');
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
        showToast('Export téléchargé.', 'success');
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
        showToast('Import réussi !', 'success');
        refreshDashboard();
    } catch (err) {
        showToast(`Erreur d'import : ${err.message}`, 'error');
    }
    e.target.value = '';
}

async function handleClearDb() {
    if (confirm('Êtes-vous sûr de vouloir effacer toutes les données ? Cette action est irréversible.')) {
        await clearDatabase();
        showToast('Base de données effacée.', 'info');
        refreshDashboard();
    }
}

// ==================== Init ====================

document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    // Add URL form
    document.getElementById('add-url-form').addEventListener('submit', handleAddUrl);
    document.getElementById('btn-save-analysis').addEventListener('click', saveAnalysis);

    // Batch
    document.getElementById('batch-url-form').addEventListener('submit', handleBatchAnalyze);

    // Database filters
    ['filter-category', 'filter-month', 'filter-impact'].forEach(id => {
        document.getElementById(id).addEventListener('change', refreshDatabase);
    });
    document.getElementById('filter-search').addEventListener('input', debounce(refreshDatabase, 300));

    // Synthesis
    document.getElementById('synth-type').addEventListener('change', handleSynthTypeChange);
    document.getElementById('btn-generate-synthesis').addEventListener('click', handleGenerateSynthesis);
    document.getElementById('btn-copy-synthesis').addEventListener('click', copySynthesis);
    document.getElementById('btn-save-synthesis').addEventListener('click', saveSynthesis);

    // LinkedIn
    document.getElementById('linkedin-type').addEventListener('change', handleLinkedInTypeChange);
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

    // Populate selects
    populateFilterSelects();

    // Initial load
    refreshDashboard();

    // Check API key
    if (!getApiKey()) {
        showToast('Configurez votre clé API Anthropic dans Config.', 'info');
    }
});

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}
