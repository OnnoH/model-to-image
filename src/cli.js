#!/usr/bin/env node

import meow from 'meow';
import path from 'path';
import fs from 'fs';
import { Console } from 'node:console';
const {
  join: joinPath,
  delimiter: pathDelimiter
} = path;
import { convertAll } from './index.js';

const cli = meow(`
  Usage

    $ model-to-image <diagramFile>${pathDelimiter}<outputConfig> ...

  Options

    diagramFile                    Path to BPMN or DMN diagram
    outputConfig                   List of extension or output file paths

    --min-dimensions=<dimensions>  Minimum size in pixels (<width>x<height>)

    --title=<title>                Add explicit <title> to exported image
    --no-title                     Don't display title on exported image

    --no-footer                    Strip title and logo from image

    --scale                        Scale factor for images (1)
    
    --dmn-view=<view>              DMN view: drd | decision | literalExpression
  
  Examples:

    # export BPMN to diagram.png
    $ model-to-image diagram.bpmn${pathDelimiter}diagram.png

    # export BPMN diagram.png and /tmp/diagram.pdf
    $ model-to-image diagram.bpmn${pathDelimiter}diagram.png,/tmp/diagram.pdf

    # export BPMN with minimum size of 500x300 pixels
    $ model-to-image --min-dimensions=500x300 diagram.bpmn${pathDelimiter}png
    
    # export BPMN with explicit title
    $ model-to-image --title=My Diagram diagram.bpmn${pathDelimiter}png
    
    # export BPMN without title
    $ model-to-image --no-title diagram.bpmn${pathDelimiter}png
    
    # export BPMN without footer
    $ model-to-image --no-footer diagram.bpmn${pathDelimiter}png
    
    # export BPMN with scale factor of 0.5
    $ model-to-image --scale=0.5 diagram.bpmn${pathDelimiter}png
    
    # export DMN to diagram.png and diagram.pdf
    $ model-to-image diagram.dmn${pathDelimiter}diagram.png,/tmp/diagram.pdf
`, {
  importMeta: import.meta,
  flags: {
    minDimensions: {
      type: 'string',
      default: '400x300'
    },
    title: {
      type: 'boolean',
      default: true
    },
    footer: {
      type: 'boolean',
      default: true
    },
    scale: {
      type: 'number',
      default: 1
    },
    dmnView: {
      type: 'string',
      default: 'drd'
    }
  }
}
);

if (cli.input.length === 0) {
  cli.showHelp(1);
}

const conversions = cli.input.map(function (conversion) {

  const hasDelimiter = conversion.includes(pathDelimiter);
  if (!hasDelimiter) {
    console.error(error(`  Error: no <diagramFile>${pathDelimiter}<outputConfig> param provided`));
    cli.showHelp(1);
  }

  const [
    input,
    output
  ] = conversion.split(pathDelimiter);

  const outputs = output.split(',').reduce(function (outputs, file, idx) {

    // just extension
    if (file.indexOf('.') === -1) {
      const baseName = path.basename(idx === 0 ? input : outputs[idx - 1]);

      const name = baseName.substring(0, baseName.lastIndexOf('.'));

      return [...outputs, `${name}.${file}`];
    }

    return [...outputs, file];
  }, []);

  return {
    input,
    outputs
  }
});

const output = fs.createWriteStream('./stdout.log');
const errorOutput = fs.createWriteStream('./stderr.log');
// Custom simple logger
const logger = new Console({ stdout: output, stderr: errorOutput });

const footer = cli.flags.footer;
const title = cli.flags.title === false ? false : cli.flags.title;
const scale = cli.flags.scale !== undefined ? cli.flags.scale : 1;
const [width, height] = cli.flags.minDimensions.split('x').map(function (d) {
  return parseInt(d, 10);
});
const dmnView = cli.flags.dmnView;

function isDMN(file) {
  return path.extname(file).toLowerCase() === '.dmn';
}

function isBPMN(file) {
  return path.extname(file).toLowerCase() === '.bpmn';
}

(async () => {
  logger.log(info('Starting conversions...'));
  logger.log("Footer:", footer);
  logger.log("Title:", title);
  logger.log("Scale:", scale);
  logger.log("Min Dimensions:", width + "x" + height);
  logger.log("DMN View:", dmnView);
  // Process in the order provided, mixing BPMN and DMN if needed
  const bpmnQueue = [];
  for (const conversion of conversions) {
    const { input, outputs } = conversion;
    if (isDMN(input)) {
      // Directly render DMN
      await renderDMN(input, outputs, {
        title,
        minDimensions: { width, height },
        view: cli.flags.dmnView
      });
    } else {
      // Defer BPMN to batch-render via convertAll (as before)
      bpmnQueue.push(conversion);
    }
  }
  if (bpmnQueue.length) {
    await convertAll(bpmnQueue, {
      minDimensions: { width, height },
      title,
      footer,
      deviceScaleFactor: scale
    });
  }
})().catch((e) => {
  logger.error('failed to export diagram(s)');
  logger.error(e);
  process.exit(1);
});