const path = require('path');
//const webpackUglifyJsPlugin = require('webpack-uglify-js-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  //mode: 'development',
  entry: './Mix_Combine.js',
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'dist.combine.js',
  },
  plugins:  [
    new webpack.DefinePlugin({
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: true,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: { allowTsInNodeModules: true }
        //exclude: /node_modules/,
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      vue: "vue/dist/vue.esm-bundler.js"
    }
  }
};