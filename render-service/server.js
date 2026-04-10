// Placeholder — Claude Code will build this
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.listen(PORT, () => {
  console.log(`Flyer render service running on port ${PORT}`);
});
