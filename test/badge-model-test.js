var vows = require('vows')
  , mysql = require('../lib/mysql')
  , assert = require('assert')
  , url = require('url')
  , makeAssertion = require('./utils').fixture
  , genstring = require('./utils').genstring
  , crypto = require('crypto')
  , Badge = require('../models/badge')
  , client = mysql.client;

var EMAILS = {
  good: ['brian@awesome.com', 'yo+wut@example.com', /*'elniño@español.es',*/ 'ümlaut@heavymetal.de'],
  bad: ['lkajd', 'skj@asdk', '@.com', '909090', '____!@']
};
var URLS = {
  good: ['http://example.com/', '/partial/path', '/rad.awesome/great/', '/foreign/crázy/ååú´¨la/'],
  bad: ['-not-asdo', 'ftp://bad-scheme', '@.com:90/', 'just totally wrong']
};
var DATES = {
  good: [Math.floor(Date.now()/1000), '2012-01-01'],
  bad: ['oiajsd09gjas;oj09', 'foreever ago', '@.com:90/', '2001-10-190-19', '901d1', '000000000000000000000']
};                                                                                                             

var BAD_VERSIONS = ['v100', '50', 'v10.1alpha'];
var sha256 = function (str) { return crypto.createHash('sha256').update(str).digest('hex'); };

var makeBadge = function () {
  var assertion = makeAssertion();
  return new Badge({
    type: 'hosted',
    endpoint: 'http://example.com/awesomebadge.json',
    image_path: '/dev/null',
    body: assertion,
    body_hash: 'sha256$' + genstring(64)
  });
};

var makeBadgeAndSave = function (changes) {
  var badge = makeBadge();
  changes = changes || {};
  Object.keys(changes).forEach(function (k) {
    if (changes[k] === null) { delete badge.data[k]; }
    else { badge.data[k] = changes[k]; }
  })
  return function () { 
    badge.save(this.callback);
  }
};

var assertErrors = function (fields, msgContains) {
  return function (err, badge) {
    if (badge instanceof Error) {
      err = badge;
      badge = null;
    }
    assert.isNull(badge);
    assert.instanceOf(err, Error);
    assert.isObject(err.fields);
    fields.forEach(function (f) {
      assert.includes(err.fields, f);
      assert.match(err.fields[f], RegExp(f));
      if (msgContains) {
        assert.match(err.fields[f], RegExp(msgContains));
      }
    })

  }
};

var makeInvalidationTests = function (field, badData) {
  var tests = {};
  badData.forEach(function (v) {
    var test = tests['like "' + v + '"'] = {}
    test['topic'] = function () {
      var fieldReplacement = {}
      fieldReplacement[field] = v;
      return Badge.validateBody(makeAssertion(fieldReplacement));
    };
    test['should fail with error on `' + field + '`'] = assertErrors([field], 'invalid');
  })
  return tests;
}
var makeValidationTests = function (field, goodData) {
  var tests = {};
  goodData.forEach(function (v) {
    var test = tests['like "' + v + '"'] = {}
    test['topic'] = function () {
      var fieldReplacement = {}
      fieldReplacement[field] = v;
      return Badge.validateBody(makeAssertion(fieldReplacement));
    };
    test['should succeed'] = function (err) { assert.isNull(err); };
  })
  return tests;
}
var makeMissingTest = function (field) {
  var test = {};
  test['topic'] = function () {
    var fieldReplacement = {}
    fieldReplacement[field] = null;
    return Badge.validateBody(makeAssertion(fieldReplacement));
  };
  test['should fail with error on `' + field + '`'] = assertErrors([field], 'missing');
  return test;
}

mysql.prepareTesting();
vows.describe('Badggesss').addBatch({
  'Validating an assertion': {
    'with a missing `recipient` field': makeMissingTest('recipient'),
    'with a missing `badge` field': makeMissingTest('badge'),
    'with a missing `badge.version` field': makeMissingTest('badge.version'),
    
    'with bogus `recipient`': makeInvalidationTests('recipient', EMAILS.bad),
    'with valid `recipient`': makeValidationTests('recipient', EMAILS.good),
    
    'with bogus `evidence`': makeInvalidationTests('evidence', URLS.bad),
    'with valid `evidence`': makeValidationTests('evidence', URLS.good),
    
    'with bogus `expires`': makeInvalidationTests('expires', DATES.bad),
    'with valid `expires`': makeValidationTests('expires', DATES.good),
    
    'with bogus `issued_on`': makeInvalidationTests('issued_on', DATES.bad),
    'with valid `issued_on`': makeValidationTests('issued_on', DATES.good),

    'that is totally valid': {
      topic: function () {
        return Badge.validateBody(makeAssertion({}))
      },
      'should succeed': function (err) {
        assert.isNull(err);
      }
    }
  },
  'Trying to save': {
    'a valid hosted assertion': {
      topic: makeBadgeAndSave(),
      'saves badge into the database and gives an id': function (err, badge) {
        assert.ifError(err);
        assert.isNumber(badge.data.id);
      }
    },

    'a hosted assertion without an `endpoint`': {
      topic: makeBadgeAndSave({endpoint: null}),
      'should fail with validation error on `endpoint`': assertErrors(['type', 'endpoint'])
    },

    'a signed assertion without a `jwt`': {
      topic: makeBadgeAndSave({type: 'signed', jwt: null}),
      'should fail with validation error on `jwt`': assertErrors(['type', 'jwt'])
    },

    'an assertion with an unknown type': {
      topic: makeBadgeAndSave({type: 'glurble'}),
      'should fail with validation error on `type`': assertErrors(['type'])
    },

    'an assertion without an `image_path`': {
      topic: makeBadgeAndSave({image_path: null}),
      'should fail with validation error on `image_path`': assertErrors(['image_path'])
    },

    'an assertion without a `body`': {
      topic: makeBadgeAndSave({body: null}),
      'should fail with validation error on `body`': assertErrors(['body'])
    },
    
    'an assertion with an unexpected `body` type': {
      topic: makeBadgeAndSave({body: "I just don't understand skrillex"}),
      'should fail with validation error on `body`': assertErrors(['body'])
    }
  }
}).export(module);
