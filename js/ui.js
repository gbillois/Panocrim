// PanoCrim - UI Rendering Functions
// Dynamic multi-dimensional taxonomy

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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== Dimension Badge Rendering ====================

function renderDimBadge(dimension, value) {
    const dim = DIMENSIONS[dimension];
    if (!dim) return `<span class="tag">${escapeHtml(value)}</span>`;
    const color = dim.color;
    return `<span class="dim-badge" style="--dim-color:${color}" data-dim="${dimension}" data-val="${escapeHtml(value)}" onclick="filterByDimension('${dimension}','${escapeHtml(value).replace(/'/g, "\\'")}')">${escapeHtml(value)}</span>`;
}

function renderDimSection(dimension, values) {
    if (!Array.isArray(values) || values.length === 0) return '';
    const dim = DIMENSIONS[dimension];
    if (!dim) return '';
    return `<div class="dim-group" style="--dim-color:${dim.color}">
        <span class="dim-group-label">${escapeHtml(dim.label)}</span>
        <div class="tags-list">${values.map(v => renderDimBadge(dimension, v)).join('')}</div>
    </div>`;
}

// Render compact dimension badges for article cards (only key dimensions)
function renderCardDimensions(article) {
    if (!article.dimensions) return '';
    const priority = ['attack_type', 'threat_actor', 'victim_sector', 'country'];
    const badges = [];
    priority.forEach(dim => {
        const vals = article.dimensions[dim];
        if (Array.isArray(vals)) {
            vals.slice(0, 2).forEach(v => badges.push(renderDimBadge(dim, v)));
        }
    });
    return badges.slice(0, 5).join('');
}

// ==================== Article Card ====================

function renderArticleCard(article) {
    const dateStr = article.date_published || article.date_added?.split('T')[0] || '';

    return `
        <div class="article-card" data-id="${article.id}" onclick="showArticleDetail(${article.id})">
            <div class="article-card-header">
                <span class="article-card-title">${escapeHtml(article.title || 'Sans titre')}</span>
            </div>
            <div class="article-card-meta">
                <span class="badge badge-impact-${article.impact}">${article.impact || '?'}</span>
                ${article.source ? `<span>${escapeHtml(article.source)}</span>` : ''}
                <span>${dateStr}</span>
            </div>
            <div class="article-card-dims">
                ${renderCardDimensions(article)}
            </div>
            ${article.summary_fr ? `<div class="article-card-summary">${escapeHtml(article.summary_fr)}</div>` : ''}
        </div>
    `;
}

function renderArticlesList(articles, containerId) {
    const container = document.getElementById(containerId);
    if (articles.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucun article trouv\u00e9.</p>';
        return;
    }
    container.innerHTML = articles.map(renderArticleCard).join('');
}

// ==================== Analysis Preview ====================

