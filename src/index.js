/* the helpers below run inside the skeleton page, not in node */
/* global loadScript, loadStyles, openDiagram, resize, toSVG */

import puppeteer from 'puppeteer';
import { basename, dirname, extname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const VIEWERS = {
  bpmn: {
    script: 'bpmn-js/dist/bpmn-viewer.production.min.js',
    styles: [
      'bpmn-js/dist/assets/diagram-js.css',
      'bpmn-js/dist/assets/bpmn-js.css'
    ]
  },
  dmn: {
    script: 'dmn-js/dist/dmn-viewer.production.min.js',
    styles: [
      'dmn-js/dist/assets/diagram-js.css',
      'dmn-js/dist/assets/dmn-js-shared.css',
      'dmn-js/dist/assets/dmn-js-drd.css',
      'dmn-js/dist/assets/dmn-js-decision-table.css',
      'dmn-js/dist/assets/dmn-js-literal-expression.css'
    ]
  }
};

// what the --dmn-view flag accepts, mapped onto dmn-js view types
const DMN_VIEWS = {
  drd: 'drd',
  decision: 'decisionTable',
  decisionTable: 'decisionTable',
  literalExpression: 'literalExpression'
};

/**
 * The viewer to use for a diagram, based on its file extension.
 *
 * @param {string} file
 * @return {'bpmn'|'dmn'}
 */
export function getMode(file) {
  return extname(file).toLowerCase() === '.dmn' ? 'dmn' : 'bpmn';
}

/**
 * Resolve a packaged asset to a URL the skeleton page can load,
 * i.e. relative to the skeleton document itself.
 */
function assetUrl(id) {
  return relative(__dirname, require.resolve(id)).split('\\').join('/');
}

async function printDiagram(page, options) {

  const {
    input,
    outputs,
    minDimensions,
    footer,
    title = true,
    deviceScaleFactor = 1,
    dmnView = 'drd'
  } = options;

  const mode = getMode(input);
  const viewer = VIEWERS[mode];

  const view = DMN_VIEWS[dmnView];

  if (mode === 'dmn' && !view) {
    throw new Error(
      `unknown --dmn-view=${dmnView}; expected one of ` +
      `${Object.keys(DMN_VIEWS).join(', ')}`
    );
  }

  const diagramXML = readFileSync(input, 'utf8');

  const diagramTitle = title === false ? false : (
    typeof title === 'string' && title.length ? title : basename(input)
  );

  await page.goto(pathToFileURL(`${__dirname}/skeleton.html`).href);

  const desiredViewport = await page.evaluate(async function(diagramXML, options) {

    const {
      viewerScript,
      viewerStyles,
      ...openOptions
    } = options;

    await loadStyles(viewerStyles);
    await loadScript(viewerScript);

    // returns the desired viewport
    return openDiagram(diagramXML, openOptions);
  }, diagramXML, {
    viewerScript: assetUrl(viewer.script),
    viewerStyles: viewer.styles.map(assetUrl),
    mode,
    minDimensions,
    title: diagramTitle,
    footer,
    view
  });

  await page.setViewport({
    width: Math.round(desiredViewport.width),
    height: Math.round(desiredViewport.height),
    deviceScaleFactor
  });

  await page.evaluate(() => resize());

  for (const output of outputs) {

    if (output.endsWith('.pdf')) {
      await page.pdf({
        path: output,
        width: `${Math.round(desiredViewport.width)}px`,
        height: `${Math.round(desiredViewport.diagramHeight)}px`,
        printBackground: true,
        pageRanges: '1'
      });
    } else if (output.endsWith('.png')) {
      await page.screenshot({
        path: output,
        clip: {
          x: 0,
          y: 0,
          width: Math.round(desiredViewport.width),
          height: Math.round(desiredViewport.diagramHeight)
        }
      });
    } else if (output.endsWith('.svg')) {
      const svg = await page.evaluate(() => toSVG());

      writeFileSync(output, svg, 'utf8');
    } else {
      throw new Error(`unknown output file format: ${output}`);
    }
  }

  return outputs;
}

async function withPage(fn) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [ '--no-sandbox', '--allow-file-access-from-files' ]
    });

    return await fn(await browser.newPage());
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Convert a list of `{ input, outputs }` conversions, reusing one browser.
 *
 * @param {Array<{ input: string, outputs: string[] }>} conversions
 * @param {Object} [options]
 */
export async function convertAll(conversions, options = {}) {

  const {
    minDimensions,
    footer,
    title,
    deviceScaleFactor,
    dmnView
  } = options;

  await withPage(async function(page) {

    for (const conversion of conversions) {

      const {
        input,
        outputs
      } = conversion;

      await printDiagram(page, {
        input,
        outputs,
        minDimensions,
        title,
        footer,
        deviceScaleFactor,
        dmnView
      });
    }

  });

}
