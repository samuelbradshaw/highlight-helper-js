# Highlight Helper

**Highlight Helper** is a JavaScript tool that enables highlighting or underlining text in an HTML page (such as a digital book or article). Highlighting text in an HTML document can be difficult, especially in cases where a highlight starts in one element but ends in another.

Behind the scenes, Highlight Helper supports three different mechanisms for drawing highlights:

1. [SVG shapes](https://developer.mozilla.org/en-US/docs/Web/SVG) drawn behind text (default).
2. The [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) (experimental&ast;).
3. Inserted [HTML mark elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/mark) (for read-only highlights).

An HTML demo page that shows basic functionality can be found here: [Highlight Helper Demo](https://samuelbradshaw.github.io/highlight-helper-js/demo.html). Source code for the demo is in **demo.html**. Highlight Helper itself is in **highlight-helper.js**.

&ast;The Custom Highlight API requires Safari 17.2+ or Chrome 105+, and may hang when rendering a large number of highlights. Additionally, only a few CSS styles are supported (see [Styling Highlights](https://www.w3.org/TR/css-pseudo-4/#highlight-styling)). Browser support and loading speed will hopefully improve in the future. See also the [load test page](https://samuelbradshaw.github.io/highlight-helper-js/test-load.html) for Highlight Helper.

### Documentation:
- [Known issues](#known-issues)
- [Getting started](#getting-started)
- [Methods, options, and custom events](#methods-options-and-custom-events)
    - [Methods](#methods)
    - [Options](#options)
    - [Custom events](#custom-events)
- [Highlight attributes](#highlight-attributes)

## <a name="known-issues"></a>Known issues

There are a few known issues:

- **Chrome on Android** doesn’t set focus (and therefore doesn’t show text selection handles) when text is programmatically selected (such as from a disambiguation panel), unless the selection is initiated directly by a user’s tap. However, if you’re working in a native app with a webview, you may be able to focus the webview from Android (see [StackOverflow](https://stackoverflow.com/a/6372903/1349044) and [GitHub](https://github.com/lawlsausage/save_gfy/pull/1)).
- **Safari on iOS** doesn’t respect the text selection color set via CSS, so when a highlight is active for editing it has a blue overlay. However, if you’re working in a native app with a webview, you may be able to set colors natively with [tintColor](https://stackoverflow.com/a/60510743/1349044), [highlightView](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195471-highlightview), and/or [handleViews](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195470-handleviews).
- **Safari on iOS** loses focus and doesn’t send a `visibilitychange` event if the device screen locks after a period of inactivity. This can cause selection handles to not show when unlocking your device and tapping on an existing highlight. Going to another app and back or manually triggering a `visibilitychange` event will allow Highlight Helper to set focus again. Focus will also be set again if the user long-presses to select text.
- **Safari on iOS and macOS** doesn’t allow setting underline thickness on a ::highlight() pseudo-element, so underline highlights drawn by the Custom Highlight API are thin and hard to see (see [StackOverflow](https://stackoverflow.com/q/79060854/1349044) and [WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=282027)). This will hopefully be fixed in a future version of Safari.


## <a name="getting-started"></a>Getting started

The easiest way to get started is to download demo.html and highlight-helper.js, open demo.html in a text editor and browser, and make changes to adapt it for your needs.

In the source of demo.html, you’ll see CSS styles, followed by the HTML body, followed by JavaScript code. The JavaScript code does the following:
1. Links to highlight-helper.js,
2. Initializes a “Highlighter” instance with options,
3. Pre-loads and draws a few existing highlights,
3. Sets up logic to call Highlight Helper methods when buttons on the demo page are tapped, and
4. Sets up listeners to respond to custom event messages that come back from Highlight Helper.

All of the available methods, options, and custom events are documented below.


## <a name="methods-options-and-custom-events"></a>Methods, options, and custom events

### <a name="methods"></a>Methods

- **loadHighlights(highlights)** – Load an array of existing highlights into Highlight Helper. Each highlight should have one or more of the properties described under “Highlight attributes” below. Omitted or invalid properties will fall back to previous or default values. If highlights are already loaded, this method will replace the loaded highlights by diffing for changes, then adding, removing, or updating individual highlights as needed.
- **createOrUpdateHighlight(attributes, triggeredByUserAction)** – Create or update an individual highlight. `attributes` is an object with one or more of the properties described under “Highlight attributes” below. If a highlight ID isn’t passed in, the currently-active highlight will be updated, if there is one, otherwise a new highlight will be created. If it’s a new highlight and start and end bounds aren’t passed in, the highlight will be created based on selected text. `triggeredByUserAction` is an optional boolean (default: `true`). If this is set to false, the highlight won’t be activated after editing, and the color and style won’t be saved as the default for the next highlight.
- **drawHighlights(highlightIds)** – Draw or redraw highlights on the page, given an array of highlight IDs. If no highlight IDs are passed, all highlights will be drawn. This shouldn’t need to be called frequently (Highlight Helper will usually draw or redraw highlights automatically).
- **activateHighlight(highlightId)** – Activate a highlight for editing, given its `highlightId`. Only one highlight can be active at a time (because it’s tied to text selection, and there can only be one text selection on a page). Normally, a highlight activates automatically when the user taps it; however, if there are overlapping highlights or if `autoTapToActivate` is set to `false`, this will need to be called manually.
- **activateHyperlink(position)** – Activate the specified hyperlink (i.e. open the link). `position` is the 0-based position of the link in the annotatable area of the page, relative to other links. Normally, a link opens automatically when the user taps it; however, if a highlight overlaps the hyperlink or if `autoTapToActivate` is set to `false`, this will need to be called manually.
- **deactivateHighlights()** – Clear the text selection and deactivate any active highlights. Normally, highlights are deactivated automatically when the user taps away.
- **removeHighlights(highlightIds)** – Remove the specified highlights. If `highlightIds` isn’t provided, all highlights will be removed.
- **getActiveHighlightId()** – Get the ID of the currently-active highlight (if there is one).
- **getHighlightInfo(highlightIds, paragraphId)** – Get highlight information for an array of highlight IDs. If no highlight IDs are passed, information for all relevant highlights will be returned. If `paragraphId` is provided, only highlights that start in the specified paragraph will be returned. Highlights will be sorted based on their position on the page.
- **setOption(key, value)** – Change one of the initialized options. Available options are described below.
- **getOptions()** – Get the initialized options, including defaults for any options that weren’t explicitly set.
- **removeHighlighter()** – Removes the current Highlighter instance and all of its highlights from the page. If a new Highlighter instance is created with the same container (as defined by the `containerSelector` option), the previous instance for that container will be removed automatically (there can be multiple Highlighter instances on a page, but each one needs to have a different container).


### <a name="options"></a>Options

Options can be provided when Highlight Helper is initialized. They can also be set on demand using `setOption(key, value)` (described above). All of these settings are optional. If not specified, the default value for each option will be used.

- **containerSelector** – CSS selector for the section of the page that should be annotatable. Default: `body`.
- **paragraphSelector** – CSS selector for the paragraphs (or other block elements) on the page that should be annotatable. Each paragraph is expected to have an ID attribute in the HTML, which is used to keep track of where a highlight starts and ends. Default: `h1[id], h2[id], h3[id], h4[id], h5[id], h6[id], p[id], ol[id], ul[id], dl[id], tr[id]`.
- **colors** – Object that describes available highlight colors. Keys are color names, and values are [CSS color values](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value). Default: red, orange, yellow, green, blue (see full default values at the bottom of highlight-helper.js).
- **styles** – Object that describes available highlight styles. Keys are style names, and there are two properties for each style: `css` and `svg`. `css` is a CSS string used for styling highlights in `highlight-api` and `inserted-marks` drawing modes, as well as for read-only highlights. `svg` is an SVG string used in `svg` drawing mode. The CSS custom property `var(--hh-color)` can be used to reference the highlight color value. For SVG highlights, the following variables (if present) will be replaced with relevant values from the highlight’s DOMRect: `{x}`, `{y}`, `{width}`, `{height}`, `{top}`, `{bottom}`, `{left}`, `{right}`. Default: fill, single-underline, double-underline, colored-text, redacted (see full default values at the bottom of highlight-helper.js).
- **wrappers** – Object that describes available highlight wrappers. Keys are wrapper names, and values are objects with two optional properties: `start` (HTML string to be inserted at the beginning of the highlight), and `end` (HTML string to be inserted at the end of the highlight). Only read-only highlights support wrappers. To avoid problems when calculating ranges and offsets, all [text nodes](https://developer.mozilla.org/en-US/docs/Web/API/Text) in the start and end wrappers will be removed (if text is needed, it should be rendered with CSS). `var(--hh-color)` can be used to reference the highlight color value. Variables surrounded by curly brackets will be replaced with variables stored in the `wrapperVariables` attribute of the highlight, if applicable. See default values at the bottom of highlight-helper.js.
- **selectionHandles** – Object that describes custom selection handles that a user can drag to resize a selection or highlight. Because most touch devices have built-in selection handles, custom selection handles will only show when using a mouse or trackpad. There are two properties: `left` (HTML string to be used for the left selection handle) and `right` (HTML string to be used for the right selection handle). `var(--hh-color)` can be used to reference the highlight color value. See default values at the bottom of highlight-helper.js.
- **rememberStyle** – Whether the most recent color, style, and wrapper should be remembered and used by default the next time the user creates a highlight. Boolean. Default: `true`.
- **snapToWord** – Whether highlights should snap to the nearest word boundary. Spaces and dashes are considered word boundaries (this option may not work correctly in all languages). Boolean. Default: `false`.
- **autoTapToActivate** – Whether Highlight Helper should automatically activate highlights and hyperlinks when they’re tapped. If set to false, you’ll need to listen for the `hh:tap` event and call `activateHighlight()` or `activateHyperlink()` manually when needed. Boolean. Default: `true`.
- **longPressTimeout** – Duration in milliseconds before a tap turns into a long-press. On long-press, Highlight Helper will send an `hh:tap` event with `isLongPress: true`. If this option is set to 0, Highlight Helper will treat long-presses the same as regular taps, sending the `hh:tap` event after the user lifts their finger. If you have access to system APIs (such as in a mobile app), you may be able to get the system long-press duration to use for this value (which may vary based on accessibility settings). For example, Android has a [getLongPressTimeout()](https://developer.android.com/reference/kotlin/android/view/ViewConfiguration#getlongpresstimeout) method and iOS has a [minimumPressDuration](https://developer.apple.com/documentation/uikit/uilongpressgesturerecognizer/minimumpressduration) property. Default: `500`.
- **pointerMode** – Mode for responding to pointer events. Options are `simple` (create highlights by selecting text, then tapping a color or style); `live` (create highlights immediately when selecting text, without needing to tap a button); and `auto` (`simple` for touch and mouse input, but `live` when a stylus or Apple Pencil is detected). Default: `auto`.
- **drawingMode** – Mode for drawing highlights on the page. Options are `svg` (SVG shapes), `highlight-api` (Custom Highlight API), and `inserted-marks` (inserted HTML mark elements). For faster performance, read-only highlights will always be drawn as inserted mark elements, even if a different drawing mode is set. Default: `svg`.
- **defaultColor** – Key of the default highlight color. Default: `yellow`.
- **defaultStyle** – Key of the default highlight style. Default: `fill`.
- **defaultWrapper** – Key of the default highlight wrapper. Default: `none`.
- **highlightIdFunction** – Identifier of a function that provides unique IDs for new highlights. Default: `hhGetNewHighlightId`.


### <a name="custom-events"></a>Custom events

Highlight Helper sends [custom events](https://developer.mozilla.org/en-US/docs/Web/Events/Creating_and_triggering_events) to the container element (defined in the `containerSelector` option) that can be listened for and responded to:

- **hh:highlightsload** – Sent when an array of highlights loads. Includes the number of highlights added, removed, or updated, the total number of loaded highlights, and the time they took to load (in milliseconds).
- **hh:highlightcreate** – Sent when a new highlight is created. Includes information about the highlight.
- **hh:highlightupdate** – Sent when the highlight changes. Includes information about the highlight, and a list of the attributes that changed.
- **hh:highlightremove** – Sent when a highlight is removed. Includes the ID of the removed highlight.
- **hh:tap** – Sent when a user taps in the annotatable container (potentially trying to activate a highlight or link). This will only be sent if there isn’t currently an active highlight. Includes the location of the tap, the highlight(s) that were tapped, and the hyperlink(s) that were tapped, if any.
- **hh:selectionupdate** – Sent when the selection color or style changes. Can be used to update custom selection UI, such as the color of selection handles. Includes the key of the color and style.
- **hh:highlightactivate** – Sent when a highlight is activated. Includes information about the activated highlight.
- **hh:highlightdeactivate** – Sent when a highlight is deactivated. Includes the ID of the deactivated highlight.
- **hh:ambiguousaction** – Sent when a user taps on overlapping highlights or an overlapping highlight and link. Includes the location of the tap, the highlight(s) that were tapped, and the hyperlink(s) that were tapped. This event will not be sent if `autoTapToActivate` is set to `false`.
- **selectionchange** – This is a [standard JavaScript event](https://developer.mozilla.org/en-US/docs/Web/API/Document/selectionchange_event) (not specific to Highlight Helper), but it’s worth mentioning here because it can be useful for adding custom selection UI around the selected text (such as a floating annotation menu). When this sends, you can call `window.getSelection()` to get the current [Selection object](https://developer.mozilla.org/en-US/docs/Web/API/Selection).


## <a name="highlight-attributes"></a>Highlight attributes

These are the attributes that Highlight Helper stores for each highlight. You can update a highlight by calling `createOrUpdateHighlight(attributes)`, where `attributes` is an object that includes the keys to be updated.

- **highlightId** (read-only after creation) – The ID of the highlight.
- **color** – The color of the highlight (key from the `colors` object in the initialized options). Example: `red`.
- **style** – The style of the highlight (key from the `styles` object in the initialized options). Example: `single-underline`.
- **wrapper** – The wrapper of the highlight (key from the `wrappers` object in the initialized options). More information about wrappers can be found above. Example: `none`.
- **wrapperVariables** – Variables used in wrappers. Example: `{ marker: 'a', }`.
- **readOnly** – Whether the highlight should be read-only (prevents a user from changing its color, bounds, or other attributes). Boolean. Example: `true`.
- **startParagraphId** – ID of the paragraph where the highlight starts. Example: `p1`.
- **startParagraphOffset** – Character offset where the highlight starts, relative to the beginning of the paragraph. Example: 12.
- **endParagraphId** – ID of the paragraph where the highlight ends. Example: `p1`.
- **endParagraphOffset** – Character offset where the highlight ends, relative to the beginning of the paragraph. Example: 14.
- **escapedHighlightId** (read-only) – Escaped highlight ID used as a CSS identifier (this is used internally by Highlight Helper).
- **rangeText** (read-only) – Text content in the highlighted range.
- **rangeHtml** (read-only) – HTML content in the highlighted range.
- **rangeParagraphIds** (read-only) – IDs of paragraphs in the highlighted range.
- **rangeObj** (read-only) – The [Range](https://developer.mozilla.org/en-US/docs/Web/API/Range) object that represents where the highlight is drawn.
