// PanoCrim - OpenAI ChatGPT API Integration
// Dynamic multi-dimensional taxonomy

const API_BASE = 'https://api.openai.com/v1/chat/completions';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

function getApiKey() {
    return localStorage.getItem('panocrim_api_key') || '';
}

function getModel() {
    return localStorage.getItem('panocrim_model') || 'gpt-4o';
}

function setApiKey(key) {
    localStorage.setItem('panocrim_api_key', key);
}

function setModel(model) {
    localStorage.setItem('panocrim_model', model);
}

// ==================== Content Fetching ====================

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
            const response = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(10000) });
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
    const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript', '.sidebar', '.menu', '.nav', '.cookie', '.ad', '.advertisement'];
    removeSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => el.remove());
    });
    const articleEl = doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.querySelector('main') || doc.querySelector('.post-content') || doc.querySelector('.article-content') || doc.querySelector('.entry-content');
    const targetEl = articleEl || doc.body;
    if (!targetEl) return '';
    let text = targetEl.innerText || targetEl.textContent || '';
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
    return text.substring(0, 8000);
}

// ==================== OpenAI API Call Helper ====================

async function callLLM(prompt, maxTokens = 2048) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Cl\u00e9 API non configur\u00e9e. Allez dans Config pour ajouter votre cl\u00e9.');

    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: getModel(),
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Erreur API : ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// ==================== Article Analysis ====================

async function analyzeArticle(url, content, notes) {
    // Get existing taxonomy so the LLM can reuse values
    const taxonomyContext = await getTaxonomyForPrompt();

    const prompt = `Tu es un analyste expert en cybers\u00e9curit\u00e9 et cybercriminalit\u00e9. Analyse l'article suivant et classe-le selon une taxonomie multi-dimensionnelle.

URL de l'article : ${url}

${content ? `Contenu de l'article :\n${content}` : "Le contenu n'a pas pu \u00eatre r\u00e9cup\u00e9r\u00e9. Analyse uniquement \u00e0 partir de l'URL et de tes connaissances si tu connais cet article."}

${notes ? `Notes de l'utilisateur : ${notes}` : ''}

${taxonomyContext}

R\u00c8GLES IMPORTANTES pour la classification :
- R\u00c9UTILISE les valeurs existantes de la taxonomie ci-dessus quand elles correspondent (orthographe identique).
- Ne cr\u00e9e une NOUVELLE valeur que si aucune existante ne correspond vraiment.
- Utilise des termes NORMALIS\u00c9S et g\u00e9n\u00e9riques (ex: "Ransomware" plut\u00f4t que "attaque par ransomware", "Phishing" plut\u00f4t que "hame\u00e7onnage cibl\u00e9").
- Pour les acteurs, utilise le nom le plus connu (ex: "LockBit", "APT29", "Lazarus Group").
- Pour les types d'acteur : "Groupe cybercriminel", "APT / \u00c9tat-nation", "Hacktiviste", "Menace interne", "Chercheur", "Inconnu".
- Pour les pays, utilise les codes ISO 2 lettres (FR, US, RU, CN...).
- Chaque dimension peut avoir PLUSIEURS valeurs (c'est un tableau).
- Ne laisse pas de dimension vide si l'article donne l'info.

R\u00e9ponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans backticks) :

{
    "title": "Titre de l'article",
    "source": "Nom du m\u00e9dia/site source",
    "date_published": "YYYY-MM-DD ou null",
    "impact": "critique | haut | moyen | faible",
    "dimensions": {
        "attack_type": ["ex: Ransomware", "Double extorsion"],
        "attack_vector": ["ex: Phishing", "Exploit zero-day"],
        "threat_actor": ["ex: LockBit", "APT29"],
        "actor_type": ["ex: Groupe cybercriminel"],
        "victim_name": ["ex: CHU de Rennes"],
        "victim_sector": ["ex: Sant\u00e9"],
        "country": ["ex: FR", "US"],
        "technology": ["ex: IA / LLM", "Active Directory"],
        "malware_family": ["ex: LockBit 3.0", "Cobalt Strike"],
        "cve": ["ex: CVE-2025-32711"],
        "mitre_technique": ["ex: T1566 Phishing", "T1486 Data Encrypted for Impact"]
    },
    "summary_fr": "R\u00e9sum\u00e9 en fran\u00e7ais (3-5 phrases)",
    "summary_en": "Summary in English (3-5 sentences)",
    "key_facts": ["fait cl\u00e9 1", "fait cl\u00e9 2", "fait cl\u00e9 3"],
    "technical_details": "D\u00e9tails techniques (TTPs, IOCs, CVE...)",
    "recommendations": "Recommandations de s\u00e9curit\u00e9"
}`;

    const text = await callLLM(prompt, 2048);

    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    jsonStr = jsonStr.trim();

    return JSON.parse(jsonStr);
}

// ==================== Synthesis Generation ====================

async function generateSynthesis(articles, type, options = {}) {
    if (articles.length === 0) throw new Error('Aucun article \u00e0 synth\u00e9tiser.');

    const articlesData = articles.map(a => ({
        title: a.title,
        source: a.source,
        date: a.date_published || a.date_added,
        dimensions: a.dimensions,
        impact: a.impact,
        summary: a.summary_fr,
        key_facts: a.key_facts
    }));

    let typeInstruction = '';
    if (type === 'monthly') {
        typeInstruction = `G\u00e9n\u00e8re une synth\u00e8se mensuelle de la cybercriminalit\u00e9 pour ${options.period || 'le mois en cours'}.
Structure :
1. **Vue d'ensemble** : tendances g\u00e9n\u00e9rales
2. **Types d'attaques dominants** : class\u00e9s par fr\u00e9quence
3. **Acteurs de la menace** : groupes les plus actifs
4. **Secteurs et victimes** : analyse sectorielle
5. **Technologies et vecteurs** : moyens utilis\u00e9s
6. **G\u00e9ographie** : r\u00e9partition g\u00e9ographique
7. **Faits marquants** : \u00e9v\u00e9nements les plus significatifs
8. **Tendances et perspectives**`;
    } else if (type === 'dimension') {
        const dimLabel = DIMENSIONS[options.dimension]?.label || options.dimension;
        typeInstruction = `G\u00e9n\u00e8re une synth\u00e8se th\u00e9matique centr\u00e9e sur la dimension "${dimLabel}", sp\u00e9cifiquement la valeur "${options.dimensionValue}".
Structure :
1. **\u00c9tat de la menace** : vue d'ensemble pour "${options.dimensionValue}"
2. **Incidents majeurs** : d\u00e9tail des \u00e9v\u00e9nements
3. **Corr\u00e9lations** : liens avec d'autres dimensions (acteurs, secteurs, techniques...)
4. **Techniques utilis\u00e9es** : TTPs et vecteurs d'attaque
5. **Impact et cons\u00e9quences** : analyse de l'impact
6. **Recommandations** : mesures de protection
7. **Perspectives** : \u00e9volution attendue`;
    } else {
        typeInstruction = `G\u00e9n\u00e8re une synth\u00e8se globale et analyse de tendances.
Structure :
1. **Panorama g\u00e9n\u00e9ral** : vue d'ensemble
2. **Tendances majeures** : \u00e9volutions significatives
3. **Types d'attaques dominants** : les menaces les plus fr\u00e9quentes
4. **Acteurs de la menace** : cartographie
5. **Analyse g\u00e9opolitique** : dimension g\u00e9opolitique
6. **Secteurs les plus expos\u00e9s** : analyse sectorielle
7. **Technologies \u00e9mergentes** : IA, IoT, cloud, etc.
8. **Recommandations strat\u00e9giques**
9. **Perspectives**`;
    }

    const prompt = `Tu es un analyste senior en cybers\u00e9curit\u00e9 r\u00e9digeant un rapport professionnel.

${typeInstruction}

Base ta synth\u00e8se sur les ${articles.length} articles suivants :

${JSON.stringify(articlesData, null, 2)}

R\u00e9dige en fran\u00e7ais, style professionnel et analytique, format Markdown.
Inclus des statistiques quand c'est pertinent. Sois factuel et pr\u00e9cis.`;

    return await callLLM(prompt, 4096);
}

