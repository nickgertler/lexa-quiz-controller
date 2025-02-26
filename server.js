// server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // For Node <=16 or node-fetch@2
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables on Heroku
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const QUIZ_TABLE = 'Quiz';
const VOTES_TABLE = 'Votes';
const SESSION_TABLE = 'Session'; // includes fields: Name (text), Current Question (number)

// Helper: talk to Airtable
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

/** -----------------------------------------------------------------------
 *  GET /questions
 *  (Optional) Returns all quiz questions sorted by Question Number
 *  The controller might use this to list or preview them.
 */
app.get('/questions', async (req, res) => {
  try {
    const data = await airtableFetch(`${QUIZ_TABLE}?sort[0][field]=Question%20Number&sort[0][direction]=asc`);
    res.json(data.records);
  } catch (err) {
    console.error('Error in GET /questions:', err);
    res.status(500).json({ error: err.message });
  }
});

/** -----------------------------------------------------------------------
 *  POST /session
 *  Create a new session record in the Session table
 *  Expects JSON: { sessionName }
 *  Sets \"Name\" = sessionName, \"Current Question\" = 0 (meaning not started)
 */
app.post('/session', async (req, res) => {
  try {
    const { sessionName } = req.body;
    if (!sessionName) {
      return res.status(400).json({ error: 'Missing sessionName' });
    }

    // Create a new record in \"Session\"
    const postBody = {
      records: [
        {
          fields: {
            'Name': sessionName,
            'Current Question': 0
          }
        }
      ]
    };

    const result = await airtableFetch(SESSION_TABLE, {
      method: 'POST',
      body: JSON.stringify(postBody)
    });

    res.json({ success: true, sessionRecord: result.records[0] });
  } catch (err) {
    console.error('Error in POST /session:', err);
    res.status(500).json({ error: err.message });
  }
});

/** -----------------------------------------------------------------------
 *  GET /session/:sessionName
 *  Returns the session record (Name, Current Question).
 *  The controller might use this to confirm the session state,
 *  or the player might do so if needed.
 */
app.get('/session/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    // Filter by formula => {Name} = 'OfficeParty2025', e.g.
    const filter = encodeURIComponent(`{Name} = '${sessionName}'`);
    const data = await airtableFetch(`${SESSION_TABLE}?filterByFormula=${filter}`);

    if (!data.records.length) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(data.records[0]);
  } catch (err) {
    console.error('Error in GET /session/:sessionName:', err);
    res.status(500).json({ error: err.message });
  }
});

/** -----------------------------------------------------------------------
 *  POST /session/:sessionName/next
 *  Increments the \"Current Question\" by 1
 *  The controller calls this to move on to the next question.
 */
app.post('/session/:sessionName/next', async (req, res) => {
  try {
    const { sessionName } = req.params;

    // 1) Find the session
    const filter = encodeURIComponent(`{Name} = '${sessionName}'`);
    const sessionData = await airtableFetch(`${SESSION_TABLE}?filterByFormula=${filter}`);
    if (!sessionData.records.length) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const sessionRec = sessionData.records[0];
    const currentQ = sessionRec.fields['Current Question'] || 0;

    // 2) Increment
    const updated = currentQ + 1;

    // 3) Patch the record
    const patchBody = {
      records: [
        {
          id: sessionRec.id,
          fields: {
            'Current Question': updated
          }
        }
      ]
    };
    const patchRes = await airtableFetch(SESSION_TABLE, {
      method: 'PATCH',
      body: JSON.stringify(patchBody)
    });
    res.json({ success: true, newCurrentQuestion: updated, updatedRecord: patchRes.records[0] });
  } catch (err) {
    console.error('Error in POST /session/:sessionName/next:', err);
    res.status(500).json({ error: err.message });
  }
});

/** -----------------------------------------------------------------------
 *  GET /active?session=MySession
 *  Returns the currently active question for that session, or indicates waiting/end
 *  Logic:
 *   1) Find the session by Name
 *   2) If Current Question == 0 => return { waiting: true }
 *   3) Otherwise fetch the quiz question with that \"Question Number\"
 *      - If none found => end of quiz => { end: true }
 *      - Else return { questionId, fields } for that question
 */
app.get('/active', async (req, res) => {
  try {
    const sessionName = req.query.session;
    if (!sessionName) {
      return res.status(400).json({ error: 'Missing session query param' });
    }

    // 1) Find session
    const filter = encodeURIComponent(`{Name} = '${sessionName}'`);
    const sessionData = await airtableFetch(`${SESSION_TABLE}?filterByFormula=${filter}`);
    if (!sessionData.records.length) {
      return res.json({ error: 'Session not found' });
    }
    const sessionRec = sessionData.records[0];
    const currentQ = sessionRec.fields['Current Question'] || 0;

    // 2) If Current Question = 0 => waiting
    if (currentQ === 0) {
      return res.json({ waiting: true });
    }

    // 3) Fetch the Quiz record by question number
    const quizFilter = encodeURIComponent(`{Question Number} = ${currentQ}`);
    const quizData = await airtableFetch(`${QUIZ_TABLE}?filterByFormula=${quizFilter}`);
    if (!quizData.records.length) {
      // Means we've passed the last question => end of quiz
      return res.json({ end: true });
    }

    // 4) Return the active question
    const qRec = quizData.records[0];
    res.json({
      questionId: qRec.id,
      fields: qRec.fields
    });
  } catch (err) {
    console.error('Error in GET /active:', err);
    res.status(500).json({ error: err.message });
  }
});

/** -----------------------------------------------------------------------
 *  POST /vote
 *  Expects JSON: { sessionName, questionNumber, voterName, answerNumber }
 *  We'll:
 *   1) Find the Quiz record by questionNumber
 *   2) Create a new Vote record with that Quiz ID
 */
app.post('/vote', async (req, res) => {
  try {
    const { sessionName, questionNumber, voterName, answerNumber } = req.body;
    if (!sessionName || !questionNumber || !voterName || !answerNumber) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // 1) Find the quiz record by {Question Number} = questionNumber
    const quizFilter = encodeURIComponent(`{Question Number} = ${questionNumber}`);
    const quizData = await airtableFetch(`${QUIZ_TABLE}?filterByFormula=${quizFilter}`);
    if (!quizData.records.length) {
      return res.status(404).json({ error: 'Quiz question not found' });
    }
    const quizRecId = quizData.records[0].id;

    // 2) Create a new record in Votes
    const postBody = {
      records: [
        {
          fields: {
            'Voter Name': voterName,
            'Question': [quizRecId], // link to Quiz by record ID
            'Vote': answerNumber.toString(),
            // If you want to store the sessionName in the Votes table, add:
            // 'Session Name': sessionName
          }
        }
      ]
    };

    const result = await airtableFetch(VOTES_TABLE, {
      method: 'POST',
      body: JSON.stringify(postBody)
    });

    // Return the new vote record
    res.json({ success: true, voteRecord: result.records[0] });
  } catch (err) {
    console.error('Error in POST /vote:', err);
    res.status(500).json({ error: err.message });
  }
});

/** -----------------------------------------------------------------------
 *  Start the server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
