# word-cloud

Interactive word cloud custom element powered by Matter.js. Check out the [demo](https://quentinroy.github.io/word-cloud/)!

## Library

This package exports the `HTMLWordCloudElement` class only. Consumers are expected to register their own custom element tag:

```ts
import { HTMLWordCloudElement } from "word-cloud"

customElements.define("x-word-cloud", HTMLWordCloudElement)
```

## Local demo

```sh
pnpm install
pnpm dev
```

The demo lives in `demo/` and is served by `index.html` during local development.

## Build

```sh
pnpm build
```

This produces the publishable library in `dist/`.
