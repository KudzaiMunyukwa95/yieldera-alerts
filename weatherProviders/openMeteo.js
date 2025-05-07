const axios = require('axios');

// Fetch current weather from Open-Meteo using lat/lon
async function fetchCurrentWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const response = await axios.get(url);
    return response.data.current_weather;
  } catch (err) {
    console.error("❌ Open-Meteo fetch error:", err.message);
    return null;
  }
}

module.exports = {
  fetchCurrentWeather
};
