// PanoCrim - UI Rendering Functions

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-16px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function renderArticleCard(article) {
    const categoryLabel = CATEGORIES[article.category] || article.category;
    const dateStr = article.date_published || article.date_added?.split('T')[0] || '';

    return `
        <div class="article-card" data-id="${article.id}" onclick="showArticleDetail(${article.id})">
            <div class="article-card-header">
                <span class="article-card-title">${escapeHtml(article.title || 'Sans titre')}</span>
            </div>
            <div class="article-card-meta">
                <span class="badge badge-category">${escapeHtml(categoryLabel)}</span>
                <span class="badge badge-impact-${article.impact}">${article.impact || '?'}</span>
                ${article.source ? `<span>${escapeHtml(article.source)}</span>` : ''}
                <span>${dateStr}</span>
            </div>
            ${article.summary_fr ? `<div class="article-card-summary">${escapeHtml(article.summary_fr)}</div>` : ''}
        </div>
    `;
}

function renderArticlesList(articles, containerId) {
    const container = document.getElementById(containerId);
    if (articles.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucun article trouvé.</p>';
        return;
    }
    container.innerHTML = articles.map(renderArticleCard).join('');
}

function renderAnalysisPreview(data) {
    const categoryLabel = CATEGORIES[data.category] || data.category;
    return `
        <div class="analysis-field">
            <div class="analysis-field-label">Titre</div>
            <div class="analysis-field-value">${escapeHtml(data.title || '')}</div>
        </div>
        <div class="analysis-field">
            <div class="analysis-field-label">Source</div>
            <div class="analysis-field-value">${escapeHtml(data.source || '')}</div>
        </div>
        <div class="analysis-field">
            <div class="analysis-field-label">Catégorie</div>
            <div class="analysis-field-value"><span class="badge badge-category">${escapeHtml(categoryLabel)}</span></div>
        </div>
        <div class="analysis-field">
            <div class="analysis-field-label">Impact</div>
            <div class="analysis-field-value"><span class="badge badge-impact-${data.impact}">${data.impact || '?'}</span></div>
        </div>
        <div class="analysis-field">
            <div class="analysis-field-label">Résumé</div>
            <div class="analysis-field-value">${escapeHtml(data.summary_fr || '')}</div>
        </div>
        ${data.threat_actors?.length ? `
        <div class="analysis-field">
            <div class="analysis-field-label">Acteurs de la menace</div>
            <div class="tags-list">${data.threat_actors.map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('')}</div>
        </div>` : ''}
        ${data.key_facts?.length ? `
        <div class="analysis-field">
            <div class="analysis-field-label">Faits clés</div>
            <div class="analysis-field-value">${data.key_facts.map(f => `<div>• ${escapeHtml(f)}</div>`).join('')}</div>
        </div>` : ''}
        ${data.tags?.length ? `
        <div class="analysis-field">
            <div class="analysis-field-label">Tags</div>
            <div class="tags-list">${data.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>` : ''}
    `;
}

function renderArticleDetail(article) {
    const categoryLabel = CATEGORIES[article.category] || article.category;
    return `
        <h2 style="margin-bottom:8px;">${escapeHtml(article.title || 'Sans titre')}</h2>
        <div class="article-card-meta" style="margin-bottom:16px;">
            <span class="badge badge-category">${escapeHtml(categoryLabel)}</span>
            <span class="badge badge-impact-${article.impact}">${article.impact}</span>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">Informations</div>
            <div class="detail-row"><span class="detail-label">Source</span><span class="detail-value">${escapeHtml(article.source || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">Date publication</span><span class="detail-value">${article.date_published || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Date ajout</span><span class="detail-value">${article.date_added?.split('T')[0] || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Sous-catégorie</span><span class="detail-value">${escapeHtml(article.subcategory || '-')}</span></div>
            <div class="detail-row">
                <span class="detail-label">URL</span>
                <span class="detail-value"><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all;">${escapeHtml(article.url)}</a></span>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">Résumé FR</div>
            <div class="detail-text">${escapeHtml(article.summary_fr || '-')}</div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">Résumé EN</div>
            <div class="detail-text">${escapeHtml(article.summary_en || '-')}</div>
        </div>

        ${article.key_facts?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Faits clés</div>
            <div class="detail-text">${article.key_facts.map(f => `<div>• ${escapeHtml(f)}</div>`).join('')}</div>
        </div>` : ''}

        ${article.threat_actors?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Acteurs de la menace</div>
            <div class="tags-list">${article.threat_actors.map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('')}</div>
        </div>` : ''}

        ${article.victims?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Victimes</div>
            <div class="tags-list">${article.victims.map(v => `<span class="tag">${escapeHtml(v)}</span>`).join('')}</div>
        </div>` : ''}

        ${article.countries?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Pays concernés</div>
            <div class="tags-list">${article.countries.map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>
        </div>` : ''}

        ${article.sectors?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Secteurs</div>
            <div class="tags-list">${article.sectors.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
        </div>` : ''}

        ${article.tags?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Tags</div>
            <div class="tags-list">${article.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>` : ''}

        ${article.technical_details ? `
        <div class="detail-section">
            <div class="detail-section-title">Détails techniques</div>
            <div class="detail-text">${escapeHtml(article.technical_details)}</div>
        </div>` : ''}

        ${article.recommendations ? `
        <div class="detail-section">
            <div class="detail-section-title">Recommandations</div>
            <div class="detail-text">${escapeHtml(article.recommendations)}</div>
        </div>` : ''}

        ${article.notes ? `
        <div class="detail-section">
            <div class="detail-section-title">Notes</div>
            <div class="detail-text">${escapeHtml(article.notes)}</div>
        </div>` : ''}

        <div class="detail-actions">
            <button class="btn btn-secondary" onclick="window.open('${escapeHtml(article.url)}', '_blank')">Ouvrir l'article</button>
            <button class="btn btn-danger" onclick="confirmDeleteArticle(${article.id})">Supprimer</button>
        </div>
    `;
}

function renderCategoryBars(categoryCount, total) {
    const container = document.getElementById('category-chart');
    if (total === 0) {
        container.innerHTML = '<p class="empty-state">Aucune donnée.</p>';
        return;
    }

    const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
    const maxCount = sorted[0]?.[1] || 1;

    container.innerHTML = sorted.map(([cat, count]) => {
        const label = CATEGORIES[cat] || cat;
        const pct = (count / maxCount) * 100;
        return `
            <div class="cat-bar-row">
                <span class="cat-bar-label">${escapeHtml(label)}</span>
                <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
                <span class="cat-bar-count">${count}</span>
            </div>
        `;
    }).join('');
}

function renderSynthesisCard(synthesis) {
    const typeLabels = { monthly: 'Mensuelle', category: 'Catégorie', global: 'Globale' };
    const label = typeLabels[synthesis.type] || synthesis.type;
    const date = synthesis.date_generated?.split('T')[0] || '';
    const preview = synthesis.content?.substring(0, 120) || '';

    return `
        <div class="synthesis-card" onclick="showSynthesisDetail(${synthesis.id})">
            <div class="synthesis-card-header">
                <span class="synthesis-card-title">${escapeHtml(label)}${synthesis.period ? ` - ${synthesis.period}` : ''}${synthesis.category ? ` - ${CATEGORIES[synthesis.category] || synthesis.category}` : ''}</span>
                <span class="synthesis-card-date">${date}</span>
            </div>
            <div class="synthesis-card-preview">${escapeHtml(preview)}...</div>
        </div>
    `;
}

function populateFilterSelects() {
    // Category filters
    const categorySelects = ['filter-category', 'synth-category', 'linkedin-category'];
    categorySelects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        const firstOption = el.querySelector('option')?.outerHTML || '<option value="">Toutes</option>';
        el.innerHTML = firstOption;
        Object.entries(CATEGORIES).forEach(([key, label]) => {
            el.innerHTML += `<option value="${key}">${label}</option>`;
        });
        el.value = currentVal;
    });
}

async function populateMonthFilter() {
    const months = await getAvailableMonths();
    const el = document.getElementById('filter-month');
    if (!el) return;
    const currentVal = el.value;
    el.innerHTML = '<option value="">Tous les mois</option>';
    months.forEach(m => {
        const [y, mo] = m.split('-');
        const label = new Date(y, mo - 1).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
        el.innerHTML += `<option value="${m}">${label}</option>`;
    });
    el.value = currentVal;
}

async function populateArticleSelect() {
    const articles = await getAllArticles();
    const el = document.getElementById('linkedin-article');
    if (!el) return;
    el.innerHTML = '<option value="">Sélectionner un article</option>';
    articles.forEach(a => {
        el.innerHTML += `<option value="${a.id}">${escapeHtml(a.title || a.url)}</option>`;
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
