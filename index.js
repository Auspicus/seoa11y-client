var Promise = require("bluebird");
var unirest = require("unirest");
var async = require("async");
var DOMParser = require("xmldom").DOMParser;

module.exports = {
  /**
   * Get a list of issues, filtered by reportId and code
   *
   * @param  {String} apiUrl    url of the pa11y api
   * @param  {String} reportId  id of report
   * @param  {String} code      code name
   * @return Array<Issue>       list of issues filtered by reportId and code
   */
  getIssues: function(apiUrl, query) {
    query = query || {};
    return new Promise(function(resolve, reject) {
      if (typeof apiUrl !== "string")
        reject("apiUrl must be a string. Found: " + apiUrl);

      unirest.get(apiUrl + "/api/issues").query(query).end(function(response) {
        resolve(response.body);
      });
    });
  },

  getContexts: function(apiUrl, query) {
    query = query || {};
    return new Promise(function(resolve, reject) {
      if (typeof apiUrl !== "string")
        reject("apiUrl must be a string. Found: " + apiUrl);

      unirest.get(apiUrl + "/api/issues").query(query).end(function(response) {
        resolve(
          response.body.map(function(issue) {
            return issue.context;
          })
        );
      });
    });
  },

  getReports: function(apiUrl, query) {
    query = query || {};
    return new Promise(function(resolve, reject) {
      if (typeof apiUrl !== "string")
        reject("apiUrl must be a string. Found: " + apiUrl);

      unirest.get(apiUrl + "/api/reports").query(query).end(function(response) {
        resolve(response.body);
      });
    });
  },

  getUrls: function(apiUrl, query) {
    query = query || {};
    return new Promise(function(resolve, reject) {
      unirest.get(apiUrl + "/api/urls")
        .query(query)
        .end(function(response) {
          resolve(response.body);
        });
    });
  },

  getIssue: function(apiUrl, issueId) {
    return new Promise(function(resolve, reject) {
      if (typeof apiUrl !== "string")
        reject("apiUrl must be a string. Found: " + apiUrl);
      if (typeof issueId !== "string")
        reject("issueId must be a string. Found: " + issueId);

      unirest.get(apiUrl + "/api/issues/" + issueId).end(function(response) {
        resolve(response.body);
      });
    });
  },

  getReport: function(apiUrl, reportId) {
    return new Promise(function(resolve, reject) {
      unirest.get(apiUrl + "/api/reports/" + reportId).end(function(response) {
        resolve(response.body);
      });
    });
  },

  getUrl: function(apiUrl, urlId) {
    return new Promise(function(resolve, reject) {
      unirest.get(apiUrl + "/api/urls/" + reportId).end(function(response) {
        resolve(response.body);
      });
    });
  },

  /**
   * Helper to create issue in the database
   *
   * @param  {String} reportId  id of report this issue is associated to
   * @param  {String} url       url at which this issue was found
   * @param  {Object} issue     issue Object
   * @return Promise            Promise object
   */
  createIssue: function(settings) {
    return new Promise(function(resolve, reject) {
      unirest
        .post(settings.apiUrl + "/api/issues")
        .set('Authorization', 'Bearer ' + settings.token)
        .set('Content-Type', 'application/json')
        .send({
          code: settings.issue.code,
          context: settings.issue.context,
          message: settings.issue.message,
          selector: settings.issue.selector,
          type: settings.issue.type,
          typeCode: settings.issue.typeCode,
          reportId: settings.reportId,
          url: settings.url
        })
        .end(function(response) {
          resolve(response.body);
        });
    });
  },

  /**
   * [description]
   * @param  {[type]} apiUrl [description]
   * @param  {[type]} url    [description]
   * @return {[type]}        [description]
   */
  createUrl: function(settings) {
    return new Promise(function(resolve, reject) {
      unirest
        .post(settings.apiUrl + "/api/urls")
        .set('Authorization', 'Bearer ' + settings.token)
        .set('Content-Type', 'application/json')
        .send({
          reportId: settings.url.reportId,
          url: settings.url.url,
          codes: settings.url.codes,
          nErrors: settings.url.nErrors,
          nWarnings: settings.url.nWarnings,
          nNotices: settings.url.nNotices
        })
        .end(function(response) {
          if (response.statusType === 2) resolve(response.body);
          else reject(response.error);
        });
    });
  },

  /**
   * Helper to create report in the database
   *
   * @param  {Object} settings  settings object (apiUrl, report)
   * @return Promise            Promise object (resolves with reportId)
   */
  createReport: function(settings) {
    return new Promise(function(resolve, reject) {
      unirest
        .post(settings.apiUrl + "/api/reports")
        .set('Authorization', 'Bearer ' + settings.token)
        .set('Content-Type', 'application/json')
        .send(settings.report)
        .end(function(response) {
          if (response.statusType === 2) resolve({
            token: settings.token,
            apiUrl: settings.apiUrl,
            workerUrl: settings.workerUrl,
            concurrency: settings.concurrency,
            report: response.body
          });
          else reject(response.error);
        });
    });
  },

  updateReport: function(settings) {
    return new Promise(function(resolve, reject) {
      unirest
        .put(settings.apiUrl + "/api/reports/" + settings.report._id)
        .set('Authorization', 'Bearer ' + settings.token)
        .set('Content-Type', 'application/json')
        .send(settings.changes)
        .end(function(response) {
          if (response.statusType === 2) resolve(response.body);
          else reject(response.error);
        });
    });
  },

  addCodesFromIssues: function (codes, issues) {
    issues.forEach(function (issue) {
      if (codes.indexOf(issue.code) === -1) codes.push(issue.code);
    });
    return codes;
  },

  /**
   * Helper to queue a list of urls for a report
   *
   * @return [type]            [description]
   */
  queueJobs: function(settings) {
    var _this = this;
    return new Promise(function(resolve, reject) {
      var error = false;
      var onError = function (err) {
        error = true;
        reject(err);
      }
      var requeue = function (url) {
        console.error('Failed to run a pa11y test on url: ' + url + ' retrying...');
        queue.push(url);
      }
      var completed = 0;
      var codes = [];

      var queue = async.queue(function(url, done) {
        _this.postJobToWorker({
          token: settings.token,
          apiUrl: settings.apiUrl,
          workerUrl: settings.workerUrl,
          concurrency: settings.concurrency,
          report: settings.report,
          url: url
        })
          .then(function (settings) {
            _this.postIssues({
              token: settings.token,
              apiUrl: settings.apiUrl,
              workerUrl: settings.workerUrl,
              concurrency: settings.concurrency,
              report: settings.report,
              url: url,
              issues: settings.issues
            })
            .then(null, onError);

            _this.createUrl({
              token: settings.token,
              apiUrl: settings.apiUrl,
              url: _this.getIssuesMetadata({
                reportId: settings.report._id,
                url: settings.url,
                issues: settings.issues
              })
            })
            .then(null, onError);

            _this.updateReport({
              token: settings.token,
              apiUrl: settings.apiUrl,
              workerUrl: settings.workerUrl,
              concurrency: settings.concurrency,
              report: settings.report,
              url: url,
              issues: settings.issues,
              changes: {
                progress: ++completed / settings.report.urls.length,
                codes: _this.addCodesFromIssues(codes, settings.issues)
              }
            })
            .then(null, onError);

            console.log('[' + ((completed) / settings.report.urls.length * 100).toFixed(2) + '%] Sending data for url: ' + url);

            done();
          })
          .catch(function (err) {
            console.error(err);
            requeue(url);
            done();
          })
      }, settings.concurrency);

      queue.drain = function() {
        if (!error) resolve();
      };

      queue.push(settings.report.urls);
    });
  },

  postJobToWorker: function(settings) {
    return new Promise(function(resolve, reject) {
      unirest
        .post(settings.workerUrl)
        .set('Authorization', 'Bearer ' + settings.token)
        .headers({ "Content-Type": "application/json" })
        .send({ url: settings.url })
        .end(function(response) {
          if (response.statusType == 2) return resolve({
            token: settings.token,
            apiUrl: settings.apiUrl,
            workerUrl: settings.workerUrl,
            concurrency: settings.concurrency,
            url: settings.url,
            report: settings.report,
            issues: response.body
          });
          else return reject(response.error);
        });
    });
  },

  postIssues: function(settings) {
    var _this = this;
    return Promise.all(settings.issues.map(function(issue) {
      return _this.createIssue({
        token: settings.token,
        apiUrl: settings.apiUrl,
        reportId: settings.report._id,
        url: settings.url,
        issue: issue
      });
    }));
  },

  getIssuesMetadata: function(settings) {
    var metadata = {
      reportId: settings.reportId,
      url: settings.url,
      codes: [],
      nErrors: 0,
      nWarnings: 0,
      nNotices: 0
    };
    if (
      settings.issues != null && typeof settings.issues.forEach === "function"
    ) {
      settings.issues.forEach(function(issue) {
        if (metadata.codes.indexOf(issue.code) === -1)
          metadata.codes.push(issue.code);

        switch (issue.typeCode) {
          case 1:
            metadata.nErrors++;
            break;
          case 2:
            metadata.nWarnings++;
            break;
          case 3:
            metadata.nNotices++;
            break;
        }
      });
    }
    return metadata;
  },

  /**
   * Helper to get an Array of urls from a url to a sitemap xml document
   *
   * @param  {String} url               url of the sitemap xml document
   * @return Promise<Array<String>>     an array of urls found on the sitemap
   */
  getUrlsFromSitemapUrl: function(url) {
    return new Promise(function(resolve, reject) {
      unirest.get(url)
        .end(function(response) {
          var urls = [];
          var error = false;
          // Create an array of all the urls in the sitemap
          var parser = new DOMParser({
            errorHandler: function (level, msg) {
              error = true;
              return reject({level: level, msg: msg});
            }
          });
          var doc = parser.parseFromString(response.body, 'application/xml');
          var aTags = doc.documentElement.getElementsByTagName('loc');
          for (var i = 0; i < aTags.length; i++) {
            urls.push(aTags[i]['childNodes'][0]['data']);
          }
          if (!error) return resolve(urls);
        });
    });
  },

  /**
   * Dispatcher for pa11y sitemap based reports
   *
   * @param  {String}   apiUrl      url of the pa11y api
   * @param  {String}   workerUrl   url of the pa11y worker
   * @param  {Integer}  concurrency how many urls to dispatch at a time
   * @param  {String}   url         url of the sitemap xml document
   * @return Promise                Promise object (resolves with reportId)
   */
  dispatch: function(token, apiUrl, workerUrl, concurrency, url) {
    var _this = this;
    return new Promise(function(resolve, reject) {
      _this
        .getUrlsFromSitemapUrl(url)
        .then(function (urls) {
          return ({
            token: token,
            apiUrl: apiUrl,
            workerUrl: workerUrl,
            concurrency: concurrency,
            report: {
              rootUrl: url,
              standard: 'WCAG2AA',
              urls: urls
            }
          })
        })
        .catch(reject)
        .then(_this.runOnListSettings.bind(_this))
        .catch(reject)
        .then(function (report) {
          resolve(report);
        });
    });
  },

  runOnListSettings: function (settings) {
    return this.runOnList(settings.token, settings.apiUrl, settings.workerUrl, settings.concurrency, settings.report.urls);
  },

  /**
   * Dispatcher for pa11y list based reports
   *
   * @param  {String}   apiUrl       url of the pa11y api
   * @param  {String}   workerUrl    url of the pa11y worker
   * @param  {Integer}  concurrency  how many urls to dispatch at a time
   * @param  {String}   urls         urls to run the report on
   * @return Promise<Report>         Promise object (resolves with report)
   */
  runOnList: function(token, apiUrl, workerUrl, concurrency, urls) {
    var _this = this;
    return new Promise(function(resolve, reject) {
      _this.createReport({
        token: token,
        apiUrl: apiUrl,
        workerUrl: workerUrl,
        concurrency: concurrency,
        report: {
          rootUrl: urls[0],
          standard: 'WCAG2AA',
          urls: urls
        }
      })
      .then(function (settings) {
        resolve(settings.report);
        return settings;
      })
      .catch(reject)
      .then(_this.queueJobs.bind(_this))
      .catch(reject);
    });
  }
};
