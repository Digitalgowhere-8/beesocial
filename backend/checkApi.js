const axios = require('axios');
require('dotenv').config();

async function run() {
  const port = process.env.PORT || 5000;
  const url = `http://localhost:${port}/api`;
  console.log('Target API URL:', url);
  try {
    const loginRes = await axios.post(`${url}/auth/login`, {
      email: 'admin@opportunityos.ai',
      password: 'Admin@12345'
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
