/**
 *
 *  FIWARE-sdk: Orion Context Broker Client Library and Utilities
 *
 *  var Orion = require('fiware-orion-client'),
 *     OrionClient = new Orion.Client({
 *        url: ORION_SERVER
 *     });
 *
 *  Copyright (c) 2015 Telefónica Investigación y Desarrollo S.A.U.
 *
 *  LICENSE: MIT (See LICENSE file)
 *
 */

'use strict';

var Request = require('request');

var NgsiHelper = require('./ngsi-helper.js').NgsiHelper;
var Attribute = require('./ngsi-helper.js').Attribute;
var XmlBuilder = require('./ngsi-helper.js').XmlBuilder;

var RequestFactory = {
  launch: function(params) {
    return new Promise(function(resolve, reject) {
      RequestFactory._createNodeRequest(params, resolve, reject);
    });
  },

  _createNodeRequest: function(params, resolve, reject) {
    Request(params, function(error, response, body) {
      if (error) {
        reject(error);
        return;
      }
      if (response.statusCode !== 200) {
        reject({
          name: 'HTTPError: ' + response.statusCode
        });
        return;
      }

      resolve(body);
    });
  }
};

function post(params) {
  params.method = 'POST';
  return RequestFactory.launch(params);
}

function OrionClient(options) {
  this.options = options;
  this.url = options.url;
}

function updateContext(contextData, options) {
  /*jshint validthis:true */
  var self = this;

  if (!contextData) {
    return Promise.resolve();
  }

  return new Promise(function(resolve, reject) {
    var headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': self.options.userAgent || 'Orion-Client-Library'
    };
    
    var params = extractServicePath(contextData, options);
    if (params.id) {
      contextData.id = params.id;
    }
    if (params.servicePath) {
      headers['Fiware-ServicePath'] = params.servicePath;
    }

    var requestData = NgsiHelper.buildUpdate(contextData,
                                  options && options.updateAction || 'APPEND');

    post({
      url: self.url + '/updateContext',
      headers: headers,
      body: requestData,
      json: true,
      timeout: options && options.timeout || self.options.timeout
    }).then(function(body) {
        var parsed = NgsiHelper.parse(body);
        if (!parsed) {
          reject(404);
        }

        if (parsed && parsed.inError) {
          reject(parsed.errorCode);
          return;
        }

        resolve(contextData);
    }, reject);
  });
}

function deleteContext(contextData, options) {
  var theOptions = options || Object.create(null);
  theOptions.updateAction = 'DELETE';
  return this.updateContext(contextData, theOptions);
}

function queryContext(queryParameters, options) {
  /*jshint validthis:true */
  var self = this;

  if (!queryParameters) {
    return Promise.resolve(null);
  }

  return new Promise(function(resolve, reject) {
    var headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': self.options.userAgent || 'Orion-Client-Library'
    };

    var params = extractServicePath(queryParameters, options);
    if (params.id) {
      queryParameters.id = params.id;
    }
    if (params.servicePath) {
      headers['Fiware-ServicePath'] = params.servicePath;
    }

    var apiData = NgsiHelper.buildQuery(queryParameters);

    post({
      url: self.url + '/queryContext',
      headers: headers,
      body: apiData,
      json: true,
      timeout: options && options.timeout || self.options.timeout
    }).then(function(body) {
        var parsed = NgsiHelper.parse(body);

        if (parsed && parsed.inError) {
          reject(parsed.errorCode);
          return;
        }
        if (queryParameters.pattern && !parsed) {
          parsed = [];
        }
        resolve(parsed);
    }, reject);
  });
}

function subscribeContext(entity, subscriptionParams, options) {
  /*jshint validthis:true */
  var self = this;

  return new Promise(function(resolve, reject) {
    var subscription = NgsiHelper.buildSubscription(entity,
                                                    subscriptionParams);
    var resource = 'subscribeContext';
    // If subscription Id already exists then entities and reference are
    // removed
    if (subscription.subscriptionId) {
      resource = 'updateContextSubscription';
      
      if (subscription.entities) {
        delete subscription.entities;
      }
      if (subscription.reference) {
        delete subscription.reference;
      }
    }

    post({
      url: self.url + '/' + resource,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': self.options.userAgent || 'Orion-Client-Library'
      },
      body: subscription,
      json: true,
      timeout: options && options.timeout || self.options.timeout
    }).then(function(body) {
        if (body.subscribeError || body.orionError) {
          var errorCode = (body.subscribeError &&
                            body.subscribeError.errorCode) ||
                          (body.orionError && body.orionError.code);
          reject(errorCode);
        }
        else {
          resolve(body.subscribeResponse);
        }
    }, reject);
  });
}

function registerContext(entity, registrationParams, options) {
  /*jshint validthis:true */
  var self = this;

  if (!registrationParams || (!registrationParams.providingApplication &&
        !registrationParams.callback)) {
    return Promise.reject('No provider provided');
  }

  return new Promise(function(resolve, reject) {
    var registration = NgsiHelper.buildRegistration(entity, registrationParams);

     post({
      url: self.url + '/registry/registerContext',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': self.options.userAgent || 'Orion-Client-Library'
      },
      body: registration,
      json: true,
      timeout: options && options.timeout || self.options.timeout
    }).then(function(body) {
        if (body.registerError || body.orionError || body.errorCode) {
          var errorCode = (body.errorCode && body.errorCode.code) ||
                          (body.registerError &&
                           body.registerError.errorCode) ||
                          (body.orionError && body.orionError.code);
          reject(errorCode);
        }
        else {
          resolve(body);
        }
    }, reject);
  });
}

function extractServicePath(params, options) {
  var id = params && params.id;
  var path = options && options.path;

  var out = {
    id: id,
    servicePath: path
  };

  if (id && id.startsWith('/')) {
    var lastSlash = id.lastIndexOf('/');
    out.servicePath = id.substring(0, lastSlash);
    out.id = id.substring(lastSlash + 1);
  }

  return out;
}

OrionClient.prototype = {
  updateContext: updateContext,
  queryContext: queryContext,
  deleteContext: deleteContext,
  subscribeContext: subscribeContext,
  registerContext: registerContext
};

exports.Client = OrionClient;
exports.NgsiHelper = NgsiHelper;
exports.Attribute = Attribute;
exports.XmlBuilder = XmlBuilder;
