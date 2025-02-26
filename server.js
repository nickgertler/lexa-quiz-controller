// server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // for Node v14–16 or node-fetch@2
require('dotenv').config(); // so we can use .env locally

const app = express();
app.use(cors());
app.use(express.json());

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const QUIZ_TABLE = 'Quiz';   // change if yours is called something else

// Helper: call Airtable
async function airtableFetch(path, options = {}) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await resp.json();
  if (data.error) {
    throw new Error(`Airtable error: ${JSON.stringify(data.error)}`);
  }
  return data;
}

// 1) GET /questions => list all questions sorted by Question Number
app.get('/questions', async (req, res) => {
  try {
    const data = await airtableFetch(
      `${QUIZ_TABLE}?sort[0][field]=Question%20Number&sort[0][direction]=asc`
    );
    res.json(data.records);
  } catch (error) {
    console.error('Error in GET /questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2) GET /results/:num => read the rollup fields for each answer’s vote count
app.get('/results/:num', async (req, res) => {
  try {
    const questionNum = req.params.num;

    // Find the question record by {Question Number} = questionNum
    const filterFormula = encodeURIComponent(`{Question Number} = ${questionNum}`);
    const quizData = await airtableFetch(`${QUIZ_TABLE}?filterByFormula=${filterFormula}`);
    if (!quizData.records || !quizData.records.length) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const quizRecord = quizData.records[0];
    const qFields = quizRecord.fields;

    // Return final JSON with rollup fields for each answer’s votes
    res.json({
      questionNumber: qFields['Question Number'] || 0,
      question: qFields['Question'] || '',
      answers: {
        '1': qFields['Answer 1'] || '',
        '2': qFields['Answer 2'] || '',
        '3': qFields['Answer 3'] || '',
        '4': qFields['Answer 4'] || ''
      },
      correctAnswer: qFields['Correct Answer'] || '',
      votes: {
        '1': qFields['a1 Votes'] || 0,
        '2': qFields['a2 Votes'] || 0,
        '3': qFields['a3 Votes'] || 0,
        '4': qFields['a4 Votes'] || 0
      }
    });
  } catch (error) {
    console.error('Error in GET /results/:num:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Quiz server listening on port ${PORT}`);
});
