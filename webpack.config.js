const path = require('path');

module.exports = {
  entry: './public/client.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'public/dist'),
  },
  resolve: {
    fallback: {
      "buffer": false,
      "crypto": false
    }
  }
};