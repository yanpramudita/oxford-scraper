const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const Bluebird = require('bluebird');
const _ = require('lodash');
const util = require('util');
const readline = require('readline');
const stream = require('stream');

const mainUrl = 'https://en.oxforddictionaries.com/definition';

const unusedPos = [
  'abbreviation',
  'noun',
  ''
]

if (_.size(process.argv) < 4) {
  console.error('usage: node index [path/to/words/file] [path/to/output/json]');
  console.error('example: node index words.txt result.json');
  process.exit(1);
}

const inputFileName = process.argv[2];
const outputFileName = process.argv[3];

const readWords = () => {
  return new Bluebird((resolve, reject) => {
    const instream = fs.createReadStream(inputFileName);
    const outstream = new stream;
    const rl = readline.createInterface(instream, outstream);

    const arr = [];

    rl.on('line', function(line) {
      arr.push(line);
    });

    rl.on('close', function() {
      resolve(arr);
    });
  });
}

const scrapeUrl = (url) => {
  return new Bluebird((resolve, reject) => {
    axios.get(url)
      .then((response) => {
        if(_.isUndefined(response) || response.status !== 200) {
          return reject("Error, response status is " + _.isUndefined(response) ? response : response.status);
        }
        const html = response.data;
        const $ = cheerio.load(html);
        return resolve($);
      })
      .catch((error) => reject(error));
  });
};

const scrapeWord = (word) => {
  return scrapeUrl(util.format('%s/%s', mainUrl, word))
    .then(($) => {
      const poses = scrapePoses($);
      const phrases = scrapePhrases($);
      return Bluebird.resolve({
        word: word,
        posList: poses,
        phrases: phrases
      });
    })
    .catch((error) => Bluebird.reject(error));
};

const scrapePhrases = ($) => {
  const prashes = [];
  const node = $('.etymology:has(> h3.phrases-title)').first();
  node.find('.senseInnerWrapper > ul.gramb > li').each((i, elem) => {
    const phrase = $(elem).find('.ind .phrase').text();
    const sensesNode = $(elem).next();

    prashes.push({
     phrase: phrase,
     senses : scrapePhraseSenses($, sensesNode)
    });
  });
  return prashes;
}

const scrapePhraseSenses = ($, sensesNode) => {
  const senses = [];
  sensesNode.find('li.phrase_sense').each((i, innerElem) => {
    const sense = $(innerElem).find('.ind').first().text();
    const examples = [];
    $(innerElem).find('.ex:not(.subSense *)').each((i, exampleElem) => {
      examples.push($(exampleElem).find('em').first().text());
    });
    senses.push({
     sense: sense,
     examples: examples
    });
  });
  return senses;
}

const scrapePoses = ($) => {
  const poses = [];
  $('.entryWrapper > .gramb').each((i, elem) => {
    const pos = $(elem).find('.pos span').first().text();
    if (_.includes(unusedPos, pos)) {
      return;
    }
    poses.push({
     pos: pos,
     senses: scrapeSenses($, elem),
    });
  });
  return poses;
};

const scrapeSenses = ($, elem) => {
  const senses = [];
  $(elem).find('ul.semb > li').each((i, innerElem) => {
    const sense = $(innerElem).find('.ind').first().text();
    const examples = [];
    $(innerElem).find('.ex:not(.subSense *)').each((i, exampleElem) => {
      examples.push($(exampleElem).find('em').first().text());
    });
    senses.push({
     sense: sense,
     examples: examples,
     subSenses: scrapeSubSenses($, innerElem)
    });
  });
  return senses;
};

const scrapeSubSenses = ($, elem) => {
  const senses = [];
  $(elem).find('ol.subSenses > li').each((i, innerElem) => {
    const sense = $(innerElem).find('.ind').first().text();
    const examples = [];
    $(innerElem).find('.ex').each((i, exampleElem) => {
      examples.push($(exampleElem).find('em').first().text());
    });
    senses.push({
     sense: sense,
     examples: examples
    });
  });
  return senses;
};

const writeJsonFile = (content) => {
  return new Bluebird((resolve, reject) => {
    fs.writeFile(outputFileName, JSON.stringify(content, null, 2), 'utf8', (err) => {
      if (err) {
        return reject(err);
      }
      return resolve(outputFileName);
    });
  });
};

Bluebird.resolve()
  .then(() => readWords())
  .then((words) => Bluebird.map(words, scrapeWord))
  .then((words) => writeJsonFile(words))
  .then((outputFileName) => console.log('result stored at: '+ outputFileName))
  .catch((error) => console.error(error));