// ==================== LinkedIn Post Generation ====================

async function generateLinkedInPost(type, options = {}) {
    const toneMap = {
        'expert': 'analytique et expert, avec des donn\u00e9es et des insights professionnels',
        'alerte': "d'alerte et d'urgence, percutant et sensibilisant",
        'pedagogique': 'p\u00e9dagogique et accessible, expliquant les concepts pour un public large',
        'opinion': 'de tribune et prise de position, engageant le d\u00e9bat professionnel'
    };

    const tone = toneMap[options.tone] || toneMap.expert;
    const lang = options.language === 'en' ? 'anglais' : 'fran\u00e7ais';

    let contextInstruction = '';
    if (type === 'highlight' && options.article) {
        const a = options.article;
        const dimSummary = [];
        if (a.dimensions) {
            DIMENSION_KEYS.forEach(dim => {
                const vals = a.dimensions[dim];
                if (Array.isArray(vals) && vals.length > 0) {
                    dimSummary.push(`- ${DIMENSIONS[dim].label} : ${vals.join(', ')}`);
                }
            });
        }
        contextInstruction = `Met en relief l'article suivant :
- Titre : ${a.title}
- Source : ${a.source}
- Date : ${a.date_published || a.date_added}
- Impact : ${a.impact}
${dimSummary.join('\n')}
- R\u00e9sum\u00e9 : ${a.summary_fr}
- Faits cl\u00e9s : ${(a.key_facts || []).join(', ')}
- URL : ${a.url}

\u00c9cris un post LinkedIn qui met en relief cette actualit\u00e9 cyber, en la contextualisant et en apportant ton analyse experte.`;
    } else if (type === 'synthesis' && options.articles) {
        const summaries = options.articles.map(a =>
            `- ${a.title} (${a.source}) : ${a.summary_fr}`
        ).join('\n');
        const dimLabel = DIMENSIONS[options.dimension]?.label || options.dimension;
        contextInstruction = `Synth\u00e9tise les articles suivants de la dimension "${dimLabel}" = "${options.dimensionValue}" :
${summaries}

\u00c9cris un post LinkedIn qui fait la synth\u00e8se de cette th\u00e9matique, avec ton analyse et tes recommandations.`;
    }

    const prompt = `Tu es un expert en cybers\u00e9curit\u00e9 avec une forte pr\u00e9sence sur LinkedIn.

${contextInstruction}

Consignes pour le post :
- Ton : ${tone}
- Langue : ${lang}
- Maximum 3000 caract\u00e8res
- Commence par une accroche percutante (1-2 lignes)
- Structure avec des sauts de ligne pour la lisibilit\u00e9
- Inclus 3-5 hashtags pertinents \u00e0 la fin
- Utilise des emojis avec parcimonie (2-4 maximum) pour la mise en forme
- Termine par un call-to-action ou une question engageante
- Style professionnel LinkedIn, pas de langage familier
- Ne pas utiliser de markdown (pas de ** ou ##), juste du texte brut avec des emojis pour structurer

R\u00e9ponds UNIQUEMENT avec le texte du post LinkedIn, pr\u00eat \u00e0 \u00eatre copi\u00e9-coll\u00e9.`;

    return await callLLM(prompt, 1500);
}
