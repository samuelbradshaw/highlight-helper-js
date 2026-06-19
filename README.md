# HighlightHelper.js

**HighlightHelper.js** is a JavaScript library for drawing highlights in HTML content. It handles on-page rendering and provides events for user interaction, leaving other business logic such as data persistence to the consumer.

To see it in action, open the [HighlightHelper.js Demo](https://samuelbradshaw.github.io/highlight-helper-js/demo.html).

### Documentation:
- [Features](#features)
- [Getting started](#getting-started)
    - [Installation options](#installation-options)
    - [Basic usage](#basic-usage)
    - [Constructor](#constructor)
    - [Public methods](#public-methods)
- [Advanced usage](#advanced-usage)
    - [Custom events](#custom-events)
    - [Highlight objects](#highlight-objects)
    - [Options](#options)
    - [Element attributes](#element-attributes)
- [Appendix](#appendix)
    - [Known issues](#known-issues)
    - [Choosing a drawing mode](#choosing-a-drawing-mode)
    - [Code snippets](#code-snippets)

## <a name="features"></a>Features

- Draw highlights across element boundaries.
- Draw highlights as read-only, or enable editing with custom drag handles.
- Respond to tap, hover, and other events.
- Flexible “wrappers” API for attaching content to a highlight.
- Define your own colors and styles in multiple drawing modes.
- Compatibility with standard text selection APIs.

### <a name="use-cases"></a>Use cases

HighlightHelper.js can support many use cases where styles are applied dynamically to text. For example:

- Study tools (highlight textbooks, articles, Bible/scripture content).
- Commentaries (add indicators for footnotes or related content).
- Drafting (insert comments, underline spelling errors, show collaborative editing).
- Synced audio (show emphasis on the current word).
- Accessibility (embed labels for screen readers).
- Searching (highlight search matches, find on page).
- Code editors (syntax highlighting).


## <a name="getting-started"></a>Getting started

### <a name="installation-options"></a>Installation options

HighlightHelper.js is available as classic JavaScript (highlight-helper.js) or as a [JavaScript module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) (highlight-helper.mjs).

#### Classic JavaScript

Download highlight-helper.js from GitHub and reference it locally in your HTML file:
```html
<script src="scripts/highlight-helper.js"></script>
```

Or load it from [jsDelivr](https://www.jsdelivr.com/package/gh/samuelbradshaw/highlight-helper-js) CDN:
```html
<script src="https://cdn.jsdelivr.net/gh/samuelbradshaw/highlight-helper-js@main/highlight-helper.min.js"></script>
```

#### JavaScript Module

Download highlight-helper.js and highlight-helper.mjs from GitHub and import as a JavaScript module:
```javascript
import { Highlighter } from './highlight-helper.mjs';
```

Or load it from [jsDelivr](https://www.jsdelivr.com/package/gh/samuelbradshaw/highlight-helper-js) CDN:
```javascript
import { Highlighter } from 'https://cdn.jsdelivr.net/gh/samuelbradshaw/highlight-helper-js@main/highlight-helper.min.mjs';
```

You can also install it using [npm](https://www.npmjs.com/package/@samuelbradshaw/highlight-helper-js):
```bash
% cd /your/project/folder
% npm i @samuelbradshaw/highlight-helper-js
```

### <a name="basic-usage"></a>Basic usage

```html
<!-- Import HighlightHelper.js (classic JavaScript) -->
<script src="https://cdn.jsdelivr.net/gh/samuelbradshaw/highlight-helper-js@main/highlight-helper.min.js"></script>

<script>
  // Prepare highlights
  const highlights = [
    {
      highlightId: 'hh-1729991847207',
      color: 'green', style: 'fill',
      startParagraphId: 'p1', startParagraphOffset: 27,
      endParagraphId: 'p1', endParagraphOffset: 59,
    },
  ];

  // Create a Highlighter instance
  const containerSelector = 'main';
  const paragraphSelector = 'main [id]';
  const highlighter = new Highlighter(containerSelector, paragraphSelector);

  // Set options
  const options = { drawingMode: 'svg' };
  highlighter.setOptions(options);

  // Load highlights
  highlighter.loadHighlights(highlights);
</script>
```

### <a name="constructor"></a>Constructor

- **Highlighter(containerSelector, paragraphSelector)** – Create a Highlighter instance. Parameters:
    - **containerSelector** – CSS selector for the “annotatable container” – the section of the page with content to be highlighted. You can have multiple highlighters on a page, but they must be in different, non-overlapping containers. Default: `body`.
    - **paragraphSelector** – CSS selector for the paragraphs (or other block elements) that can be highlighted within the container. Each paragraph is expected to have an ID attribute for anchoring highlights. Default: `:is(h1, h2, h3, h4, h5, h6, p, ol, ul, dl)[id]`.


### <a name="public-methods"></a>Public methods

- **loadHighlights(highlights)** – Load a set of highlights. If highlights are already loaded, this method will diff for changes and replace the loaded highlights. Parameters:
    - **highlights** – Array of [highlight objects](#highlight-objects). Each highlight should have a `highlightId`, and one or more other attributes. Omitted or invalid properties will fall back to previous or default values.
- **createOrUpdateHighlight(properties, draw = true, activate = true)** – Create and load a new highlight, or update an existing highlight. Return value: updated highlight object. Parameters:
    - **properties** – Object with one or more [highlight object](#highlight-objects) properties. When updating an existing highlight, only the `highlightId` and properties that changed need to be provided. If a highlight ID isn't provided, HighlightHelper.js will update the currently-active highlight or create a new highlight with a default ID.
    - **draw** – Boolean. Indicates if the highlight should be drawn after loading. Default: `true`.
    - **activate** – Boolean. Indicates if the highlight should be activated after loading. Default: `true`.
- **drawHighlights(highlightIds = all)** – Draw or redraw highlights. In most cases, HighlightHelper.js will draw highlights automatically, but a manual redraw can be triggered if needed. Parameters:
    - **highlightIds** – Array of highlight IDs. Default: all highlights.
- **activateHighlight(highlightId)** – Activate the specified highlight (i.e. enable it for editing). Only one highlight can be active at a time (because it's tied to text selection, and there can only be one text selection on a page). This is usually called in response to an `hh:tap` event. Parameters:
    - **highlightId** – The `highlightId` of the highlight to activate.
- **activateHyperlink(index)** – Activate the specified hyperlink (i.e. open the link). A link without overlapping highlights will open automatically, but if there are overlaps it will need to be handled manually in response to the `hh:tap` event. Parameters:
    - **index** – The 0-based index of the link, relative to other links in the container.
- **deactivateHighlights(removeSelectionRanges = true, redraw = true)** – Deactivate the active highlight, if there is one. Highlights are deactivated automatically if the user taps away. Parameters:
    - **removeSelectionRanges** – Boolean. Indicates whether text selection should be cleared. Default: `true`.
    - **redraw** – Boolean. Indicates whether the highlight should be redrawn. Default: `true`.
- **getActiveHighlightId()** – Get the highlight ID of the active highlight (if there is one).
- **getHighlightInfo(highlightIds = all, paragraphId = null)** – Get an array of [highlight objects](#highlight-objects) for specified highlight IDs. Highlights will be sorted based on their position on the page. Parameters:
    - **highlightIds** – Array of highlight IDs. Default: all highlights.
    - **paragraphId** – Paragraph ID. Filters highlights based on their start paragraph. Default: `null`.
- **getTargetsAtPoint(clientX, clientY)** – Gets any highlights, wrappers, and hyperlinks at the given coordinates.
    - **clientX** – Horizontal (x) coordinate relative to the viewport.
    - **clientY** – Vertical (y) coordinate relative to the viewport.
- **setOptions(optionsToUpdate)** – Change one or more options. Parameters:
    - **optionsToUpdate** – Object with one or more [option keys and values](#options).
- **getOptions()** – Get the current option values.
- **getSelectionState()** – Get information about the current text selection and active highlight.
- **removeHighlights(highlightIds = all)** – Remove the specified highlights. Parameters:
    - **highlightIds** – Array of highlight IDs. Default: all highlights.
- **removeHighlighter()** – Removes the current Highlighter instance and its highlights, resetting to a clean state. Called automatically if a new Highlighter instance is created on the same container.


## <a name="advanced-usage"></a>Advanced usage

### <a name="custom-events"></a>Custom events

HighlightHelper.js sends [custom events](https://developer.mozilla.org/en-US/docs/Web/Events/Creating_and_triggering_events) to the annotatable container. These can be used to trigger actions.

- **hh:tap** – Sent when a user taps in the container (potentially trying to tap a highlight, wrapper, or link).
- **hh:hover** – Sent when a user hovers over a highlight, wrapper, or link. Requires `enableHover` to be set in [options](#options).
- **hh:selectionchange** – Sent when the selection state changes.
- **hh:highlightsload** – Sent when an array of highlights loads.
- **hh:highlightcreate** – Sent when a new highlight is created.
- **hh:highlightupdate** – Sent when a highlight is updated.
- **hh:highlightactivate** – Sent when a highlight is activated.
- **hh:highlightdeactivate** – Sent when a highlight is deactivated.
- **hh:highlightremove** – Sent when a highlight is removed.

Each event has a `detail` property that provides additional information. For example, the `hh:tap` event could be used to activate a highlight:

```javascript
const container = document.getElementById('annotatable-container');
container.addEventListener('hh:tap', (event) => {
  console.log(event.detail);
  if (event.detail.highlights.length >= 1) {
    highlighter.activateHighlight(event.detail.highlights[0].highlightId);
  }
});
```


## <a name="highlight-objects"></a>Highlight objects

Highlight objects have the following properties that can be edited using the createOrUpdateHighlight() method:

- **highlightId** – String. Unique identifier for the highlight. Example: `dQw4w9WgXcQ`. Default: `hh-[timestamp]`.
- **color** – String. Highlight color (key from the `colorDefs` option). Default: `yellow`.
- **style** – String. Highlight style (key from the `styleDefs` option). Default: `fill`.
- **wrapper** – String. Highlight wrapper (key from the `wrapperDefs` option). Example: `{ startLabel: 'Start', }`. Default: `null`.
- **variables** – Object. Style and wrapper variables. Values are substituted into `{key}` placeholders in style and wrapper templates. Default: `null`.
- **readOnly** – Boolean. Indicates whether the highlight should be read-only. Default: `false`.
- **startParagraphId** – String. Paragraph ID where the highlight starts. Example: `p1`. Default based on selected text.
- **startParagraphOffset** – Integer. Character offset* where the highlight starts, relative to the beginning of the paragraph. Example: `0`. Default based on selected text.
- **endParagraphId** – String. Paragraph ID where the highlight ends. Example: `p1`. Default based on selected text.
- **endParagraphOffset** – Integer. Character offset* where the highlight ends (exclusive), relative to the beginning of the paragraph. Example: `27`. Default based on selected text.

These additional properties are added/updated automatically:

- **rangeText** – String. Plain text of the highlighted range.
- **rangeHtml** – String. HTML content of the highlighted range.
- **rangeRect** – DOMRect. Location of rendered highlight, relative to the top of the page (bounding rectangle).
- **rangeLineRects** – Array of DOMRects. Location of rendered highlight lines, relative to the top of the page (one rectangle for each line of text).
- **rangeParagraphIds** – Array of paragraph IDs. Paragraphs in the highlighted range.
- **rangeObj** – [Range](https://developer.mozilla.org/en-US/docs/Web/API/Range) object that represents where the highlight is drawn.
- **resolvedDrawingMode** – String. Drawing mode used to render the highlight. Should be either the current drawing mode, or `mark-elements` (fallback when a highlight can't be rendered in the current drawing mode).
- **escapedHighlightId** – String. Escaped highlight ID used internally in case the provided ID isn't a valid CSS identifier.

*Elements with the attribute `data-hh-ignore` are skipped when calculating character offsets. See [element attributes](#element-attributes).


### <a name="options"></a>Options

The following options can be set using the `setOptions()` method. Options that aren't defined will fall back to default values. For complex options, it may help to reference the default values at the bottom of highlight-helper.js.

- **drawingMode** – String. Default method for drawing highlights. See [Choosing a drawing mode](#choosing-a-drawing-mode). Possible values: `svg`, `highlight-api`, or `mark-elements`. Highlight styles not supported in the current drawing mode will fall back to `mark-elements`. Default: `svg`.
- **snapToWord** – Boolean. Indicates whether highlights should snap to the nearest word boundary, delimited by spaces and dashes (may not work correctly in all languages). Default: `false`.
- **longPressTimeout** – Integer. Minimum duration in milliseconds to be considered a long-press (`isLongPress` property on `hh:tap` event). Some operating systems may provide an API to get the system long-press duration ([Android](https://developer.android.com/reference/kotlin/android/view/ViewConfiguration#getlongpresstimeout); [iOS](https://developer.apple.com/documentation/uikit/uilongpressgesturerecognizer/minimumpressduration)), which may vary based on accessibility settings. Default: `500`.
- **enableHover** – Boolean. Indicates whether the `hh:hover` event is enabled. Disabled by default to reduce processing. Default: `false`.
- **dragHandles** – Object with properties `left` and `right`. Template used for custom handles that a user can drag to resize a selection or highlight. Properties:
    - **left** – HTML string for the left selection handle.
    - **right** – HTML string for the right selection handle.
    - Template variables (optional): `var(--hh-color)` can be used to reference the highlight color.
- **showDragHandles** – Array. Indicates when custom drag handles should be shown. Default: `['highlights']`. Possible values:
    - **highlights** – Show custom handles for active highlights. Default: `true`.
    - **selection** – Show custom handles for text selection. Default: `false`.
    - **touch** – Show custom handles on touch devices (may be unstable due to interaction with built-in selection handles). Default: `false`.
- **colorDefs** – Object. Defines highlight colors. Keys are color names, and values are [CSS color values](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value). Default keys: `red`, `orange`, `yellow`, `green`, `blue`.
- **styleDefs** – Object. Defines highlight style templates. Keys are style names. Default keys: `fill`, `underline`. Each style has four available properties:
    - **css** (required) – CSS string used in `highlight-api` and `mark-elements` drawing modes, for active text selection, and as a fallback in `svg` drawing mode.
    - **cssActive** (optional) – alternate CSS string for active highlights. Falls back to `css`.
    - **svg** (optional) – SVG string used in `svg` drawing mode. Falls back to `css`.
    - **svgActive** (optional) – alternate SVG string for active highlights. Falls back to `svg`, `cssActive`, or `css`.
    - Template variables (optional): `var(--hh-color)` can be used to reference the highlight color. The following variable substitutions are also supported (applied in this precedence order):
        - `{key}` – replaced with provided values from the highlight's `variables` property.
        - `{line.x}`, `{line.y}`, `{line.width}`, `{line.height}`, `{line.top}`, `{line.bottom}`, `{line.left}`, `{line.right}` – replaced with values from the bounding rect of the current line of the highlight.
        - `{range.x}`, `{range.y}`, `{range.width}`, `{range.height}`, `{range.top}`, `{range.bottom}`, `{range.left}`, `{range.right}` – replaced with values from the bounding rect of the highlight range.
        - `{column.x}`, `{column.y}`, `{column.width}`, `{column.height}`, `{column.top}`, `{column.bottom}`, `{column.left}`, `{column.right}` – replaced with values from the bounding rect of the nearest column or block element ancestor of the paragraph.
        - `{container.x}`, `{container.y}`, `{container.width}`, `{container.height}`, `{container.top}`, `{container.bottom}`, `{container.left}`, `{container.right}` – replaced with values from bounding rect of the annotatable container.
- **wrapperDefs** – Object. Defines highlight wrapper templates. Keys are wrapper names. Default keys: `screen-reader-label`. Each wrapper has two properties:
    - **start** – HTML template for the start wrapper. Default: `null`.
    - **end** – HTML template for the end wrapper. Default: `null`.
    - Template variables (optional): `var(--hh-color)` can be used to reference the highlight color. All of the substitutions described under `styleDefs` are also supported.


### <a name="element-attributes"></a>Element attributes

Elements used or created by HighlightHelper.js have the following properties, which can be used for CSS styling:

Identifying attributes:
- **@data-hh-container** – Annotatable container.
- **@data-hh-additions** – Element that contains drag handles and the SVG background.
- **@data-hh-handle** – Drag handle parent element.
- **@data-hh-handle-content** – Drag handle child element.
- **@data-hh-default-handle** – Default drag handle (can be overwritten in options).
- **@data-hh-svg-background** – SVG background where SVG highlights are drawn.
- **@data-hh-svg-active-overlay** – SVG group with shapes for the active highlight.
- **@data-hh-wrapper** – Wrapper element.

Differentiating attributes:
- **@data-hh-highlight-id** (on highlight and wrapper elements) – highlight ID.
- **@data-hh-color** (on highlight and wrapper elements) – color name.
- **@data-hh-style** (on highlight and wrapper elements) – style name.
- **@data-hh-wrapper** (on highlight and wrapper elements) – wrapper name.
- **@data-hh-position** (on mark highlight and wrapper elements) – indicates if the element is at the `start` or `end` of the highlight, or both (`start end`).
- **@data-hh-index** (on hyperlink) – 0-based index of the hyperlink.
- **@data-hh-side** (on drag handle) – indicates if the handle is `left` or `right`.
- **@data-hh-wrapper-hash** (on wrapper elements) – used internally to check if a wrapper needs to be replaced with a different wrapper.

Other:
- **@class="sr-only"** – Elements with this attribute are only visible to screen readers.
- **@data-hh-ignore** – Elements with this attribute are skipped when calculating character offsets and highlight rectangle positions.
- **@highlighter** (on container) – Highlighter instance associated with the container.
- **@style="--hh-color: [color string];"** (on container) – CSS custom property with the current highlight's color string.
- **@data-pointer-down** (on container) – Indicates whether the pointer (mouse, finger, etc.) is down on the page.


## <a name="appendix"></a>Appendix

### <a name="known-issues"></a>Known issues

- **Chrome on Android** doesn't show text selection handles when text is selected programmatically (such as from a disambiguation panel, or with snap-to-word). Text selection UI must be initiated by a user gesture.
    - Workaround: Tap the highlight again to show the handles.
- **Safari on iOS and macOS** doesn't allow setting underline thickness on a ::highlight() pseudo-element, so underline highlights drawn by the CSS Custom Highlight API are thin and hard to see (see [StackOverflow](https://stackoverflow.com/q/79060854/1349044) and [WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=282027)).
    - Workaround: Use a different drawing mode.
- **Safari on iOS and macOS** expand text selection to include the previous word when selecting a word in an inline element at the beginning of the line of text. Code to reproduce: `<p style="font-family: Times; font-size: 16px; width: 250px">This is an example of <i>text selection</i> <b>jumping</b> to include the previous word when text wraps at the beginning of an inline element. Double-click (macOS) or long-press (iOS) the word "jumping."</p>`
    - Workaround: Manually adjust highlight after it's created.
- **Safari on iOS** doesn't respect text selection colors set via CSS, so when a highlight is active for editing it has a blue overlay.
    - Workaround: In a native app with a webview, you may be able to set colors natively. See [tintColor](https://stackoverflow.com/a/60510743/1349044), [highlightView](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195471-highlightview), and/or [handleViews](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195470-handleviews).
- **Safari on iOS 26** doesn't create a text selection when using an Apple Pencil (or other compatible stylus), until the stylus is lifted.
    - Workaround: Double-tap then drag the stylus.
- **Safari on macOS** – SVG highlights are slightly shifted when zoomed to the maximum zoom size.
    - Workaround: Reduce text size.
- **Amazon Fire webview** doesn’t show selection handles, making it difficult to resize an existing highlight (and custom drag handles don't work reliably on touch devices).
    - Workaround: Long-press and drag to select everything you need before lifting your finger.


### <a name="choosing-a-drawing-mode"></a>Choosing a drawing mode

| | SVG | Highlight API | Mark Elements |
| :--- | :--- | :--- | :--- |
| **Loading speed** | Very fast | Slow | Fast |
| **Browser support** | Full support | Requires iOS 17.2+ | Full support |
| **Background shapes** | Good | None | Limited |
| **Background colors** | Good | Good | Good |
| **Text styles** | None, but falls back to mark elements | Limited | Good |
| **Printing** | Poor by default, but falls back to mark elements | Good | Good |
| **Screen reader accessibility** | None by default; good with wrappers | None by default; good with wrappers | Good by default; poor with overlapping highlights |

See the [load test page](https://samuelbradshaw.github.io/highlight-helper-js/test-load.html) for informal benchmarking.


### <a name="code-snippets"></a>Code snippets

These code snippets demonstrate some of the ways that HighlightHelper.js can be used. The [HighlightHelper.js Demo](https://samuelbradshaw.github.io/highlight-helper-js/demo.html) may also be helpful.

#### Floating menu

```css
body {
  -webkit-touch-callout: none; /* Hide default text selction menu */
}
```

```javascript
// Hide default text selection menu
window.addEventListener('contextmenu', event => { event.preventDefault() });

function updateFloatingMenu() {
  const selection = window.getSelection();
  if (selection.type === 'Range' && !isResizing && !isScrolling) {
    showMenu(selection.getBoundingClientRect());
  } else {
    hideMenu();
  }
}

// Respond to selection resize
let isResizing;
container.addEventListener('hh:selectionchange', (event) => {
  isResizing = event.detail.isResizing;
  updateFloatingMenu();
});

// Respond to page scroll
let scrollTimeout, isScrolling;
window.addEventListener('scroll', (event) => {
  isScrolling = true;
  updateFloatingMenu();
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling = false;
    updateFloatingMenu();
  }, 200);
});
```

#### Live highlighting with a stylus or Apple Pencil

```javascript
let previousColor = 'yellow';
let previousStyle = 'fill';
function createLiveHighlight(event) {
  const selectionState = event.detail;
  if (selectionState.pointerType === 'pen' && selectionState.changes.includes('selection') && selectionState.selection.type === 'Range' && !highlighter.getActiveHighlightId()) {
    highlighter.createOrUpdateHighlight({
      highlightId: crypto.randomUUID(),
      color: previousColor,
      style: previousStyle,
    });
  }
}
container.addEventListener('hh:selectionchange', createLiveHighlight);
```

#### Responding to selection color change

```javascript
// In a native app, this could be used to update the color of the system selection UI
function updateColors(event) {
  if (event.detail.changes.includes('color')) {
    setNativeAccentColor(event.detail.color);
  }
}
container.addEventListener('hh:selectionchange', updateColors);
```

#### Light and dark mode colors

```css
html { color-scheme: light dark; }
html[data-theme="light"] { color-scheme: light; }
html[data-theme="dark"] { color-scheme: dark; }
```

```javascript
const options = {
  colorDefs: {
    'red': 'light-dark(#ff8080, #cc0000)',
  },
}
highlighter.setOptions(options);
```

#### Changing color vibrance or opacity

```javascript
const options = {
  styleDefs: {
    'fill': {
      css: 'background-color: hsl(from var(--hh-color) h s l / var(--highlight-opacity, 50%));',
      cssActive: 'background-color: hsl(from var(--hh-color) h s l / var(--highlight-opacity-active, 80%));',
      svg: '<rect x="{line.x}" y="{line.y}" style="fill: hsl(from var(--hh-color) h s l / var(--highlight-opacity, 50%)); width: {line.width}px; height: calc({line.height}px * 0.85); transform: translateY(calc({line.height}px * 0.15));" />',
      svgActive: `
        <rect x="{line.x}" y="{line.y}" style="fill: hsl(from var(--hh-color) h s l / var(--highlight-opacity-active, 80%)); width: {line.width}px; height: calc({line.height}px * 0.85); transform: translateY(calc({line.height}px * 0.15));" />
      `,
    },
  },
}
highlighter.setOptions(options);

function setColorOpacity(highContrast = false) {
  if (highContrast) {
    container.style.setProperty('--highlight-opacity', '80%');
    container.style.setProperty('--highlight-opacity-active', '100%');
  } else {
    container.style.setProperty('--highlight-opacity', '50%');
    container.style.setProperty('--highlight-opacity-active', '80%');
  }
}
const highContrastToggle = document.querySelector('[name="highContrast"]');
highContrastToggle.addEventListener('change', (event) => { setColorOpacity(highContrastToggle.checked) });
setColorOpacity();
```

#### Styling start and end mark elements

```css
mark[data-hh-highlight-id][data-hh-style="fill"] {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
mark[data-hh-highlight-id][data-hh-style="fill"][data-hh-position~="start"] {
  border-top-left-radius: 0.25em;
  border-bottom-left-radius: 0.25em;
  margin-left: -0.13em; padding-left: 0.13em;
}
mark[data-hh-highlight-id][data-hh-style="fill"][data-hh-position~="end"] {
  border-top-right-radius: 0.25em;
  border-bottom-right-radius: 0.25em;
  margin-right: -0.13em; padding-right: 0.13em;
}
mark[data-hh-highlight-id][data-hh-style="fill"] + mark[hh-highlight-id][data-hh-style="fill"] {
  margin-left: 0; padding-left: 0;
}
```

#### Keeping wrapper on same line as highlight

```css
[data-hh-wrapper="smile"] {
  white-space: nowrap;
}
```

```javascript
const options = {
  wrapperDefs: {
    'smile': {
      start: '<span>[:)]</span>&NoBreak;',
      end: '&NoBreak;<span>[(:]</span>',
    },
  },
};
highlighter.setOptions(options);
```

#### Inserting dynamic elements

```html
<!-- data-hh-ignore prevents text content from being included in character counts -->
<a href="#footnote" class="footnote-marker" data-hh-ignore>**</a>

<!-- class="sr-only" makes text content only visible to screen readers -->
<span class="sr-only" data-hh-ignore>(begin highlight)</span>
```

#### Responding to tap events

```javascript
// Add event listener for tap
container.addEventListener('hh:tap', respondToTap);
function respondToTap(event) {
  if (event.detail.targetCount === 0 || event.detail.isLongPress || event.detail.selectionType === 'Range') return;
  if (event.detail.targetCount > 1) {
    handleAmbiguousTap(event);
  } else if (event.detail.targetCount === 1) {
    if (event.detail.highlights.length === 1) {
      highlighter.activateHighlight(event.detail.highlights[0].highlightId);
    } else if (event.detail.wrappers.length === 1) {
      highlighter.activateHighlight(event.detail.wrappers[0].highlight.highlightId);
    } else if (event.detail.hyperlinks.length === 1) {
      highlighter.activateHyperlink(event.detail.hyperlinks[0].index);
    }
  }
}

// Load disambiguation panel for ambiguous taps
const disambiguationPanel = document.getElementById('disambiguation-panel');
const disambiguationButtons = document.getElementById('disambiguation-buttons');
const disambiguationCancelButton = document.getElementById('disambiguation-cancel');
disambiguationCancelButton.addEventListener('click', (event) => disambiguationPanel.close());
const handleAmbiguousTap = (event) => {
  // Build buttons
  let buttonsHtml = '';
  const highlightIds = new Set();
  for (const highlight of event.detail.highlights) highlightIds.add(highlight.highlightId);
  for (const wrapper of event.detail.wrappers) highlightIds.add(wrapper.highlight.highlightId);
  for (const highlight of highlighter.getHighlightInfo(highlightIds)) {
    let colorString = highlighter.getOptions().colorDefs[highlight.color];
    let styleString = highlighter.getOptions().styleDefs[highlight.style]['css'];
    buttonsHtml += `
      <button data-highlight-id="${highlight.highlightId}" style="--hh-color: ${colorString};">
        <span style="${styleString}">${highlight.rangeText}</span>
      </button>
    `;
  }
  for (const hyperlink of event.detail.hyperlinks) {
    buttonsHtml += `
      <button data-hyperlink-index="${hyperlink.index}">
        <span style="color: var(--dark-gray); text-decoration: underline;">${hyperlink.text}</span>
      </button>
    `;
  }
  disambiguationButtons.innerHTML = buttonsHtml;

  // Add event listeners to buttons
  for (const button of disambiguationButtons.children) {
    button.addEventListener('click', () => {
      disambiguationPanel.close();
      if (button.dataset.highlightId) {
        highlighter.activateHighlight(button.dataset.highlightId);
      } else if (button.dataset.hyperlinkIndex) {
        highlighter.activateHyperlink(button.dataset.hyperlinkIndex);
      }
    });
  }

  // Waiting 10 milliseconds before showing the disambiguation panel is a workaround for an issue in Android Chrome where a click event fires right after the pointerup event that triggered hh:tap. If the click event happens to be at the same position as a button in the panel, the button will receive the click, dismissing the panel before the user sees it.
  setTimeout(function() { disambiguationPanel.showModal(); }, 10);
}
```

#### Responding to hover events

```javascript
container.addEventListener('hh:hover', (event) => {
  container.style.cursor = (event.detail.targetCount > 0) ? 'pointer' : '';
});
```

#### Moving wrappers during highlight resize

```javascript
// Wrappers redraw when the highlight deactivates, but they can be manually adjusted while the highlight is active
function moveMarginIndicator(event) {
  const activeHighlightId = highlighter.getActiveHighlightId();
  if (!event.detail.activeHighlightId) return;
  const marginIndicator = container.querySelector(`[data-hh-wrapper][data-hh-position="start"][data-hh-highlight-id="${activeHighlightId}"] .note`);
  if (marginIndicator) {
    marginIndicator.style.top = `${event.detail.rangeRect.top}px`;
  }
}
container.addEventListener('hh:selectionchange', moveMarginIndicator);
```

#### Keyboard shortcut for deleting a highlight

```javascript
function removeHighlight(event) {
  const activeHighlightId = highlighter.getActiveHighlightId();
  highlighter.removeHighlights([activeHighlightId]);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Backspace') removeHighlight(event);
});
```

#### Copying selected text or HTML

```html
<button id="copy-text">Copy Text</button>
<button id="copy-html">Copy HTML</button>
```

```javascript
function copyToClipboard(plainText = true) {
  const selectionState = highlighter.getSelectionState();
  const content = plainText ? selectionState.rangeText : selectionState.rangeHtml;
  navigator.clipboard.writeText(content);
}
document.getElementById('copy-text').addEventListener('click', copyToClipboard);
document.getElementById('copy-html').addEventListener('click', (event) => {
  copyToClipboard(false);
});
```

#### Hide highlights when printing

```css
@media print {
  [data-hh-additions] { display: none; } /* Hide SVG highlights and custom drag handles */
  mark[data-hh-highlight-id] { all: unset; } /* Hide mark-element highlights */
}
```

#### Reinitializing selection UI in iOS Safari

```javascript
// After a period of inactivity with a locked screen, certain versions of iOS Safari may get into a state where system selection handles don't show when the app tries to select text programmatically (such as when a user taps an existing highlight). Sending a visibilitychange event triggers HighlightHelper.js to run code that enables programmatic text selection again.
document.dispatchEvent(new Event('visibilitychange'));
});
```