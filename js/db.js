// PanoCrim - Database Layer (IndexedDB via Dexie.js)
// Dynamic multi-dimensional taxonomy system

const db = new Dexie('PanoCrimDB');

db.version(2).stores({
    articles: '++id, url, title, source, date_published, date_added, impact, status',
    syntheses: '++id, type, date_generated, period'
});

// ==================== Dimensions Definition ====================
// These define the AXES of classification. Values within each are dynamic.

const DIMENSIONS = {
    attack_type:    { label: "Type d'attaque",      color: '#00d4ff', icon: 'zap' },
    attack_vector:  { label: "Vecteur d'attaque",   color: '#ffa502', icon: 'arrow' },
    threat_actor:   { label: 'Acteur de la menace', color: '#ff6348', icon: 'user' },
    actor_type:     { label: "Type d'acteur",       color: '#ff4757', icon: 'shield' },
    victim_name:    { label: 'Victime',             color: '#a29bfe', icon: 'target' },
    victim_sector:  { label: 'Secteur cibl\u00e9',       color: '#6c5ce7', icon: 'building' },
    country:        { label: 'Pays concern\u00e9',       color: '#2ed573', icon: 'globe' },
    technology:     { label: 'Technologie',         color: '#e056fd', icon: 'cpu' },
    malware_family: { label: 'Malware / Outil',     color: '#eb4d4b', icon: 'bug' },
    cve:            { label: 'CVE / Vuln\u00e9rabilit\u00e9',  color: '#f9ca24', icon: 'alert' },
    mitre_technique:{ label: 'Technique MITRE',     color: '#7ed6df', icon: 'layers' }
};

const DIMENSION_KEYS = Object.keys(DIMENSIONS);

const IMPACT_LEVELS = {
    'critique': 'Critique',
    'haut': 'Haut',
    'moyen': 'Moyen',
    'faible': 'Faible'
};

// ==================== Taxonomy (derived from articles) ====================

// Build complete taxonomy from all articles: { dimension: { value: count } }
async function buildTaxonomy() {
    const all = await getAllArticles();
    const taxonomy = {};
    DIMENSION_KEYS.forEach(dim => { taxonomy[dim] = {}; });

    all.forEach(article => {
        const dims = article.dimensions;
        if (!dims) return;
        DIMENSION_KEYS.forEach(dim => {
            const values = dims[dim];
            if (Array.isArray(values)) {
                values.forEach(v => {
                    if (v && v.trim()) {
                        const normalized = v.trim();
                        taxonomy[dim][normalized] = (taxonomy[dim][normalized] || 0) + 1;
                    }
                });
            }
        });
    });
    return taxonomy;
}

// Get flat list of all values for a given dimension: [{value, count}]
async function getDimensionValues(dimension) {
    const taxonomy = await buildTaxonomy();
    const dimData = taxonomy[dimension] || {};
    return Object.entries(dimData)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
}

// Get total unique tags count across all dimensions
async function getTotalTagsCount() {
    const taxonomy = await buildTaxonomy();
    let count = 0;
    DIMENSION_KEYS.forEach(dim => {
        count += Object.keys(taxonomy[dim]).length;
    });
    return count;
}

// Format taxonomy for Claude prompt (so it can reuse existing values)
async function getTaxonomyForPrompt() {
    const taxonomy = await buildTaxonomy();
    const lines = [];
    DIMENSION_KEYS.forEach(dim => {
        const values = Object.entries(taxonomy[dim]).sort((a, b) => b[1] - a[1]);
        if (values.length > 0) {
            const label = DIMENSIONS[dim].label;
            const valStr = values.map(([v, c]) => `"${v}" (${c})`).join(', ');
            lines.push(`  ${label} [${dim}]: ${valStr}`);
        }
    });
    return lines.length > 0
        ? 'Taxonomie existante (r\u00e9utilise ces valeurs quand elles correspondent) :\n' + lines.join('\n')
        : 'Aucune taxonomie existante (premier article).';
}

// ==================== Article CRUD ====================

async function addArticle(articleData) {
    // Normalize dimensions
    const dimensions = {};
    DIMENSION_KEYS.forEach(dim => {
        const val = articleData.dimensions?.[dim];
        if (Array.isArray(val)) {
            dimensions[dim] = val.map(v => (typeof v === 'string') ? v.trim() : '').filter(Boolean);
        } else {
            dimensions[dim] = [];
        }
    });

    const article = {
        url: articleData.url,
        title: articleData.title || '',
        source: articleData.source || '',
        date_published: articleData.date_published || null,
        date_added: new Date().toISOString(),
        dimensions,
        impact: articleData.impact || 'moyen',
        summary_fr: articleData.summary_fr || '',
        summary_en: articleData.summary_en || '',
        key_facts: articleData.key_facts || [],
        technical_details: articleData.technical_details || '',
        recommendations: articleData.recommendations || '',
        raw_content: articleData.raw_content || '',
        notes: articleData.notes || '',
        status: articleData.status || 'analyzed'
    };
    return await db.articles.add(article);
}

