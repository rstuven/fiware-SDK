/**
 *
 *  FIWARE-sdk: Orion Context Broker Client Library and Utilities
 *
 *  var Orion = require('fiware-orion-client'),
 *     OrionHelper = Orion.NgsiHelper;
 *
 * This library is intended to work both in Web Browsers and Node
 *
 *  Copyright (c) 2015 Telefónica Investigación y Desarrollo S.A.U.
 *
 *  LICENSE: MIT (See LICENSE file)
 *
 */

'use strict';

var XmlBuilder = require('./xml-builder.js');

const PROPERTY_MAP = {
  'type': 'type',
  'id' : 'id'
};

const EXT_PROPERTY_MAP = {
  'attributes': 'attributes',
  'pattern': 'pattern'
};

function Attribute(value, metadata) {
  this.value = value;
  this.metadata = metadata;
}

// Converts a NGSI object to XML
function ngsiObj2XML() {
  return ngsiObj2XMLTree.bind(this)().build();
}

function ngsiObj2XMLTree() {
  var root = new XmlBuilder('contextElement');
  var entityId = root.child('entityId').attr('type', this.type);
  
  entityId.attr('isPattern', this.isPattern);
  entityId.child('id').text(this.id);

  var attrList = root.child('contextAttributeList');
  this.attributes.forEach(function(aAttr) {
    var attrNode = attrList.child('contextAttribute');
    attrNode.child('name').text(aAttr.name);
    if (aAttr.type) {
      attrNode.child('type').text(aAttr.type);
    }
    attrNode.child('contextValue').text(aAttr.value);
  });

  return root;
}

// Converts a NGSI Response to XML
function ngsiResponse2XMLTree() {
  var root = new XmlBuilder('contextResponseList');

  this.contextResponses.forEach(function(aResponse) {
    var responseElement = root.child('contextElementResponse');

    responseElement.child(aResponse.contextElement.toXMLTree());

    var statusCode = responseElement.child('statusCode');
    statusCode.child('code').text(aResponse.statusCode.code);
    statusCode.child('reasonPhrase').text(aResponse.statusCode.reasonPhrase);
  });

  return root;
}

function ngsiResponse2XML() {
  return ngsiResponse2XMLTree.bind(this)().build();
}


