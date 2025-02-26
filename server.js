// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

// Log basic info about env vars (true/false instead of printing secret)
console.log("Has AIRTABLE_API_KEY?", !!process.env.AIRTABLE_API_KEY);
console.log("Has AIRTABLE_BASE_ID?", !!process.env.AIRTABLE_BASE_ID);
console.log("Has AIRTABLE_TABLE_NAME?", !!process.env.AIRTABLE_TABLE_NAME);

// Standard config
const app = express();
app.use(cors());
app.use(express.json());

// Read environment vars
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Quiz';
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

// GET /active
app.get('/active', async (req, res) => {
  try {
    console.log("Received GET /active");
    // Filter for records where {Active Question} is checked
    // If your checkbox formula in Airtable requires =TRUE(), try:
    // const filterFormula = encodeURIComponent('{Active Question} = TRUE()');
    const filterFormula = encodeURIComponent('{Active Question}');
    const url = `${AIRTABLE_URL}?filterByFormula=${filterFormula}`;

    console.log("Fetching from Airtable:", url);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const data = await response.json();

    if (data.error) {
      // If Airtable returns an error object
      console.error("Airtable responded with an error:", data.error);
      return res.status(500).json({ error: data.error });
    }
    if (!data.records || !data.records.length) {
      console.log("No active question found!");
      return res.json({ error: 'No active question found' });
    }

    const record = data.records[0];
    console.log("Found active question record:", record.id);
    res.json(record);
  } catch (error) {
    console.error("Error in GET /active:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /next
app.post('/next', async (req, res) => {
  try {
    console.log("Received POST /next");
    // 1) Find the current active question
    const filterFormula = encodeURIComponent('{Active Question}');
    const currentResponse = await fetch(`${AIRTABLE_URL}?filterByFormula=${filterFormula}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const currentData = await currentResponse.json();

    if (currentData.error) {
      console.error("Airtable responded with an error (currentData):", currentData.error);
      return res.status(500).json({ error: currentData.error });
    }

    // Prepare batch to uncheck current active
    const updates = [];
    if (currentData.records && currentData.records.length) {
      for (let rec of currentData.records) {
        updates.push({
          id: rec.id,
          fields: { 'Active Question': false },
        });
      }
    }

    // 2) Find all quiz records
    const allResponse = await fetch(AIRTABLE_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const allData = await allResponse.json();

    if (allData.error) {
      console.error("Airtable responded with an error (allData):", allData.error);
      return res.status(500).json({ error: allData.error });
    }

    // 3) Pick the first record that is not active to be the new active
    const nextRecord = allData.records.find(r => !r.fields['Active Question']);
    if (nextRecord) {
      updates.push({
        id: nextRecord.id,
        fields: { 'Active Question': true },
      });
      console.log("Will set next record active:", nextRecord.id);
    }

    // 4) Perform the batch update if there's anything to update
    if (updates.length > 0) {
      console.log("Sending PATCH to Airtable:", updates);
      const patchResponse = await fetch(AIRTABLE_URL, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: updates }),
      });
      const patchData = await patchResponse.json();
      if (patchData.error) {
        console.error("Airtable responded with an error (patchData):", patchData.error);
        return res.status(500).json({ error: patchData.error });
      }
    } else {
      console.log("No records found to update!");
    }

    // Return success
    if (nextRecord) {
      res.json({ newActive: nextRecord.id });
    } else {
      res.json({ message: 'No next question found' });
    }
  } catch (error) {
    console.error("Error in POST /next:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
