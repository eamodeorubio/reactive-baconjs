"use strict";

var books = require('./books'),
    express = require('express'),
    app = express();

function sendDataEvent(res) {
  return function (ev) {
    res.write('event: data\n');
    res.write('data: ' + JSON.stringify(ev) + '\n');
    res.write('\n\n');
    res.flush();
  };
}

function sendEndEvent(res) {
  return function () {
    res.write('event: end\n');
    res.write('data: end\n');
    res.write('\n\n');
    res.flush();
  };
}

app
    .use(express.compress())
    .use(express.static(__dirname + "/www/"))
    .use(express.logger('dev'));

app.get('/books', function (req, res) {
  var searchText = req.param('q');
  var maxPrice = Number(req.param('maxPrice'));
  var minPrice = Number(req.param('minPrice'));
  searchText = searchText ? searchText.trim() : '';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');

  var resultStream = books
      .find({
        keyWords: searchText.split(/\b/g),
        minPrice: minPrice,
        maxPrice: maxPrice
      })
      .on('data', sendDataEvent(res))
      .on('end', sendEndEvent(res));

  var destroyStream = resultStream.destroy.bind(resultStream);

  req
      .on('close', destroyStream)
      .on('error', destroyStream);
  res
      .on('close', destroyStream)
      .on('error', destroyStream);
});

app.listen(8091, function (err) {
  if (err)
    return console.log(err);
  console.log('Ready at', 8091);
});