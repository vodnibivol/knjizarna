'use strict';

const fs = require('fs');
const gm = require('gm');
const path = require('path');

const defaultOptions = {
  type: 'jpg',
  size: 1000,
  density: 200,
  quality: 30,
};

function convertpdf(input, output, opts = {}) {
  /**
   * input: input filename
   * output: output filename;
   * options: density, size (max), quality
   */

  const options = { ...defaultOptions, ...opts };

  return new Promise((resolve, reject) => {
    gm(input)
      .selectFrame(0)
      .density(options.density, options.density)
      .resize(options.size, options.size)
      .quality(options.quality)
      .write(output, function (err) {
        if (err) {
          reject({
            result: 'error',
            message: 'Can not write output file.',
          });
          console.error(err);
        }

        const results = {
          name: path.basename(output),
          size: fs.statSync(output)['size'] / 1000.0,
          path: output,
        };

        resolve(results);
      });
  });
}

module.exports = { convertpdf };
