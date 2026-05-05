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
- * **containerSelector** – CSS selector for the “annotatable container” – the section of the page with content to be highlighted. You can have multiple highlighters on a page, but they must be in different, non-overlapping containers. Default: `body`.
- * **paragraphSelector** – CSS selector for the paragraphs (or other block elements) that can be highlighted within the container. Each paragraph is expected to have an ID attribute for anchoring highlights. Default: `:is(h1, h2, h3, h4, h5, h6, p, ol, ul, dl)[id]`.


### <a name="public-methods"></a>Public methods

- **loadHighlights(highlights)** – Load a set of highlights. If highlights are already loaded, this method will diff for changes and replace the loaded highlights. Parameters:
    - **highlights** – Array of [highlight objects](#highlight-objects). Each highlight should have a `highlightId`, and one or more other attributes. Omitted or invalid properties will fall back to previous or default values.
- **createOrUpdateHighlight(properties, draw = true, activate = true)** – Create and load a new highlight, or update an existing highlight. Parameters:
    - **properties** – Object with one or more [highlight object](#highlight-objects) properties. When updating an existing highlight, only the `highlightId` and properties that changed need to be provided. If a highlight ID isn't provided, HighlightHelper.js will update the currently-active highlight or create a new highlight with a default ID.
    - **draw** – Boolean. Indicates if the highlight should be drawn after loading. Default: `true`.
    - **activate** – Boolean. Indicates if the highlight should be activated after loading. Default: `true`.
- **drawHighlights(highlightIds = all)** – Draw or redraw highlights. In most cases, HighlightHelper.js will draw highlights automatically, but a manual redraw can be triggered if needed. Parameters:
    - **highlightIds** – Array of highlight IDs. Default: all highlights.
- **activateHighlight(highlightId)** – Activate the specified highlight (i.e. enable it for editing). Only one highlight can be active at a time (because it's tied to text selection, and there can only be one text selection on a page). This is usually called in response to an `hh:tap` event. Parameters:
    - **highlightId** – The `highlightId` of the highlight to activate.
- **activateHyperlink(index)** – Activate the specified hyperlink (i.e. open the link). A link without overlapping highlights will open automatically, but if there are overlaps it will need to be handled manually in response to the `hh:tap` event. Parameters:
    - **index** – The 0-based index of the link, relative to other links in the container.
- **deactivateHighlights(removeSelectionRanges = true)** – Deactivate the active highlight, if there is one. Highlights are deactivated automatically if the user taps away. Parameters:
    - **removeSelectionRanges** – Boolean. Indicates whether text selection should be cleared. Default: `true`.
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

- **hh:tap** – Sent when a user taps in the annotatable container (potentially trying to tap a highlight, wrapper, or link).
- **hh:hover** – Sent when a user hovers over a highlight, wrapper, or link. Requires `enableHover` to be set in [options](#options).
- **hh:selectionchange** – Sent when the selection bounds or appearance changes.
- **hh:highlightsload** – Sent when an array of highlights loads.
- **hh:highlightcreate** – Sent when a new highlight is created.
- **hh:highlightupdate** – Sent when a highlight is updated.
- **hh:highlightactivate** – Sent when a highlight is activated.
- **hh:highlightdeactivate** – Sent when a highlight is deactivated.
- **hh:highlightremove** – Sent when a highlight is removed.

Each event has a `detail` attribute that provides additional information. For example, the `hh:tap` event could be used to activate a highlight:

```javascript
const annotatableContainer = document.getElementById('annotatable-container');
annotatableContainer.addEventListener('hh:tap', (event) => {
  console.log(event.detail);
  if (event.detail.highlights.length >= 1 {
    highlighter.activateHighlight(event.detail.highlights[0].highlightId);
  }
});
```


## <a name="highlight-objects"></a>Highlight objects

Highlight objects have the following editable properties:

- **highlightId** – String. Unique identifier for the highlight. Example: `dQw4w9WgXcQ`. Default: `hh-[timestamp]`.
- **color** – String. Highlight color (key from the `colorDefs` option). Default: `yellow`.
- **style** – String. Highlight style (key from the `styleDefs` option). Default: `fill`.
- **wrapper** – String. Highlight wrapper (key from the `wrapperDefs` option). Example: `{ startLabel: 'Start', }`. Default: `null`.
- **wrapperVariables** – Object. Wrapper variables. Default: `null`.
- **readOnly** – Boolean. Indicates whether the highlight should be read-only. Default: `false`.
- **startParagraphId** – String. Paragraph ID where the highlight starts. Example: `p1`. Default based on selected text.
- **startParagraphOffset** – Integer. Character offset* where the highlight starts, relative to the beginning of the paragraph. Example: `0`. Default based on selected text.
- **endParagraphId** – String. Paragraph ID where the highlight ends. Example: `p1`. Default based on selected text.
- **endParagraphOffset** – Integer. Character offset* where the highlight ends (exclusive), relative to the beginning of the paragraph. Example: `27`. Default based on selected text.

These additional properties are updated on the fly:

- **rangeText** – String. Plain text of the highlighted range.
- **rangeHtml** – String. HTML content of the highlighted range.
- **rangeParagraphIds** – Array of paragraph IDs. Paragraphs in the highlighted range.
- **rangeObj** – [Range](https://developer.mozilla.org/en-US/docs/Web/API/Range) object that represents where the highlight is drawn.
- **mergedRects** – Array of DOMRects. Location of rendered highlights, relative to the top of the page (one rectangle for each line of text).
- **resolvedDrawingMode** – String. Drawing mode used to render the highlight. Should be either the current drawing mode, or `mark-elements` (fallback when a highlight can't be rendered in the current drawing mode).
- **escapedHighlightId** – Strong. Escaped highlight ID used internally in case the provided ID isn't a valid CSS identifier.

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
    - Template variables (optional): `var(--hh-color)` can be used to reference the highlight color. Additionally, for SVG, the following variables will be replaced with values from the highlight's DOMRect: `{x}`, `{y}`, `{width}`, `{height}`, `{top}`, `{bottom}`, `{left}`, `{right}`.
- **wrapperDefs** – Object. Defines highlight wrapper templates. Keys are wrapper names. Default keys: `screen-reader-label`. Each wrapper has two properties:
    - **start** – HTML template for the start wrapper. Default: `null`.
    - **end** – HTML template for the end wrapper. Default: `null`.
    - Template variables (optional): `var(--hh-color)` can be used to reference the highlight color. Additionally, variables surrounded by curly brackets will be replaced with values from the highlight object's `wrapperVariables` attribute.


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

- **Chrome on Android** doesn't show text selection handles when text is selected programmatically (such as from a disambiguation panel, or with snap-to-word). Text selection must be initiated by a user gesture.
    - Workaround: None.
- **Chrome on Android and macOS** can cause text selection to jump and select more than expected when selecting Japanese text with ruby characters or dragging the selection to the edge of the page.
    - Workaround: None.
- **Safari on iOS and macOS** doesn't allow setting underline thickness on a ::highlight() pseudo-element, so underline highlights drawn by the CSS Custom Highlight API are thin and hard to see (see [StackOverflow](https://stackoverflow.com/q/79060854/1349044) and [WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=282027)).
    - Workaround: Use a different drawing mode.
- **Safari on iOS** doesn't respect text selection colors set via CSS, so when a highlight is active for editing it has a blue overlay.
    - Workaround: In a native app with a webview, you may be able to set colors natively. See [tintColor](https://stackoverflow.com/a/60510743/1349044), [highlightView](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195471-highlightview), and/or [handleViews](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195470-handleviews).
- **Safari on iOS 26** doesn't create a text selection when using an Apple Pencil (or other compatible stylus), until the stylus is lifted.
    - Workaround: Double-tap then drag the stylus.
- **Safari on macOS** – SVG highlights are slightly shifted when zoomed to the maximum zoom size.
    - Workaround: Reduce text size.
- **Amazon Fire webview** doesn’t show selection handles, making it difficult to resize an existing highlight (and custom drag handles don't work reliably on touch devices).
    - Workaround: None.
- **All browsers** don’t redraw SVG highlights in the correct location when printing.
    - Workaround: HighlightHelper.js switches to mark element highlights temporarily when printing.


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

See also the [load test page](https://samuelbradshaw.github.io/highlight-helper-js/test-load.html).


### <a name="code-snippets"></a>Code snippets

UNDER CONSTRUCTION

#### Floating menu

<!--
How to hide built-in menu
How to position
show/hide custom menu on scroll and on resize
 -->

#### Live highlighting with a stylus

#### Remembering color and style

#### Light and dark mode colors

#### Responding to selection color change

#### Text wrapping

<!--
prevent wrapping mid-wrapper or between wrapper and highlight (noBreak entity)
box-decoration-break: clone
 -->

#### Insert dynamic elements

<!-- .sr-only, data-hh-ignore -->

#### Managing built-in selection handles

#### Responding to tap events

<!--
activate, don't activate if already active
disambiguation
 -->

#### Responding to hover events

<!--
change cursor
show popup
 -->

#### Moving wrappers during highlight resize
