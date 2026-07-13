# Use without a bundler

The package can be loaded directly from browser modules without bundling. Because its published JavaScript uses bare module specifiers, provide an import map for the package and its dependencies.

The version numbers below match the package dependencies at the time this example was written. Update them when using newer package or dependency versions.

```html
<script type="importmap">
{
  "imports": {
    "@quentinroy/word-cloud": "https://esm.sh/@quentinroy/word-cloud@0.15.2",
    "@quentinroy/custom-element-mixins": "https://esm.sh/@jsr/quentinroy__custom-element-mixins@0.4.2",
    "matter-js": "https://esm.sh/matter-js@0.20.0",
    "valibot": "https://esm.sh/valibot@1.4.1?exports=array,boolean,number,object,optional,safeParse,string"
  }
}
</script>

<script type="module">
  import { HTMLWordCloudElement } from "@quentinroy/word-cloud"

  customElements.define("x-word-cloud", HTMLWordCloudElement)
</script>

<x-word-cloud word-action="drag" word-input></x-word-cloud>
```

The [online demo](https://quentinroy.github.io/word-cloud/) uses the same no-bundler structure, although it loads the locally built library artifact rather than the published npm package.
