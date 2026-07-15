const axios = require('axios');
require('dotenv').config();

async function run() {
  const port = process.env.PORT || 5000;
  const url = `http://localhost:${port}/api`;
  const email = process.env.CHECK_API_EMAIL;
  const password = process.env.CHECK_API_PASSWORD;
  if (!email || !password) {
    console.error('Set CHECK_API_EMAIL and CHECK_API_PASSWORD in the environment before running this script.');
    process.exit(1);
  }
  console.log('Target API URL:', url);
  try {
    const loginRes = await axios.post(`${url}/auth/login`, {
      email,
      password
    });
    const token = loginRes.data.token;
    console.log('Logged in successfully, token retrieved.');

    const dashboardRes = await axios.get(`${url}/articles/dashboard?type=evergreen`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const evergreenItems = dashboardRes.data.evergreen;
    console.log('Evergreen items count:', evergreenItems.length);
    if (evergreenItems.length > 0) {
      console.log('Sample item from API:', JSON.stringify(evergreenItems[0], null, 2));
    }
  } catch (err) {
    console.error('Error fetching data:', err.response?.data || err.message);
  }
  process.exit(0);
}
run();
