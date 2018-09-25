#!/usr/bin/env node

var pa11yApiClient = require('../index.js');
var program = require('commander');

program
.command('sitemap <token> <sitemapUrl>')
.alias('sm')
.option('-a, --api <api>',                  'url to the pa11y API')
.option('-w, --worker <worker>',            'url to the pa11y worker')
.option('-c, --concurrency <concurrency>',  'amount of workers to use')
.action(function(token, sitemapUrl) {
  if (typeof sitemapUrl !== "undefined") {
    let api = (program.commands[0].api || "https://api.seoa11y.com");
    let worker = (program.commands[0].worker || "http://worker.seoa11y.com");
    let concurrency = (program.commands[0].concurrency || 1);
    pa11yApiClient.dispatch(
      token,
      api,
      worker,
      concurrency,
      sitemapUrl,
      console.log
    )
    .then(function (report) {
      console.log('Report created: ' + report._id);
    });
  }
})

program
.command('list <token> <urlList>')
.alias('l')
.option('-a, --api <api>',                  'url to the pa11y API')
.option('-w, --worker <worker>',            'url to the pa11y worker')
.option('-c, --concurrency <concurrency>',  'amount of workers to use')
.action(function(token, urlList) {
  if (typeof urlList !== "undefined") {
    let arrayOfUrls = urlList.split(',');
    if (arrayOfUrls.length > 0) {
      let api = (program.commands[1].api || "https://api.seoa11y.com");
      let worker = (program.commands[1].worker || "http://worker.seoa11y.com");
      let concurrency = (program.commands[1].concurrency || 1);
      pa11yApiClient.runOnList(
        token,
        api,
        worker,
        concurrency,
        arrayOfUrls,
        console.log
      )
      .then(function (report) {
        console.log('Report created: ' + report._id);
      });
    }
  }
})

program
.command('get <token> <type> <id>')
.alias('g')
.option('-a, --api <api>', 'url to the pa11y API')
.action(function(token, type, id) {
  let api = (program.commands[2].api || "https://api.seoa11y.com");
  let method = 'get' + type.charAt(0).toUpperCase() + type.slice(1);
  pa11yApiClient[method](api, id)
    .then(function (response) {
      console.log(response);
    })
})

program
.command('getlist <token> <type>')
.alias('gl')
.option('-a, --api <api>', 'url to the pa11y API')
.action(function(token, type) {
  let api = (program.commands[3].api || "https://api.seoa11y.com");
  let method = 'get' + type.charAt(0).toUpperCase() + type.slice(1) + 's';
  pa11yApiClient[method](api)
    .then(function (response) {
      console.log(response);
    });
})

program.parse(process.argv);
