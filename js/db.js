// PanoCrim - Database Layer (IndexedDB via Dexie.js)

const db = new Dexie('PanoCrimDB');

db.version(1).stores({
    articles: '++id, url, title, source, date_published, date_added, category, subcategory, impact, status, *tags, *threat_actors, *countries',
    syntheses: '++id, type, date_generated, period, category'
});

// Categories for cybercrime classification
const CATEGORIES = {
    'ransomware': 'Ransomware',
    'phishing': 'Phishing / Ingénierie sociale',
    'data_breach': 'Fuite de données',
    'apt': 'APT / Espionnage étatique',
    'vulnerability': 'Vulnérabilité / Zero-day',
    'malware': 'Malware / Trojan',
    'ddos': 'DDoS / Attaque par déni de service',
    'fraud': 'Fraude / Arnaque en ligne',
    'supply_chain': 'Attaque supply chain',
    'iot_ics': 'IoT / Systèmes industriels',
    'crypto_crime': 'Cryptomonnaie / Blockchain',
    'insider_threat': 'Menace interne',
    'disinformation': 'Désinformation / Influence',
    'regulation': 'Réglementation / Juridique',
    'other': 'Autre'
};

const IMPACT_LEVELS = {
    'critique': 'Critique',
    'haut': 'Haut',
    'moyen': 'Moyen',
    'faible': 'Faible'
};

const SECTORS = [
    'Santé', 'Finance / Banque', 'Énergie', 'Télécommunications',
    'Transport', 'Éducation', 'Administration publique', 'Défense',
    'Commerce / Retail', 'Industrie', 'Technologie', 'Médias',
    'Juridique', 'Immobilier', 'Agriculture', 'Autre'
];

// Article CRUD operations

async function addArticle(articleData) {
    const article = {
        url: articleData.url,
        title: articleData.title || '',
        source: articleData.source || '',
        date_published: articleData.date_published || null,
        date_added: new Date().toISOString(),
        category: articleData.category || 'other',
        subcategory: articleData.subcategory || '',
        threat_actors: articleData.threat_actors || [],
        victims: articleData.victims || [],
        countries: articleData.countries || [],
        sectors: articleData.sectors || [],
        impact: articleData.impact || 'moyen',
        summary_fr: articleData.summary_fr || '',
        summary_en: articleData.summary_en || '',
        key_facts: articleData.key_facts || [],
        tags: articleData.tags || [],
        technical_details: articleData.technical_details || '',
        recommendations: articleData.recommendations || '',
        raw_content: articleData.raw_content || '',
        ai_analysis: articleData.ai_analysis || null,
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

async function getArticlesByCategory(category) {
    return await db.articles.where('category').equals(category).toArray();
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
    let collection = db.articles.orderBy('date_added').reverse();
    let results = await collection.toArray();

    if (filters.category) {
        results = results.filter(a => a.category === filters.category);
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
        results = results.filter(a =>
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.summary_fr && a.summary_fr.toLowerCase().includes(q)) ||
            (a.source && a.source.toLowerCase().includes(q)) ||
            (a.tags && a.tags.some(t => t.toLowerCase().includes(q))) ||
            (a.threat_actors && a.threat_actors.some(t => t.toLowerCase().includes(q)))
        );
    }
    return results;
}

async function getStats() {
    const all = await getAllArticles();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const thisMonth = all.filter(a => a.date_added >= monthStart);
    const categories = new Set(all.map(a => a.category));
    const pending = all.filter(a => a.status === 'pending');

    const categoryCount = {};
    all.forEach(a => {
        categoryCount[a.category] = (categoryCount[a.category] || 0) + 1;
    });

    return {
        total: all.length,
        month: thisMonth.length,
        categories: categories.size,
        pending: pending.length,
        categoryCount,
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

async function getUsedCategories() {
    const all = await getAllArticles();
    const cats = new Set();
    all.forEach(a => {
        if (a.category) cats.add(a.category);
    });
    return Array.from(cats);
}

// Synthesis CRUD

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

// Export / Import

async function exportDatabase() {
    const articles = await getAllArticles();
    const syntheses = await getAllSyntheses();
    return JSON.stringify({ articles, syntheses, exportDate: new Date().toISOString() }, null, 2);
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
