
const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Gemini 503/429 kabi vaqtinchalik xatolarda qayta urinish
async function generateWithRetry(instruction, maxRetries = 3) {
  const delays = [2000, 5000, 10000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Gemini so'rovi: urinish ${attempt + 1}/${maxRetries + 1}`
      );

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: instruction
      });

      return response;

    } catch (error) {
      const status = error?.status;
      const message = error?.message || '';

      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        message.includes('high demand') ||
        message.includes('UNAVAILABLE') ||
        message.includes('overloaded');

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = delays[attempt] || 10000;

      console.log(
        `Gemini vaqtincha band. ${delay / 1000} soniyadan keyin qayta uriniladi...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

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

Juda muhim:
- Aynan ${safeCount} ta savol yarat.
- Har bir savolda aynan 4 ta variant bo'lsin.
- Faqat bitta javob to'g'ri bo'lsin.
- "correct" faqat 0, 1, 2 yoki 3 bo'lsin.
- Javob faqat JSON bo'lsin.
- Markdown ishlatma.
- JSON oldidan yoki keyin hech qanday izoh yozma.

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

    const response = await generateWithRetry(instruction);

    let text = response?.text;

    if (!text) {
      throw new Error('AI bo‘sh javob qaytardi.');
    }

    text = text.trim();

    // ```json ... ``` bo'lsa olib tashlash
    if (text.startsWith('```')) {
      text = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error('AI JSON parse xatosi:', text);

      throw new Error(
        'AI JSON formatida to‘g‘ri javob qaytarmadi.'
      );
    }

    if (!result.questions || !Array.isArray(result.questions)) {
      throw new Error(
        'AI noto‘g‘ri formatda javob qaytardi.'
      );
    }

    // Savollarni tekshirish
    const validQuestions = result.questions.filter(question => {
      return (
        question &&
        typeof question.question === 'string' &&
        Array.isArray(question.options) &&
        question.options.length === 4 &&
        Number.isInteger(question.correct) &&
        question.correct >= 0 &&
        question.correct <= 3 &&
        typeof question.explanation === 'string'
      );
    });

    if (validQuestions.length === 0) {
      throw new Error(
        'AI hech qanday yaroqli test savolini qaytarmadi.'
      );
    }

    res.json({
      questions: validQuestions
    });

  } catch (error) {
    console.error('AI test error:', error);

    const status = error?.status;

    // Gemini serveri band bo'lib, barcha retrylar ham muvaffaqiyatsiz bo'lsa
    if (
      status === 503 ||
      error?.message?.includes('high demand') ||
      error?.message?.includes('UNAVAILABLE')
    ) {
      return res.status(503).json({
        error:
          'AI serveri hozir juda band. Bir ozdan keyin yana urinib ko‘ring.',
        retryable: true
      });
    }

    // Rate limit
    if (status === 429) {
      return res.status(429).json({
        error:
          'AI so‘rovlari limiti vaqtincha tugagan. Bir ozdan keyin yana urinib ko‘ring.',
        retryable: true
      });
    }

    res.status(500).json({
      error: 'AI test yaratishda xatolik.',
      details: error.message
    });
  }
});

module.exports = router;
