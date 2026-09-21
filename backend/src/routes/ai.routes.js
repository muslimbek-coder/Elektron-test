const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

router.post('/generate-test', async (req, res) => {
  try {
    const {
      prompt,
      count = 10,
      difficulty = 'medium',
      language = 'uz'
    } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: 'Test mavzusi yoki prompt kiritilmagan.'
      });
    }

    const safeCount = Math.min(
      Math.max(Number(count) || 10, 1),
      50
    );

    const instruction = `
Sen professional o'qituvchi yordamchisisan.
O'zbek tilida test savollari yarat.

Foydalanuvchi so'rovi:
${String(prompt).trim()}

Savollar soni: ${safeCount}
Qiyinlik darajasi: ${difficulty}
Til: ${language}

Har bir savol:
- 1 ta savol matni
- aynan 4 ta javob varianti
- faqat bitta to'g'ri javob
- qisqa tushuntirish

Faqat JSON qaytar.
Markdown, izoh yoki boshqa matn yozma.

JSON formati:
{
  "questions": [
    {
      "question": "Savol matni",
      "options": [
        "A varianti",
        "B varianti",
        "C varianti",
        "D varianti"
      ],
      "correct": 0,
      "explanation": "Qisqa tushuntirish"
    }
  ]
}

"correct" qiymati:
0 = A
1 = B
2 = C
3 = D
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: instruction,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;

    const result = JSON.parse(text);

    if (!result.questions || !Array.isArray(result.questions)) {
      throw new Error('AI noto‘g‘ri formatda javob qaytardi.');
    }

    res.json({
      questions: result.questions
    });

  } catch (error) {
    console.error('AI test error:', error);

    res.status(500).json({
      error: 'AI test yaratishda xatolik.',
      details: error.message
    });
  }
});

module.exports = router;