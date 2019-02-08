'use strict';

const xcode = require('appium-xcode');
const path = require('path');
const log = require('fancy-log');
const _ = require('lodash');
const { exec } = require('teen_process');
const { fs } = require('appium-support');


const MAX_BUFFER_SIZE = 524288;

const REAL_DEVICE_FLAGS = ['IOS_REAL_DEVICE', 'REAL_DEVICE'];

function configure (gulp, opts) {
  if (_.isEmpty(opts.iosApps)) {
    // nothing to do
    return;
  }

  // extract the paths from the enclosing package configuration
  const relativeLocations = opts.iosApps.relativeLocations;

  // figure out where things will go in the end
  const SDKS = {
    iphonesimulator: {
      name: 'iphonesimulator',
      buildPath: path.resolve('build', 'Release-iphonesimulator', opts.iosApps.appName),
      finalPath: relativeLocations.iphonesimulator
    },
    iphoneos: {
      name: 'iphoneos',
      buildPath: path.resolve('build', 'Release-iphoneos', opts.iosApps.appName),
      finalPath: relativeLocations.iphoneos
    }
  };

  // the sdks against which we will build
  let sdks = ['iphonesimulator'];

  let sdkVer;
  async function getIOSSDK () {
    if (!sdkVer) {
      try {
        sdkVer = await xcode.getMaxIOSSDK();
      } catch (err) {
        log(`Unable to get max iOS SDK: ${err.message}`);
        throw err;
      }
    }
    return sdkVer;
  }

  function logErrorLines (str = '') {
    str = `${str}`;
    for (const line of str.split('\n')) {
      log.error(`    ${line}`);
    }
  }

  function logError (err, prefix = 'Failed:') {
    log.error(`${prefix}: ${err.message}`);
    log.error('Stdout:');
    logErrorLines(err.stdout);
    log.error('Stderr:');
    logErrorLines(err.stderr);
  }

  async function cleanApp (appRoot, sdk) {
    log(`Cleaning app for ${sdk} at app root '${appRoot}'`);
    try {
      const cmd = 'xcodebuild';
      const args = ['-sdk', sdk, 'clean'];
      log(`    Executing command '${cmd} ${args.join(' ')}'`);
      await exec(cmd, args, {cwd: appRoot, maxBuffer: MAX_BUFFER_SIZE});
    } catch (err) {
      logError(err, 'Failed cleaning app');
      throw err;
    }
  }

  gulp.task('ios-apps:sdks', function findSDKs (done) {
    // determine if the real device sdk should be used, too
    for (const flag of REAL_DEVICE_FLAGS) {
      const value = process.env[flag];
      if (!_.isEmpty(value)) {
        log(`Enabling real device build because '${flag}' environment variable set (value is '${value}')`);
        sdks.push('iphoneos');
      }
    }
    log(`SDKs to process: ${sdks.map((sdk) => `'${sdk}'`).join(', ')}`);
    done();
  });

  gulp.task('ios-apps:clean', async function cleanAll () {
    log('Cleaning all sdks');
    const sdkVer = await getIOSSDK();
    for (const sdk of sdks) {
      await cleanApp('.', sdk + sdkVer);
    }

    log('Deleting all apps');
    const apps = [
      SDKS.iphonesimulator.buildPath,
      SDKS.iphonesimulator.finalPath,
      SDKS.iphoneos.buildPath,
      SDKS.iphoneos.finalPath,
    ];
    for (const app of apps) {
      log(`    Deleting app '${app}'`);
      await fs.rimraf(app);
    }
  });

  async function buildApp (appRoot, sdk) {
    log(`Building app for ${sdk} at app root '${appRoot}'`);
    try {
      // let cmd = `xcodebuild -sdk ${sdk}`;
      const cmd = 'xcodebuild';
      let args = ['-sdk', sdk];
      if (process.env.XCCONFIG_FILE) {
        args.push('-xcconfig', process.env.XCCONFIG_FILE);
      }

      log(`    Executing command '${cmd} ${args.join(' ')}'`);
      await exec(cmd, args, {cwd: appRoot, maxBuffer: MAX_BUFFER_SIZE});
    } catch (err) {
      logError(err, 'Failed building app');
      throw err;
    }
  }

  gulp.task('ios-apps:build', async function buildAll () {
    log('Building all apps');
    const sdkVer = await getIOSSDK();
    for (const sdk of sdks) {
      await buildApp('.', sdk + sdkVer);
    }
  });

  gulp.task('ios-apps:rename', async function () {
    log('Renaming apps');
    for (const sdk of sdks) {
      log(`    Renaming for ${sdk}`);
      await fs.rename(SDKS[sdk].buildPath, SDKS[sdk].finalPath);
    }
  });

  gulp.task('ios-apps:install', gulp.series('ios-apps:sdks', 'ios-apps:clean', 'ios-apps:build', 'ios-apps:rename'));
}

module.exports = {
  configure,
};