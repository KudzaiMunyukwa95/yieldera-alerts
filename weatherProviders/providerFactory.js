const openMeteo = require('./openMeteo');

// You can expand this later to support meteomatics, etc.
function getProvider(providerName = 'open-meteo') {
  switch (providerName) {
    case 'open-meteo':
    default:
      return openMeteo;
  }
}

module.exports = { getProvider };
