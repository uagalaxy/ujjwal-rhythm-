// api/generate-quiz.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { topic, difficulty, numQuestions, userApiKey } = req.body;

    if (!userApiKey) {
        return res.status(400).json({ error: 'User API Key is missing.' });
    }

    // Comprehensive Prompt Engineering safely hidden away from client inspection
    const prompt = `Generate ${numQuestions} objective questions about "${topic}" tailored exactly to a **${difficulty}** level of difficulty. 
Each question should have exactly 4 options (A, B, C, D), one correct answer, and a short, concise explanation. 
Provide the output as a JSON array of objects. Each object should have 'questionText', 'options' (an array of strings), 'correctAnswer' (the exact text matches one of your options array strings), and 'explanation'.`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "questionText": { "type": "STRING" },
                        "options": { "type": "ARRAY", "items": { "type": "STRING" } },
                        "correctAnswer": { "type": "STRING" },
                        "explanation": { "type": "STRING" }
                    },
                    required: ["questionText", "options", "correctAnswer", "explanation"]
                }
            }
        }
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${userApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || "Failed to connect to Gemini." });
        }

        const jsonString = data.candidates[0].content.parts[0].text;
        const rawQuestions = JSON.parse(jsonString);

        // Server-side data normalization to keep client processing light
        const sanitizedQuestions = rawQuestions.map(q => {
            return {
                questionText: q.questionText ? q.questionText.trim() : "",
                options: Array.isArray(q.options) ? q.options.map(opt => opt.trim()) : [],
                correctAnswer: q.correctAnswer ? q.correctAnswer.trim() : "",
                explanation: q.explanation ? q.explanation.trim() : "No explanation provided."
            };
        });

        return res.status(200).json(sanitizedQuestions);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