async function updateArticle(id, updates) {
    return await db.articles.update(id, updates);
}

async function deleteArticle(id) {
    return await db.articles.delete(id);
}

async function getArticle(id) {
    return await db.articles.get(id);
}

async function getAllArticles() {
    return await db.articles.orderBy('date_added').reverse().toArray();
}

async function getArticleByUrl(url) {
    return await db.articles.where('url').equals(url).first();
}

// Get articles that have a specific value in a specific dimension
async function getArticlesByDimensionValue(dimension, value) {
    const all = await getAllArticles();
    return all.filter(a =>
        a.dimensions &&
        Array.isArray(a.dimensions[dimension]) &&
        a.dimensions[dimension].some(v => v.toLowerCase() === value.toLowerCase())
    );
}

async function getArticlesByMonth(year, month) {
    const start = new Date(year, month - 1, 1).toISOString();
    const end = new Date(year, month, 0, 23, 59, 59).toISOString();
    return await db.articles
        .where('date_added')
        .between(start, end)
        .toArray();
}

async function getArticlesByFilters(filters) {
    let results = await getAllArticles();

    // Filter by any dimension:value pair
    if (filters.dimension && filters.dimensionValue) {
        results = results.filter(a =>
            a.dimensions &&
            Array.isArray(a.dimensions[filters.dimension]) &&
            a.dimensions[filters.dimension].some(v =>
                v.toLowerCase() === filters.dimensionValue.toLowerCase()
            )
        );
    }

    if (filters.month) {
        const [year, month] = filters.month.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59);
        results = results.filter(a => {
            const d = new Date(a.date_added);
            return d >= start && d <= end;
        });
    }

    if (filters.impact) {
        results = results.filter(a => a.impact === filters.impact);
    }

    if (filters.search) {
        const q = filters.search.toLowerCase();
        results = results.filter(a => {
            // Search in title, summary, source, notes
            if ((a.title || '').toLowerCase().includes(q)) return true;
            if ((a.summary_fr || '').toLowerCase().includes(q)) return true;
            if ((a.source || '').toLowerCase().includes(q)) return true;
            if ((a.notes || '').toLowerCase().includes(q)) return true;
            // Search across all dimension values
            if (a.dimensions) {
                for (const dim of DIMENSION_KEYS) {
                    const vals = a.dimensions[dim];
                    if (Array.isArray(vals) && vals.some(v => v.toLowerCase().includes(q))) {
                        return true;
                    }
                }
            }
            return false;
        });
    }

    return results;
}

async function getStats() {
    const all = await getAllArticles();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const thisMonth = all.filter(a => a.date_added >= monthStart);
    const pending = all.filter(a => a.status === 'pending' || a.status === 'error');

    // Count unique tags across all dimensions
    const tagSet = new Set();
    all.forEach(a => {
        if (!a.dimensions) return;
        DIMENSION_KEYS.forEach(dim => {
            const vals = a.dimensions[dim];
            if (Array.isArray(vals)) {
                vals.forEach(v => tagSet.add(`${dim}:${v}`));
            }
        });
    });

    return {
        total: all.length,
        month: thisMonth.length,
        tagsCount: tagSet.size,
        pending: pending.length,
        recentArticles: all.slice(0, 10)
    };
}

async function getAvailableMonths() {
    const all = await getAllArticles();
    const months = new Set();
    all.forEach(a => {
        if (a.date_added) {
            const d = new Date(a.date_added);
            months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
    });
    return Array.from(months).sort().reverse();
}

// ==================== Synthesis CRUD ====================

async function addSynthesis(synthesisData) {
    return await db.syntheses.add({
        ...synthesisData,
        date_generated: new Date().toISOString()
    });
}

async function getAllSyntheses() {
    return await db.syntheses.orderBy('date_generated').reverse().toArray();
}

async function deleteSynthesis(id) {
    return await db.syntheses.delete(id);
}

// ==================== Export / Import ====================

async function exportDatabase() {
    const articles = await getAllArticles();
    const syntheses = await getAllSyntheses();
    return JSON.stringify({ version: 2, articles, syntheses, exportDate: new Date().toISOString() }, null, 2);
}

async function importDatabase(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.articles) {
        await db.articles.clear();
        await db.articles.bulkAdd(data.articles);
    }
    if (data.syntheses) {
        await db.syntheses.clear();
        await db.syntheses.bulkAdd(data.syntheses);
    }
}

async function clearDatabase() {
    await db.articles.clear();
    await db.syntheses.clear();
}
