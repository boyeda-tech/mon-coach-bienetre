import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSynthesisPrompt(profile, journals, weightHistory) {
  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date)) / 31557600000)
    : 'inconnu';

  const bmi = profile.weight_start && profile.height
    ? (profile.weight_start / Math.pow(profile.height / 100, 2)).toFixed(1)
    : 'inconnu';

  const equipment = Array.isArray(profile.equipment)
    ? profile.equipment.join(', ')
    : profile.equipment || 'non renseigné';

  const recentWeight = weightHistory?.length
    ? weightHistory[weightHistory.length - 1].weight
    : profile.weight_start;

  const journalSummary = (journals || []).map(j => {
    const parts = [];
    if (j.sante?.poids) parts.push(`poids ${j.sante.poids}kg`);
    if (j.sante?.fatigue !== undefined) parts.push(`fatigue ${j.sante.fatigue}/5`);
    if (j.sante?.douleur_genou !== undefined) parts.push(`genou ${j.sante.douleur_genou}/5`);
    if (j.alim?.hydratation !== undefined) parts.push(`eau ${j.alim.hydratation}L`);
    if (j.sport?.fait) parts.push(`sport: ${j.sport.type || 'oui'} ${j.sport.duree || ''}min`);
    if (j.hygiene?.qualite_sommeil) parts.push(`sommeil ${j.hygiene.qualite_sommeil}/5`);
    return `  - ${j.date}: ${parts.join(', ')}`;
  }).join('\n');

  return `Tu es un coach bien-être expert, bienveillant et précis. Voici le profil complet de ton patient :

PROFIL :
- Prénom : ${profile.first_name || 'Patient'}
- Âge : ${age} ans
- Sexe : ${profile.gender || 'non renseigné'}
- Profession : ${profile.profession || 'non renseigné'}
- Taille : ${profile.height || '?'} cm
- Poids de départ : ${profile.weight_start || '?'} kg
- Poids actuel : ${recentWeight || '?'} kg
- Objectif : ${profile.weight_target || '?'} kg
- IMC estimé : ${bmi}
- Traitement : ${profile.treatment || 'aucun'} (${profile.treatment_frequency || ''})
- Problème genou : ${profile.knee_issue ? 'OUI — genou droit arthrosique' : 'non'}
- Équipement disponible : ${equipment}
- Niveau fitness : ${profile.fitness_level || 'sédentaire'}

DONNÉES DES 7 DERNIERS JOURS :
${journalSummary || '  Aucune donnée disponible'}

ÉVOLUTION DU POIDS (7 derniers jours) :
${weightHistory?.map(w => `  - ${w.date}: ${w.weight} kg`).join('\n') || '  Aucune pesée'}

Génère une analyse structurée avec exactement ce format :

📊 **Bilan de la semaine**
[Synthèse en 3-4 phrases sur les tendances générales observées]

🍽 **Nutrition — 3 conseils concrets**
1. [Conseil spécifique basé sur les données]
2. [Conseil spécifique basé sur les données]
3. [Conseil spécifique basé sur les données]

🏋️ **Sport — recommandations adaptées**
[2-3 paragraphes adaptés au profil, en tenant compte du genou et de l'équipement disponible]

💊 **Traitement — suivi**
[Point sur la régularité de la prise et les effets observés]

🎯 **Meilleur combo pour accélérer la perte de poids**
[Combinaison nutrition + sport + récupération la plus efficace pour ce profil spécifique]

✅ **3 actions prioritaires cette semaine**
1. [Action concrète et mesurable]
2. [Action concrète et mesurable]
3. [Action concrète et mesurable]

Sois encourageant, précis, et adapte tes conseils au profil spécifique de ce patient.`;
}

function buildQuestionPrompt(profile, question) {
  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date)) / 31557600000)
    : 'inconnu';

  return `Tu es un coach bien-être expert et bienveillant. Tu réponds aux questions d'un patient avec son profil spécifique en tête.

PROFIL DU PATIENT :
- Prénom : ${profile.first_name || 'Patient'}, ${age} ans, ${profile.gender || ''}
- Poids : ${profile.weight_start || '?'} kg → objectif ${profile.weight_target || '?'} kg
- Traitement : ${profile.treatment || 'aucun'} (${profile.treatment_frequency || ''})
- Genou : ${profile.knee_issue ? 'problème genou droit arthrosique' : 'pas de problème'}
- Équipement : ${Array.isArray(profile.equipment) ? profile.equipment.join(', ') : profile.equipment || 'non renseigné'}
- Niveau : ${profile.fitness_level || 'sédentaire'}

QUESTION DU PATIENT :
${question}

Réponds de manière personnalisée, pratique et bienveillante. Sois concis (3-5 paragraphes max). Si pertinent, donne des exemples concrets ou des alternatives adaptées au profil.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, profile, journals, weightHistory, question } = req.body;

  if (!type || !profile) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let systemPrompt;
    let userMessage;

    if (type === 'synthesis') {
      systemPrompt = 'Tu es un coach bien-être expert, spécialisé en perte de poids saine et durable, nutrition équilibrée, et activité physique adaptée. Tu fournis des analyses personnalisées et des conseils pratiques basés sur les données réelles du patient.';
      userMessage = buildSynthesisPrompt(profile, journals, weightHistory);
    } else if (type === 'question') {
      if (!question) return res.status(400).json({ error: 'Missing question' });
      systemPrompt = 'Tu es un coach bien-être expert, bienveillant et à l\'écoute. Tu réponds aux questions de manière personnalisée en tenant compte du profil spécifique du patient.';
      userMessage = buildQuestionPrompt(profile, question);
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = message.content[0]?.text || '';
    res.status(200).json({ response: text });
  } catch (err) {
    console.error('Anthropic API error:', err);
    res.status(500).json({ error: 'AI service error', details: err.message });
  }
}
