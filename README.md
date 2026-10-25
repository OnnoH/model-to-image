# model-to-image
Convert a BPMN or DMN file to an image

## Usage

```sh
# BPMN to PNG
model-to-image diagram.bpmn:diagram.png

# DMN decision table to PNG
model-to-image --dmn-view=decision diagram.dmn:diagram.png
```

Run `model-to-image` without arguments for all options.

## Development

```sh
npm ci
npx puppeteer browsers install chrome   # if npm deferred the install script
npm test
npm run lint
```

The tests render `test/all_elements.bpmn` and `test/all_elements.dmn`, so they
need a Chrome puppeteer can launch.
