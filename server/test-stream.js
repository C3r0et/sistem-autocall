require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');

// Bypass console log limits
const token = jwt.sign({ id: 'ID-TEST01' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const number = '081299868548'; 
const timestamp = '2026-03-27T08:13:12.000Z'; 

const options = {
  hostname: 'localhost',
  port: 3001,
  path: `/api/recordings/stream?number=${number}&date=${encodeURIComponent(timestamp)}&token=${token}`,
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers, null, 2)}`);
  
  let receivedData = 0;
  res.on('data', (chunk) => {
    receivedData += chunk.length;
    if (receivedData > 0) {
        console.log(`Received first chunk of ${chunk.length} bytes`);
        req.destroy(); // Stop receiving
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem: ${e.message}`);
});
req.end();
