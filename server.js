const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Serve all static files from the current directory
app.use(express.static(path.join(__dirname)));

// Fallback: serve index.html for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ETH Earner Mini App running on port ${PORT}`);
});
