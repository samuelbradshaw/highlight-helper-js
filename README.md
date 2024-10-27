# Highlight Helper

**Highlight Helper** is a JavaScript tool that enables highlighting or underlining text in an HTML page (such as a digital book or article). Behind the scenes, the tool uses the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API). This allows Highlight Helper to support complex use cases – like overlapping highlights, or starting a highlight in one element and ending it in another – while remaining relatively lightweight.

An HTML demo page that shows basic functionality can be found here: [Highlight Helper Demo](https://samuelbradshaw.github.io/highlight-helper-js/demo.html). Source code for the demo is in **demo.html**. Highlight Helper itself is in **highlight-helper.js**.


## Known issues

There are a few known issues:

- The Custom Highlight API is relatively new, so **not all browsers support it**. However, it should work with Safari 17.2+ and Chrome 105+, and it’s been tested on macOS, iOS, and Android.
- **Desktop browsers** don’t show selection handles for changing the bounds of a highlight or selection. Selection handles do show on iOS and Android. In the future it would be nice to have fallback selection handles for desktop browsers, like the ones on [this page](https://www.churchofjesuschrist.org/study/scriptures/bofm/1-ne/1?lang=eng).
- **Safari on iOS** doesn't respect the text selection color set via CSS, so when a highlight is active for editing it has a blue overlay. However, if you’re working in a native app with a webview, you may be able to set colors natively with [tintColor](https://stackoverflow.com/a/60510743/1349044), [highlightView](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195471-highlightview), and/or [handleViews](https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195470-handleviews).
- **Safari on iOS and macOS** doesn’t allow setting underline thickness on a ::highlight() pseudo-element, so underline highlights are thin and hard to see (see [StackOverflow](https://stackoverflow.com/q/79060854/1349044) and [WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=282027)). This will likely require a fix from Apple. In the meantime, if you need underlines, a workaround could be to use a different underline style, such as a double underline.


## Getting started

The easiest way to get started is to download demo.html and highlight-helper.js, open demo.html in a text editor and browser, and make changes to adapt it for your needs.

In the source of demo.html, you’ll see CSS styles, followed by the HTML body, followed by JavaScript code. The JavaScript code does the following:
1. Links to highlight-helper.js,
2. Initializes Highlight Helper with options,
3. Pre-loads and draws an existing highlight,
3. Sets up logic to call Highlight Helper methods when buttons on the demo page are tapped, and
4. Sets up listeners to respond to custom event messages that come back from Highlight Helper.

All of the available methods, options, and custom events are documented below.


## Methods, options, and custom events

### Methods

- **loadHighlights(highlights)** – Load an array of existing highlights into Highlight Helper. After loading highlights, you’ll usually want to call drawHighlights() to draw them on the page. See the demo source code for an example highlights array. Omitted or invalid properties will fall back to default values.
- **drawHighlights()** – Draw (or redraw) highlights on the page. Highlights should be redrawn automatically by Highlight Helper when an individual highlight is added, updated, or removed, but you’ll need to call drawHighlights() manually if you use loadHighlights() to load several highlights at once.
- **setColor(color)** – Set the color of the selection or active highlight.
- **setStyle(style)** – Set the style of the selection or active highlight.
- **activateHighlight(highlightId)** – Activate a highlight for editing, given its `highlightId`. Only one highlight can be active at a time (because it’s tied to text selection, and there can only be one text selection on a page). Normally, a highlight activates automatically when the user taps it, but if a highlight overlaps another highlight or a link, it’s not clear which one the user is tapping, so neither activates automatically.
- **activateHyperlink(position)** – Activate the specified hyperlink (i.e. open the link). `position` is the 0-based position of the link in the annotatable area of the page, relative to other links. Normally, a link opens automatically when the user taps it; but if a highlight overlaps the link, it’s not clear which one the user is tapping, so neither activates automatically.
- **deactivateSelection()** – Clear the text selection and deactivate any active highlights.
- **removeHighlight(highlightId)** – Remove the specified highlight. If `highlightId` isn’t provided, the currently-active highlight will be deleted (if there is one).
- **getActiveHighlightId()** – Get the ID of the currently-active highlight (if there is one).
- **getHighlightsById()** – Get information for all of the highlights on the page, indexed by highlight ID.
- **setOption(key, value)** – Change one of the initialized options. Available options are described below.
- **getOptions()** – Get the initialized options, including defaults for any options that weren’t explicitly set.


### Options

Options can be provided when Highlight Helper is initialized. They can also be set on demand using `setOption(key, value)` (described above). All of these settings are optional. If not specified, the default value for each option will be used.

- **containerSelector** – CSS selector for the section of the page that should be annotatable. Default: `body`.
- **paragraphSelector** – CSS selector for the paragraphs or other blocks of text on the page that should be annotatable. Each block is expected to have an ID attribute in the HTML, which is used to keep track of where a highlight starts and ends. Default: `h1, h2, h3, h4, h5, h6, p, ol, ul, dl, tr`.
- **colors** – Object that describes available highlight colors. Keys are color names, and values are [CSS color values](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value). Default: red, orange, yellow, green, blue (see full default values at the bottom of highlight-helper.js).
- **styles** – Object that describes available highlight styles. Keys are style names, and values are CSS property lists. Supported CSS properties are limited and support varies by browser (see [Styling Highlights](https://www.w3.org/TR/css-pseudo-4/#highlight-styling)). If present, the substring `{color}` will be dynamically replaced with the relevant color string. Default: fill, single-underline, double-underline, invisible, redacted (see full default values at the bottom of highlight-helper.js).
- **rememberStyle** – Whether the most recent color and style should be remembered and used by default the next time the user creates a highlight. Boolean. Default: `true`.
- **snapToWord** – Whether text selection and highlights should snap to the nearest word boundary. Boolean. Default: `false`.
- **highlightMode** – Mode for creating highlights. Options are `default` (create highlights by selecting text, then tapping a color or style); `live` (create highlights immediately when selecting text, without needing to tap a button); and `auto` (`default` for touch and mouse input, but `live` when a stylus or Apple Pencil is detected). Default: `default`.
- **defaultColor** – Key of the default highlight color. Default: `yellow`.
- **defaultStyle** – Key of the default highlight style. Default: `fill`.
- **highlightIdFunction** – Identifier of a function that provides unique IDs for new highlights. Default: `hhGetNewHighlightId`.


### Custom events

Highlight Helper sends [custom events](https://developer.mozilla.org/en-US/docs/Web/Events/Creating_and_triggering_events) to the container element (defined in the `containerSelector` option) that can be listened for and responded to:

- **hh:highlightsload** – Sent when a set of highlights loads. Includes the number of highlights added and the overall number of loaded highlights.
- **hh:selectionstyleupdate** – Sent when the selection color or style changes. Includes the key of the color and style.
- **hh:highlightstyleupdate** – Sent when the color or style of a highlight changes. Includes the highlight ID, and the key of the color and style.
- **hh:highlightactivate** – Sent when a highlight is activated. Includes information about the highlight that was activated.
- **hh:highlightdeactivate** – Sent when a highlight is deactivated. Includes the ID of the highlight that was deactivated.
- **hh:highlightremove** – Sent when a highlight is removed. Includes the ID of the highlight that was removed.
- **hh:ambiguousaction** – Sent when a user taps on overlapping highlights or an overlapping highlight and link. Includes the location of the tap, the highlight(s) that were tapped, and the hyperlink(s) that were tapped.