function renderAnalysisPreview(data) {
    let dimsHtml = '';
    if (data.dimensions) {
        DIMENSION_KEYS.forEach(dim => {
            dimsHtml += renderDimSection(dim, data.dimensions[dim]);
        });
    }

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
            <div class="analysis-field-label">Impact</div>
            <div class="analysis-field-value"><span class="badge badge-impact-${data.impact}">${data.impact || '?'}</span></div>
        </div>
        <div class="analysis-field">
            <div class="analysis-field-label">R\u00e9sum\u00e9</div>
            <div class="analysis-field-value">${escapeHtml(data.summary_fr || '')}</div>
        </div>
        ${dimsHtml}
        ${data.key_facts?.length ? `
        <div class="analysis-field">
            <div class="analysis-field-label">Faits cl\u00e9s</div>
            <div class="analysis-field-value">${data.key_facts.map(f => `<div>\u2022 ${escapeHtml(f)}</div>`).join('')}</div>
        </div>` : ''}
    `;
}

// ==================== Article Detail (Modal) ====================

function renderArticleDetail(article) {
    let dimsHtml = '';
    if (article.dimensions) {
        DIMENSION_KEYS.forEach(dim => {
            dimsHtml += renderDimSection(dim, article.dimensions[dim]);
        });
    }

    return `
        <h2 style="margin-bottom:8px;">${escapeHtml(article.title || 'Sans titre')}</h2>
        <div class="article-card-meta" style="margin-bottom:16px;">
            <span class="badge badge-impact-${article.impact}">${article.impact}</span>
            <span>${escapeHtml(article.source || '')}</span>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">Informations</div>
            <div class="detail-row"><span class="detail-label">Date publication</span><span class="detail-value">${article.date_published || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Date ajout</span><span class="detail-value">${article.date_added?.split('T')[0] || '-'}</span></div>
            <div class="detail-row">
                <span class="detail-label">URL</span>
                <span class="detail-value"><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all;">${escapeHtml(article.url)}</a></span>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">Classification</div>
            ${dimsHtml || '<p class="empty-state">Aucune classification.</p>'}
        </div>

        <div class="detail-section">
            <div class="detail-section-title">R\u00e9sum\u00e9 FR</div>
            <div class="detail-text">${escapeHtml(article.summary_fr || '-')}</div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">R\u00e9sum\u00e9 EN</div>
            <div class="detail-text">${escapeHtml(article.summary_en || '-')}</div>
        </div>

        ${article.key_facts?.length ? `
        <div class="detail-section">
            <div class="detail-section-title">Faits cl\u00e9s</div>
            <div class="detail-text">${article.key_facts.map(f => `<div>\u2022 ${escapeHtml(f)}</div>`).join('')}</div>
        </div>` : ''}

        ${article.technical_details ? `
        <div class="detail-section">
            <div class="detail-section-title">D\u00e9tails techniques</div>
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
            <button class="btn btn-secondary" onclick="window.open('${escapeHtml(article.url)}', '_blank')">Ouvrir</button>
            <button class="btn btn-danger" onclick="confirmDeleteArticle(${article.id})">Supprimer</button>
        </div>
    `;
}

// ==================== Dashboard Chart ====================

function renderDimensionBars(taxonomy, dimension) {
    const container = document.getElementById('dimension-chart');
    const dimData = taxonomy[dimension] || {};
    const entries = Object.entries(dimData).sort((a, b) => b[1] - a[1]).slice(0, 15);

    if (entries.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucune donn\u00e9e.</p>';
        return;
    }

    const maxCount = entries[0][1];
    const color = DIMENSIONS[dimension]?.color || '#00d4ff';

    container.innerHTML = entries.map(([value, count]) => {
        const pct = (count / maxCount) * 100;
        return `
            <div class="cat-bar-row" onclick="filterByDimension('${dimension}','${escapeHtml(value).replace(/'/g, "\\'")}')">
                <span class="cat-bar-label">${escapeHtml(value)}</span>
                <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${color}88,${color})"></div></div>
                <span class="cat-bar-count">${count}</span>
            </div>
        `;
    }).join('');
}

// ==================== Synthesis Card ====================

function renderSynthesisCard(synthesis) {
    const typeLabels = { monthly: 'Mensuelle', dimension: 'Th\u00e9matique', global: 'Globale' };
    const label = typeLabels[synthesis.type] || synthesis.type;
    const date = synthesis.date_generated?.split('T')[0] || '';
    const preview = synthesis.content?.substring(0, 120) || '';
    const dimInfo = synthesis.dimensionValue ? ` - ${synthesis.dimensionValue}` : '';
    const periodInfo = synthesis.period ? ` - ${synthesis.period}` : '';

    return `
        <div class="synthesis-card" onclick="showSynthesisDetail(${synthesis.id})">
            <div class="synthesis-card-header">
                <span class="synthesis-card-title">${escapeHtml(label)}${periodInfo}${dimInfo}</span>
                <span class="synthesis-card-date">${date}</span>
            </div>
            <div class="synthesis-card-preview">${escapeHtml(preview)}...</div>
        </div>
    `;
}

// ==================== Dynamic Filter Selects ====================

async function populateDimensionSelect(selectId, dimension, defaultLabel) {
    const values = await getDimensionValues(dimension);
    const el = document.getElementById(selectId);
    if (!el) return;
    const currentVal = el.value;
    el.innerHTML = `<option value="">${defaultLabel || 'Tous'}</option>`;
    values.forEach(({ value, count }) => {
        el.innerHTML += `<option value="${escapeHtml(value)}">${escapeHtml(value)} (${count})</option>`;
    });
    el.value = currentVal;
}

async function populateDimensionFilterSelects() {
    const taxonomy = await buildTaxonomy();

    // Populate dimension selector for database filter
    const dimFilterSelect = document.getElementById('filter-dimension');
    if (dimFilterSelect) {
        const currentDim = dimFilterSelect.value;
        dimFilterSelect.innerHTML = '<option value="">Toutes dimensions</option>';
        DIMENSION_KEYS.forEach(dim => {
            const count = Object.keys(taxonomy[dim]).length;
            if (count > 0) {
                dimFilterSelect.innerHTML += `<option value="${dim}">${DIMENSIONS[dim].label} (${count})</option>`;
            }
        });
        dimFilterSelect.value = currentDim;
    }

    // Update value selector based on chosen dimension
    await updateDimensionValueSelect();
}

async function updateDimensionValueSelect() {
    const dimSelect = document.getElementById('filter-dimension');
    const valSelect = document.getElementById('filter-dim-value');
    if (!dimSelect || !valSelect) return;

    const dim = dimSelect.value;
    if (!dim) {
        valSelect.innerHTML = '<option value="">Toutes valeurs</option>';
        valSelect.disabled = true;
        return;
    }

    valSelect.disabled = false;
    await populateDimensionSelect('filter-dim-value', dim, 'Toutes valeurs');
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
    el.innerHTML = '<option value="">S\u00e9lectionner un article</option>';
    articles.forEach(a => {
        el.innerHTML += `<option value="${a.id}">${escapeHtml(a.title || a.url)}</option>`;
    });
}

// Populate synthesis & linkedin dimension selects dynamically
async function populateSynthDimensionSelects() {
    const taxonomy = await buildTaxonomy();

    ['synth-dimension', 'linkedin-dimension'].forEach(selectId => {
        const el = document.getElementById(selectId);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = '<option value="">Choisir une dimension</option>';
        DIMENSION_KEYS.forEach(dim => {
            const count = Object.keys(taxonomy[dim]).length;
            if (count > 0) {
                el.innerHTML += `<option value="${dim}">${DIMENSIONS[dim].label} (${count})</option>`;
            }
        });
        el.value = currentVal;
    });
}

async function updateSynthValueSelect(dimSelectId, valSelectId) {
    const dimSelect = document.getElementById(dimSelectId);
    const valSelect = document.getElementById(valSelectId);
    if (!dimSelect || !valSelect) return;

    const dim = dimSelect.value;
    if (!dim) {
        valSelect.innerHTML = '<option value="">Choisir une valeur</option>';
        valSelect.disabled = true;
        return;
    }

    valSelect.disabled = false;
    await populateDimensionSelect(valSelectId, dim, 'Choisir une valeur');
}
