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
const VOTES_TABLE = 'Votes'; // change if yours is called something else

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

// 2) GET /results/:num => show question + answer texts + which is correct + how many votes each answer got
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
    const questionId = quizRecord.id;

    // Now fetch votes for that question record
    // If the "Question" field in Votes is a linked record, we can search:
    const votesFilter = encodeURIComponent(`SEARCH("${questionId}", ARRAYJOIN({Question}))`);
    const votesData = await airtableFetch(`${VOTES_TABLE}?filterByFormula=${votesFilter}`);

    // Tally votes in an object
    const counts = { '1': 0, '2': 0, '3': 0, '4': 0 };
    (votesData.records || []).forEach(v => {
      const voteVal = v.fields['Vote'];
      if (counts[voteVal] !== undefined) {
        counts[voteVal]++;
      }
    });

    // Return final JSON
    res.json({
      questionNumber: qFields['Question Number'],
      question: qFields['Question'] || '',
      answers: {
        '1': qFields['Answer 1'] || '',
        '2': qFields['Answer 2'] || '',
        '3': qFields['Answer 3'] || '',
        '4': qFields['Answer 4'] || ''
      },
      correctAnswer: qFields['Correct Answer'] || '',
      votes: counts
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
