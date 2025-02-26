// The code below merges your existing /active and /vote routes with a missing /questions route.
// Place this in your server.js, commit, and deploy to Heroku.
// This way, the Controller can fetch all questions by question number, and the Player can fetch the active one.

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // for Node <=16 or node-fetch@2
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Config Vars
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const QUIZ_TABLE = 'Quiz';
const VOTES_TABLE = 'Votes';

// Helper to call Airtable
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

/**
 * GET /questions
 * Returns all questions sorted by Question Number.
 * The Controller uses this to load the entire quiz.
 */
app.get('/questions', async (req, res) => {
  try {
    // Sort by the numeric field "Question Number" ascending
    const data = await airtableFetch(`${QUIZ_TABLE}?sort[0][field]=Question%20Number&sort[0][direction]=asc`);
    res.json(data.records);
  } catch (err) {
    console.error('Error in GET /questions:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /active
 * Returns the first Quiz record where {Active Question} is true.
 * The Player uses this to see which question is live.
 */
app.get('/active', async (req, res) => {
  try {
    // If your checkbox is named exactly "Active Question",
    // you can do filterByFormula={Active Question} = TRUE()
    const filter = encodeURIComponent('{Active Question} = TRUE()');
    const data = await airtableFetch(`${QUIZ_TABLE}?filterByFormula=${filter}`);

    if (!data.records || !data.records.length) {
      // No active question => return an object with active:false
      return res.json({ active: false });
    }
    const record = data.records[0];
    res.json({
      active: true,
      questionId: record.id,
      fields: record.fields
    });
  } catch (err) {
    console.error('Error in GET /active:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /vote
 * Expects JSON { voterName, questionId, answerNumber }
 * Creates a new record in "Votes"
 */
app.post('/vote', async (req, res) => {
  try {
    const { voterName, questionId, answerNumber } = req.body;
    if (!voterName || !questionId || !answerNumber) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Create a new record in Votes
    // "Question" is a linked field referencing the Quiz record (by ID)
    // "Voter Name" is text, "Vote" is 1–4
    const postBody = {
      records: [
        {
          fields: {
            'Voter Name': voterName,
            'Question': [questionId],
            'Vote': answerNumber.toString()
          }
        }
      ]
    };

    const result = await airtableFetch(VOTES_TABLE, {
      method: 'POST',
      body: JSON.stringify(postBody)
    });

    // Return the new record
    res.json({ success: true, voteRecord: result.records[0] });
  } catch (err) {
    console.error('Error in POST /vote:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
