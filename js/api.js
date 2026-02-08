// PanoCrim - Claude API Integration

const API_BASE = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

function getApiKey() {
    return localStorage.getItem('panocrim_api_key') || '';
}

function getModel() {
    return localStorage.getItem('panocrim_model') || 'claude-sonnet-4-20250514';
}

function setApiKey(key) {
    localStorage.setItem('panocrim_api_key', key);
}

function setModel(model) {
    localStorage.setItem('panocrim_model', model);
}

// Fetch article content from URL via CORS proxy
async function fetchArticleContent(url) {
    const proxiedUrl = CORS_PROXY + encodeURIComponent(url);
    try {
        const response = await fetch(proxiedUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        return extractTextFromHtml(html);
    } catch (e) {
        console.warn('CORS proxy fetch failed, trying direct:', e.message);
        try {
            const response = await fetch(url, {
                mode: 'cors',
                signal: AbortSignal.timeout(10000)
            });
            const html = await response.text();
            return extractTextFromHtml(html);
        } catch (e2) {
            console.warn('Direct fetch also failed:', e2.message);
            return null;
        }
    }
}

function extractTextFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove scripts, styles, nav, footer, etc.
    const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript', '.sidebar', '.menu', '.nav', '.cookie', '.ad', '.advertisement'];
    removeSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Try to get article content specifically
    const articleEl = doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.querySelector('main') || doc.querySelector('.post-content') || doc.querySelector('.article-content') || doc.querySelector('.entry-content');

    const targetEl = articleEl || doc.body;
    if (!targetEl) return '';

    let text = targetEl.innerText || targetEl.textContent || '';
    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
    // Limit to ~8000 chars to stay within token limits
    return text.substring(0, 8000);
}

// Call Claude API for article analysis
async function analyzeArticle(url, content, notes) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Clé API non configurée. Allez dans Config pour ajouter votre clé.');

    const prompt = `Tu es un analyste expert en cybersécurité et cybercriminalité. Analyse l'article suivant et extrais les informations structurées.

URL de l'article : ${url}

${content ? `Contenu de l'article :\n${content}` : "Le contenu n'a pas pu être récupéré. Analyse uniquement à partir de l'URL et de tes connaissances si tu connais cet article."}

${notes ? `Notes de l'utilisateur : ${notes}` : ''}

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans backticks) contenant ces champs :

{
    "title": "Titre de l'article",
    "source": "Nom du média/site source",
    "date_published": "YYYY-MM-DD ou null si inconnue",
    "category": "une parmi: ransomware, phishing, data_breach, apt, vulnerability, malware, ddos, fraud, supply_chain, iot_ics, crypto_crime, insider_threat, disinformation, regulation, other",
    "subcategory": "sous-catégorie plus précise",
    "threat_actors": ["liste des groupes/acteurs de menace mentionnés"],
    "victims": ["liste des organisations/entités victimes"],
    "countries": ["liste des pays concernés (codes ISO 2 lettres)"],
    "sectors": ["secteurs d'activité touchés parmi: Santé, Finance / Banque, Énergie, Télécommunications, Transport, Éducation, Administration publique, Défense, Commerce / Retail, Industrie, Technologie, Médias, Juridique, Immobilier, Agriculture, Autre"],
    "impact": "une parmi: critique, haut, moyen, faible",
    "summary_fr": "Résumé en français (3-5 phrases)",
    "summary_en": "Summary in English (3-5 sentences)",
    "key_facts": ["fait clé 1", "fait clé 2", "fait clé 3"],
    "tags": ["tag1", "tag2", "tag3"],
    "technical_details": "Détails techniques pertinents (TTPs MITRE ATT&CK, CVE, IOCs mentionnés, etc.)",
    "recommendations": "Recommandations de sécurité en lien avec cet article"
}`;

    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': API_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: getModel(),
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Erreur API : ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    jsonStr = jsonStr.trim();

    return JSON.parse(jsonStr);
}

// Generate synthesis using Claude
async function generateSynthesis(articles, type, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Clé API non configurée.');
    if (articles.length === 0) throw new Error('Aucun article à synthétiser.');

    const articlesData = articles.map(a => ({
        title: a.title,
        source: a.source,
        date: a.date_published || a.date_added,
        category: CATEGORIES[a.category] || a.category,
        impact: a.impact,
        summary: a.summary_fr,
        key_facts: a.key_facts,
        threat_actors: a.threat_actors,
        victims: a.victims,
        countries: a.countries,
        sectors: a.sectors,
        tags: a.tags
    }));

    let typeInstruction = '';
    if (type === 'monthly') {
        typeInstruction = `Génère une synthèse mensuelle de la cybercriminalité pour ${options.period || 'le mois en cours'}.
