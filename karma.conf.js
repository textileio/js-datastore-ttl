module.exports = function(config) {
  config.set({
    frameworks: ['mocha', 'chai', 'karma-typescript'],
    files: ['src/**/*.ts'],
    exclude: ['src/@types/**'],
    preprocessors: {
      '**/*.ts': ['karma-typescript'],
    },
    reporters: ['progress', 'karma-typescript', 'dots'],
    browsers: ['FirefoxHeadless'],
    phantomJsLauncher: {
      exitOnResourceError: true,
    },
    singleRun: true,
    karmaTypescriptConfig: {
      // compilerOptions: {
      // module: "commonjs",
      // },
      tsconfig: './tsconfig.json',
      reports: {
        html: 'coverage',
        'text-summary': '', // Destination "" will redirect output to the console
      },
      bundlerOptions: {
        acornOptions: {
          ecmaVersion: 9,
        },
      },
    },
  })
}
