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

  return paddedNumber + "\xFF" + keyWord;
}

function endOf(word) {
  var n = 50 - word.length;
  for (var i = 0; i < n; i++) {
    word = word + "\xFF";
  }
  return word;
}

function search(startPrice, endPrice, keyword) {
  var endKeyWord = endOf(keyword), processedKeys = {};

  function nonProcessedKeys(link) {
    var needsProccessing = !processedKeys[link];
    if (needsProccessing)
      processedKeys[link] = true;
    return needsProccessing;
  }

  return indexDB
      .createReadStream({
        start: key(startPrice, keyword),
        end: key(endPrice, endKeyWord)
      })
      .pipe(es.mapSync(function (indexEntry) {
        var word = indexEntry.key.split("\xFF")[1];
        if (word >= keyword && word <= endKeyWord) {
          return Object.getOwnPropertyNames(indexEntry.value);
        }
      }))
      .pipe(es.mapSync(function (links) {
        return links.filter(nonProcessedKeys);
      }))
      .pipe(es.map(function (links, callback) {
        async.map(links, findBookByLink, callback);
      }));
}

var found = 0;
search(5, 10, "peter")
    .pipe(es.through(function (dataBatch) {
      var self = this;
      dataBatch.forEach(function (data) {
        self.emit('data', data);
      });
    }))
    .pipe(es.mapSync(function (data) {
      found++;
      console.log(data);
      return data;
    }))
    .on('end', function () {
      console.log("Total records found: " + found);
    });