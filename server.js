// server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // For node-fetch v2
require('dotenv').config(); // So we can use .env locally (Heroku uses Config Vars)

// Read env vars
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const QUIZ_TABLE = 'Quiz';
const VOTES_TABLE = 'Votes';

const app = express();
app.use(cors());
app.use(express.json());

// Helper to call Airtable
async function airtableFetch(path, options = {}) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Airtable error: ${JSON.stringify(data.error)}`);
  }
  return data;
}

// 1) GET /questions → Returns all questions sorted by Question Number
app.get('/questions', async (req, res) => {
  try {
    // Sort by Question Number ascending
    const data = await airtableFetch(`${QUIZ_TABLE}?sort[0][field]=Question%20Number&sort[0][direction]=asc`);
    res.json(data.records);
  } catch (error) {
    console.error('Error in GET /questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2) GET /question/:num → Returns a single question by Question Number
app.get('/question/:num', async (req, res) => {
  try {
    const questionNum = req.params.num;
    // Filter for records where {Question Number} = questionNum
    const filterFormula = encodeURIComponent(`{Question Number} = ${questionNum}`);
    const data = await airtableFetch(`${QUIZ_TABLE}?filterByFormula=${filterFormula}`);
    if (!data.records || !data.records.length) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(data.records[0]); 
  } catch (error) {
    console.error('Error in GET /question/:num:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3) GET /results/:num → Returns question details + vote counts for question # :num
app.get('/results/:num', async (req, res) => {
  try {
    const questionNum = req.params.num;

    // First, find the Quiz record by question number
    const filterFormula = encodeURIComponent(`{Question Number} = ${questionNum}`);
    const quizData = await airtableFetch(`${QUIZ_TABLE}?filterByFormula=${filterFormula}`);
    if (!quizData.records || !quizData.records.length) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const quizRecord = quizData.records[0];
    const quizFields = quizRecord.fields;
    const questionId = quizRecord.id;

    // Next, fetch all Votes linked to this question
    // We'll filter the Votes table: {Question} contains questionId
    // If {Question} is a linked-record array, we can do:
    const votesFilter = encodeURIComponent(`SEARCH("${questionId}", ARRAYJOIN({Question}))`);
    const votesData = await airtableFetch(`${VOTES_TABLE}?filterByFormula=${votesFilter}`);

    // Tally the votes by "Vote" field
    const counts = { '1': 0, '2': 0, '3': 0, '4': 0 };
    for (const v of (votesData.records || [])) {
      const voteVal = v.fields['Vote'];
      if (voteVal && counts[voteVal] !== undefined) {
        counts[voteVal]++;
      }
    }

    // Return aggregated info
    res.json({
      questionNumber: quizFields['Question Number'],
      question: quizFields['Question'],
      answers: {
        '1': quizFields['Answer 1'] || '',
        '2': quizFields['Answer 2'] || '',
        '3': quizFields['Answer 3'] || '',
        '4': quizFields['Answer 4'] || ''
      },
      correctAnswer: quizFields['Correct Answer'] || '',
      results: counts
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
