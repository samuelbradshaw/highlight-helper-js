# Highlight Helper

**Highlight Helper** is a JavaScript tool that enables highlighting or underlining text in an HTML page (such as a digital book or article). Highlighting text in an HTML document can be difficult, especially in cases where a highlight starts in one element but ends in another.

Behind the scenes, Highlight Helper uses three different mechanisms for drawing highlights:

1. The [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) (default on supported browsers, including Safari 17.2+ and Chrome 105+).
2. [SVG shapes](https://developer.mozilla.org/en-US/docs/Web/SVG) drawn behind text (fallback for older browsers, including Safari 16.4+, Chrome 73+, and Firefox 101+).
3. Inserted HTML span elements (for read-only highlights).

An HTML demo page that shows basic functionality can be found here: [Highlight Helper Demo](https://samuelbradshaw.github.io/highlight-helper-js/demo.html). Source code for the demo is in **demo.html**. Highlight Helper itself is in **highlight-helper.js**.


## Known issues

There are a few known issues:

- **Desktop browsers** don’t show selection handles for changing the bounds of a highlight or selection. Selection handles do show on iOS and Android. In the future it would be nice to have fallback selection handles for desktop browsers, like the ones on [this page](https://www.churchofjesuschrist.org/study/scriptures/bofm/1-ne/1?lang=eng).
- **Safari on iOS** selects text without showing the selection UI (selection handles and overlay) if you select text programmatically before the user has long-pressed to create a selection (see [StackOverflow](https://stackoverflow.com/q/79136377/1349044)). This could happen if a user taps an existing highlight after the page loads. Highlight Helper currently uses a workaround that involves creating a temporary tab to trigger a change in focus state. In a native app with a webview, there may be a cleaner way to trigger a focus state or selection UI change and/or select text programmatically.
- **Safari on iOS** doesn’t respect the text selection color set via CSS, so when a highlight is active for editing it has a blue overlay. However, if you’re working in a native app with a webview, you may be able to set colors natively with [tintColor](https://stackoverflow.com/a/60510743/1349044), [highlightView](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195471-highlightview), and/or [handleViews](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195470-handleviews).
- **Safari on iOS and macOS** doesn’t allow setting underline thickness on a ::highlight() pseudo-element, so underline highlights drawn by the Custom Highlight API are thin and hard to see (see [StackOverflow](https://stackoverflow.com/q/79060854/1349044) and [WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=282027)). This will likely require a fix from Apple. In the meantime, a workaround could be to use a different underline style, such as a double underline. Alternatively, you can set Highlight Helper to use the SVG drawing mode.


## Getting started

The easiest way to get started is to download demo.html and highlight-helper.js, open demo.html in a text editor and browser, and make changes to adapt it for your needs.

In the source of demo.html, you’ll see CSS styles, followed by the HTML body, followed by JavaScript code. The JavaScript code does the following:
1. Links to highlight-helper.js,
2. Initializes Highlight Helper with options,
3. Pre-loads and draws a few existing highlights,
3. Sets up logic to call Highlight Helper methods when buttons on the demo page are tapped, and
4. Sets up listeners to respond to custom event messages that come back from Highlight Helper.

All of the available methods, options, and custom events are documented below.


## Methods, options, and custom events

### Methods

- **loadHighlights(highlights)** – Load an array of existing highlights into Highlight Helper. Each highlight should have one or more of the properties described under “Highlight attributes” below. Omitted or invalid properties will fall back to default values.
- **createOrUpdateHighlight(attributes, triggeredByUserAction)** – Create or update an individual highlight. `attributes` is an object with one or more of the properties described under “Highlight attributes” below. If a highlight ID isn’t passed in, the currently-active highlight will be updated, if there is one, otherwise a new highlight will be created. If it’s a new highlight and start and end bounds aren’t passed in, the highlight will be created based on selected text. `triggeredByUserAction` is an optional boolean (default: `true`). If this is set to false, the highlight won’t be activated after editing, and the color and style won’t be saved as the default for the next highlight.
- **drawHighlights(highlightIds)** – Draw or redraw highlights on the page, given an array of highlight IDs. If no highlight IDs are passed, all highlights will be drawn. This shouldn’t need to be called frequently (Highlight Helper will usually draw or redraw highlights automatically).
- **activateHighlight(highlightId)** – Activate a highlight for editing, given its `highlightId`. Only one highlight can be active at a time (because it’s tied to text selection, and there can only be one text selection on a page). Normally, a highlight activates automatically when the user taps it; however, if there are overlapping highlights, an `hh:ambiguousaction` event will be sent instead.
- **activateHyperlink(position)** – Activate the specified hyperlink (i.e. open the link). `position` is the 0-based position of the link in the annotatable area of the page, relative to other links. Normally, a link opens automatically when the user taps it; but if a highlight overlaps the link, an `hh:ambiguousaction` event will be sent instead.
- **deactivateHighlights()** – Clear the text selection and deactivate any active highlights.
- **removeHighlight(highlightId)** – Remove the specified highlight. If `highlightId` isn’t provided, the currently-active highlight will be deleted (if there is one).
- **getActiveHighlightId()** – Get the ID of the currently-active highlight (if there is one).
- **getHighlightsById(highlightIds)** – Get highlight information for an array of highlight IDs. If no highlight IDs are passed, information for all highlights will be returned.
- **setOption(key, value)** – Change one of the initialized options. Available options are described below.
- **getOptions()** – Get the initialized options, including defaults for any options that weren’t explicitly set.


### Options

Options can be provided when Highlight Helper is initialized. They can also be set on demand using `setOption(key, value)` (described above). All of these settings are optional. If not specified, the default value for each option will be used.

- **containerSelector** – CSS selector for the section of the page that should be annotatable. Default: `body`.
- **paragraphSelector** – CSS selector for the paragraphs or other blocks of text on the page that should be annotatable. Each block is expected to have an ID attribute in the HTML, which is used to keep track of where a highlight starts and ends. Default: `h1, h2, h3, h4, h5, h6, p, ol, ul, dl, tr`.
- **colors** – Object that describes available highlight colors. Keys are color names, and values are [CSS color values](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value). Default: red, orange, yellow, green, blue (see full default values at the bottom of highlight-helper.js).
- **styles** – Object that describes available highlight styles. Keys are style names, and there are two properties for each style: `css` and `svg`. `css` is a CSS string used for styling highlights in `highlight-api` drawing mode; as well as for styling read-only highlights and text selection. Only a few CSS styles are supported (see [Styling Highlights](https://www.w3.org/TR/css-pseudo-4/#highlight-styling)). `svg` is an SVG string used in `svg` drawing mode. If present, the variable `{color}` will be dynamically replaced with the relevant color string. For SVG highlights, the variables `{x}`, `{y}`, `{width}`, and `{height}` will also be replaced with relevant values. Default: fill, single-underline, double-underline, colored-text, redacted (see full default values at the bottom of highlight-helper.js).
- **wrappers** – Object that describes available highlight wrappers. Keys are wrapper names, and values are objects with three optional properties: `start` (HTML string to be inserted at the beginning of the highlight), `end` (HTML string to be inserted at the end of the highlight), and `drag` (boolean indicating if the user should be able to drag the wrapper to resize the highlight). For now, only read-only highlights support wrappers, and `drag` doesn’t do anything. To avoid problems when calculating ranges and offsets, all [text nodes](https://developer.mozilla.org/en-US/docs/Web/API/Text) in the start and end wrappers will be removed (if text is needed, it should be rendered with CSS). If present, the variable `{color}` will be dynamically replaced with the relevant color string from the highlight, and other variable with curly brackets will be replaced with variables stored in the `wrapperVariables` attribute of the highlight, if applicable. Default: none, sliders, footnote (see full default values at the bottom of highlight-helper.js).
- **rememberStyle** – Whether the most recent color, style, and wrapper should be remembered and used by default the next time the user creates a highlight. Boolean. Default: `true`.
- **snapToWord** – Whether text selection and highlights should snap to the nearest word boundary. Boolean. Default: `false`.
- **pointerMode** – Mode for responding to pointer events. Options are `default` (create highlights by selecting text, then tapping a color or style); `live` (create highlights immediately when selecting text, without needing to tap a button); and `auto` (`default` for touch and mouse input, but `live` when a stylus or Apple Pencil is detected). Default: `default`.
- **drawingMode** – Mode for drawing highlights on the page. Options are `highlight-api` (Custom Highlight API) and `svg` (SVG shapes). In both modes, read-only highlights will be drawn by inserting HTML span elements, and styled using Custom Highlight API styles. Default: `highlight-api` on supported browsers.
- **defaultColor** – Key of the default highlight color. Default: `yellow`.
- **defaultStyle** – Key of the default highlight style. Default: `fill`.
- **defaultWrapper** – Key of the default highlight wrapper. Default: `none`.
- **highlightIdFunction** – Identifier of a function that provides unique IDs for new highlights. Default: `hhGetNewHighlightId`.


### Custom events

Highlight Helper sends [custom events](https://developer.mozilla.org/en-US/docs/Web/Events/Creating_and_triggering_events) to the container element (defined in the `containerSelector` option) that can be listened for and responded to:

- **hh:highlightsload** – Sent when an array of highlights loads. Includes the number of highlights added and the overall number of loaded highlights.
- **hh:highlightcreate** – Sent when a new highlight is created. Includes information about the highlight.
- **hh:highlightupdate** – Sent when the highlight changes. Includes information about the highlight, and a list of the attributes that changed.
- **hh:highlightactivate** – Sent when a highlight is activated. Includes information about the activated highlight.
- **hh:highlightdeactivate** – Sent when a highlight is deactivated. Includes the ID of the deactivated highlight.
- **hh:highlightremove** – Sent when a highlight is removed. Includes the ID of the removed highlight.
- **hh:ambiguousaction** – Sent when a user taps on overlapping highlights or an overlapping highlight and link. Includes the location of the tap, the highlight(s) that were tapped, and the hyperlink(s) that were tapped.
- **hh:selectionupdate** – Sent when the selection color or style changes. Includes the key of the color and style.


## Highlight attributes

These are the attributes that Highlight Helper stores for each highlight. Most of the attributes can be changed by calling `createOrUpdateHighlight(attributes)`, where `attributes` is an object that includes the keys to be updated.

- **highlightId** (read-only after creation) – The ID of the highlight.
- **color** – The color of the highlight (key from the `colors` object in the initialized options). Example: `red`.
- **style** – The style of the highlight (key from the `styles` object in the initialized options). Example: `single-underline`.
- **wrapper** – The wrapper of the highlight (key from the `wrappers` object in the initialized options). More information about wrappers can be found above. Example: `none`.
- **wrapperVariables** – Variables used in wrappers. Example: `{ marker: 'a', }`.
- **readOnly** – Whether the highlight should be read-only (prevents a user from changing its color, bounds, or other attributes). Boolean. Example: `true`.
- **startParagraphId** – ID of the annotatable block element where the highlight starts. Example: `p1`.
- **startParagraphOffset** – Character offset where the highlight starts, relative to the beginning of the annotatable block element. Example: 12.
- **endParagraphId** – ID of the annotatable block element where the highlight ends. Example: `p1`.
- **endParagraphOffset** – Character offset where the highlight ends, relative to the beginning of the annotatable block element. Example: 14.
- **text** (read-only) – Text from the highlighted range.
- **html** (read-only) – HTML from the highlighted range.
- **highlightRange** (read-only) – The [Range](https://developer.mozilla.org/en-US/docs/Web/API/Range) object that represents where the highlight is drawn.
