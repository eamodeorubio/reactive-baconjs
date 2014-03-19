var cheerio = require('cheerio'),
    request = require('request'),
    levelup = require('levelup'),
    multi = require('multimeter')(process);

var count = 0, max = 0, progress, errorBar, errors = 0;

var booksDB = levelup('./db/books', {valueEncoding: 'json'});
var indexDB = levelup('./db/index', {valueEncoding: 'json'});

booksDB.on('closed', function() {
  console.log("Books db closed!");
});

indexDB.on('closed', function() {
  console.log("Index db closed!");
});

function updateProgress(err) {
  count++;

  if (err) {
    errors++;
    if (errorBar)
      errorBar.percent(errors / max);
  } else if (progress)
    progress.ratio(count, max);

  if (count >= max) {
    booksDB.close(function () {
      indexDB.close(function () {
        console.log("Exiting...");
        process.exit(0);
      });
    });
  }
}

function extractKeywords(book) {
  var words = (book.title + ' ' + book.authors.join(' '))
      .split(/\b/g);
  return Object.getOwnPropertyNames(
      words
          .filter(function (el) {
            if (el && el.length >= 3)
              return el;
          })
          .map(function(el) {
            return el.toLowerCase();
          })
          .reduce(function (keyWords, el) {
            keyWords[el] = true;
            return keyWords;
          }, {})
  );
}

function padNumber(number) {
  var N = 100000000000000000;
  return number < N ? ("" + (N + number)).slice(1) : "" + number;
}

function updateIndex(id, book) {
  var price = padNumber(book.price * 100);

  extractKeywords(book).forEach(function (keyWord) {
    var key = price + "\xFF" + keyWord;
    indexDB.get(key, function (err, links) {
      if (err) {
        if (err.notFound)
          links = {};
        else
          return errors++;
      }
      links[id] = id;
      indexDB.put(key, links, {'sync': true });
    });
  });
}

booksDB.on('put', updateIndex);

function saveToDB(book) {
  booksDB.put(book.link, book, {'sync': true }, updateProgress);
}

function loadFromUri(uri, cb) {
  request.get(uri, function (error, response, body) {
    if (error || response.statusCode != 200)
      return console.log(error, response.statusCode);
    cb(cheerio.load(body));
  });
}

function loadBookDetails(_, book) {
  loadFromUri(book.link, function ($) {
    book.authors = $('.authors a').map(function () {
      return $(this).text();
    }).toArray();
    var priceText = $('[itemprop=highPrice]').first().text();
    book.price = Number(priceText.replace(",", ".").replace(/\D*(\d+\.\d\d)\D*/, "$1")) || 0;
    saveToDB(book);
  });
}

function loadBooks($) {
  $('.book-list-item').map(function () {
        max++;
        if (max == 1) {
          multi.drop({
            width: 100,
            before: 'progress [',
            solid: { background: 'green', foreground: 'white', text: '#' }
          }, function (bar) {
            progress = bar;
          });
          multi.drop({
            width: 100,
            before: 'errors [',
            solid: { background: 'red', foreground: 'white', text: 'X' }
          }, function (bar) {
            errorBar = bar;
          });
        }
        var $el = $(this);
        var $link = $el.find('a.book-link');
        return {
          title: $link.text(),
          link: 'http://leanpub.com' + $link.attr('href'),
          cover: $el.find('img.book-cover').attr('src')
        };
      }
  ).each(loadBookDetails);
}

console.log("Loading data from leanpub.com...");
loadFromUri('https://leanpub.com/c/software/mostcopies', function ($) {
  $('#category_slug > option').each(function () {
    var cat = $(this).attr('value');
    loadFromUri('http://leanpub.com/c/' + cat + '/mostcopies', loadBooks);
  });
});