Structure ta synthèse ainsi :
1. **Vue d'ensemble** : tendances générales du mois
2. **Menaces principales** : classées par catégorie (ransomware, APT, vulnérabilités, etc.)
3. **Acteurs de la menace** : groupes les plus actifs
4. **Secteurs ciblés** : analyse sectorielle
5. **Géographie** : répartition géographique
6. **Faits marquants** : les événements les plus significatifs
7. **Tendances et perspectives** : évolution et anticipation`;
    } else if (type === 'category') {
        typeInstruction = `Génère une synthèse thématique sur la catégorie "${CATEGORIES[options.category] || options.category}".
Structure ta synthèse ainsi :
1. **État de la menace** : vue d'ensemble de cette catégorie
2. **Incidents majeurs** : détail des événements les plus importants
3. **Acteurs identifiés** : groupes et individus impliqués
4. **Techniques utilisées** : TTPs et vecteurs d'attaque observés
5. **Impact et conséquences** : analyse de l'impact
6. **Recommandations** : mesures de protection et bonnes pratiques
7. **Perspectives** : évolution attendue de cette menace`;
    } else {
        typeInstruction = `Génère une synthèse globale et une analyse de tendances de la cybercriminalité.
Structure ta synthèse ainsi :
1. **Panorama général** : vue d'ensemble de la cybercriminalité
2. **Tendances majeures** : évolutions significatives
3. **Catégories dominantes** : les types de menaces les plus fréquents
4. **Acteurs de la menace** : cartographie des groupes actifs
5. **Analyse géopolitique** : dimension géopolitique de la cybercriminalité
6. **Secteurs les plus exposés** : analyse sectorielle
7. **Recommandations stratégiques** : mesures à envisager
8. **Perspectives** : anticipation des évolutions`;
    }

    const prompt = `Tu es un analyste senior en cybersécurité rédigeant un rapport professionnel.

${typeInstruction}

Base ta synthèse sur les ${articles.length} articles suivants :

${JSON.stringify(articlesData, null, 2)}

Rédige en français, dans un style professionnel et analytique. Utilise le format Markdown.
Inclus des statistiques quand c'est pertinent (nombre d'incidents par catégorie, etc.).
Sois factuel et précis, en citant les sources et les cas concrets.`;

    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': API_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: getModel(),
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Erreur API : ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

// Generate LinkedIn post using Claude
async function generateLinkedInPost(type, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Clé API non configurée.');

    const toneMap = {
        'expert': 'analytique et expert, avec des données et des insights professionnels',
        'alerte': "d'alerte et d'urgence, percutant et sensibilisant",
        'pedagogique': 'pédagogique et accessible, expliquant les concepts pour un public large',
        'opinion': 'de tribune et prise de position, engageant le débat professionnel'
    };

    const tone = toneMap[options.tone] || toneMap.expert;
    const lang = options.language === 'en' ? 'anglais' : 'français';

    let contextInstruction = '';
    if (type === 'highlight' && options.article) {
        const a = options.article;
        contextInstruction = `Met en relief l'article suivant :
- Titre : ${a.title}
- Source : ${a.source}
- Date : ${a.date_published || a.date_added}
- Catégorie : ${CATEGORIES[a.category] || a.category}
- Résumé : ${a.summary_fr}
- Faits clés : ${(a.key_facts || []).join(', ')}
- Acteurs : ${(a.threat_actors || []).join(', ')}
- Impact : ${a.impact}
- URL : ${a.url}

Écris un post LinkedIn qui met en relief cette actualité cyber, en la contextualisant et en apportant ton analyse experte.`;
    } else if (type === 'synthesis' && options.articles) {
        const summaries = options.articles.map(a =>
            `- ${a.title} (${a.source}) : ${a.summary_fr}`
        ).join('\n');
        contextInstruction = `Synthétise les articles suivants de la catégorie "${CATEGORIES[options.category] || options.category}" :
${summaries}

Écris un post LinkedIn qui fait la synthèse de cette catégorie de menaces, avec ton analyse et tes recommandations.`;
    }

    const prompt = `Tu es un expert en cybersécurité avec une forte présence sur LinkedIn.

${contextInstruction}

Consignes pour le post :
- Ton : ${tone}
- Langue : ${lang}
- Maximum 3000 caractères
- Commence par une accroche percutante (1-2 lignes)
- Structure avec des sauts de ligne pour la lisibilité
- Inclus 3-5 hashtags pertinents à la fin
- Utilise des emojis avec parcimonie (2-4 maximum) pour la mise en forme
- Termine par un call-to-action ou une question engageante
- Style professionnel LinkedIn, pas de langage familier
- Ne pas utiliser de markdown (pas de ** ou ##), juste du texte brut avec des emojis pour structurer

Réponds UNIQUEMENT avec le texte du post LinkedIn, prêt à être copié-collé.`;

    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': API_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: getModel(),
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Erreur API : ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
}
