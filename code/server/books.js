var levelup = require('levelup'),
    es = require('event-stream'),
    async = require('async');

var booksDB = levelup('./db/books', {valueEncoding: 'json'}),
    findBookByLink = booksDB.get.bind(booksDB);
var indexDB = levelup('./db/index', {valueEncoding: 'json'});

function key(number, keyWord) {
  var N = 100000000000000000;
  number = number * 100;
  var paddedNumber = number < N ? ("" + (N + number)).slice(1) : "" + number;

  if (keyWord)
    return paddedNumber + "\xFF" + keyWord;
  else
    return paddedNumber;
}

function endOf(word) {
  word = word || "";
  var n = 50 - word.length;
  for (var i = 0; i < n; i++) {
    word = word + "\xFF";
  }
  return word;
}

function keywordFilter(keyword) {
  var endKeyWord = endOf(keyword);
  return function (word) {
    return word >= keyword && word <= endKeyWord;
  };
}

function anyKeyword(keywords) {
  var filters = keywords.map(keywordFilter);
  var filterCount = filters.length;
  return function (word) {
    if(filterCount == 0) {
      return true;
    }
    for (var i = 0; i < filterCount; i++) {
      if (filters[i](word))
        return true;
    }
    return false;
  };
}

function findWordRange(range, word) {
  if (typeof range.min == "undefined" || range.min >= word)
    range.min = word;
  if (typeof range.max == "undefined" || range.max <= word)
    range.max = word;
  return range;
}

function queryFor(startPrice, endPrice, keyWordRange, keywordFilter) {
  return indexDB
      .createReadStream({
        start: key(startPrice, keyWordRange.min),
        end: key(endPrice, endOf(keyWordRange.max))
      })
      .pipe(es.mapSync(function (indexEntry) {
        var word = indexEntry.key.split("\xFF")[1];
        if (keywordFilter(word)) {
          return Object.getOwnPropertyNames(indexEntry.value);
        }
      }))
      .pipe(es.map(function (links, callback) {
        async.map(links, findBookByLink, callback);
      }))
      .pipe(es.through(function (dataBatch) {
        var self = this;
        dataBatch.forEach(function (data) {
          self.emit('data', data);
        });
      }));
}

module.exports = {
  find: function (query) {
    var keyWords = query.keyWords
        .filter(function (word) {
          return word.length > 3;
        })
        .map(Function.prototype.call.bind(String.prototype.toLowerCase));
    var startPrice = query.minPrice ? query.minPrice : 0;
    var endPrice = query.maxPrice ? query.maxPrice : 99999999999;
    var keyWordRange = keyWords.reduce(findWordRange, {});
    return queryFor(startPrice,
        endPrice,
        keyWordRange,
        anyKeyword(keyWords));
  }
};