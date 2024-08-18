const fs = require('fs');

function readExchangeRate(callback) {
    fs.readFile('rate.json', 'utf8', (err, data) => {
        if (err) {
            callback(err, null);
            return;
        }
        const exchangeRateObj = JSON.parse(data);
        callback(null, exchangeRateObj.exchange_rate);
    });
}

module.exports = readExchangeRate;
