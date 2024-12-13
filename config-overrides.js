const webpack = require('webpack');

module.exports = function override(config) {
  config.resolve = {
    ...config.resolve,
    fallback: {
      ...config.resolve.fallback,
      "stream": require.resolve("stream-browserify"),
      "crypto": require.resolve("crypto-browserify"),
      "https": require.resolve("https-browserify"),
      "http": require.resolve("stream-http"),
      "url": require.resolve("url/"),
      "vm": require.resolve("vm-browserify"),
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser"),
    },
    alias: {
      ...config.resolve.alias,
      'crypto': 'crypto-browserify'
    }
  };
  
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    })
  ];
  
  return config;
}; 