var NgsiHelper = {
  parse: function(chunk) {
    var self = this;

    var ngsiData = chunk;
    if (typeof chunk === 'string') {
      try {
        ngsiData = JSON.parse(chunk);
      }
      catch(e) {
        // If cannot be parsed as JSON then should XML
        return this._parseXML(chunk);
      }
    }

    var responses = ngsiData.contextResponses;
    // In this case the response has not been wrapped around contextReponses
    if (!responses && !ngsiData.errorCode && !ngsiData.attributes) {
      responses = [ngsiData];
    }
    if (ngsiData.attributes) {
      responses = [{
        contextElement: {
          attributes: ngsiData.attributes
        }
      }];
    }

    var statusCode = (ngsiData.errorCode && ngsiData.errorCode.code) ||
                      (ngsiData.statusCode && ngsiData.statusCode.code) ||
                    (Array.isArray(responses) && responses[0].statusCode.code);
    if (statusCode != 200) {
      if (statusCode == 404) {
        return null;
      }
      return {
        inError: true,
        errorCode: statusCode
      };
    }

    if (responses.length === 1) {
      return this._toObject(responses[0].contextElement);
    }
    else {
      var out = [];
      responses.forEach(function(aResponse) {
        out.push(self._toObject(aResponse.contextElement));
      });

      return out;
    }
  },

  toNgsi: function(contextData) {
    var ctxElements = Array.isArray(contextData) ?
                                                  contextData : [contextData];
    var ngsiElements = [];
    ctxElements.forEach(function(aElement) {
      ngsiElements.push(NgsiHelper.toNgsiObject(aElement));
    });

    return {
      contextElements: ngsiElements
    };
  },

  // Converts an object to a NGSI Object
  toNgsiObject: function(object) {
    var self = this;

    if (!object) {
      return null;
    }

    var out = {
      isPattern: object.pattern ? true : false,
      id: object.pattern
    };

    var keys = Object.keys(object);
    keys.forEach(function(aKey) {
      var mapped = PROPERTY_MAP[aKey];
      var extProperty = EXT_PROPERTY_MAP[aKey];

      if (mapped && !extProperty) {
        out[mapped] = object[aKey];
        return;
      }

      if (extProperty) {
        return;
      }

      out.attributes = out.attributes || [];
      var value = self._getAttrValue(object[aKey]);
      var attributeData = {
        name: aKey,
        value: value,
        type: self._typeOf(value)
      };

      // Now dealing with metadata (if present)
      var metadata = object[aKey].metadata;
      if (metadata) {
        attributeData.metadatas = [];
        for (var p in metadata) {
          var metaValue = metadata[p];
           attributeData.metadatas.push({
            name: p,
            value: metaValue,
            type: self._typeOf(metaValue)
          });
        }
      }
      out.attributes.push(attributeData);
    });

    out.toXMLTree = ngsiObj2XMLTree;
    out.toXML = ngsiObj2XML;

    return out;
  },

  _getAttrValue: function(attrValue) {
    if (attrValue instanceof Attribute) {
      return attrValue.value;
    }

    return attrValue;
  },

  _toValue: function(ngsiAttr) {
    var out = ngsiAttr.value;
    if (ngsiAttr.type === 'number') {
      out = Number(out);
    }
    else if (ngsiAttr.type === 'date') {
      out = new Date(out);
    }
    return out;
  },

  _typeOf: function(value) {
    var out = typeof value;

    if (out === 'object') {
      if (typeof value.getDate === 'function') {
        out = 'date';
      }
    }

    return out;
  },

  _attrList2Obj: function(attrList) {
    var self = this;

    var out = Object.create(null);

    if (!attrList) {
      return out;
    }

    if (Array.isArray(attrList)) {
      attrList.forEach(function(aAttr) {
        var value = self._toValue(aAttr);

        if (Array.isArray(aAttr.metadatas)) {
          var metaObj = Object.create(null);
          aAttr.metadatas.forEach(function(aMeta) {
            metaObj[aMeta.name] = self._toValue(aMeta);
          });
          // If the attribute has metadata, then the value is a compound one
          // represented by the Attribute object
          value = new Attribute(value, metaObj);
        }

        out[aAttr.name] = value;
      });
    }

    return out;
  },

  _toObject: function(contextElement) {
    if (!contextElement) {
      return null;
    }

    var out = this._attrList2Obj(contextElement.attributes);
    out.type = contextElement.type;
    out.id = contextElement.id;

    return out;
  },

  buildSubscription: function(entity, subscriptionParams) {
    var entities = Array.isArray(entity) ? entity : [entity];

    var subscription = {
      entities: [],
      notifyConditions: []
    };

    var entityList = subscription.entities;

    entities.forEach(function(aEntity) {
      if (Array.isArray(aEntity.attributes)) {
        subscription.attributes = aEntity.attributes;
      }

      delete aEntity.attributes;
      entityList.push(NgsiHelper.toNgsiObject(aEntity));
    });

    var subscribedAttrs = [];
    if (Array.isArray(subscriptionParams.attributes)) {
      subscriptionParams.attributes.forEach(function(aAttr) {
        subscribedAttrs.push(aAttr);
      });
    }

    subscription.notifyConditions[0] = {
      type: subscriptionParams.type || 'ONCHANGE',
      condValues: subscribedAttrs
    };

    for (var option in subscriptionParams) {
      if (option === 'attributes' || option === 'type') {
        continue;
      }

      if (option === 'callback') {
        subscription.reference = subscriptionParams.callback;
        continue;
      }
      subscription[option] = subscriptionParams[option];
    }

    // Infinite duration by default
    subscription.duration = subscription.duration || 'P10Y';

    return subscription;
  },

  buildRegistration: function(entity, registrationParams) {
    var entities = Array.isArray(entity) ? entity : [entity];

    var registration = {
      contextRegistrations: []
    };

    entities.forEach(function(aEntity) {
      var aRegistration = {
        entities: [],
        attributes: [],
        providingApplication: aEntity.callback || registrationParams.callback
      };
      var entityList = aRegistration.entities;
      var attrList = aRegistration.attributes;

      if (Array.isArray(aEntity.attributes)) {
        aEntity.attributes.forEach(function(aAttr) {
          attrList.push(NgsiHelper._toAttr(aAttr));
        })
        delete aEntity.attributes;
      }
      entityList.push(NgsiHelper.toNgsiObject(aEntity));
      registration.contextRegistrations.push(aRegistration);
      
      // We are not checking for attribute duplicity
      if (Array.isArray(registrationParams.attributes)) {
        registrationParams.attributes.forEach(function(aAttr) {
          attrList.push(NgsiHelper._toAttr(aAttr));
        });
      }
    });

    for (var option in registrationParams) {
      if (option === 'providingApplication' || option === 'attributes' ||
          option === 'callback') {
        continue;
      }
      registration[option] = registrationParams[option];
    }

    return registration;
  },

  _toAttr: function(attrData) {
    if (typeof attrData === 'string') {
      return {
        name: attrData,
        type: 'string',
        isDomain: false
      }
    }
    
    attrData.isDomain = false;
    return attrData;
  },

  buildUpdate: function(contextData, action) {
    var request = this.toNgsi(contextData);
    request.updateAction = action;

    return request;
  },

  buildQuery: function(queryParameters) {
    return {
      entities: [
        this.toNgsiObject(queryParameters)
      ],
      attributes: queryParameters.attributes
    };
  },

  buildNgsiResponse: function(data) {
    var dataAsNgsi = NgsiHelper.toNgsiObject(data);

    var out = {
      contextResponses: [],
    };

    out.contextResponses[0] = {
      contextElement: dataAsNgsi,
      statusCode: {
        code: 200,
        reasonPhrase: 'OK'
      }
    };
    
    out.toXMLTree = ngsiResponse2XMLTree;
    out.toXML = ngsiResponse2XML;

    return out;
  },

  parseNgsiRequest: function(chunk) {
    var out = {
      entities: []
    };

    var parsedChunk = chunk;
    if (typeof chunk === 'string') {
      try {
        parsedChunk = JSON.parse(chunk);
      }
      catch(e) {
        return this._parseNgsiRequestXML(chunk);
      }
    }

    var entities = parsedChunk.entities;
    entities.forEach(function(aEntity) {
      var obj = NgsiHelper._toObject(aEntity);
      out.entities.push(obj);
    });

    out.attributes = parsedChunk.attributes;

    return out;
  },

  toURL: function(queryParameters) {
    var out = ['contextEntities'];

    out.push(encodeURIComponent(queryParameters.id));

    if (queryParameters.attributes) {
      out.push('attributes');
      out.push(encodeURIComponent(queryParameters.attributes[0]));
    }

    return out.join('/');
  },

  _parseNgsiRequestXML: function(chunk) {
    var out = {
      entities: [],
      attributes: []
    };

    var regExp1 = /<entityId type=\"(\w+)\"\s+isPattern=\"(\w+)\">/g;
    var regExp2 = /<id>(\S+)<\/id>/g;
    var regExp3 = /<attribute>(\w+)<\/attribute>/g;

    var match1 = regExp1.exec(chunk);
    while (match1 !== null) {
      var entity = {
        type: match1[1]
      };

      if (match1[2] === 'true') {
        entity.pattern = 'yes';
      }
      else {
        entity.id = 'yes';
      }
      out.entities.push(entity);
      
      match1 = regExp1.exec(chunk);
    }

    var match2 = regExp2.exec(chunk);
    var index = 0;
    while (match2 !== null) {
      if(out.entities[index].pattern === 'yes') {
        out.entities[index].pattern = match2[1];
      }
      else {
        out.entities[index].id = match2[1];
      }
      match2 = regExp2.exec(chunk);
      index++;
    }

    var match3 = regExp3.exec(chunk);
    while (match3 !== null) {
      out.attributes.push(match3[1]);
      match3 = regExp3.exec(chunk);
    }

    return out;
  },

  _parseXML: function(chunk) {
    var objs = [];

    var START_ELEMENT = '<contextElement>';
    var END_ELEMENT = '</contextElement>';
    var START_ATTR = '<contextAttribute>';
    var END_ATTR = '</contextAttribute>';

    var entityRegExp = /<entityId type=\"(\w+)\"\s+isPattern=\"(\w+)\">/;
    var idRegExp = /<id>(\S+)<\/id>/;

    var attrNameRegExp = /<name>(\w+)<\/name>/;
    var typeRegExp = /<type>(\w+)<\/type>/;
    var valueRegExp = /<contextValue>(.+)<\/contextValue>/;

    var remainingStr = chunk;
    while (true) {
      var startElement = remainingStr.indexOf(START_ELEMENT);
      var endElement = remainingStr.indexOf(END_ELEMENT);

      if (startElement === -1) {
        break;
      }

      var elementChunk = remainingStr.substring(
                          startElement + START_ELEMENT.length, endElement);

      var entityMatching = entityRegExp.exec(elementChunk);
      if (!Array.isArray(entityMatching)) {
        return null;
      }
      var type = entityMatching[1];
      var isPattern = entityMatching[2];
      var id = idRegExp.exec(elementChunk)[1];

      var attrList = [];
      var remainingAttrs = elementChunk;
      while(true) {
        var startAttr = remainingAttrs.indexOf(START_ATTR);
        var endAttr = remainingAttrs.indexOf(END_ATTR);

        if (startAttr === -1) {
          break;
        }

        var attrChunk = remainingAttrs.substring(
                                  startAttr + START_ATTR.length, endAttr);
        
        var attrName = attrNameRegExp.exec(attrChunk)[1];
        
        var attrType;
        var typeMatch = typeRegExp.exec(attrChunk);
        if (Array.isArray(typeMatch)) {
          attrType = typeMatch[1];
        }
        var attrVal = valueRegExp.exec(attrChunk)[1];

        attrList.push({
          name: attrName,
          type: attrType,
          value: attrVal
        });

        remainingAttrs = remainingAttrs.substring(endAttr + END_ATTR.length);
      }

      var myObj = this._attrList2Obj(attrList);
      myObj.type = type;

      if (isPattern === 'true') {
        myObj.pattern = id;
      }
      else {
        myObj.id = id;
      }

      objs.push(myObj);

      remainingStr = remainingStr.substring(endElement + END_ELEMENT.length);
    }

    if (objs.length === 1) {
      return objs[0];
    }
    else if (objs.length === 0) {
      return null;
    }

    return objs;
  }
};

var theWindow = this.window || null;
if (!theWindow) {
  exports.NgsiHelper = NgsiHelper;
  exports.Attribute = Attribute;
  exports.XmlBuilder = XmlBuilder;
}
