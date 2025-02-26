// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config(); // lets us read .env locally (not needed on Heroku)

const app = express();
app.use(cors());
app.use(express.json()); // so we can parse JSON in POST/PUT bodies

// Read environment vars (on Heroku, from Config Vars; locally, from .env)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Quiz';
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

// 1) GET /active : returns the currently "Active Question"
app.get('/active', async (req, res) => {
  try {
    const response = await fetch(`${AIRTABLE_URL}?filterByFormula={Active Question}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const data = await response.json();
    if (!data.records.length) {
      return res.json({ error: 'No active question found' });
    }
    // Return the first matching record
    const record = data.records[0];
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2) POST /next : unchecks the current active question and sets the next question as active
app.post('/next', async (req, res) => {
  try {
    // 2A) Find the current active question
    const currentResponse = await fetch(`${AIRTABLE_URL}?filterByFormula={Active Question}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const currentData = await currentResponse.json();
    // Uncheck the current active question
    const updates = [];
    for (let rec of currentData.records) {
      updates.push({
        id: rec.id,
        fields: { 'Active Question': false },
      });
    }

    // 2B) Find *all* quiz records. We'll just pick the next in line for example:
    // In real usage, you might store an "Order" or "Sequence" field. For simplicity, we pick any question that isn't active and update the first one.
    const allResponse = await fetch(`${AIRTABLE_URL}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const allData = await allResponse.json();
    // Find a record that is not active
    const nextRecord = allData.records.find(r => !r.fields['Active Question']);
    if (nextRecord) {
      updates.push({
        id: nextRecord.id,
        fields: { 'Active Question': true },
      });
    }

    // 2C) Perform the batch update
    if (updates.length > 0) {
      await fetch(AIRTABLE_URL, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: updates }),
      });
    }

    // Return the new “Active Question” record
    if (nextRecord) {
      res.json({ newActive: nextRecord.id });
    } else {
      res.json({ message: 'No next question found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
